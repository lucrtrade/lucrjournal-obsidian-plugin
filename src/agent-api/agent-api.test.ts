import { TFile, TFolder, type App } from 'obsidian'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setTradingViewRequesterForTests } from '../domains/symbol/metadata'
import { setCurrentTimeZoneSetting } from '../settings/plugin-settings'

import { executePositionPlan } from './execute'
import { parseCreatePositionInput } from './input'
import { buildOpenPositionCommands } from './open'
import { planPosition } from './plan'

import { createAgentApi } from './index'

type FakeEntry = { kind: 'file'; file: TFile; content: string } | { kind: 'folder'; folder: TFolder }

/** Minimal in-memory vault: frontmatter is stored as `key: <json>` lines like the entry writer emits. */
function createFakeVault(initialFiles: Record<string, string>) {
	const entries = new Map<string, FakeEntry>()
	const trashed: string[] = []
	let sessionToken = 'test-token'
	let accessDenied = false
	let failingCreatePath: string | null = null
	let failNextSetViewState = false

	const makeFile = (path: string) => {
		const name = path.split('/').pop() ?? path
		const dot = name.lastIndexOf('.')
		return Object.assign(new TFile(), {
			path,
			name,
			basename: dot === -1 ? name : name.slice(0, dot),
			extension: dot === -1 ? '' : name.slice(dot + 1),
		})
	}
	const ensureFolders = (path: string) => {
		const segments = path.split('/').slice(0, -1)
		for (let index = 1; index <= segments.length; index += 1) {
			const folderPath = segments.slice(0, index).join('/')
			if (!entries.has(folderPath)) {
				entries.set(folderPath, { kind: 'folder', folder: Object.assign(new TFolder(), { path: folderPath, name: segments[index - 1] ?? '', children: [] }) })
			}
		}
	}
	const writeFile = (path: string, content: string) => {
		const existing = entries.get(path)
		const file = existing?.kind === 'file' ? existing.file : makeFile(path)
		entries.set(path, { kind: 'file', file, content })
		return file
	}
	for (const [path, content] of Object.entries(initialFiles)) {
		ensureFolders(path)
		writeFile(path, content)
	}

	const readContent = (file: { path: string }) => {
		const entry = entries.get(file.path)
		if (entry?.kind !== 'file') {
			throw new Error(`missing file ${file.path}`)
		}
		return entry.content
	}
	const parseFrontmatter = (content: string): Record<string, unknown> | undefined => {
		if (!content.startsWith('---\n')) {
			return undefined
		}
		const end = content.indexOf('\n---', 4)
		const lines = content.slice(4, end).split('\n').filter((line) => line.trim() !== '')
		return Object.fromEntries(lines.map((line) => {
			const index = line.indexOf(':')
			const raw = line.slice(index + 1).trim()
			let value: unknown = raw
			try {
				value = raw === '' ? null : JSON.parse(raw)
			} catch {
				value = raw
			}
			return [line.slice(0, index).trim(), value]
		}))
	}
	const replaceFrontmatter = (content: string, frontmatter: Record<string, unknown>) => {
		const end = content.indexOf('\n---', 4)
		const body = content.startsWith('---\n') ? content.slice(end + 4) : `\n${content}`
		const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value === null || value === undefined ? '' : JSON.stringify(value)}`).join('\n')
		return `---\n${yaml}\n---${body}`
	}
	const files = () => [...entries.values()].flatMap((entry) => (entry.kind === 'file' ? [entry.file] : []))
	const lookup = (path: string) => {
		const entry = entries.get(path)
		return entry === undefined ? null : entry.kind === 'file' ? entry.file : entry.folder
	}

	type FakeLeaf = {
		view: { file: TFile | null; viewType: string; getViewType: () => string }
		setViewState: (state: { type: string; state: { file: string } }) => Promise<void>
		detach: () => void
		detached: boolean
	}
	const leaves: FakeLeaf[] = []
	const createLeaf = (): FakeLeaf => {
		const leaf: FakeLeaf = {
			view: { file: null, viewType: '', getViewType: () => leaf.view.viewType },
			detached: false,
			async setViewState(state) {
				if (failNextSetViewState) {
					failNextSetViewState = false
					throw new Error('setViewState failed')
				}
				const target = lookup(state.state.file)
				leaf.view.viewType = state.type
				leaf.view.file = target instanceof TFile ? target : null
			},
			detach() {
				leaf.detached = true
			},
		}
		return leaf
	}

	const app = {
		appId: 'test-vault-id',
		secretStorage: {
			getSecret: (id: string) => (id === 'lucrjournal-session' ? sessionToken : ''),
			setSecret: (id: string, value: string) => {
				if (id === 'lucrjournal-session') {
					sessionToken = value
				}
			},
		},
		loadLocalStorage: (key: string) => (key === 'lucrjournal-access-denied' ? accessDenied : null),
		saveLocalStorage: (key: string, value: unknown) => {
			if (key === 'lucrjournal-access-denied') {
				accessDenied = value === true
			}
		},
		vault: {
			getName: () => 'test-vault',
			getMarkdownFiles: () => files().filter((file) => file.extension === 'md'),
			getAbstractFileByPath: lookup,
			read: async (file: TFile) => readContent(file),
			create: async (path: string, content: string) => {
				if (path === failingCreatePath) {
					throw new Error(`disk full: ${path}`)
				}
				if (entries.has(path)) {
					throw new Error(`File already exists: ${path}`)
				}
				ensureFolders(path)
				return writeFile(path, content)
			},
			createBinary: async (path: string) => writeFile(path, '<binary>'),
			createFolder: async (path: string) => {
				ensureFolders(`${path}/x`)
			},
			process: async (file: TFile, fn: (content: string) => string) => {
				const next = fn(readContent(file))
				writeFile(file.path, next)
				return next
			},
			adapter: {
				write: async (path: string, content: string) => {
					writeFile(path, content)
				},
			},
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const entry = entries.get(file.path)
				return entry?.kind === 'file' ? { frontmatter: parseFrontmatter(entry.content) } : null
			},
			getFirstLinkpathDest: (linkpath: string) => files().find((file) => file.basename === linkpath) ?? null,
		},
		fileManager: {
			processFrontMatter: async (file: TFile, fn: (frontmatter: Record<string, unknown>) => void) => {
				const content = readContent(file)
				const frontmatter = parseFrontmatter(content) ?? {}
				fn(frontmatter)
				writeFile(file.path, replaceFrontmatter(content, frontmatter))
			},
			trashFile: async (file: { path: string }) => {
				trashed.push(file.path)
				entries.delete(file.path)
			},
		},
		workspace: {
			getLeavesOfType: (type: string) => leaves.filter((leaf) => leaf.view.getViewType() === type && !leaf.detached),
			getLeaf: () => {
				const leaf = createLeaf()
				leaves.push(leaf)
				return leaf
			},
			setActiveLeaf: () => {},
			revealLeaf: async () => {},
		},
	} as unknown as App

	return {
		app,
		trashed,
		leaves,
		paths: () => files().map((file) => file.path).sort(),
		content: (path: string) => readContent({ path }),
		frontmatter: (path: string) => parseFrontmatter(readContent({ path })) ?? {},
		signOut: () => {
			sessionToken = ''
		},
		signIn: () => {
			sessionToken = 'test-token'
		},
		denyAccess: () => {
			accessDenied = true
		},
		allowAccess: () => {
			accessDenied = false
		},
		failOnCreate: (path: string) => {
			failingCreatePath = path
		},
		failNextSetViewState: () => {
			failNextSetViewState = true
		},
		failNextProcess: () => {
			const vault = app.vault as unknown as { process: unknown }
			vault.process = async () => {
				throw new Error('disk full')
			}
		},
	}
}

const ROOT = 'LucrJournal'

function fm(fields: Record<string, unknown>, body = '') {
	return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${body}`
}

