import { TFile } from 'obsidian'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
	deleteAccount,
	deleteSymbol,
	gatherAccountDeletionScope,
	gatherSymbolDeletionScope,
} from '..'
import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { AccountDomain } from '../account'
import { listAccountTableEntries } from '../account/fields'

import { listSymbolTableEntries } from './fields'
import { setTradingViewRequesterForTests } from './metadata'

import { buildSymbolFileBaseName, resolveSymbolName, SymbolDomain } from './index'

type MockAppState = {
	files: TFile[]
	frontmatters: Map<string, Record<string, unknown>>
	contents: Map<string, string>
	trashedPaths: string[]
}

function createMockFile(path: string): TFile {
	const file = new TFile()
	const parentPath = path.split('/').slice(0, -1).join('/')
	return Object.assign(file, {
		path,
		basename: path.split('/').pop()?.replace(/\.md$/, '') ?? path,
		parent: { path: parentPath },
	})
}

function parseFrontmatterValue(value: string): unknown {
	const trimmed = value.trim()
	if (trimmed.startsWith('"') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
		return JSON.parse(trimmed)
	}
	if (trimmed === 'null') {
		return null
	}
	if (trimmed === 'true') {
		return true
	}
	if (trimmed === 'false') {
		return false
	}
	const numericValue = Number(trimmed)
	return Number.isFinite(numericValue) ? numericValue : trimmed
}

function parseFrontmatter(markdown: string): Record<string, unknown> {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
	if (match == null) {
		return {}
	}

	const frontmatterBlock = match[1]
	if (frontmatterBlock === undefined) {
		return {}
	}

	return Object.fromEntries(
		frontmatterBlock
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.map((line) => {
				const separatorIndex = line.indexOf(':')
				const key = line.slice(0, separatorIndex).trim()
				const rawValue = line.slice(separatorIndex + 1).trim()
				return [key, parseFrontmatterValue(rawValue)]
			}),
	)
}

function createMockApp(initialFiles: Array<{
	path: string
	frontmatter: Record<string, unknown>
	content?: string
}>, options: { cacheCreatedFrontmatter?: boolean } = {}) {
	const cacheCreatedFrontmatter = options.cacheCreatedFrontmatter ?? true
	const cachedPaths = new Set(initialFiles.map(({ path }) => path))
	const state: MockAppState = {
		files: initialFiles.map(({ path }) => createMockFile(path)),
		frontmatters: new Map(initialFiles.map(({ path, frontmatter }) => [path, { ...frontmatter }])),
		contents: new Map(initialFiles.map(({ path, content }) => [path, content ?? '\n# Title\n'])),
		trashedPaths: [],
	}

	const app = {
		vault: {
			getMarkdownFiles: () => state.files,
			getAbstractFileByPath: (path: string) => state.files.find((file) => file.path === path) ?? null,
			create: async (path: string, content: string) => {
				const file = createMockFile(path)
				state.files.push(file)
				state.contents.set(path, content)
				state.frontmatters.set(path, parseFrontmatter(content))
				if (cacheCreatedFrontmatter) {
					cachedPaths.add(path)
				}
				return file
			},
			read: async (file: TFile) => state.contents.get(file.path) ?? '\n# Title\n',
			modify: async (file: TFile, content: string) => {
				state.contents.set(file.path, content)
			},
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({
				frontmatter: cachedPaths.has(file.path) ? state.frontmatters.get(file.path) ?? null : null,
			}),
		},
		fileManager: {
			processFrontMatter: async (file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
				const currentFrontmatter = {
					...(state.frontmatters.get(file.path) ?? {}),
				}
				updater(currentFrontmatter)
				state.frontmatters.set(file.path, currentFrontmatter)
			},
			renameFile: async (file: TFile, nextPath: string) => {
				const currentPath = file.path
				const nextFile = createMockFile(nextPath)
				Object.assign(file, nextFile)
				state.frontmatters.set(nextPath, state.frontmatters.get(currentPath) ?? {})
				state.frontmatters.delete(currentPath)
				state.contents.set(nextPath, state.contents.get(currentPath) ?? '\n# Title\n')
				state.contents.delete(currentPath)
				if (cachedPaths.delete(currentPath)) {
					cachedPaths.add(nextPath)
				}
			},
			trashFile: async (file: TFile) => {
				state.trashedPaths.push(file.path)
				state.files = state.files.filter((candidate) => candidate.path !== file.path)
				state.frontmatters.delete(file.path)
				state.contents.delete(file.path)
			},
		},
	}

	return { app, state }
}

