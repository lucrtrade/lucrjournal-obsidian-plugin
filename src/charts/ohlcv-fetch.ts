/// <reference types="vitest/importMeta" />

import { requestUrl, type RequestUrlResponse } from 'obsidian'

import { resolveSymbolInfo } from '../domains/symbol/catalog'
import { parseSymbolPair, type SymbolPair } from '../domains/symbol/pair'
import { EXCHANGE_ID_TO_ADAPTER } from '../platforms'

import { RESOLUTION_TO_TIMEFRAME } from './chart-model'
import { getOhlcvCache, makeCacheKey, mergeOhlcvCache } from './ohlcv-cache'

import type { OhlcvAdapter, OhlcvBar, OhlcvPageRequest } from '../platforms/factory'

const MAX_PAGINATION_CALLS = 50
const OHLCV_BATCH_LIMIT = 1000
const RATE_LIMIT_STATUS = 429
const RETRY_DELAY_MS = 1050

type FetchBarsParams = {
	exchangeId: string
	symbol: string
	resolution: string
	fromSeconds: number
	toSeconds: number
}

export async function fetchBarsWithCache(params: FetchBarsParams): Promise<OhlcvBar[]> {
	const { exchangeId, symbol, resolution, fromSeconds, toSeconds } = params
	const timeframe = RESOLUTION_TO_TIMEFRAME[resolution as keyof typeof RESOLUTION_TO_TIMEFRAME]
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
	const cached = await getOhlcvCache(key)
	const fromMs = fromSeconds * 1000
	const toMs = toSeconds * 1000

	if (cached !== null && cached.coveredFrom <= fromMs && cached.coveredTo >= toMs) {
		return cached.bars.filter((b) => b.time >= fromMs && b.time <= toMs)
	}

	const fetched = await paginateFetch(adapter, pair, timeframe, fromMs, toMs)
	await mergeOhlcvCache(key, fetched, fromMs, toMs)
	return fetched.filter((b) => b.time >= fromMs && b.time <= toMs)
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

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	const bar = (time: number): OhlcvBar => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 })

	describe('collectPage', () => {
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
}