function baseVault(extra: Record<string, string> = {}) {
	return createFakeVault({
		[`${ROOT}/platforms/Binance.md`]: fm({ lucr_type: 'platform' }),
		[`${ROOT}/accounts/ACC-Binance.md`]: fm({ lucr_type: 'account', platform: '[[Binance]]', name: 'Binance' }),
		...extra,
	})
}

function secondAccount() {
	return {
		[`${ROOT}/platforms/MetaTrader.md`]: fm({ lucr_type: 'platform' }),
		[`${ROOT}/accounts/ACC-FTMO.md`]: fm({ lucr_type: 'account', platform: '[[MetaTrader]]', name: 'FTMO' }),
	}
}

function symbolFile(account: string, name: string, type: string) {
	return { [`${ROOT}/symbols/SBL-${account}-${name}.md`]: fm({ lucr_type: 'symbol', name, account: `[[ACC-${account}]]`, type }) }
}

describe('agent api createPosition', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {
			setTimeout: (callback: () => void) => {
				queueMicrotask(callback)
				return 0
			},
		})
		setCurrentTimeZoneSetting('Asia/Shanghai')
		setTradingViewRequesterForTests(async () => ({ status: 200, json: { symbols: [] } }))
	})
	afterEach(() => {
		vi.unstubAllGlobals()
		setTradingViewRequesterForTests(null)
	})

	it('creates a new symbol and position from a bare base asset with inferred account and side', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.createPosition({ symbol: 'sol', entry_price: 142, stop_loss: 138, opened_at: '2026-11-09 10:00' })

		expect(result.ok).toBe(true)
		if (!result.ok) {
			return
		}
		expect(result.data).toMatchObject({
			path: `${ROOT}/positions/POS-00001.md`,
			created: [`${ROOT}/symbols/SBL-Binance-SOLUSDT.P.md`, `${ROOT}/positions/POS-00001.md`],
			resolved: {
				account: { value: 'Binance', reason: 'only account in the vault' },
				symbol: { value: 'SOLUSDT.P', created: true },
				side: { value: 'LONG' },
				opened_at: { value: '2026-11-09T10:00:00+08:00' },
			},
		})
		expect(result.data.open).toEqual({
			uri: 'obsidian://lucrjournal-open-position?vault=test-vault-id&file=LucrJournal%2Fpositions%2FPOS-00001.md',
			bash: 'open "obsidian://lucrjournal-open-position?vault=test-vault-id&file=LucrJournal%2Fpositions%2FPOS-00001.md"'
				+ ' && open -a Obsidian'
				+ ' && obsidian vault=test-vault-id eval code="app.plugins.plugins.lucrjournal.api.openPosition({ path: \'LucrJournal/positions/POS-00001.md\' })"',
			powershell: 'Start-Process \'obsidian://lucrjournal-open-position?vault=test-vault-id&file=LucrJournal%2Fpositions%2FPOS-00001.md\';'
				+ ' obsidian vault=test-vault-id eval "code=app.plugins.plugins.lucrjournal.api.openPosition({ path: \'LucrJournal/positions/POS-00001.md\' })"',
		})
		const position = vault.frontmatter(`${ROOT}/positions/POS-00001.md`)
		expect(position).toMatchObject({
			lucr_type: 'position',
			symbol: '[[SBL-Binance-SOLUSDT.P]]',
			side: 'LONG',
			status: 'open',
			entry_price: 142,
			stop_loss: 138,
			opened_at: '2026-11-09T10:00:00+08:00',
		})
		expect(vault.frontmatter(`${ROOT}/symbols/SBL-Binance-SOLUSDT.P.md`)).toMatchObject({ name: 'SOLUSDT.P', type: 'Crypto_Perp', account: '[[ACC-Binance]]' })
	})

	it('dry-run returns the planned files without writing anything and matches the real run', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const before = vault.paths()
		const input = {
			symbol: 'BTC/USDT',
			side: 'SHORT',
			entry_price: 100000,
			stop_loss: 101000,
			target_price: 97000,
			notional_value: 5000,
			opened_at: '2026-11-09T09:00:00+08:00',
			links: { key_levels: ['Weekly high'], news: ['CPI print'] },
			notes: 'Rejected weekly high.',
		}

		const dry = await api.createPosition({ ...input, dryRun: true })
		expect(vault.paths()).toEqual(before)
		expect(dry.ok).toBe(true)
		if (!dry.ok || dry.dryRun !== true) {
			throw new Error('expected dry run result')
		}
		const plannedFiles = dry.data.files ?? []
		const plannedPaths = plannedFiles.map((file) => file.path)
		expect(plannedPaths).toEqual([
			`${ROOT}/symbols/SBL-Binance-BTCUSDT.md`,
			`${ROOT}/analyses/Weekly high.md`,
			`${ROOT}/news/CPI print.md`,
			`${ROOT}/positions/POS-00001.md`,
		])
		const plannedPosition = plannedFiles[plannedFiles.length - 1]!
		expect(plannedPosition.body).toContain('# Key Levels\n\n## [[Weekly high]]')
		expect(plannedPosition.body).toContain('# News\n\n## [[CPI print]]')

		const real = await api.createPosition(input)
		expect(real.ok).toBe(true)
		if (!real.ok) {
			return
		}
		expect(real.data.created).toEqual(plannedPaths)
		const written = vault.frontmatter(`${ROOT}/positions/POS-00001.md`)
		for (const field of ['symbol', 'side', 'status', 'entry_price', 'stop_loss', 'target_price', 'notional_value', 'notional_asset', 'risk', 'opened_at']) {
			expect(written[field], field).toEqual(plannedPosition.frontmatter?.[field])
		}
		const content = vault.content(`${ROOT}/positions/POS-00001.md`)
		expect(content).toContain('# Notes\n\nRejected weekly high.')
		expect(content).toContain('## [[Weekly high]]')
		expect(vault.frontmatter(`${ROOT}/analyses/Weekly high.md`)).toMatchObject({ lucr_type: 'key_level' })
	})

	it('aligns a bare base to the only existing symbol and links existing analyses without creating them', async () => {
		const vault = baseVault({
			...symbolFile('Binance', 'ETHUSDT.P', 'Crypto_Perp'),
			[`${ROOT}/analyses/Range low.md`]: fm({ lucr_type: 'key_level' }),
			[`${ROOT}/playbooks/Breakout.md`]: fm({ lucr_type: 'playbook' }),
		})
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.createPosition({ symbol: 'eth', side: 'long', playbook: 'breakout', links: { key_levels: ['range LOW'] } })

		expect(result.ok).toBe(true)
		if (!result.ok) {
			return
		}
		expect(result.data.created).toEqual([`${ROOT}/positions/POS-00001.md`])
		expect(result.data.resolved).toMatchObject({ symbol: { value: 'ETHUSDT.P', created: false }, playbook: 'Breakout', links: [{ kind: 'key_levels', name: 'Range low', created: false }] })
		expect(vault.frontmatter(`${ROOT}/positions/POS-00001.md`).playbook).toBe('[[Breakout]]')
	})

	it('keeps an explicitly specified full symbol instead of aligning it', async () => {
		const vault = baseVault(symbolFile('Binance', 'SOLUSDT.P', 'Crypto_Perp'))
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.createPosition({ symbol: 'SOLUSDT', side: 'LONG' })

		expect(result.ok && result.data.resolved).toMatchObject({ symbol: { value: 'SOLUSDT', created: true } })
	})

	it('picks the perpetual for a crypto short given only the base asset', async () => {
		const vault = baseVault({ ...symbolFile('Binance', 'SOLUSDT', 'Crypto_Spot'), ...symbolFile('Binance', 'SOLUSDT.P', 'Crypto_Perp'), ...symbolFile('Binance', 'ETHUSDT', 'Crypto_Spot') })
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		await expect(api.createPosition({ symbol: 'SOL', side: 'SHORT', dryRun: true })).resolves.toMatchObject({
			ok: true,
			data: { resolved: { symbol: { value: 'SOLUSDT.P', created: false } } },
		})
		await expect(api.createPosition({ symbol: 'BTC', side: 'SHORT', dryRun: true })).resolves.toMatchObject({
			ok: true,
			data: { resolved: { symbol: { value: 'BTCUSDT.P', created: true, reason: expect.stringContaining('a short needs a perpetual') as unknown } } },
		})
		await expect(api.createPosition({ symbol: 'BTC', side: 'LONG', dryRun: true })).resolves.toMatchObject({
			ok: true,
			data: { resolved: { symbol: { value: 'BTCUSDT', created: true } } },
		})
	})

	it('reports SYMBOL_AMBIGUOUS with candidates when spot and perp both exist', async () => {
		const vault = baseVault({ ...symbolFile('Binance', 'SOLUSDT', 'Crypto_Spot'), ...symbolFile('Binance', 'SOLUSDT.P', 'Crypto_Perp') })
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.createPosition({ symbol: 'SOL', side: 'LONG' })

		expect(result).toMatchObject({ ok: false, error: { code: 'SYMBOL_AMBIGUOUS', field: 'symbol', candidates: ['SOLUSDT', 'SOLUSDT.P'] } })
		expect(vault.paths()).not.toContain(`${ROOT}/positions/POS-00001.md`)
	})

	it('infers the account from the symbol, expands CFD bases and validates lots', async () => {
		const vault = baseVault({ ...secondAccount(), ...symbolFile('FTMO', 'XAUUSD', 'CFD') })
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const ok = await api.createPosition({ symbol: 'xau', entry_price: 2400, stop_loss: 2410, exit_price: 2390, lots: 0.5, closed_at: '2026-11-09 12:00', opened_at: '2026-11-09 11:00' })
		expect(ok.ok && ok.data.resolved).toMatchObject({ account: { value: 'FTMO' }, symbol: { value: 'XAUUSD', created: false }, side: { value: 'SHORT' } })
		expect(vault.frontmatter(`${ROOT}/positions/POS-00001.md`)).toMatchObject({ status: 'close', lots: 0.5, exit_price: 2390 })

		const badLots = await api.createPosition({ account: 'FTMO', symbol: 'XAUUSD', side: 'LONG', lots: 50 })
		expect(badLots).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'lots' } })

		const conflict = await api.createPosition({ account: 'Binance', symbol: 'BTCUSDT', side: 'LONG', lots: 1 })
		expect(conflict).toMatchObject({ ok: false, error: { code: 'QUANTITY_CONFLICT', field: 'lots' } })
	})

	it('returns actionable errors for unknown accounts, risk direction and playbooks; defaults side to LONG', async () => {
		const vault = baseVault(secondAccount())
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		await expect(api.createPosition({ account: 'Binanse', symbol: 'BTCUSDT', side: 'LONG' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'ACCOUNT_NOT_FOUND', candidates: ['Binance'] },
		})
		await expect(api.createPosition({ account: 'Binance', symbol: 'BTCUSDT', side: 'LONG', entry_price: 100, stop_loss: 110 })).resolves.toMatchObject({
			ok: false,
			error: { code: 'RISK_DIRECTION', field: 'stop_loss' },
		})
		await expect(api.createPosition({ account: 'Binance', symbol: 'BTCUSDT', side: 'LONG', playbook: 'Nope' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'PLAYBOOK_NOT_FOUND', field: 'playbook' },
		})
		await expect(api.createPosition({ account: 'Binance', symbol: 'BTCUSDT', dryRun: true })).resolves.toMatchObject({
			ok: true,
			data: { resolved: { side: { value: 'LONG', reason: expect.stringContaining('defaulted to LONG') as unknown } } },
		})
		await expect(api.createPosition({ symbol: 'NEWCOIN', side: 'LONG', dryRun: true })).resolves.toMatchObject({
			ok: true,
			data: { resolved: { account: { value: 'Binance' } } },
		})
		await expect(api.createPosition({ symbol: 'BTC', confirmVault: 'other' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'UNKNOWN_FIELD', field: 'confirmVault' },
		})
		expect(vault.paths().some((path) => path.includes('/positions/'))).toBe(false)
	})

	it('reports every independent problem in one error so the agent can resolve them together', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.createPosition({ account: 'Binance', symbol: 'BTC', side: 'LONG', entry_price: 100, stop_loss: 110, playbook: 'Momentum', opened_at: 'yesterday' })

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: 'RISK_DIRECTION',
				details: {
					additionalErrors: [
						{ code: 'INVALID_VALUE', field: 'opened_at' },
						{ code: 'PLAYBOOK_NOT_FOUND', field: 'playbook' },
					],
				},
			},
		})
		expect(!result.ok && result.error.message).toContain('Also:')
	})

	it('creates a missing account (and its preset platform) before the symbol and position', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const dry = await api.createPosition({ account: 'okx', symbol: 'solusdt', side: 'LONG', dryRun: true })
		expect(dry.ok && dry.data.files?.map((file) => [file.kind, file.path])).toEqual([
			['platform', `${ROOT}/platforms/OKX.md`],
			['account', `${ROOT}/accounts/ACC-OKX.md`],
			['symbol', `${ROOT}/symbols/SBL-OKX-SOLUSDT.md`],
			['position', `${ROOT}/positions/POS-00001.md`],
		])
		expect(vault.paths()).not.toContain(`${ROOT}/accounts/ACC-OKX.md`)

		const result = await api.createPosition({ account: 'okx', symbol: 'solusdt', side: 'LONG', entry_price: 140, exit_price: 150, amount: 100 })
		expect(result.ok && result.data.resolved).toMatchObject({ account: { value: 'OKX', created: true }, symbol: { value: 'SOLUSDT', created: true } })
		expect(result.ok && result.data.created).toEqual([
			`${ROOT}/platforms/OKX.md`,
			`${ROOT}/accounts/ACC-OKX.md`,
			`${ROOT}/symbols/SBL-OKX-SOLUSDT.md`,
			`${ROOT}/positions/POS-00001.md`,
		])
		expect(vault.frontmatter(`${ROOT}/accounts/ACC-OKX.md`)).toMatchObject({ lucr_type: 'account', platform: '[[OKX]]', name: 'OKX' })
		expect(vault.frontmatter(`${ROOT}/symbols/SBL-OKX-SOLUSDT.md`)).toMatchObject({ account: '[[ACC-OKX]]' })
		expect(vault.frontmatter(`${ROOT}/positions/POS-00001.md`)).toMatchObject({ status: 'close', profit: 1000 })
	})

	it('creates a custom account on a given platform, and an account in an empty vault', async () => {
		const vault = createFakeVault({})
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		await expect(api.createPosition({ symbol: 'XAUUSD', side: 'LONG' })).resolves.toMatchObject({ ok: false, error: { code: 'NO_ACCOUNT' } })
		const result = await api.createPosition({ account: 'FTMO Challenge', platform: 'metatrader', symbol: 'XAUUSD', side: 'LONG' })
		expect(result.ok && result.data.resolved).toMatchObject({ account: { value: 'FTMO Challenge', created: true } })
		expect(vault.frontmatter(`${ROOT}/accounts/ACC-FTMO Challenge.md`)).toMatchObject({ platform: '[[MetaTrader]]', name: 'FTMO Challenge' })
		expect(vault.paths()).toContain(`${ROOT}/platforms/MetaTrader.md`)
	})

	it('rejects a likely typo of an existing account unless createAccount confirms it', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		await expect(api.createPosition({ account: 'Binanse', symbol: 'BTC', side: 'LONG' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'ACCOUNT_NOT_FOUND', candidates: ['Binance'] },
		})
		await expect(api.createPosition({ account: 'Binanse', createAccount: true, symbol: 'BTC', side: 'LONG', dryRun: true })).resolves.toMatchObject({
			ok: true,
			data: { resolved: { account: { value: 'Binanse', created: true } } },
		})
	})

	it('rejects creating a link whose name collides with another LucrJournal note', async () => {
		const vault = baseVault({ [`${ROOT}/news/FOMC.md`]: fm({ lucr_type: 'news' }) })
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.createPosition({ symbol: 'BTCUSDT', side: 'LONG', links: { market_analysis: ['FOMC'] } })

		expect(result).toMatchObject({ ok: false, error: { code: 'NAME_CONFLICT', field: 'links.market_analysis' } })
	})

	it('rolls back every created file when a write step fails', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const before = vault.paths()
		vault.failNextProcess()

		const result = await api.createPosition({ symbol: 'sol', side: 'LONG', notes: 'x', links: { confluence: ['Trend'] } })

		expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
		expect(!result.ok && result.error.message).toContain('moved to trash')
		expect(vault.paths()).toEqual(before)
		expect(vault.trashed).toEqual(expect.arrayContaining([
			`${ROOT}/positions/POS-00001.md`,
			`${ROOT}/analyses/Trend.md`,
			`${ROOT}/symbols/SBL-Binance-SOLUSDT.P.md`,
		]))
	})

	it('refuses to write or preview anything while the journal is locked', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const before = vault.paths()

		vault.signOut()
		await expect(api.createPosition({ symbol: 'sol', side: 'LONG' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'JOURNAL_LOCKED' },
		})
		await expect(api.createPosition({ symbol: 'sol', side: 'LONG', dryRun: true })).resolves.toMatchObject({
			ok: false,
			error: { code: 'JOURNAL_LOCKED' },
		})
		expect(vault.paths()).toEqual(before)

		vault.signIn()
		vault.denyAccess()
		await expect(api.createPosition({ symbol: 'sol', side: 'LONG' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'JOURNAL_LOCKED' },
		})
		expect(vault.paths()).toEqual(before)
	})

	it('keeps a symbol that another writer created between planning and writing', async () => {
		const vault = baseVault()
		const input = parseCreatePositionInput({ symbol: 'sol', side: 'LONG', notes: 'retry safety' })
		const plan = await planPosition(vault.app, input)
		const symbolPath = `${ROOT}/symbols/SBL-Binance-SOLUSDT.P.md`
		expect(plan.execution.createSymbol).toBe(true)

		await vault.app.vault.create(symbolPath, fm({ lucr_type: 'symbol', name: 'SOLUSDT.P', account: '[[ACC-Binance]]', type: 'Crypto_Perp' }))
		vault.failNextProcess()

		await expect(executePositionPlan(vault.app, plan)).rejects.toMatchObject({ payload: { code: 'INTERNAL_ERROR' } })
		expect(vault.paths()).toContain(symbolPath)
		expect(vault.paths()).not.toContain(`${ROOT}/positions/POS-00001.md`)
	})

	it('rolls back the platform that a failed account creation cascaded', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		vault.failOnCreate(`${ROOT}/accounts/ACC-Desk.md`)

		const result = await api.createPosition({ account: 'Desk', platform: 'MetaTrader', symbol: 'XAUUSD', side: 'LONG' })

		expect(result.ok).toBe(false)
		expect(vault.paths()).not.toContain(`${ROOT}/platforms/MetaTrader.md`)
		expect(vault.paths()).not.toContain(`${ROOT}/accounts/ACC-Desk.md`)
	})

	it('rejects a platform that contradicts the resolved account', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		await expect(api.createPosition({ account: 'Binance', platform: 'Bybit', symbol: 'BTCUSDT', side: 'LONG' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'INVALID_VALUE', field: 'platform' },
		})
	})

	it('asks which market a short belongs to when the account only traded spot', async () => {
		const vault = baseVault({ ...symbolFile('Binance', 'SOLUSDT', 'Crypto_Spot') })
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		await expect(api.createPosition({ symbol: 'sol', side: 'SHORT', dryRun: true })).resolves.toMatchObject({
			ok: false,
			error: { code: 'SYMBOL_AMBIGUOUS', candidates: ['SOLUSDT', 'SOLUSDT.P'] },
		})
	})

	it('builds an open command that works from Git Bash on Windows', () => {
		const path = `${ROOT}/positions/POS-00012.md`
		const windows = buildOpenPositionCommands('2b770fde7df4a65c', path, 'lucrjournal', { isWin: true, isMacOS: false })
		const mac = buildOpenPositionCommands('2b770fde7df4a65c', path, 'lucrjournal', { isWin: false, isMacOS: true })

		expect(windows.bash).toContain('powershell.exe -NoProfile -Command "Start-Process ')
		expect(windows.bash).not.toContain('start ""')
		expect(mac.bash).toContain('open "obsidian://')
		expect(mac.bash).toContain('&& open -a Obsidian &&')
		expect(windows.powershell).toBe(mac.powershell)
	})

	it('escapes the open path for both the URI and the eval code', () => {
		const commands = buildOpenPositionCommands('vault', `${ROOT}/positions/POS-'1.md`, 'lucrjournal', { isWin: false, isMacOS: true })

		expect(commands.uri).toContain('%27')
		expect(commands.bash).toContain('\\u{27}')
	})

	it('previews the same frontmatter keys that the written file will have', async () => {
		const vault = baseVault(symbolFile('Binance', 'BTCUSDT', 'Crypto_Spot'))
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const input = { symbol: 'BTCUSDT', side: 'LONG', entry_price: 100, stop_loss: 90 }

		const dry = await api.createPosition({ ...input, dryRun: true })
		if (!dry.ok) {
			throw new Error('expected a dry run')
		}
		const planned = (dry.data.files ?? []).find((file) => file.kind === 'position')
		const real = await api.createPosition(input)
		if (!real.ok) {
			throw new Error('expected a created position')
		}

		expect(Object.keys(planned?.frontmatter ?? {}).sort()).toEqual(Object.keys(vault.frontmatter(real.data.path)).sort())
	})

	it('opens an existing position once and rejects a link for another vault', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const created = await api.createPosition({ symbol: 'sol', side: 'LONG' })
		if (!created.ok) {
			throw new Error('expected a created position')
		}
		const path = created.data.path

		await expect(api.openPosition({ path: `/${path}` })).resolves.toMatchObject({
			ok: false,
			error: { code: 'INVALID_VALUE', field: 'path' },
		})
		await expect(api.handleOpenPositionUri({ vault: 'other-vault', file: path })).resolves.toContain('targets vault')
		await expect(api.openPosition({ path })).resolves.toMatchObject({ ok: true, data: { path, reusedTab: false } })
		await expect(api.openPosition({ path })).resolves.toMatchObject({ ok: true, data: { path, reusedTab: true } })
	})

	it('closes its own tab when the position view cannot be created', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const created = await api.createPosition({ symbol: 'sol', side: 'LONG' })
		if (!created.ok) {
			throw new Error('expected a created position')
		}
		vault.failNextSetViewState()

		const result = await api.openPosition({ path: created.data.path })

		expect(result.ok).toBe(false)
		expect(vault.leaves).toHaveLength(1)
		expect(vault.leaves[0]?.detached).toBe(true)
	})
})
