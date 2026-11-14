import { TFile, TFolder, type App } from 'obsidian'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setTradingViewRequesterForTests } from '../domains/symbol/metadata'
import { setCurrentTimeZoneSetting } from '../settings/plugin-settings'

import { persistAttachment } from './attachments'
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
			parent: { path: path.split('/').slice(0, -1).join('/') },
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
			getFiles: () => files(),
			read: async (file: TFile) => readContent(file),
			cachedRead: async (file: TFile) => readContent(file),
			modify: async (file: TFile, content: string) => {
				writeFile(file.path, content)
			},
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
			getFirstLinkpathDest: (linkpath: string) => files().find((file) => file.basename === linkpath || file.name === linkpath) ?? null,
			get resolvedLinks() {
				const links: Record<string, Record<string, number>> = {}
				for (const source of files().filter((file) => file.extension === 'md')) {
					for (const match of readContent(source).matchAll(/\[\[([^\]|]+)/g)) {
						const target = files().find((file) => file.basename === match[1] || file.name === match[1])
						if (target !== undefined) {
							links[source.path] = { ...links[source.path], [target.path]: 1 }
						}
					}
				}
				return links
			},
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
			// Like Obsidian: move the note and rewrite every wikilink that pointed at it.
			renameFile: async (file: TFile, nextPath: string) => {
				const previousBasename = file.basename
				const content = readContent(file)
				entries.delete(file.path)
				const nextName = nextPath.split('/').pop() ?? nextPath
				Object.assign(file, { path: nextPath, name: nextName, basename: nextName.replace(/\.md$/, '') })
				entries.set(nextPath, { kind: 'file', file, content })
				for (const other of files()) {
					if (other.extension === 'md') {
						writeFile(other.path, readContent(other).split(`[[${previousBasename}]]`).join(`[[${file.basename}]]`))
					}
				}
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
/** 1x1 transparent PNG, enough to exercise the real attachment pipeline. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
				+ ' && (open -a Obsidian 2>/dev/null || true);'
				+ ' obsidian vault=test-vault-id eval code="app.plugins.plugins.lucrjournal.api.openPosition({ path: \'LucrJournal/positions/POS-00001.md\' })"',
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
		// Focus is best-effort: a failed URL handler or a missing/renamed bundle must not skip the verification step.
		expect(mac.bash).toContain('(open -a Obsidian 2>/dev/null || true); obsidian vault=')
		expect(windows.bash).toContain('Start-Process \'obsidian://lucrjournal-open-position?vault=2b770fde7df4a65c&file=LucrJournal%2Fpositions%2FPOS-00012.md\'"; obsidian vault=')
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

	it('saves a base64 image into the dated attachment folder and returns a pasteable token', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.saveAttachment({ base64: PNG_BASE64, fileName: 'chart.png' })

		expect(result.ok).toBe(true)
		if (!result.ok) {
			return
		}
		expect(result.data.path).toMatch(new RegExp(`^${ROOT}/attachments/\\d{4}-\\d{2}/\\d{4}-\\d{2}-\\d{2}_[\\d-]+_chart\\.png$`))
		expect(result.data.embed).toBe(`!${result.data.token}`)
		expect(result.data.bytes).toBeGreaterThan(0)
		expect(vault.paths()).toContain(result.data.path)
	})

	it('adds a suffix instead of overwriting an attachment saved in the same millisecond', async () => {
		const vault = baseVault()
		const now = new Date('2026-11-10T12:00:00+08:00')
		const input = { base64: PNG_BASE64, fileName: 'chart.png' }

		const first = await persistAttachment(vault.app, input, now)
		const second = await persistAttachment(vault.app, input, now)

		expect(second.path).toBe(first.path.replace('_chart.png', '_chart-2.png'))
		expect(vault.paths()).toContain(second.path)
	})

	it('reads a local image path when the desktop fs is available', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const bytes = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0))
		vi.stubGlobal('window', {
			setTimeout: (callback: () => void) => {
				queueMicrotask(callback)
				return 0
			},
			require: (id: string) => (id === 'fs'
				? {
					existsSync: () => true,
					statSync: () => ({ isFile: () => true, size: bytes.byteLength }),
					readFileSync: () => bytes,
				}
				: undefined),
		})

		const result = await api.saveAttachment({ sourcePath: '/tmp/lucrjournal-agent-api-probe.png' })

		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.data.path).toMatch(new RegExp(`^${ROOT}/attachments/\\d{4}-\\d{2}/\\d{4}-\\d{2}-\\d{2}_[\\d-]+_lucrjournal-agent-api-probe\\.png$`))
		}
	})

	it('rejects a non-image, a missing payload and unknown fields', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		await expect(api.saveAttachment({ base64: 'aGk=', fileName: 'notes.txt' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'ATTACHMENT_UNSUPPORTED' },
		})
		await expect(api.saveAttachment({ fileName: 'chart.png' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'INVALID_VALUE' },
		})
		await expect(api.saveAttachment({ base64: PNG_BASE64, fileName: 'chart.png', path: 'x' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'UNKNOWN_FIELD' },
		})
		await expect(api.saveAttachment({ base64: PNG_BASE64 })).resolves.toMatchObject({
			ok: false,
			error: { code: 'INVALID_VALUE', field: 'attachment.fileName' },
		})
	})

	it('accepts a base64 attachment through createPosition and links it in the note', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })

		const result = await api.createPosition({
			symbol: 'sol',
			side: 'LONG',
			attachments: [{ base64: PNG_BASE64, fileName: 'chart.png' }],
		})

		expect(result.ok).toBe(true)
		if (!result.ok) {
			return
		}
		const attachmentPath = (result.data.created ?? []).find((path) => path.includes('/attachments/'))
		expect(attachmentPath).toMatch(new RegExp(`^${ROOT}/attachments/\\d{4}-\\d{2}/.*_chart\\.png$`))
		expect(vault.frontmatter(result.data.path).attachments).toEqual([`[[${attachmentPath?.split('/').pop()}]]`])
	})

	it('refuses to save an attachment while the journal is locked', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const before = vault.paths()
		vault.signOut()

		await expect(api.saveAttachment({ base64: PNG_BASE64, fileName: 'chart.png' })).resolves.toMatchObject({
			ok: false,
			error: { code: 'JOURNAL_LOCKED' },
		})
		expect(vault.paths()).toEqual(before)
	})
})

describe('agent api operations beyond createPosition', () => {
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

	const POSITION = `${ROOT}/positions/POS-00001.md`
	async function seeded() {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const created = await api.createPosition({ symbol: 'sol', side: 'LONG', entry_price: 142, stop_loss: 138, amount: 10, opened_at: '2026-11-09 10:00', links: { key_levels: ['Range high'] }, notes: 'First note.' })
		expect(created.ok).toBe(true)
		return { vault, api }
	}
	/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- results are JSON payloads read loosely on purpose */
	function data<T extends { ok: boolean }>(result: T): Record<string, any> {
		expect(result).toMatchObject({ ok: true })
		return (result as unknown as { data: Record<string, any> }).data
	}
	function fileAt(app: App, path: string): TFile {
		const file = app.vault.getAbstractFileByPath(path)
		if (!(file instanceof TFile)) {
			throw new Error(`missing test file ${path}`)
		}
		return file
	}

	it('describes exactly the operations the api exposes', async () => {
		const api = createAgentApi({ app: baseVault().app, manifest: { id: 'lucrjournal' } })
		const described = data(await api.describe())
		const names = (described.operations as Array<{ name: string }>).map((operation) => operation.name).sort()
		const exposed = Object.keys(api).filter((key) => key !== 'version' && key !== 'handleOpenPositionUri').sort()
		expect(names).toEqual(exposed)
		expect(described.version).toBe(api.version)
	})

	it('refuses every guarded operation while the journal is locked', async () => {
		const { vault, api } = await seeded()
		vault.signOut()
		for (const call of [api.listPositions({}), api.getPosition({ position: 'POS-00001' }), api.updatePosition({ position: 'POS-00001', exit_price: 150 }), api.checkHealth()]) {
			expect(await call).toMatchObject({ ok: false, error: { code: 'JOURNAL_LOCKED' } })
		}
		expect(vault.frontmatter(POSITION).status).toBe('open')
	})

	it('lists and reads positions', async () => {
		const { api } = await seeded()
		const listed = data(await api.listPositions({ symbol: 'SOL', status: 'open', from: '2026-11-01', to: '2026-11-30' }))
		expect(listed.positions).toMatchObject([{ id: 'POS-00001', symbol: 'SOLUSDT.P', account: 'Binance', side: 'LONG', status: 'open', entry_price: 142 }])
		expect(data(await api.listPositions({ status: 'closed' })).total).toBe(0)
		expect(data(await api.listPositions({ from: '2026-12-01' })).total).toBe(0)

		const position = data(await api.getPosition({ position: '1' }))
		expect(position).toMatchObject({ path: POSITION, links: { key_level: ['Range high'], news: [] }, notes: 'First note.' })
		expect(position.rev).toMatch(/^[0-9a-f]{8}$/)
		expect(await api.getPosition({ position: 'POS-00099' })).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } })
		expect(data(await api.listEntries({ kind: 'key_level' })).entries).toMatchObject([{ name: 'Range high', kind: 'key_level' }])
		expect(await api.listEntries({ kind: 'nope' })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'kind' } })
	})

	it('closes a position, appends notes and keeps the earlier notes', async () => {
		const { vault, api } = await seeded()
		const preview = data(await api.updatePosition({ position: 'POS-00001', exit_price: 150, dryRun: true }))
		expect(preview.changes).toMatchObject({ exit_price: { from: null, to: 150 }, status: { from: 'open', to: 'close' } })
		expect(vault.frontmatter(POSITION).status).toBe('open')

		const updated = data(await api.updatePosition({ position: 'POS-00001', exit_price: 150, closed_at: '2026-11-10 09:00', notes: 'Closed at the range high.' }))
		expect(updated.changes.profit.to).toBeGreaterThan(0)
		expect(vault.frontmatter(POSITION)).toMatchObject({ status: 'close', exit_price: 150, closed_at: '2026-11-10T09:00:00+08:00' })
		expect(vault.content(POSITION)).toContain('First note.\n\nClosed at the range high.')
		expect(data(await api.listPositions({ status: 'closed' })).total).toBe(1)

		expect(await api.updatePosition({ position: 'POS-00001', opened_at: '2027-01-01 00:00' })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'opened_at' } })
		data(await api.updatePosition({ position: 'POS-00001', status: 'open' }))
		expect(vault.frontmatter(POSITION)).toMatchObject({ status: 'open', exit_price: null, closed_at: null })
	})

	it('rejects invalid position changes without writing', async () => {
		const { vault, api } = await seeded()
		const before = vault.content(POSITION)
		expect(await api.updatePosition({ position: 'POS-00001', lots: 1 })).toMatchObject({ ok: false, error: { code: 'QUANTITY_CONFLICT' } })
		expect(await api.updatePosition({ position: 'POS-00001', profit: 5 })).toMatchObject({ ok: false, error: { code: 'UNKNOWN_FIELD', field: 'profit' } })
		expect(await api.updatePosition({ position: 'POS-00001', notes: '# Title' })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'notes' } })
		expect(await api.updatePosition({ position: 'POS-00001' })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE' } })
		expect(await api.updatePosition({ position: 'POS-00001', stop_loss: 160 })).toMatchObject({ ok: false, error: { code: 'RISK_DIRECTION' } })
		expect(await api.updatePosition({ position: 'POS-00001', entry_price: null })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'entry_price' } })
		expect(await api.updatePosition({ position: 'POS-00001', status: 'open', exit_price: 150 })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'status' } })
		expect(await api.listPositions({ limit: 0 })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'limit' } })
		expect(vault.content(POSITION)).toBe(before)
		expect(await api.updatePosition({ position: 'POS-00001', entry_price: 142 })).toMatchObject({ ok: true, data: { unchanged: true } })
		expect(data(await api.listAgentActivity()).activity).toMatchObject([{ id: 'act-0001', operation: 'createPosition' }])
	})

	it('detects a note the user changed after the agent read it', async () => {
		const { vault, api } = await seeded()
		const { rev } = data(await api.getPosition({ position: 'POS-00001' }))
		await vault.app.vault.process(fileAt(vault.app, POSITION), (content) => `${content}\nuser typed this\n`)
		expect(await api.updatePosition({ position: 'POS-00001', target_price: 160, ifRev: rev })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
		expect(vault.frontmatter(POSITION).target_price ?? null).toBeNull()
		const fresh = data(await api.getPosition({ position: 'POS-00001' }))
		data(await api.updatePosition({ position: 'POS-00001', target_price: 160, ifRev: fresh.rev }))
		expect(vault.content(POSITION)).toContain('user typed this')
	})

	it('restores the position when a write fails half way', async () => {
		const { vault, api } = await seeded()
		const before = vault.content(POSITION)
		const fakeVault = vault.app.vault as unknown as { process: (file: TFile, fn: (content: string) => string) => Promise<string> }
		const realProcess = fakeVault.process
		let failed = false
		fakeVault.process = async (file, fn) => {
			if (!failed) {
				failed = true
				throw new Error('disk full')
			}
			return await realProcess(file, fn)
		}
		const result = await api.updatePosition({ position: 'POS-00001', target_price: 160, notes: 'will fail' })
		expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
		expect(vault.content(POSITION)).toBe(before)
	})

	it('adds and removes attachments on an existing position', async () => {
		const { vault, api } = await seeded()
		const added = data(await api.addAttachments({ position: 'POS-00001', attachments: [{ base64: PNG_BASE64, fileName: 'chart.png' }] }))
		expect(added.added).toHaveLength(1)
		const attachmentPath = added.added[0].path as string
		expect(vault.paths()).toContain(attachmentPath)
		expect(vault.frontmatter(POSITION).attachments).toEqual([added.added[0].token])

		expect(await api.removeAttachment({ position: 'POS-00001', attachment: 'missing.png' })).toMatchObject({ ok: false, error: { code: 'ATTACHMENT_NOT_FOUND' } })
		data(await api.removeAttachment({ position: 'POS-00001', attachment: attachmentPath }))
		expect(vault.frontmatter(POSITION).attachments ?? null).toBeNull()
		expect(vault.paths()).toContain(attachmentPath)
		expect(data(await api.checkHealth()).issues).toMatchObject([{ type: 'orphan_attachment', path: attachmentPath }])
	})

	it('creates a full news entry, links and unlinks context on an existing position', async () => {
		const { vault, api } = await seeded()
		const news = data(await api.createEntry({ kind: 'news', name: 'CPI beat', impact: 'high', tags: ['#Macro'], description: 'Hot print', body: 'Core CPI above consensus.' }))
		expect(news.path).toBe(`${ROOT}/news/CPI beat.md`)
		expect(vault.frontmatter(news.path)).toMatchObject({ lucr_type: 'news', impact: 'high', description: 'Hot print' })
		expect(vault.content(news.path)).toContain('Core CPI above consensus.')
		expect(await api.createEntry({ kind: 'news', name: 'cpi beat' })).toMatchObject({ ok: false, error: { code: 'NAME_CONFLICT' } })
		expect(await api.createEntry({ kind: 'key_level', name: 'Weekly open', impact: 'high' })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'impact' } })

		expect(data(await api.linkContext({ position: 'POS-00001', kind: 'news', name: 'cpi beat' }))).toMatchObject({ linked: 'appended', created: false, name: 'CPI beat' })
		expect(data(await api.linkContext({ position: 'POS-00001', kind: 'news', name: 'CPI beat' }))).toMatchObject({ linked: 'exists' })
		expect(data(await api.linkContext({ position: 'POS-00001', kind: 'confluence', name: 'HTF trend' }))).toMatchObject({ linked: 'appended', created: true })
		expect(vault.paths()).toContain(`${ROOT}/analyses/HTF trend.md`)
		expect(data(await api.getPosition({ position: 'POS-00001' })).links).toEqual({ news: ['CPI beat'], key_level: ['Range high'], confluence: ['HTF trend'], market_analysis: [] })
		expect(vault.content(POSITION)).toContain('First note.')

		data(await api.unlinkContext({ position: 'POS-00001', kind: 'key_levels', name: 'range high' }))
		expect(data(await api.getPosition({ position: 'POS-00001' })).links.key_level).toEqual([])
		expect(vault.paths()).toContain(`${ROOT}/analyses/Range high.md`)
		expect(await api.unlinkContext({ position: 'POS-00001', kind: 'key_level', name: 'Range high' })).toMatchObject({ ok: false, error: { code: 'ENTRY_NOT_FOUND' } })

		data(await api.updateEntry({ entry: 'CPI beat', impact: 'low', tags: [], body: 'Follow-up.' }))
		expect(vault.frontmatter(news.path)).toMatchObject({ impact: 'low', tags: null })
		expect(vault.content(news.path)).toContain('Core CPI above consensus.\n\nFollow-up.')
	})

	it('creates, assigns, updates and removes a playbook', async () => {
		const { vault, api } = await seeded()
		const playbook = data(await api.createPlaybook({ name: 'Breakout', description: 'Range breaks', criteria: [{ name: 'Trend', confluences: ['HTF trend', 'Break of structure'] }] }))
		expect(playbook.path).toBe(`${ROOT}/playbooks/Breakout.md`)
		expect(vault.content(playbook.path)).toContain('# [[Trend]]\n\n## [[HTF trend]]\n\n## [[Break of structure]]')
		expect(vault.paths()).toEqual(expect.arrayContaining([`${ROOT}/analyses/HTF trend.md`, `${ROOT}/criteria/Trend.md`]))
		expect(await api.createPlaybook({ name: 'Breakout' })).toMatchObject({ ok: false, error: { code: 'NAME_CONFLICT' } })
		expect(await api.createPlaybook({ name: 'Bad', criteria: [{ name: 'A', confluences: [] }] })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'criteria' } })

		data(await api.setPlaybook({ position: 'POS-00001', playbook: 'breakout' }))
		expect(vault.frontmatter(POSITION).playbook).toBe('[[Breakout]]')
		expect(data(await api.listPositions({ playbook: 'Breakout' })).total).toBe(1)

		data(await api.updatePlaybook({ playbook: 'Breakout', criteria: [{ name: 'Trend', confluences: ['HTF trend'] }, { name: 'Entry', confluences: ['Retest'] }] }))
		expect(vault.content(playbook.path)).toContain('# [[Entry]]\n\n## [[Retest]]')
		expect(vault.content(playbook.path)).not.toContain('Break of structure')

		data(await api.removePlaybook({ position: 'POS-00001' }))
		expect(vault.frontmatter(POSITION).playbook ?? null).toBeNull()
	})

	it('creates templates and edits symbol parameters', async () => {
		const { vault, api } = await seeded()
		const template = data(await api.createTemplate({ name: 'Swing', body: '# Notes\n\n## Thesis\n' }))
		expect(vault.frontmatter(template.path)).toMatchObject({ lucr_type: 'template', name: 'Swing' })
		expect(vault.content(template.path)).toContain('## Thesis')
		expect(data(await api.listEntries({ kind: 'template' })).total).toBe(1)

		data(await api.updateSymbol({ symbol: 'SOLUSDT.P', fee_value: 0.05 }))
		expect(vault.frontmatter(`${ROOT}/symbols/SBL-Binance-SOLUSDT.P.md`).fee_value).toBe(0.05)
		expect(await api.updateSymbol({ symbol: 'NOPE', fee_value: 1 })).toMatchObject({ ok: false, error: { code: 'ENTRY_NOT_FOUND' } })
	})

	it('renames only after a confirmed preview and updates links', async () => {
		const { vault, api } = await seeded()
		const preview = await api.renameEntry({ entry: 'Range high', newName: 'Weekly range high' })
		expect(preview).toMatchObject({ ok: true, needsConfirmation: true })
		const { scope, confirmToken } = data(preview)
		expect(scope.linksUpdatedIn).toEqual([POSITION])
		expect(vault.paths()).toContain(`${ROOT}/analyses/Range high.md`)

		expect(await api.renameEntry({ entry: 'Range high', newName: 'Weekly range high', confirmToken: 'deadbeef' })).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_INVALID' } })
		expect(await api.renameEntry({ entry: 'POS-00001', newName: 'X' })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE' } })

		data(await api.renameEntry({ entry: 'Range high', newName: 'Weekly range high', confirmToken }))
		expect(vault.paths()).toContain(`${ROOT}/analyses/Weekly range high.md`)
		expect(data(await api.getPosition({ position: 'POS-00001' })).links.key_level).toEqual(['Weekly range high'])
	})

	it('deletes only after a confirmed preview, with the same cascade as the UI', async () => {
		const { vault, api } = await seeded()
		const preview = data(await api.deleteEntry({ entry: 'Range high' }))
		// The heading link is removed by the delete, so the position is not reported as left broken.
		expect(preview.scope).toMatchObject({ trash: { key_level: `${ROOT}/analyses/Range high.md` }, unlinkedFromPositions: [POSITION], linksLeftBroken: [] })
		expect(vault.trashed).toEqual([])
		data(await api.deleteEntry({ entry: 'Range high', confirmToken: preview.confirmToken }))
		expect(vault.trashed).toEqual([`${ROOT}/analyses/Range high.md`])
		expect(vault.content(POSITION)).not.toContain('[[Range high]]')

		const account = data(await api.deleteEntry({ entry: 'Binance', kind: 'account' }))
		expect(account.scope.linksLeftBroken).toEqual([])
		expect(account.scope.trash).toMatchObject({ account: `${ROOT}/accounts/ACC-Binance.md`, symbols: [`${ROOT}/symbols/SBL-Binance-SOLUSDT.P.md`], positions: [POSITION] })
		expect(vault.paths()).toContain(POSITION)
		data(await api.deleteEntry({ entry: 'Binance', kind: 'account', confirmToken: account.confirmToken }))
		expect(vault.paths()).not.toContain(POSITION)
		expect(await api.deleteEntry({ entry: `${ROOT}/platforms/Binance.md` })).toMatchObject({ ok: false })
	})

	it('reports notes broken by hand edits', async () => {
		const { vault, api } = await seeded()
		expect(data(await api.checkHealth())).toMatchObject({ healthy: true, issues: [] })
		const file = fileAt(vault.app, POSITION)
		await vault.app.vault.process(file, (content) => content.replace('## [[Range high]]', '## [[Range high]]\n\n## [[Gone]]'))
		expect(data(await api.checkHealth()).issues).toMatchObject([{ type: 'broken_link', path: POSITION }])
		await vault.app.vault.process(file, (content) => content.replace('lucr_type: "position"', 'lucr_type: "positon"'))
		const report = data(await api.checkHealth())
		expect(report.healthy).toBe(false)
		expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'invalid_note', path: POSITION })]))
	})

	it('logs agent writes and undoes them unless the note changed since', async () => {
		const { vault, api } = await seeded()
		const before = vault.content(POSITION)
		const updated = await api.updatePosition({ position: 'POS-00001', target_price: 160 })
		const linked = await api.linkContext({ position: 'POS-00001', kind: 'news', name: 'FOMC' })
		expect(updated).toMatchObject({ ok: true, activityId: 'act-0002' })
		expect(linked).toMatchObject({ ok: true })
		expect(data(await api.listAgentActivity()).activity).toMatchObject([
			{ id: 'act-0003', operation: 'linkContext', created: [`${ROOT}/news/FOMC.md`], modified: [POSITION] },
			{ id: 'act-0002', operation: 'updatePosition', modified: [POSITION] },
			{ id: 'act-0001', operation: 'createPosition', created: expect.arrayContaining([POSITION]) },
		])
		expect(await api.listAgentActivity({ limit: 0 })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'limit' } })

		// Out of order: the later agent operation is named, not the user.
		const outOfOrder = await api.undo({ id: 'act-0002' })
		expect(outOfOrder).toMatchObject({ ok: false, error: { code: 'CONFLICT', details: { laterOperations: ['act-0003'] } } })

		data(await api.undo())
		expect(vault.paths()).not.toContain(`${ROOT}/news/FOMC.md`)
		expect(vault.frontmatter(POSITION).target_price).toBe(160)
		data(await api.undo({ id: 'act-0002' }))
		expect(vault.content(POSITION)).toBe(before)
		expect(await api.undo({ id: 'act-0002' })).toMatchObject({ ok: false, error: { code: 'UNDO_UNAVAILABLE' } })

		data(await api.updatePosition({ position: 'POS-00001', target_price: 170 }))
		await vault.app.vault.process(fileAt(vault.app, POSITION), (content) => `${content}\nuser edit\n`)
		expect(await api.undo()).toMatchObject({ ok: false, error: { code: 'CONFLICT', details: { laterOperations: [] } } })
		expect(vault.content(POSITION)).toContain('user edit')
	})

	it('does not undo a created note the user edited or renamed, and skips no-op records', async () => {
		const { vault, api } = await seeded()
		const edited = await api.createEntry({ kind: 'news', name: 'Edited later' })
		await vault.app.vault.process(fileAt(vault.app, `${ROOT}/news/Edited later.md`), (content) => `${content}\nhuman paragraph\n`)
		expect(await api.undo({ id: (edited as { activityId?: string }).activityId })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
		expect(vault.paths()).toContain(`${ROOT}/news/Edited later.md`)

		const renamed = await api.createEntry({ kind: 'news', name: 'Rename me' })
		const preview = data(await api.renameEntry({ entry: 'Rename me', newName: 'Renamed' }))
		const done = await api.renameEntry({ entry: 'Rename me', newName: 'Renamed', confirmToken: preview.confirmToken })
		expect(done).toMatchObject({ ok: true })
		expect(await api.undo({ id: (renamed as { activityId?: string }).activityId })).toMatchObject({ ok: false, error: { code: 'UNDO_UNAVAILABLE' } })
		expect(vault.paths()).toContain(`${ROOT}/news/Renamed.md`)
		expect(data(await api.listAgentActivity()).activity[0]).toMatchObject({ operation: 'renameEntry', created: [`${ROOT}/news/Renamed.md`], removed: [`${ROOT}/news/Rename me.md`] })

		const count = data(await api.listAgentActivity({ limit: 50 })).activity.length
		expect(await api.removePlaybook({ position: 'POS-00001' })).toMatchObject({ ok: true, unchanged: true })
		expect(data(await api.listAgentActivity({ limit: 50 })).activity).toHaveLength(count)
	})

	it('reports a position as left broken only when it keeps a link the delete does not remove', async () => {
		const { vault, api } = await seeded()
		await vault.app.vault.process(fileAt(vault.app, POSITION), (content) => `${content}\nSee [[Range high|the range]] again.\n`)
		const preview = data(await api.deleteEntry({ entry: 'Range high' }))
		expect(preview.scope).toMatchObject({ unlinkedFromPositions: [POSITION], linksLeftBroken: [POSITION] })
	})

	it('does not undo a created note that another note links to since', async () => {
		const { vault, api } = await seeded()
		const created = await api.createEntry({ kind: 'news', name: 'Linked later' })
		const linked = await api.linkContext({ position: 'POS-00001', kind: 'news', name: 'Linked later' })
		const createdId = (created as { activityId?: string }).activityId
		const linkedId = (linked as { activityId?: string }).activityId
		expect(await api.undo({ id: createdId })).toMatchObject({ ok: false, error: { code: 'CONFLICT', details: { linkedFrom: [POSITION], laterOperations: [linkedId] } } })
		expect(vault.paths()).toContain(`${ROOT}/news/Linked later.md`)

		data(await api.undo({ id: linkedId }))
		data(await api.undo({ id: createdId }))
		expect(vault.paths()).not.toContain(`${ROOT}/news/Linked later.md`)
	})

	it('does not send the agent to undo a deletion that cannot be undone', async () => {
		const { api } = await seeded()
		const closed = await api.updatePosition({ position: 'POS-00001', exit_price: 150 })
		const preview = data(await api.deleteEntry({ entry: 'Range high' }))
		const deleted = await api.deleteEntry({ entry: 'Range high', confirmToken: preview.confirmToken })
		const deletedId = (deleted as { activityId?: string }).activityId
		const result = await api.undo({ id: (closed as { activityId?: string }).activityId })
		expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', details: { laterOperations: [deletedId] } } })
		const fix = (result as unknown as { error: { fix: string } }).error.fix
		expect(fix).toContain('cannot be undone')
		expect(fix).not.toContain('first (newest first)')
	})

	it('treats a body line starting with "modified:" as a user edit', async () => {
		const { vault, api } = await seeded()
		const created = await api.createTemplate({ name: 'Body modified', body: 'modified: draft' })
		const path = data(created).path as string
		await vault.app.vault.process(fileAt(vault.app, path), (content) => content.replace('modified: draft', 'modified: final'))
		expect(await api.undo({ id: (created as { activityId?: string }).activityId })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
		expect(vault.content(path)).toContain('modified: final')
	})

	it('removes an attachment by full path without touching a same-named image in another folder', async () => {
		const { vault, api } = await seeded()
		const first = `[[${ROOT}/attachments/a/chart.png]]`
		const second = `[[${ROOT}/attachments/b/chart.png]]`
		await vault.app.fileManager.processFrontMatter(fileAt(vault.app, POSITION), (frontmatter: Record<string, unknown>) => {
			frontmatter.attachments = [first, second]
		})
		expect(await api.removeAttachment({ position: 'POS-00001', attachment: 'chart.png' })).toMatchObject({ ok: false, error: { code: 'ENTRY_AMBIGUOUS', candidates: [first, second] } })
		expect(data(await api.removeAttachment({ position: 'POS-00001', attachment: `${ROOT}/attachments/a/chart.png` }))).toMatchObject({ removed: [first], attachments: [second] })
		expect(vault.frontmatter(POSITION).attachments).toEqual([second])
		expect(data(await api.removeAttachment({ position: 'POS-00001', attachment: 'chart.png' }))).toMatchObject({ removed: [second] })
	})

	it('links an existing note given by file name or vault path instead of creating one named after it', async () => {
		const { vault, api } = await seeded()
		data(await api.createEntry({ kind: 'news', name: 'CPI beat' }))
		expect(data(await api.linkContext({ position: 'POS-00001', kind: 'news', name: 'CPI beat.md' }))).toMatchObject({ name: 'CPI beat', created: false, linked: 'appended' })
		expect(data(await api.linkContext({ position: 'POS-00001', kind: 'news', name: `${ROOT}/news/CPI beat.md` }))).toMatchObject({ name: 'CPI beat', linked: 'exists' })
		expect(await api.linkContext({ position: 'POS-00001', kind: 'news', name: `${ROOT}/news/Missing.md` })).toMatchObject({ ok: false, error: { code: 'ENTRY_NOT_FOUND' } })
		expect(vault.paths().filter((path) => path.startsWith(`${ROOT}/news/`))).toEqual([`${ROOT}/news/CPI beat.md`])
	})

	it('unlinks every heading of a note that a hand edit linked twice', async () => {
		const { vault, api } = await seeded()
		await vault.app.vault.process(fileAt(vault.app, POSITION), (content) => content.replace('## [[Range high]]', '## [[Range high]]\n\n## [[Range high]]'))
		expect(data(await api.getPosition({ position: 'POS-00001' })).links.key_level).toEqual(['Range high', 'Range high'])
		expect(data(await api.unlinkContext({ position: 'POS-00001', kind: 'key_level', name: 'Range high' }))).toMatchObject({ unlinked: true })
		expect(data(await api.getPosition({ position: 'POS-00001' })).links.key_level).toEqual([])
		expect(vault.content(POSITION)).not.toContain('[[Range high]]')
		expect(vault.content(POSITION)).toContain('First note.')
	})

	it('accepts saveAttachment input as base64 JSON, like every other operation (what lucr.sh sends)', async () => {
		const { vault, api } = await seeded()
		const encoded = (input: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(input))))
		const preview = await api.saveAttachment(encoded({ base64: PNG_BASE64, fileName: 'chart enc.png', dryRun: true }))
		expect(preview).toMatchObject({ ok: true, dryRun: true })
		const saved = data(await api.saveAttachment(encoded({ base64: PNG_BASE64, fileName: 'chart enc.png' })))
		expect(vault.paths()).toContain(saved.path)
		expect(await api.saveAttachment('not base64 at all')).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE' } })
		const broken = await api.listEntries(btoa('{ "kind": "news",'))
		expect(broken).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', message: expect.stringContaining('malformed JSON') } })
	})

	it('previews saveAttachment without writing', async () => {
		const { vault, api } = await seeded()
		const before = data(await api.listAgentActivity({ limit: 50 })).activity.length
		const preview = await api.saveAttachment({ base64: PNG_BASE64, fileName: 'dry.png', dryRun: true })
		expect(preview).toMatchObject({ ok: true, dryRun: true, data: { bytes: expect.any(Number) } })
		expect(vault.paths()).not.toContain((preview as unknown as { data: { path: string } }).data.path)
		expect(data(await api.listAgentActivity({ limit: 50 })).activity).toHaveLength(before)
		expect(await api.saveAttachment({ base64: PNG_BASE64, fileName: 'dry.png', dryRun: 'yes' })).toMatchObject({ ok: false, error: { code: 'INVALID_VALUE', field: 'dryRun' } })
		const saved = data(await api.saveAttachment({ base64: PNG_BASE64, fileName: 'dry.png' }))
		expect(vault.paths()).toContain(saved.path)
	})

	it('restores the positions a failed delete already unlinked', async () => {
		const { vault, api } = await seeded()
		const before = vault.content(POSITION)
		const preview = data(await api.deleteEntry({ entry: 'Range high' }))
		const fileManager = vault.app.fileManager as unknown as { trashFile: (file: TFile) => Promise<void> }
		fileManager.trashFile = async () => {
			throw new Error('trash failed')
		}
		expect(await api.deleteEntry({ entry: 'Range high', confirmToken: preview.confirmToken })).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
		expect(vault.content(POSITION)).toBe(before)
		expect(vault.paths()).toContain(`${ROOT}/analyses/Range high.md`)
	})

	it('moves a renamed note back when a later rename step fails', async () => {
		const { vault, api } = await seeded()
		const preview = data(await api.renameEntry({ entry: 'Range high', newName: 'Range top' }))
		const fileVault = vault.app.vault as unknown as { read: (file: TFile) => Promise<string> }
		const read = fileVault.read.bind(fileVault)
		fileVault.read = async (file: TFile) => {
			if (file.path.endsWith('Range top.md')) {
				throw new Error('read failed')
			}
			return await read(file)
		}
		expect(await api.renameEntry({ entry: 'Range high', newName: 'Range top', confirmToken: preview.confirmToken })).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
		expect(vault.paths()).toContain(`${ROOT}/analyses/Range high.md`)
		expect(vault.paths()).not.toContain(`${ROOT}/analyses/Range top.md`)
		expect(vault.content(POSITION)).toContain('[[Range high]]')
	})

	it('accepts a confirm token once, only for the preview it came from', async () => {
		const { api } = await seeded()
		data(await api.createEntry({ kind: 'news', name: 'Again' }))
		const first = data(await api.deleteEntry({ entry: 'Again' }))
		const second = data(await api.deleteEntry({ entry: 'Again' }))
		expect(second.confirmToken).not.toBe(first.confirmToken)
		expect(await api.deleteEntry({ entry: 'Range high', confirmToken: first.confirmToken })).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_INVALID' } })
		data(await api.deleteEntry({ entry: 'Again', confirmToken: first.confirmToken }))
		data(await api.createEntry({ kind: 'news', name: 'Again' }))
		// Same entry, same scope: the used token still does not confirm the new note.
		expect(await api.deleteEntry({ entry: 'Again', confirmToken: first.confirmToken })).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_INVALID' } })
	})

	it('locates an entry given as a wikilink with an alias', async () => {
		const { api } = await seeded()
		expect(data(await api.updateEntry({ entry: '[[Range high|the range]]', description: 'Weekly', dryRun: true }))).toMatchObject({ path: `${ROOT}/analyses/Range high.md` })
	})

	it('gives concurrent createPosition calls distinct ids', async () => {
		const vault = baseVault()
		const api = createAgentApi({ app: vault.app, manifest: { id: 'lucrjournal' } })
		const results = await Promise.all([1, 2, 3, 4].map((index) => api.createPosition({ symbol: 'sol', side: 'LONG', entry_price: 140 + index, stop_loss: 130 })))
		expect(results.map((result) => result.ok)).toEqual([true, true, true, true])
		expect(vault.paths().filter((path) => path.includes('/positions/'))).toEqual([1, 2, 3, 4].map((index) => `${ROOT}/positions/POS-0000${index}.md`))
		expect(vault.trashed).toEqual([])
	})

	it('explains a position whose properties were damaged instead of calling it missing', async () => {
		const { vault, api } = await seeded()
		await vault.app.vault.process(fileAt(vault.app, POSITION), (content) => content.replace('lucr_type: "position"', 'lucr_type: "positon"'))
		const result = await api.getPosition({ position: 'POS-00001' })
		expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND', details: { path: POSITION } } })
	})

	it('opens any entry for the user', async () => {
		const { api } = await seeded()
		expect(data(await api.open({ entry: 'POS-00001' }))).toMatchObject({ kind: 'position', viewType: 'lucrjournal-position-view' })
		expect(data(await api.open({ entry: 'Range high' }))).toMatchObject({ kind: 'key_level', viewType: 'markdown' })
	})
})
