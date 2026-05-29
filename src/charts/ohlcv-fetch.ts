import { requestUrl, type RequestUrlResponse } from 'obsidian'

import { resolveSymbolInfo } from '../domains/symbol/catalog'

import { RESOLUTION_TO_TIMEFRAME } from './chart-model'
import { getOhlcvCache, makeCacheKey, mergeOhlcvCache, type OhlcvBar } from './ohlcv-cache'

import type { Exchange } from 'ccxt'

const MAX_PAGINATION_CALLS = 25
const OHLCV_BATCH_LIMIT = 500
const RATE_LIMIT_STATUS = 429
const RETRY_DELAY_MS = 1050

let ccxtPromise: Promise<Record<string, new (options?: Record<string, unknown>) => Exchange>> | null = null

async function loadCcxt(): Promise<Record<string, new (options?: Record<string, unknown>) => Exchange>> {
	ccxtPromise ??= import('ccxt').then((module) => {
		const namespace: unknown = (module as { default?: unknown }).default ?? module
		return namespace as Record<string, new (options?: Record<string, unknown>) => Exchange>
	})

	return await ccxtPromise
}

async function createCcxtExchange(exchangeId: string): Promise<Exchange> {
	const ctors = await loadCcxt()
	const Ctor = ctors[exchangeId]
	if (Ctor === undefined) {
		throw new Error(`Unsupported exchange: ${exchangeId}`)
	}

	const ex = new Ctor({ enableRateLimit: true, adjustForTimeDifference: true })

	ex.fetch = async (
		url: RequestInfo | URL,
		method: string,
		headers: object,
		body: ArrayBuffer | string,
	): Promise<Response> => {
		while (true) {
			const response = await proxyCcxtRequest(url, method, headers, body)
			if (response.status !== RATE_LIMIT_STATUS) {
				return ex.handleRestResponse(response, url, method, headers, body)
			}
			await wait(RETRY_DELAY_MS)
		}
	}

	return ex
}

type FetchBarsParams = {
	exchangeId: string
	symbol: string
	resolution: string // e.g. "60", "D"
	fromSeconds: number
	toSeconds: number
}

/**
 * Fetch OHLCV bars for a range, using the in-memory cache to avoid redundant API calls.
 * Returns bars filtered to [fromSeconds * 1000, toSeconds * 1000].
 */
export async function fetchBarsWithCache(params: FetchBarsParams): Promise<OhlcvBar[]> {
	const { exchangeId, symbol, resolution, fromSeconds, toSeconds } = params
	const timeframe = RESOLUTION_TO_TIMEFRAME[resolution as keyof typeof RESOLUTION_TO_TIMEFRAME]
	if (timeframe === undefined) {
		throw new Error(`Unsupported resolution: ${resolution}`)
	}

	const normalizedSymbol = resolveSymbolInfo(symbol).ccxtSymbol
	if (normalizedSymbol === null) {
		throw new Error(`Unsupported ccxt symbol: ${symbol}`)
	}
	const key = makeCacheKey(exchangeId, normalizedSymbol, resolution)
	const cached = await getOhlcvCache(key)
	const fromMs = fromSeconds * 1000
	const toMs = toSeconds * 1000

	// Full cache hit — no fetch needed
	if (cached !== null && cached.coveredFrom <= fromMs && cached.coveredTo >= toMs) {
		return cached.bars.filter((b) => b.time >= fromMs && b.time <= toMs)
	}

	const ex = await createCcxtExchange(exchangeId)

	try {
		const fetched = await paginateFetch(ex, normalizedSymbol, timeframe, fromMs, toMs)
		await mergeOhlcvCache(key, fetched, fromMs, toMs)
		return fetched.filter((b) => b.time >= fromMs && b.time <= toMs)
	} finally {
		await ex.close()
	}
}

async function paginateFetch(
	ex: Exchange,
	symbol: string,
	timeframe: string,
	fromMs: number,
	toMs: number,
): Promise<OhlcvBar[]> {
	const bars: OhlcvBar[] = []
	let since = fromMs
	let calls = 0

	while (since < toMs) {
		if (++calls > MAX_PAGINATION_CALLS) {
			break
		}

		const batch = await ex.fetchOHLCV(symbol, timeframe, since, OHLCV_BATCH_LIMIT, {})
		if (!Array.isArray(batch) || batch.length === 0) {
			break
		}

		for (const row of batch) {
			if (!Array.isArray(row)) {
				continue
			}
			const [time, open, high, low, close, volume] = row
			if (
				typeof time !== 'number'
				|| typeof open !== 'number'
				|| typeof high !== 'number'
				|| typeof low !== 'number'
				|| typeof close !== 'number'
			) {
				continue
			}
			if (time < fromMs || time > toMs) {
				continue
			}
			bars.push({ time, open, high, low, close, volume: typeof volume === 'number' ? volume : 0 })
		}

		const last = batch[batch.length - 1]?.[0]
		if (typeof last !== 'number' || batch.length < OHLCV_BATCH_LIMIT || last <= since) {
			break
		}
		since = last + 1
	}

	// Deduplicate
	const map = new Map<number, OhlcvBar>()
	for (const b of bars) {
		map.set(b.time, b)
	}
	return Array.from(map.values()).sort((a, b) => a.time - b.time)
}

async function proxyCcxtRequest(
	url: RequestInfo | URL,
	method: string,
	headers: object,
	body: ArrayBuffer | string,
): Promise<Response> {
	const urlStr = url instanceof URL ? url.href : url instanceof Request ? url.url : url
	const response: RequestUrlResponse = await requestUrl({
		url: urlStr,
		method,
		headers: headers as Record<string, string>,
		body,
		throw: false,
	})

	return new Response(response.arrayBuffer, {
		headers: new Headers(response.headers),
		status: response.status,
		statusText: String(response.status),
	})
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}
