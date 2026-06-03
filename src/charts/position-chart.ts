/// <reference types="vitest/importMeta" />

import { LUCRCHART_URL } from '../constant'
import { EXCHANGE_ID_TO_ADAPTER, PLATFORM_NAMES, PLATFORM_TO_EXCHANGE_ID } from '../platforms'

import type { ChartConfig, MinimalChartState, ThemeColors } from './protocol'
import type { App } from 'obsidian'

export const RESOLUTION_TO_TIMEFRAME = {
	1: '1m',
	5: '5m',
	15: '15m',
	30: '30m',
	60: '1h',
	120: '2h',
	240: '4h',
	D: '1d',
	W: '1w',
	M: '1M',
} as const

export const YAHOO_SUPPORTED_RESOLUTIONS = ['1', '5', '15', '30', '60', 'D', 'W', 'M'] as const

export const LUCRCHART_ORIGIN = LUCRCHART_URL.replace(/\/$/, '')

export type PositionChartSource =
	| { provider: 'exchange'; exchangeId: string; symbol: string }
	| { provider: 'yahoo'; symbol: string }

type ChartPlugin = {
	app: App
}

type PositionRecord = Record<string, unknown>

type PositionMarker = {
	datetime: string
}

type PositionChartTimeframe = {
	leftEdgeTime: number
	resolution: string
	rightEdgeTime: number
}

type PositionChartContext = {
	entry?: NonNullable<ChartConfig['entry']>
	exit?: NonNullable<ChartConfig['exit']>
	resolution: string
	source: PositionChartSource
	timeframe: PositionChartTimeframe
}

type PositionChartTimeframeOptions = {
	minIntradayTime?: number
	nowSeconds?: number
	supportedResolutions?: readonly string[]
}

type ResolutionOption = {
	seconds: number
	value: string
}

type ChartFile = {
	basename?: string
	path: string
}

type BuildPositionChartConfigParams = {
	isDarkMode: boolean
	nowSeconds: number
	savedState?: MinimalChartState
}

type PositionChartSourceResolverParams = {
	plugin: ChartPlugin
	symbol: PositionRecord
	symbolName: string
}

