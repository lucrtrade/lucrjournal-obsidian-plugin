/// <reference types="vitest/importMeta" />

import { EXCHANGE_ID_TO_ADAPTER, PLATFORM_NAMES, PLATFORM_TO_EXCHANGE_ID } from '../platforms'

import type { App } from 'obsidian'

export type PositionChartSource =
	| { provider: 'exchange'; exchangeId: string; symbol: string }
	| { provider: 'yahoo'; symbol: string }

type PositionFill = {
	time: number
	side: 'buy' | 'sell'
	price?: number
}

type ThemeColors = {
	buyColor: string
	sellColor: string
	buyColorDark: string
	sellColorDark: string
	textOnColor: string
	backgroundColor: string
	loadingFg: string
	separatorColor: string
	crosshairColor: string
	watermarkTransparency: number
	buyBorderColor: string
	sellBorderColor: string
	buyWickColor: string
	sellWickColor: string
	gridColor: string
	scalesTextColor: string
	scalesLineColor: string
	volumeUpColor: string
	volumeDownColor: string
}

type ChartConfig = {
	symbol: string
	symbolType: 'crypto' | 'futures' | 'cfd'
	debug: boolean | undefined
	exchange: string
	maxBarsPerRequest: number
	resolution?: string
	supportedResolutions?: readonly string[]
	autosize?: boolean
	entry?: PositionFill
	exit?: PositionFill
}

type ChartPlugin = {
	app: App
}

type PositionRecord = Record<string, unknown>

type PositionChartContext = {
	entry?: NonNullable<ChartConfig['entry']>
	exit?: NonNullable<ChartConfig['exit']>
	source: PositionChartSource
	supportedResolutions: readonly string[]
}

type ChartFile = {
	basename?: string
	path: string
}

type PositionChartSourceResolverParams = {
	plugin: ChartPlugin
	symbol: PositionRecord
	symbolName: string
}

