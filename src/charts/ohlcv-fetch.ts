/// <reference types="vitest/importMeta" />

import { requestUrl, type RequestUrlResponse } from 'obsidian'

import { resolveSymbolInfo } from '../domains/symbol/catalog'
import { parseSymbolPair, type SymbolPair } from '../domains/symbol/pair'
import { EXCHANGE_ID_TO_ADAPTER } from '../platforms'

import { getOhlcvCache, makeCacheKey, mergeOhlcvCache } from './ohlcv-cache'
import { fetchYahooBars } from './yahoo-ohlcv'

import type { PositionChartSource } from './position-chart'
import type { OhlcvAdapter, OhlcvBar, OhlcvPageRequest } from '../platforms/factory'

// @story [[lucrjournal/market-data#^exchange-pagination-bounds]] Caps page size and total pagination calls.
const MAX_PAGINATION_CALLS = 50
const OHLCV_BATCH_LIMIT = 1000
const RATE_LIMIT_STATUS = 429
const RETRY_DELAY_MS = 1050
const REQUEST_RESOLUTION_ALIASES: Record<string, string> = {
	'1D': 'D',
	'1W': 'W',
	'1M': 'M',
	'1d': 'D',
	'1w': 'W',
}
const RESOLUTION_TO_TIMEFRAME = {
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

type OhlcvCacheValue = {
	bars: OhlcvBar[]
	coveredFrom: number
	coveredTo: number
}

type FetchBarsParams = PositionChartSource & {
	resolution: string
	fromSeconds: number
	toSeconds: number
}

export async function fetchBarsWithCache(params: FetchBarsParams): Promise<OhlcvBar[]> {
	// @story [[lucrjournal/market-data#^future-uses-yahoo]] Dispatches Yahoo sources to the Yahoo fetcher.
	// @story [[lucrjournal/market-data#^crypto-uses-account-exchange]] Dispatches exchange sources to registered adapters.
	return params.provider === 'yahoo'
		? await fetchYahooBarsWithCache(params)
		: await fetchExchangeBarsWithCache(params)
}

async function fetchExchangeBarsWithCache(
	params: Extract<FetchBarsParams, { provider: 'exchange' }>,
): Promise<OhlcvBar[]> {
	const { exchangeId, symbol, resolution, fromSeconds, toSeconds } = params
	const normalizedResolution = normalizeChartResolution(resolution)
	const timeframe = RESOLUTION_TO_TIMEFRAME[normalizedResolution as keyof typeof RESOLUTION_TO_TIMEFRAME]
	// @story [[lucrjournal/market-data#^invalid-market-data-fails]] Rejects unsupported exchange resolutions, symbols, and adapters.
	if (timeframe === undefined) {
		throw new Error(`Unsupported resolution: ${resolution}`)
	}

	const symbolName = resolveSymbolInfo(symbol).name
	const pair = parseSymbolPair(symbolName)
	if (pair === null) {
		throw new Error(`Unsupported crypto symbol: ${symbol}`)
	}

	const adapter = EXCHANGE_ID_TO_ADAPTER.get(exchangeId)
	if (adapter === undefined) {
		throw new Error(`Unsupported exchange: ${exchangeId}`)
	}

	const key = makeCacheKey(exchangeId, symbolName, resolution)
	return await withOhlcvCache(key, fromSeconds, toSeconds, (fromMs, toMs) => paginateFetch(adapter, pair, timeframe, fromMs, toMs))
}

async function fetchYahooBarsWithCache(
	params: Extract<FetchBarsParams, { provider: 'yahoo' }>,
): Promise<OhlcvBar[]> {
	const { symbol, resolution, fromSeconds, toSeconds } = params
	const key = makeCacheKey('yahoo', symbol, resolution)
	return await withOhlcvCache(key, fromSeconds, toSeconds, () => fetchYahooBars({ symbol, resolution, fromSeconds, toSeconds }))
}

async function withOhlcvCache(
	key: string,
	fromSeconds: number,
	toSeconds: number,
	fetchFn: (fromMs: number, toMs: number) => Promise<OhlcvBar[]>,
): Promise<OhlcvBar[]> {
	const cached = await getOhlcvCache(key)
	const fromMs = fromSeconds * 1000
	const toMs = toSeconds * 1000

	// @story [[lucrjournal/market-data#^covered-cache-hit]] Requires non-empty complete coverage.
	if (hasCoveredCachedBars(cached, fromMs, toMs)) {
		return cached.bars.filter((b) => b.time >= fromMs && b.time <= toMs)
	}

	const fetched = await fetchFn(fromMs, toMs)
	// @story [[lucrjournal/market-data#^empty-result-not-cached]] Leaves empty provider results recoverable on the next request.
	if (fetched.length > 0) {
		await mergeOhlcvCache(key, fetched, fromMs, toMs)
	}
	return fetched.filter((b) => b.time >= fromMs && b.time <= toMs)
}

function hasCoveredCachedBars(cached: OhlcvCacheValue | null, fromMs: number, toMs: number): cached is OhlcvCacheValue {
	return cached !== null && cached.bars.length > 0 && cached.coveredFrom <= fromMs && cached.coveredTo >= toMs
}

async function paginateFetch(
	adapter: OhlcvAdapter,
	pair: SymbolPair,
	timeframe: string,
	fromMs: number,
	toMs: number,
): Promise<OhlcvBar[]> {
	const limit = Math.min(OHLCV_BATCH_LIMIT, adapter.maxLimit)
	const bars = new Map<number, OhlcvBar>()
	let cursor = fromMs
	let calls = 0

	while (cursor < toMs && ++calls <= MAX_PAGINATION_CALLS) {
		const request: OhlcvPageRequest = { pair, timeframe, cursorMs: cursor, limit, nowMs: Date.now() }
		const url = adapter.pageUrl(request)
		const page = adapter.parsePage(await requestJson(url), pair)
		const next = collectPage(bars, page, fromMs, toMs, cursor, limit)
		if (next === null) {
			break
		}
		cursor = next
	}

	return Array.from(bars.values()).sort((left, right) => left.time - right.time)
}

function collectPage(
	bars: Map<number, OhlcvBar>,
	page: OhlcvBar[],
	fromMs: number,
	toMs: number,
	cursor: number,
	limit: number,
): number | null {
	// @story [[lucrjournal/market-data#^exchange-pagination-progress]] Stops pagination when a page is empty, short, or cannot advance.
	if (page.length === 0) {
		return null
	}
	let last = cursor
	for (const bar of page) {
		if (bar.time >= fromMs && bar.time <= toMs) {
			bars.set(bar.time, bar)
		}
		if (bar.time > last) {
			last = bar.time
		}
	}
	if (last <= cursor || page.length < limit) {
		return null
	}
	return last + 1
}

async function requestJson(url: string): Promise<unknown> {
	// @story [[lucrjournal/market-data#^exchange-rate-limit-retry]] Retries rate-limited exchange requests after the fixed delay.
	while (true) {
		const response: RequestUrlResponse = await requestUrl({ url, method: 'GET', throw: false })
		if (response.status !== RATE_LIMIT_STATUS) {
			return response.json as unknown
		}
		await wait(RETRY_DELAY_MS)
	}
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function normalizeChartResolution(resolution: string): string {
	return REQUEST_RESOLUTION_ALIASES[resolution] ?? resolution
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	const bar = (time: number): OhlcvBar => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 })

	describe('collectPage', () => {
		// @story [[lucrjournal/market-data#^exchange-pagination-progress]] Covers page termination, cursor progress, and range filtering.
		it('stops on an empty page', () => {
			expect(collectPage(new Map(), [], 0, 100, 0, 10)).toBeNull()
		})
		it('stops on a short page after collecting in-range bars', () => {
			const map = new Map<number, OhlcvBar>()
			expect(collectPage(map, [bar(10), bar(20)], 0, 100, 0, 10)).toBeNull()
			expect([...map.keys()]).toEqual([10, 20])
		})
		it('advances cursor past the last bar on a full page', () => {
			const map = new Map<number, OhlcvBar>()
			expect(collectPage(map, [bar(10), bar(20), bar(30)], 0, 100, 0, 3)).toBe(31)
		})
		it('drops bars outside the requested range', () => {
			const map = new Map<number, OhlcvBar>()
			collectPage(map, [bar(5), bar(50), bar(150)], 10, 100, 0, 3)
			expect([...map.keys()]).toEqual([50])
		})
	})

	describe('hasCoveredCachedBars', () => {
		// @story [[lucrjournal/market-data#^covered-cache-hit]] Covers non-empty full-range cache eligibility.
		it('does not treat empty covered cache entries as hits', () => {
			expect(hasCoveredCachedBars({ bars: [], coveredFrom: 0, coveredTo: 100 }, 0, 100)).toBe(false)
		})

		it('accepts non-empty cache entries that cover the range', () => {
			expect(hasCoveredCachedBars({ bars: [bar(50)], coveredFrom: 0, coveredTo: 100 }, 0, 100)).toBe(true)
		})
	})
}