describe('buildSymbolFileBaseName', () => {
	it('uses the account display name plus normalized symbol name before sanitizing the basename', () => {
		expect(buildSymbolFileBaseName('Main Desk', 'btc/usdt:usdt')).toBe('SBL-Main Desk-BTCUSDT.P')
		expect(buildSymbolFileBaseName('Main Desk', 'btc/usdt')).toBe('SBL-Main Desk-BTCUSDT')
		expect(buildSymbolFileBaseName('Main Desk', 'foo/bar')).toBe('SBL-Main Desk-FOO∕BAR')
		expect(buildSymbolFileBaseName('Main Desk', 'btcusdt')).toBe('SBL-Main Desk-BTCUSDT')
	})
})

describe('resolveSymbolName', () => {
	it('resolves the persisted symbol entry name from a symbol wikilink', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
			},
		])

		expect(resolveSymbolName(app, '[[SBL-Research-BTCUSDT]]')).toBe('BTCUSDT')
		expect(resolveSymbolName(app, { symbol: '[[SBL-Research-BTCUSDT]]' })).toBe('BTCUSDT')
	})
})

describe('SymbolDomain', () => {
	beforeEach(() => {
		setTradingViewRequesterForTests(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ symbols: [] }),
		}))
	})

	afterEach(() => {
		setTradingViewRequesterForTests(null)
	})

	it('maps invalid fee_value to a visible error message key', () => {
		expect(SymbolDomain.toCreateEntryErrorMessageKey(new Error('FEE_VALUE_INVALID_ERROR')))
			.toBe('SYMBOL_FEE_VALUE_INVALID')
	})

	it('uses the shared symbol combobox for the create form name field', () => {
		expect(SymbolDomain.formDefinition.name.type).toBe('symbol_combobox')
	})

	it('requires the create form account to match an existing account', () => {
		const { app } = createMockApp([])

		expect(SymbolDomain.formDefinition.account.validate?.('Research', { account: 'Research', name: 'BTCUSDT' }, { app: app as never }))
			.toBe('SYMBOL_ACCOUNT_NOT_FOUND')
	})

	it('lists existing symbols for the selected account with logo and type metadata', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.P.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT.P',
					account: '[[ACC-Research]]',
					type: 'Crypto_Perp',
					logo: 'btc.svg',
				},
			},
		])

		expect(SymbolDomain.listPickerOptionsForAccountName(app as never, 'Research')).toEqual([
			{
				value: 'BTCUSDT.P',
				label: 'BTCUSDT.P',
				icon: { kind: 'url', value: 'btc.svg' },
				symbolType: 'Crypto_Perp',
			},
		])
	})

	it('keeps symbol picker options scoped to the selected account', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Swing.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Swing',
					platform: '[[Bybit]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
					type: 'Crypto_Spot',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Swing-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Swing]]',
					type: 'Crypto_Spot',
				},
			},
		])

		expect(SymbolDomain.listPickerOptionsForAccountName(app as never, 'Research').map((option) => option.label))
			.toEqual(['BTCUSDT'])
	})

	it('coerces persisted type and fee_value into the canonical schema', () => {
		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'btc/usdt',
			account: '[[ACC-Research]]',
			platform: '[[Binance]]',
			type: 'crypto_spot',
			fee_value: '1.25',
		})).toEqual({
			lucr_type: 'symbol',
			name: 'BTCUSDT',
			account: '[[ACC-Research]]',
			platform: '[[Binance]]',
			type: 'Crypto_Spot',
			fee_value: 1.25,
			contract_unit: null,
		})
	})

	it('canonicalizes known symbol forms via builtin lookup when saving symbol names', () => {
		for (const name of ['BTC/USDT', 'btcusdt', 'BTC-USDT']) {
			expect(SymbolDomain.refine({
				lucr_type: 'symbol',
				name,
				account: '[[ACC-Research]]',
			})?.name).toBe('BTCUSDT')
		}
		for (const name of ['BTCUSDT.P', 'BTC/USDT.P', 'BTC/USDT:USDT']) {
			expect(SymbolDomain.refine({
				lucr_type: 'symbol',
				name,
				account: '[[ACC-Research]]',
			})?.name).toBe('BTCUSDT.P')
		}
	})

	it('canonicalizes non-builtin compact quote pair forms when saving symbol names', () => {
		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'FOO/USDT',
			account: '[[ACC-Research]]',
		})?.name).toBe('FOOUSDT')
		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'BTCFDUSD',
			account: '[[ACC-Research]]',
		})?.name).toBe('BTCFDUSD')
	})

	it('preserves retired short metal codes when saving symbol names', () => {
		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'xau',
			account: '[[ACC-Research]]',
		})?.name).toBe('XAU')
	})

	it('reuses an existing legacy slash symbol entry when user input keeps slash form', async () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTC∕USDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTC/USDT',
					account: '[[ACC-Research]]',
				},
			},
		])

		await expect(SymbolDomain.ensureEntry(app as never, {
			account: 'Research',
			name: 'BTC/USDT',
		})).resolves.toMatchObject({
			created: false,
			wikilink: '[[SBL-Research-BTC∕USDT]]',
		})
	})

	it('keeps cfd contract_unit overrides and drops non-cfd overrides', () => {
		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'eurusd',
			account: '[[ACC-Research]]',
			type: 'cfd',
			contract_unit: '50000',
		})?.contract_unit).toBe(50000)

		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'eurusd',
			account: '[[ACC-Research]]',
			type: 'cfd',
			contract_unit: '50000.5',
		})?.contract_unit).toBe(50001)

		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'eurusd',
			account: '[[ACC-Research]]',
			type: 'cfd',
			contract_unit: '0.4',
		})?.contract_unit).toBeNull()

		expect(SymbolDomain.refine({
			lucr_type: 'symbol',
			name: 'es',
			account: '[[ACC-Research]]',
			type: 'future',
			contract_unit: 50000,
		})?.contract_unit).toBeNull()
	})

	it('creates a canonical spot-like symbol note without builtin metadata', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
		])

		await SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: 'foo/usdt',
		})

		const symbolFrontmatter = state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-FOOUSDT.md`)
		expect(symbolFrontmatter).toMatchObject({
			lucr_type: 'symbol',
			name: 'FOOUSDT',
			account: '[[ACC-Research]]',
			type: 'Crypto_Spot',
		})
		expect(symbolFrontmatter).not.toHaveProperty('platform')
	})

	it('creates a perp symbol note from dot suffix crypto symbols', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
		])

		await SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: 'btc/usdt.p',
		})

		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.P.md`)).toMatchObject({
			lucr_type: 'symbol',
			name: 'BTCUSDT.P',
			account: '[[ACC-Research]]',
			type: 'Crypto_Perp',
			logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
		})
	})

	it('marks builtin future symbols as Future', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Interactive Brokers]]',
				},
			},
		])

		await SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: 'es',
		})

		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-ES.md`)).toMatchObject({
			lucr_type: 'symbol',
			name: 'ES',
			account: '[[ACC-Research]]',
			type: 'Future',
			logo: 'https://s3-symbol-logo.tradingview.com/indices/s-and-p-500.svg',
		})
	})

	it('marks major currency pairs as CFD', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[MetaTrader]]',
				},
			},
		])

		await SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: 'eurusd',
		})

		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-EURUSD.md`)).toMatchObject({
			lucr_type: 'symbol',
			name: 'EURUSD',
			account: '[[ACC-Research]]',
			type: 'CFD',
			logo: 'https://s3-symbol-logo.tradingview.com/country/EU.svg',
		})
	})

	it('creates retired short metal codes as literal symbol names', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[MetaTrader]]',
				},
			},
		])

		await SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: 'xau',
		})

		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-XAU.md`)).toMatchObject({
			lucr_type: 'symbol',
			name: 'XAU',
			account: '[[ACC-Research]]',
		})
		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-XAU.md`)).not.toHaveProperty('type')
	})

	it('creates broker-suffixed cfd symbols with canonical symbol identity', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[MetaTrader]]',
				},
			},
		])

		await SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: 'xauusd+',
		})

		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-XAUUSD.md`)).toMatchObject({
			lucr_type: 'symbol',
			name: 'XAUUSD',
			account: '[[ACC-Research]]',
			type: 'CFD',
		})
	})

	it('writes tradingview-derived logo + type for a non-builtin crypto perp', async () => {
		setTradingViewRequesterForTests(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				symbols: [{ symbol: 'WIFUSDT.P', type: 'spot', logo: { logoid: 'crypto/XTVCWIF' } }],
			}),
		}))
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Binance.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Binance',
					platform: '[[Binance]]',
				},
			},
		])

		const result = await SymbolDomain.createEntry(app as never, { account: 'Binance', name: 'WIFUSDT.P' })
		expect(result.entry).toMatchObject({
			name: 'WIFUSDT.P',
			type: 'Crypto_Perp',
			logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCWIF.svg',
		})
		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Binance-WIFUSDT.P.md`)).toMatchObject({
			lucr_type: 'symbol',
			name: 'WIFUSDT.P',
			account: '[[ACC-Binance]]',
			type: 'Crypto_Perp',
			logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCWIF.svg',
		})
		expect(state.contents.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Binance-WIFUSDT.P.md`)).toMatch(/\n---\n$/)
	})

	it('queries TradingView with the canonical compact name for slash spot pairs', async () => {
		const queries: string[] = []
		setTradingViewRequesterForTests(async (url: string) => {
			queries.push(decodeURIComponent(url.split('text=')[1]?.split('&')[0] ?? ''))
			return {
				ok: true,
				status: 200,
				json: async () => ({
					symbols: [{ symbol: 'FOOUSDT', type: 'spot', logo: { logoid: 'crypto/XTVCFOO' } }],
				}),
			}
		})
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Binance.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Binance',
					platform: '[[Binance]]',
				},
			},
		])

		const result = await SymbolDomain.createEntry(app as never, { account: 'Binance', name: 'FOO/USDT' })
		expect(queries).toEqual(['FOOUSDT'])
		expect(result.entry).toMatchObject({
			name: 'FOOUSDT',
			type: 'Crypto_Spot',
			logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCFOO.svg',
		})
	})

	it('keeps an unknown symbol untyped when TradingView returns nothing', async () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-MetaTrader.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'MetaTrader',
					platform: '[[MetaTrader]]',
				},
			},
		])

		const result = await SymbolDomain.createEntry(app as never, { account: 'MetaTrader', name: 'TSLA' })
		expect(result.entry).toMatchObject({ name: 'TSLA', type: null, logo: null })
	})

	it('keeps an unknown symbol untyped when TradingView fails', async () => {
		setTradingViewRequesterForTests(async () => {
			throw new Error('offline')
		})
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-MetaTrader.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'MetaTrader',
					platform: '[[MetaTrader]]',
				},
			},
		])

		const result = await SymbolDomain.createEntry(app as never, { account: 'MetaTrader', name: 'TSLA' })
		expect(result.entry).toMatchObject({ name: 'TSLA', type: null, logo: null })
	})

	it('does not call TradingView when the name is a builtin', async () => {
		const requester = vi.fn()
		setTradingViewRequesterForTests(requester as never)
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Binance.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Binance',
					platform: '[[Binance]]',
				},
			},
		])

		const result = await SymbolDomain.createEntry(app as never, { account: 'Binance', name: 'BTCUSDT.P' })
		expect(result.entry).toMatchObject({
			name: 'BTCUSDT.P',
			type: 'Crypto_Perp',
			logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
		})
		expect(requester).not.toHaveBeenCalled()
	})

	it('rejects missing account instead of creating it before creating a symbol', async () => {
		const { app, state } = createMockApp([])

		await expect(SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: 'btc/usdt',
		})).rejects.toThrow('SYMBOL_ACCOUNT_NOT_FOUND_ERROR')

		expect(state.frontmatters.has(`${LUCR_TRADE_ROOT_DIR}/platforms/Research.md`)).toBe(false)
		expect(state.frontmatters.has(`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`)).toBe(false)
		expect(state.frontmatters.has(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`)).toBe(false)
	})

	it('writes cfd contract_unit override through updateFields', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-EURUSD.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'EURUSD',
					account: '[[ACC-Research]]',
					type: 'CFD',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-ES.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'ES',
					account: '[[ACC-Research]]',
					type: 'Future',
				},
			},
		])

		const cfdFile = state.files.find((file) => file.basename === 'SBL-Research-EURUSD')
		const futureFile = state.files.find((file) => file.basename === 'SBL-Research-ES')
		if (!(cfdFile instanceof TFile) || !(futureFile instanceof TFile)) {
			throw new Error('Expected symbol files')
		}

		await SymbolDomain.updateFields(app as never, cfdFile, { contract_unit: 50000 })
		await SymbolDomain.updateFields(app as never, futureFile, { contract_unit: 50000 })

		expect(state.frontmatters.get(cfdFile.path)?.contract_unit).toBe(50000)
		expect(state.frontmatters.get(futureFile.path)?.contract_unit).toBeNull()

		await SymbolDomain.updateFields(app as never, cfdFile, { contract_unit: 50000.5 })

		expect(state.frontmatters.get(cfdFile.path)?.contract_unit).toBe(50001)

		await SymbolDomain.updateFields(app as never, cfdFile, { contract_unit: 0.4 })

		expect(state.frontmatters.get(cfdFile.path)?.contract_unit).toBeNull()
	})

	it('preserves removed platform fields during unrelated symbol writeback', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
					platform: '[[Binance]]',
					type: 'Crypto_Spot',
					fee_value: 1.25,
				},
			},
		])
		const symbolFile = state.files.find((file) => file.basename === 'SBL-Research-BTCUSDT')
		if (!(symbolFile instanceof TFile)) {
			throw new Error('Expected symbol file')
		}

		const updated = await SymbolDomain.updateFields(app as never, symbolFile, { fee_value: 1 })

		expect(state.frontmatters.get(symbolFile.path)?.platform).toBe('[[Binance]]')
		expect(updated.fee_value).toBe(1)
	})

	it('rejects duplicate symbols within the same account but allows the same symbol name in another account', async () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Swing.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Swing',
					platform: '[[Bybit]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
			},
		])

		await expect(SymbolDomain.createEntry(app as never, {
			account: 'Research',
			name: ' btcusdt ',
		})).rejects.toThrow('PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR')

		await expect(SymbolDomain.createEntry(app as never, {
			account: 'Swing',
			name: 'BTCUSDT',
		})).resolves.toMatchObject({
			file: {
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Swing-BTCUSDT.md`,
			},
		})
	})
})

describe('listSymbolTableEntries', () => {
	it('counts persisted positions by exact symbol wikilink and keeps same-name symbols isolated by account', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Swing.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Swing',
					platform: '[[Bybit]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
					type: 'Crypto_Spot',
					fee_value: 1.25,
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Swing-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Swing]]',
					type: null,
					fee_value: null,
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
					side: 'LONG',
					entry_price: 100,
					exit_price: 120,
					stop_loss: 95,
					notional_value: 200,
					fee: 1.25,
					profit: 38.75,
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00002.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Swing-BTCUSDT]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00003.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: 'BTCUSDT',
				},
			},
		])

		expect(listSymbolTableEntries(app as never).map((entry) => entry.fm)).toEqual([
			{
				lucr_type: 'symbol',
				account: '[[ACC-Research]]',
				account_label: 'Research',
				logo: null,
				symbol: 'BTCUSDT',
				symbol_wikilink: '[[SBL-Research-BTCUSDT]]',
				type: 'Crypto_Spot',
				fee_value: 1.25,
				contract_unit: {
					value: 1,
					editable: false,
					source: 'fixed',
				},
				position_count: 1,
			},
			{
				lucr_type: 'symbol',
				account: '[[ACC-Swing]]',
				account_label: 'Swing',
				logo: null,
				symbol: 'BTCUSDT',
				symbol_wikilink: '[[SBL-Swing-BTCUSDT]]',
				type: null,
				fee_value: null,
				contract_unit: {
					value: 1,
					editable: false,
					source: 'fixed',
				},
				position_count: 1,
			},
		])
	})

	it('shows builtin contract_unit and cfd overrides in symbol table', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-ES.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'ES',
					account: '[[ACC-Research]]',
					type: 'Future',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-EURUSD.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'EURUSD',
					account: '[[ACC-Research]]',
					type: 'CFD',
					contract_unit: 50000,
				},
			},
		])

		expect(listSymbolTableEntries(app as never).map((entry) => entry.fm.contract_unit)).toEqual([
			{ value: 50, editable: false, source: 'builtin' },
			{ value: 50000, editable: true, source: 'custom' },
		])
	})
})

describe('listAccountTableEntries', () => {
	it('aggregates platform, symbol count, and position count by exact account wikilink while preserving display name fallback', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Swing.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Swing',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Bybit.md`,
				frontmatter: {
					lucr_type: 'account',
					name: null,
					platform: '[[Bybit]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Swing-ETH∕USDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'ETH/USDT',
					account: '[[ACC-Swing]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Swing-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Swing]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Bybit-SOL∕USDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'SOL/USDT',
					account: '[[ACC-Bybit]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
					side: 'LONG',
					entry_price: 100,
					exit_price: 120,
					stop_loss: 95,
					notional_value: 200,
					fee: 1.25,
					profit: 38.75,
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00002.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Swing-ETH∕USDT]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00003.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Swing-BTCUSDT]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00004.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Bybit-SOL∕USDT]]',
				},
			},
		])

		expect(listAccountTableEntries(app as never).map((entry) => entry.fm)).toEqual([
			{
				lucr_type: 'account',
				account_wikilink: '[[ACC-Research]]',
				display_name: 'Research',
				platform_name: 'Binance',
				symbol_count: 1,
				position_count: 1,
			},
			{
				lucr_type: 'account',
				account_wikilink: '[[ACC-Swing]]',
				display_name: 'Swing',
				platform_name: 'Binance',
				symbol_count: 2,
				position_count: 2,
			},
			{
				lucr_type: 'account',
				account_wikilink: '[[ACC-Bybit]]',
				display_name: 'Bybit',
				platform_name: 'Bybit',
				symbol_count: 1,
				position_count: 1,
			},
		])
	})
})