const DEFAULT_RESOLUTION = '60'
const CHART_SUPPORTED_RESOLUTIONS = ['1', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'] as const
const PREFER_BARS = 300
const PADDING_BARS = 25
const YAHOO_INTRADAY_MAX_AGE_SECONDS = 60 * 24 * 60 * 60
const REQUEST_RESOLUTION_ALIASES: Record<string, string> = {
	'1D': 'D',
	'1W': 'W',
	'1M': 'M',
	'1d': 'D',
	'1w': 'W',
}
const RESOLUTIONS: ResolutionOption[] = [
	{ value: '1', seconds: 60 },
	{ value: '5', seconds: 300 },
	{ value: '15', seconds: 900 },
	{ value: '30', seconds: 1800 },
	{ value: '60', seconds: 3600 },
	{ value: '120', seconds: 7200 },
	{ value: '240', seconds: 14400 },
	{ value: 'D', seconds: 86400 },
	{ value: 'W', seconds: 604800 },
	{ value: 'M', seconds: 2592000 },
]
const DERIVATIVE_SUFFIX_PATTERN = /[.\-_](PERP|NEXT|PS|NW|P|F|S)$/u
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

export function normalizeChartResolution(resolution: string): string {
	return REQUEST_RESOLUTION_ALIASES[resolution] ?? resolution
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

export function buildPositionChartContext(
	plugin: ChartPlugin,
	position: PositionRecord,
	nowSeconds: number,
): PositionChartContext | null {
	const source = resolvePositionChartSource(plugin, position)
	if (source === null) {
		return null
	}

	const timeframe = computePositionChartTimeframe(position, buildTimeframeOptions(source, nowSeconds))
	return {
		...buildPositionChartFills(position),
		resolution: formatChartResolution(timeframe.resolution),
		source,
		timeframe,
	}
}

export function buildPositionChartConfig(
	plugin: ChartPlugin,
	position: PositionRecord,
	{ isDarkMode, nowSeconds, savedState }: BuildPositionChartConfigParams,
): ChartConfig | null {
	const context = buildPositionChartContext(plugin, position, nowSeconds)
	if (context === null) {
		return null
	}

	return {
		symbol: context.source.symbol,
		exchange: context.source.provider === 'exchange' ? context.source.exchangeId : '',
		supportedResolutions: [
			...(context.source.provider === 'yahoo' ? YAHOO_SUPPORTED_RESOLUTIONS : CHART_SUPPORTED_RESOLUTIONS),
		],
		debug: false,
		entry: context.entry,
		exit: context.exit,
		timeframe: {
			resolution: context.timeframe.resolution,
			left_edge_time: context.timeframe.leftEdgeTime,
			right_edge_time: context.timeframe.rightEdgeTime,
		},
		theme: isDarkMode ? 'dark' : 'light',
		savedState,
		colors: resolvePositionChartThemeColors(),
	}
}

function resolvePositionChartThemeColors(): { light: ThemeColors; dark: ThemeColors } {
	const isDark = activeDocument.body.classList.contains('theme-dark')
	const current = resolveThemeColors(isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS)

	return {
		light: isDark ? LIGHT_DEFAULTS : current,
		dark: isDark ? current : DARK_DEFAULTS,
	}
}

export function resolveCurrentChartThemeColors(): ThemeColors {
	const isDark = activeDocument.body.classList.contains('theme-dark')
	return resolveThemeColors(isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS)
}

function buildTimeframeOptions(
	source: PositionChartSource,
	nowSeconds: number,
): PositionChartTimeframeOptions {
	return source.provider === 'yahoo'
		? {
			minIntradayTime: nowSeconds - YAHOO_INTRADAY_MAX_AGE_SECONDS,
			nowSeconds,
			supportedResolutions: YAHOO_SUPPORTED_RESOLUTIONS,
		}
		: { nowSeconds }
}

function computePositionChartTimeframe(
	position: PositionRecord,
	options?: PositionChartTimeframeOptions,
): PositionChartTimeframe {
	const markers = extractPositionMarkers(position)
	const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000)
	const defaultIntervalSeconds = getResolutionSeconds(DEFAULT_RESOLUTION)

	if (markers.length === 0) {
		const rightEdgeTime = now
		return {
			resolution: DEFAULT_RESOLUTION,
			leftEdgeTime: rightEdgeTime - PREFER_BARS * defaultIntervalSeconds,
			rightEdgeTime,
		}
	}

	const timestamps = markers
		.map((marker) => Math.floor(new Date(marker.datetime).getTime() / 1000))
		.filter((timestamp) => Number.isFinite(timestamp))

	if (timestamps.length === 0) {
		const rightEdgeTime = now
		return {
			resolution: DEFAULT_RESOLUTION,
			leftEdgeTime: rightEdgeTime - PREFER_BARS * defaultIntervalSeconds,
			rightEdgeTime,
		}
	}

	const from = Math.min(...timestamps)
	const to = timestamps.length === 1
		? now
		: Math.min(Math.max(...timestamps), now)
	const span = to - from

	if (span === 0) {
		const half = Math.floor(PREFER_BARS / 2)
		const rightEdgeTime = Math.min(to + half * defaultIntervalSeconds, now)
		return {
			resolution: DEFAULT_RESOLUTION,
			leftEdgeTime: rightEdgeTime - PREFER_BARS * defaultIntervalSeconds,
			rightEdgeTime,
		}
	}

	const resolutions = options?.supportedResolutions === undefined
		? RESOLUTIONS
		: RESOLUTIONS.filter((option) =>
			options.supportedResolutions!.includes(option.value)
			&& (options.minIntradayTime === undefined || from >= options.minIntradayTime || option.seconds >= 86400))

	let chosen = resolutions.find((option) => option.value === DEFAULT_RESOLUTION) ?? resolutions[0]!
	for (const option of resolutions) {
		if (span / option.seconds <= PREFER_BARS) {
			chosen = option
			break
		}
	}

	if (span / chosen.seconds > PREFER_BARS) {
		chosen = resolutions[resolutions.length - 1]!
	}

	const spanBars = Math.ceil(span / chosen.seconds)
	const padding = Math.max(PADDING_BARS, Math.floor((PREFER_BARS - spanBars) / 2))
	const rightEdgeTime = Math.min(to + padding * chosen.seconds, now)

	return {
		resolution: chosen.value,
		leftEdgeTime: from - padding * chosen.seconds,
		rightEdgeTime,
	}
}

function formatChartResolution(resolution: string): string {
	const timeframe = RESOLUTION_TO_TIMEFRAME[resolution as keyof typeof RESOLUTION_TO_TIMEFRAME]
	return timeframe ?? RESOLUTION_TO_TIMEFRAME[DEFAULT_RESOLUTION]
}

function extractPositionMarkers(position: PositionRecord): PositionMarker[] {
	const orders = asArray(position.orders)

	if (orders.length > 0) {
		const markers = orders
			.map((order) => extractOrderMarker(order))
			.filter((marker): marker is PositionMarker => marker !== null)

		if (markers.length > 0) {
			return markers
		}
	}

	const markers: PositionMarker[] = []
	const openedAt = readStringField(position, 'opened_at')
	const closedAt = readStringField(position, 'closed_at')

	if (openedAt !== null) {
		markers.push({ datetime: toIsoDatetime(openedAt) })
	}

	if (closedAt !== null) {
		markers.push({ datetime: toIsoDatetime(closedAt) })
	}

	return markers
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

function extractOrderMarker(order: unknown): PositionMarker | null {
	if (!isRecord(order)) {
		return null
	}

	const datetime = readStringField(order, 'datetime')
	if (datetime !== null) {
		return { datetime: toIsoDatetime(datetime) }
	}

	const lastTradeTimestamp = order.lastTradeTimestamp
	if (typeof lastTradeTimestamp === 'number' && Number.isFinite(lastTradeTimestamp)) {
		return { datetime: new Date(lastTradeTimestamp).toISOString() }
	}

	const timestamp = order.timestamp
	if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
		return { datetime: new Date(timestamp).toISOString() }
	}

	return null
}

function getResolutionSeconds(resolution: string): number {
	return RESOLUTIONS.find((option) => option.value === resolution)?.seconds
		?? RESOLUTIONS.find((option) => option.value === DEFAULT_RESOLUTION)!.seconds
}

function buildPositionChartFills(position: PositionRecord): Pick<PositionChartContext, 'entry' | 'exit'> {
	return {
		entry: buildPositionChartFill(position, 'opened_at', 'entry_price'),
		exit: buildPositionChartFill(position, 'closed_at', 'exit_price'),
	}
}

function buildPositionChartFill(
	position: PositionRecord,
	timeKey: string,
	priceKey: string,
): NonNullable<ChartConfig['entry']> | undefined {
	const value = readStringField(position, timeKey)
	if (value === null) {
		return undefined
	}

	const time = Math.floor(new Date(toIsoDatetime(value)).getTime() / 1000)
	const price = readNumberField(position, priceKey)
	return {
		time,
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

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
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

	describe('computePositionChartTimeframe', () => {
		it('uses order markers before fallback timestamps', () => {
			const result = computePositionChartTimeframe({
				opened_at: '2026-03-20T16:31:05+08:00',
				orders: [
					{ lastTradeTimestamp: new Date('2026-03-19T16:31:00Z').getTime() },
					{ lastTradeTimestamp: new Date('2026-03-21T16:31:00Z').getTime() },
				],
			})

			expect(result.leftEdgeTime).toBeLessThan(new Date('2026-03-19T16:31:00Z').getTime() / 1000)
			expect(result.rightEdgeTime).toBeGreaterThan(new Date('2026-03-21T16:31:00Z').getTime() / 1000)
		})

		it('selects daily resolution for old Yahoo intraday windows', () => {
			const nowSeconds = Math.floor(new Date('2026-06-02T00:00:00Z').getTime() / 1000)
			const result = computePositionChartTimeframe(
				{
					opened_at: '2025-05-26T12:33:09.009Z',
					closed_at: '2025-05-29T02:33:09.009Z',
				},
				{
					minIntradayTime: nowSeconds - YAHOO_INTRADAY_MAX_AGE_SECONDS,
					supportedResolutions: YAHOO_SUPPORTED_RESOLUTIONS,
				},
			)

			expect(result.resolution).toBe('D')
		})
	})

	describe('chart resolution helpers', () => {
		it('maps TradingView daily and higher aliases to host resolutions', () => {
			expect(normalizeChartResolution('1D')).toBe('D')
			expect(normalizeChartResolution('1W')).toBe('W')
			expect(normalizeChartResolution('1M')).toBe('M')
		})

		it('formats host resolutions to chart timeframes', () => {
			expect(formatChartResolution('60')).toBe('1h')
			expect(formatChartResolution('bogus')).toBe('1h')
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
				opened_at: '2026-03-20T16:31:05+08:00',
				entry_price: 100,
				closed_at: '2026-03-21T18:45:00+08:00',
				exit_price: 120,
			}, {
				isDarkMode: false,
				nowSeconds: Math.floor(new Date('2026-03-22T00:00:00Z').getTime() / 1000),
			})

			expect(config?.entry).toEqual({ time: 1773995465, price: 100 })
			expect(config?.exit).toEqual({ time: 1774089900, price: 120 })
			expect(config?.supportedResolutions).toEqual([...CHART_SUPPORTED_RESOLUTIONS])
			expect(config?.supportedResolutions).not.toContain('40')
		})
	})
}