const DERIVATIVE_SUFFIX_PATTERN = /[.\-_](PERP|NEXT|PS|NW|P|F|S)$/u
const DEFAULT_CHART_RESOLUTION = '60'
const DEFAULT_MAX_BARS_PER_REQUEST = 1000
const CHART_SUPPORTED_RESOLUTIONS = ['1', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'] as const
const YAHOO_SUPPORTED_RESOLUTIONS = ['1', '5', '15', '30', '60', 'D', 'W', 'M'] as const
const POSITION_CHART_SOURCE_RESOLVERS = new Map<string, (params: PositionChartSourceResolverParams) => PositionChartSource | null>([
	['Future', ({ symbolName }) => ({ provider: 'yahoo', symbol: symbolName.trim().toUpperCase() })],
	['Crypto_Perp', (params) => resolveCryptoChartSource(params, true)],
	['Crypto_Spot', (params) => resolveCryptoChartSource(params, false)],
])

const LIGHT_DEFAULTS: ThemeColors = {
	buyColor: '#111111',
	sellColor: 'rgba(17, 17, 17, 0.38)',
	buyColorDark: '#000000',
	sellColorDark: 'rgba(17, 17, 17, 0.5)',
	textOnColor: '#ffffff',
	backgroundColor: '#ffffff',
	loadingFg: '#111111',
	separatorColor: 'rgba(0, 0, 0, 0)',
	crosshairColor: '#6b7280',
	watermarkTransparency: 90,
	buyBorderColor: '#111111',
	sellBorderColor: 'rgba(17, 17, 17, 0.38)',
	buyWickColor: '#111111',
	sellWickColor: 'rgba(17, 17, 17, 0.38)',
	gridColor: 'rgba(0, 0, 0, 0.1)',
	scalesTextColor: '#111827',
	scalesLineColor: 'rgba(0, 0, 0, 0.12)',
	volumeUpColor: 'rgba(17, 17, 17, 0.15)',
	volumeDownColor: 'rgba(17, 17, 17, 0.06)',
}

const DARK_DEFAULTS: ThemeColors = {
	buyColor: '#ffffff',
	sellColor: 'rgba(255, 255, 255, 0.3)',
	buyColorDark: '#cccccc',
	sellColorDark: 'rgba(255, 255, 255, 0.4)',
	textOnColor: '#000000',
	backgroundColor: '#0a0a0a',
	loadingFg: '#ffffff',
	separatorColor: 'rgba(0, 0, 0, 0)',
	crosshairColor: 'rgba(255, 255, 255, 0.4)',
	watermarkTransparency: 90,
	buyBorderColor: '#ffffff',
	sellBorderColor: 'rgba(255, 255, 255, 0.3)',
	buyWickColor: '#ffffff',
	sellWickColor: 'rgba(255, 255, 255, 0.3)',
	gridColor: 'rgba(255, 255, 255, 0.1)',
	scalesTextColor: '#eaeaea',
	scalesLineColor: 'rgba(255, 255, 255, 0.12)',
	volumeUpColor: 'rgba(255, 255, 255, 0.12)',
	volumeDownColor: 'rgba(255, 255, 255, 0.05)',
}

export function resolvePositionChartSource(plugin: ChartPlugin, position: PositionRecord): PositionChartSource | null {
	const symbol = readLinkedFrontmatter(plugin.app, readStringField(position, 'symbol'), 'symbol')
	if (symbol === null) {
		return null
	}

	const symbolName = readStringField(symbol, 'name')
	const symbolType = readStringField(symbol, 'type')
	if (symbolName === null || symbolType === null) {
		return null
	}

	const resolver = POSITION_CHART_SOURCE_RESOLVERS.get(symbolType)
	return resolver?.({ plugin, symbol, symbolName }) ?? null
}

function resolveCryptoChartSource(
	{ plugin, symbol, symbolName }: PositionChartSourceResolverParams,
	isPerp: boolean,
): PositionChartSource | null {
	const account = readLinkedFrontmatter(plugin.app, readStringField(symbol, 'account'), 'account')
	const platform = account === null ? null : readStringField(account, 'platform')
	const exchangeId = platform === null ? null : resolvePlatformExchangeId(platform)
	if (exchangeId === null || !EXCHANGE_ID_TO_ADAPTER.has(exchangeId)) {
		return null
	}

	return {
		provider: 'exchange',
		exchangeId,
		symbol: resolveCryptoChartSymbolName(symbolName, isPerp),
	}
}

function buildPositionChartContext(
	plugin: ChartPlugin,
	position: PositionRecord,
): PositionChartContext | null {
	const source = resolvePositionChartSource(plugin, position)
	if (source === null) {
		return null
	}

	return {
		...buildPositionChartFills(position),
		source,
		supportedResolutions: chartSupportedResolutions(source),
	}
}

export function buildPositionChartConfig(
	plugin: ChartPlugin,
	position: PositionRecord,
): ChartConfig | null {
	const context = buildPositionChartContext(plugin, position)
	if (context === null) {
		return null
	}

	return {
		symbol: context.source.symbol,
		// exchange ⇒ crypto, yahoo ⇒ futures (CFD has no chart source yet).
		symbolType: context.source.provider === 'exchange' ? 'crypto' : 'futures',
		exchange: context.source.provider === 'exchange' ? context.source.exchangeId : 'YAHOO',
		maxBarsPerRequest: DEFAULT_MAX_BARS_PER_REQUEST,
		resolution: DEFAULT_CHART_RESOLUTION,
		supportedResolutions: [...context.supportedResolutions],
		debug: false,
		entry: context.entry,
		exit: context.exit,
	}
}

export function resolveCurrentChartThemeColors(): ThemeColors {
	const isDark = activeDocument.body.classList.contains('theme-dark')
	return resolveThemeColors(isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS)
}

function chartSupportedResolutions(source: PositionChartSource): readonly string[] {
	return source.provider === 'yahoo' ? YAHOO_SUPPORTED_RESOLUTIONS : CHART_SUPPORTED_RESOLUTIONS
}

function readLinkedFrontmatter(
	app: App,
	wikilink: string | null,
	lucrType: string,
): Record<string, unknown> | null {
	const linkpath = wikilink === null ? null : parseWikilinkTarget(wikilink)
	if (linkpath === null) {
		return null
	}

	const targetBaseName = getLinkpathBasename(linkpath)
	const file = app.vault.getMarkdownFiles()
		.find((candidate) => getFileBasename(candidate) === targetBaseName)
	if (file === undefined) {
		return null
	}

	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter
	return isRecord(frontmatter) && frontmatter.lucr_type === lucrType ? frontmatter : null
}

function resolvePlatformExchangeId(platform: string): string | null {
	const normalized = getLinkpathBasename(parseWikilinkTarget(platform) ?? platform).trim().toLocaleLowerCase()
	const platformName = PLATFORM_NAMES.find((name) => name.toLocaleLowerCase() === normalized)
	return platformName === undefined ? null : PLATFORM_TO_EXCHANGE_ID[platformName] ?? null
}

function resolveCryptoChartSymbolName(symbolName: string, sourceIsPerp: boolean): string {
	let symbol = symbolName.trim().toUpperCase()
		.replace(/!+$/u, '')
		.replace(/\d+!$/u, '')
		.replace(/\+$/u, '')
	let isPerp = sourceIsPerp

	const colonIdx = symbol.indexOf(':')
	if (colonIdx !== -1) {
		symbol = symbol.slice(0, colonIdx)
		isPerp = true
	}

	const deriv = symbol.match(DERIVATIVE_SUFFIX_PATTERN)
	if (deriv !== null) {
		symbol = symbol.slice(0, -deriv[0].length)
		isPerp = true
	}

	const sep = symbol.match(/^([A-Z0-9]+)[/\-_]([A-Z0-9]+)$/u)
	if (sep !== null) {
		symbol = `${sep[1]}${sep[2]}`
	}

	return isPerp ? `${symbol}.P` : symbol
}

function buildPositionChartFills(position: PositionRecord): Pick<PositionChartContext, 'entry' | 'exit'> {
	switch (readStringField(position, 'side')) {
		case 'LONG':
			return {
				entry: buildPositionChartFill(position, 'opened_at', 'entry_price', 'buy'),
				exit: buildPositionChartFill(position, 'closed_at', 'exit_price', 'sell'),
			}
		case 'SHORT':
			return {
				entry: buildPositionChartFill(position, 'opened_at', 'entry_price', 'sell'),
				exit: buildPositionChartFill(position, 'closed_at', 'exit_price', 'buy'),
			}
		case null:
		default:
			throw new Error('Invalid position side')
	}
}

function buildPositionChartFill(
	position: PositionRecord,
	timeKey: string,
	priceKey: string,
	side: NonNullable<ChartConfig['entry']>['side'],
): NonNullable<ChartConfig['entry']> | undefined {
	const value = readStringField(position, timeKey)
	if (value === null) {
		return undefined
	}

	const time = Math.floor(new Date(toIsoDatetime(value)).getTime() / 1000)
	const price = readNumberField(position, priceKey)
	return {
		time,
		side,
		...(price === undefined ? {} : { price }),
	}
}

function getLjVar(name: string): string {
	return getComputedStyle(activeDocument.body).getPropertyValue(`--lj-${name}`).trim()
}

function resolveThemeColors(defaults: ThemeColors): ThemeColors {
	const surf = getLjVar('surf')
	const profitText = getLjVar('profit-text')
	const lossText = getLjVar('loss-text')
	const muted = getLjVar('c-muted')
	const border = getLjVar('border')
	const text = getLjVar('text')

	return {
		...defaults,
		...(surf && { backgroundColor: surf }),
		...(profitText && { buyColor: profitText, buyBorderColor: profitText, buyWickColor: profitText, loadingFg: profitText }),
		...(lossText && { sellColor: lossText, sellBorderColor: lossText, sellWickColor: lossText }),
		...(text && { scalesTextColor: text }),
		...(muted && { crosshairColor: muted }),
		...(border && { gridColor: border, scalesLineColor: border }),
	}
}

function parseWikilinkTarget(input: string): string | null {
	const match = input.match(/^\[\[([^[\]\n]+)\]\]$/u)
	if (match === null) {
		return null
	}
	return match[1]!.split('|')[0]!.split('#')[0]!.split('^')[0]!.trim()
}

function getLinkpathBasename(linkpath: string): string {
	const normalized = linkpath.replace(/\.md$/u, '')
	const segments = normalized.split('/')
	return segments[segments.length - 1]?.trim() ?? ''
}

function getFileBasename(file: ChartFile): string {
	if (typeof file.basename === 'string') {
		return file.basename
	}

	return getLinkpathBasename(file.path)
}

function toIsoDatetime(value: string): string {
	return new Date(value).toISOString()
}

function readStringField(record: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === 'string' && value.trim().length > 0) {
			return value
		}
	}

	return null
}

function readNumberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it, vi } = import.meta.vitest

	function createPlugin(files: Array<{ basename: string; frontmatter: Record<string, unknown>; path?: string }>) {
		return {
			app: {
				vault: {
					getMarkdownFiles: () => files.map((file) => ({
						basename: file.basename,
						path: file.path ?? `LucrJournal/${file.basename}.md`,
					})),
				},
				metadataCache: {
					getFileCache: (file: { basename: string }) => ({
						frontmatter: files.find((entry) => entry.basename === file.basename)?.frontmatter,
					}),
				},
			},
		} as unknown as ChartPlugin
	}

	describe('resolvePositionChartSource', () => {
		it('routes future symbols to yahoo from linked symbol frontmatter', () => {
			const plugin = createPlugin([
				{ basename: 'SBL-Main-E7', frontmatter: { lucr_type: 'symbol', name: 'E7', type: 'Future', account: '[[ACC-Main]]' } },
				{ basename: 'ACC-Main', frontmatter: { lucr_type: 'account', platform: '[[Interactive Brokers]]' } },
			])

			expect(resolvePositionChartSource(plugin, { symbol: '[[SBL-Main-E7]]' })).toEqual({
				provider: 'yahoo',
				symbol: 'E7',
			})
		})

		it('routes crypto symbols to exchange when the linked account platform has OHLCV support', () => {
			const plugin = createPlugin([
				{ basename: 'SBL-Main-BTCUSDT', frontmatter: { lucr_type: 'symbol', name: 'BTC/USDT', type: 'Crypto_Spot', account: '[[ACC-Main]]' } },
				{ basename: 'ACC-Main', frontmatter: { lucr_type: 'account', platform: '[[Binance]]' } },
			])

			expect(resolvePositionChartSource(plugin, { symbol: '[[SBL-Main-BTCUSDT]]' })).toEqual({
				provider: 'exchange',
				exchangeId: 'binance',
				symbol: 'BTCUSDT',
			})
		})

		it('returns null for unsupported symbol and platform combinations', () => {
			expect(resolvePositionChartSource(createPlugin([
				{ basename: 'SBL-Main-CFD', frontmatter: { lucr_type: 'symbol', name: 'EURUSD', type: 'CFD', account: '[[ACC-Main]]' } },
				{ basename: 'ACC-Main', frontmatter: { lucr_type: 'account', platform: '[[MetaTrader]]' } },
			]), { symbol: '[[SBL-Main-CFD]]' })).toBeNull()

			expect(resolvePositionChartSource(createPlugin([
				{ basename: 'SBL-Main-BTCUSDT', frontmatter: { lucr_type: 'symbol', name: 'BTCUSDT', type: 'Crypto_Spot', account: '[[ACC-Main]]' } },
				{ basename: 'ACC-Main', frontmatter: { lucr_type: 'account', platform: '[[Interactive Brokers]]' } },
			]), { symbol: '[[SBL-Main-BTCUSDT]]' })).toBeNull()
		})
	})

	describe('buildPositionChartConfig', () => {
		afterEach(() => {
			vi.unstubAllGlobals()
		})

		it('uses position fills and explicit v3 supported resolutions', () => {
			vi.stubGlobal('activeDocument', {
				body: {
					classList: {
						contains: () => false,
					},
				},
			})
			vi.stubGlobal('getComputedStyle', () => ({
				getPropertyValue: (name: string) => {
					if (name === '--lj-profit-text') {
						return '#111111'
					}
					if (name === '--lj-loss-text') {
						return 'rgba(17, 17, 17, 0.38)'
					}
					return ''
				},
			}))

			const plugin = createPlugin([
				{ basename: 'SBL-Main-BTCUSDT', frontmatter: { lucr_type: 'symbol', name: 'BTC/USDT', type: 'Crypto_Spot', account: '[[ACC-Main]]' } },
				{ basename: 'ACC-Main', frontmatter: { lucr_type: 'account', platform: '[[Binance]]' } },
			])
			const config = buildPositionChartConfig(plugin, {
				symbol: '[[SBL-Main-BTCUSDT]]',
				side: 'LONG',
				opened_at: '2026-03-20T16:31:05+08:00',
				entry_price: 100,
				closed_at: '2026-03-21T18:45:00+08:00',
				exit_price: 120,
			})

			expect(config?.entry).toEqual({ time: 1773995465, price: 100, side: 'buy' })
			expect(config?.exit).toEqual({ time: 1774089900, price: 120, side: 'sell' })
			expect(config?.symbolType).toBe('crypto')
			expect(config?.resolution).toBe('60')
			expect(config?.maxBarsPerRequest).toBe(1000)
			expect(config?.supportedResolutions).toEqual([...CHART_SUPPORTED_RESOLUTIONS])
			expect(config?.supportedResolutions).not.toContain('40')
			expect(config).not.toHaveProperty('timeframe')
			expect(config).not.toHaveProperty('theme')
			expect(config).not.toHaveProperty('savedState')
			expect(config).not.toHaveProperty('colors')
		})

		it('marks Yahoo futures with explicit Yahoo exchange', () => {
			vi.stubGlobal('activeDocument', {
				body: {
					classList: {
						contains: () => false,
					},
				},
			})
			vi.stubGlobal('getComputedStyle', () => ({
				getPropertyValue: () => '',
			}))

			const plugin = createPlugin([
				{ basename: 'SBL-Main-E7', frontmatter: { lucr_type: 'symbol', name: 'E7', type: 'Future', account: '[[ACC-Main]]' } },
				{ basename: 'ACC-Main', frontmatter: { lucr_type: 'account', platform: '[[Interactive Brokers]]' } },
			])
			const config = buildPositionChartConfig(plugin, {
				symbol: '[[SBL-Main-E7]]',
				side: 'LONG',
				opened_at: '2026-03-20T16:31:05+08:00',
				entry_price: 1.08,
			})

			expect(config?.exchange).toBe('YAHOO')
			expect(config?.supportedResolutions).toEqual([...YAHOO_SUPPORTED_RESOLUTIONS])
			expect(config).not.toHaveProperty('timeframe')
		})

		it('maps short fills to sell then buy executions', () => {
			vi.stubGlobal('activeDocument', {
				body: {
					classList: {
						contains: () => false,
					},
				},
			})
			vi.stubGlobal('getComputedStyle', () => ({
				getPropertyValue: () => '',
			}))

			const plugin = createPlugin([
				{ basename: 'SBL-Main-BTCUSDT', frontmatter: { lucr_type: 'symbol', name: 'BTC/USDT', type: 'Crypto_Spot', account: '[[ACC-Main]]' } },
				{ basename: 'ACC-Main', frontmatter: { lucr_type: 'account', platform: '[[Binance]]' } },
			])
			const config = buildPositionChartConfig(plugin, {
				symbol: '[[SBL-Main-BTCUSDT]]',
				side: 'SHORT',
				opened_at: '2026-03-20T16:31:05+08:00',
				entry_price: 100,
				closed_at: '2026-03-21T18:45:00+08:00',
				exit_price: 90,
			})

			expect(config?.entry).toEqual({ time: 1773995465, price: 100, side: 'sell' })
			expect(config?.exit).toEqual({ time: 1774089900, price: 90, side: 'buy' })
		})
	})
}