describe('symbol deletion', () => {
	it('gathers the symbol file and only exact linked positions for deletion', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00002.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Other-BTCUSDT]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00003.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: 'BTCUSDT',
				},
			},
		])

		const symbolEntry = SymbolDomain.totalEntries(app)[0]
		expect(symbolEntry).toBeDefined()
		const scope = gatherSymbolDeletionScope(app as never, symbolEntry!)

		expect(scope).not.toBeNull()
		expect(scope?.symbolFile.path).toBe(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`)
		expect(scope?.positionFiles.map((file) => file.path)).toEqual([
			`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
		])
	})

	it('trashes linked positions before the symbol file', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00002.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
				},
			},
		])

		const symbolEntry = SymbolDomain.totalEntries(app)[0]
		expect(symbolEntry).toBeDefined()
		const scope = gatherSymbolDeletionScope(app as never, symbolEntry!)
		expect(scope).not.toBeNull()

		await deleteSymbol(app as never, scope!)

		expect(state.trashedPaths).toEqual([
			`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
			`${LUCR_TRADE_ROOT_DIR}/positions/POS-00002.md`,
			`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
		])
		expect(state.files.map((file) => file.path)).toEqual([])
	})
})

describe('account deletion cascade scope', () => {
	it('skips the platform file when other accounts still share the same platform', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Swing.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Swing',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`,
				frontmatter: {
					lucr_type: 'platform',
				},
			},
		])

		const accountEntry = AccountDomain.totalEntries(app).find(
			(entry) => entry.file instanceof TFile && entry.file.basename === 'ACC-Research',
		)
		expect(accountEntry).toBeDefined()

		const scope = gatherAccountDeletionScope(app as never, accountEntry!)
		expect(scope).not.toBeNull()
		expect(scope?.platformFile).toBeNull()

		await deleteAccount(app as never, scope!)
		expect(state.trashedPaths).toEqual([
			`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
		])
		expect(state.files.map((file) => file.path)).toContain(
			`${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`,
		)
	})

	it('returns platformFile=null when the account does not declare a platform link', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Solo.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Solo',
				},
			},
		])

		const accountEntry = AccountDomain.totalEntries(app)[0]
		expect(accountEntry).toBeDefined()
		const scope = gatherAccountDeletionScope(app as never, accountEntry!)
		expect(scope?.platformFile).toBeNull()
		expect(scope?.symbolFiles).toEqual([])
		expect(scope?.positionFiles).toEqual([])
	})

	it('returns platformFile=null when the linked platform file is missing from the vault', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Orphan.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Orphan',
					platform: '[[GhostExchange]]',
				},
			},
		])

		const accountEntry = AccountDomain.totalEntries(app)[0]
		expect(accountEntry).toBeDefined()
		const scope = gatherAccountDeletionScope(app as never, accountEntry!)
		expect(scope?.platformFile).toBeNull()
	})
})

describe('symbol deletion cascade scope', () => {
	it('returns an empty positionFiles array when no positions reference the symbol', () => {
		const { app } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
			},
		])

		const symbolEntry = SymbolDomain.totalEntries(app)[0]
		expect(symbolEntry).toBeDefined()
		const scope = gatherSymbolDeletionScope(app as never, symbolEntry!)
		expect(scope?.positionFiles).toEqual([])
		expect(scope?.symbolFile.basename).toBe('SBL-Research-BTCUSDT')
	})
})

describe('AccountDomain.updateAccountSettings', () => {
	it('gathers and deletes linked symbol files when deleting an account', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`,
				frontmatter: {
					lucr_type: 'platform',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-ETH∕USDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'ETH/USDT',
					account: '[[ACC-Research]]',
				},
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
				},
			},
		])

		const accountEntry = AccountDomain.totalEntries(app)[0]
		expect(accountEntry).toBeDefined()

		const scope = gatherAccountDeletionScope(app as never, accountEntry!)
		expect(scope).not.toBeNull()
		expect(scope?.symbolFiles.map((file) => file.path)).toEqual([
			`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
			`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-ETH∕USDT.md`,
		])

		await deleteAccount(app as never, scope!)

		expect(state.trashedPaths).toEqual([
			`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
			`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
			`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-ETH∕USDT.md`,
			`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
			`${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`,
		])
	})

	it('renames linked symbol files and rewrites linked positions when the account display name changes', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
				content: '\n# Research\n',
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
				},
				content: '\n# BTCUSDT\n',
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
					side: 'LONG',
					entry_price: 100,
					exit_price: 120,
					stop_loss: 95,
					notional_value: 200,
					fee: 1.25,
					profit: 38.75,
				},
			},
		])

		const accountEntry = AccountDomain.totalEntries(app)[0]
		expect(accountEntry).toBeDefined()

		await AccountDomain.updateAccountSettings(app as never, accountEntry!, {
			name: 'Research Pro',
		})

		const positionFm = state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		expect(positionFm).toMatchObject({
			symbol: '[[SBL-Research Pro-BTCUSDT]]',
		})
		expect(positionFm).not.toHaveProperty('account')
		expect(positionFm).not.toHaveProperty('platform')
		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research Pro-BTCUSDT.md`)).toMatchObject({
			account: '[[ACC-Research Pro]]',
		})
	})

	it('does not rewrite linked position fees when a symbol fee model changes', async () => {
		const { app, state } = createMockApp([
			{
				path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`,
				frontmatter: {
					lucr_type: 'symbol',
					name: 'BTCUSDT',
					account: '[[ACC-Research]]',
					type: 'Crypto_Spot',
					fee_value: 2.5,
				},
				content: '\n# BTCUSDT\n',
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				frontmatter: {
					lucr_type: 'account',
					name: 'Research',
					platform: '[[Binance]]',
				},
				content: '\n# Research\n',
			},
			{
				path: `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`,
				frontmatter: {
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTCUSDT]]',
					side: 'LONG',
					entry_price: 100,
					exit_price: 120,
					stop_loss: 95,
					notional_value: 200,
					fee: 2.5,
					profit: 37.5,
				},
			},
		])

		const symbolEntry = SymbolDomain.totalEntries(app)[0]
		expect(symbolEntry).toBeDefined()
		expect(symbolEntry?.file).toBeInstanceOf(TFile)
		if (!(symbolEntry?.file instanceof TFile)) {
			throw new Error('Expected persisted symbol file')
		}

		await SymbolDomain.updateFields(app as never, symbolEntry.file, {
			fee_value: 1,
		})

		expect(state.frontmatters.get(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)).toMatchObject({
			symbol: '[[SBL-Research-BTCUSDT]]',
			fee: 2.5,
			profit: 37.5,
		})
	})
})
