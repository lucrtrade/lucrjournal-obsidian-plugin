/// <reference types="vitest/importMeta" />

import { searchTradingViewSymbols, type TradingViewSymbolRow } from './tradingview'

type TradingViewRequester = Parameters<typeof searchTradingViewSymbols>[0]

const TRADINGVIEW_SEARCH_TTL_MS = 60 * 60 * 1000
const TradingViewSearches = new WeakMap<TradingViewRequester, Map<string, {
	expiresAt: number
	rows: TradingViewSymbolRow[]
}>>()
const PendingTradingViewSearches = new WeakMap<TradingViewRequester, Map<string, Promise<TradingViewSymbolRow[]>>>()

function normalizeTradingViewSearchKey(query: string): string {
	return query.trim().toUpperCase()
}

export async function getCachedTradingViewSearch(
	query: string,
	requester: TradingViewRequester,
): Promise<TradingViewSymbolRow[]> {
	const key = normalizeTradingViewSearchKey(query)
	if (key.length === 0) {
		return []
	}

	const cache = getRequesterMap(TradingViewSearches, requester)
	const cached = cache.get(key)
	if (cached !== undefined && cached.expiresAt > Date.now()) {
		return cached.rows
	}
	if (cached !== undefined) {
		cache.delete(key)
	}

	const pending = getRequesterMap(PendingTradingViewSearches, requester)
	const inFlight = pending.get(key)
	if (inFlight !== undefined) {
		return await inFlight
	}

	const run = searchTradingViewSymbols(requester, key)
		.then((rows) => {
			cache.set(key, { expiresAt: Date.now() + TRADINGVIEW_SEARCH_TTL_MS, rows })
			return rows
		})
		.finally(() => pending.delete(key))

	pending.set(key, run)
	return await run
}

function getRequesterMap<T>(store: WeakMap<TradingViewRequester, Map<string, T>>, requester: TradingViewRequester): Map<string, T> {
	let map = store.get(requester)
	if (map === undefined) {
		map = new Map()
		store.set(requester, map)
	}
	return map
}

if (import.meta.vitest) {
	const { describe, expect, it, vi } = import.meta.vitest

	describe('getCachedTradingViewSearch', () => {
		it('keeps cached searches in module memory without binding the cache registry', async () => {
			const fetcher = vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({ symbols: [{ symbol: 'BTC', type: 'spot', logo: { logoid: 'crypto/XTVCBTC' } }] }),
			}))

			await getCachedTradingViewSearch('btc', fetcher)
			await getCachedTradingViewSearch('BTC', fetcher)

			expect(fetcher).toHaveBeenCalledTimes(1)
		})

		it('dedupes concurrent requests and caches the response', async () => {
			const fetcher = vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({ symbols: [{ symbol: 'BTC', type: 'spot', logo: { logoid: 'crypto/XTVCBTC' } }] }),
			}))

			const [first, second] = await Promise.all([
				getCachedTradingViewSearch('btc', fetcher),
				getCachedTradingViewSearch(' BTC ', fetcher),
			])

			expect(first).toEqual([{ symbol: 'BTC', type: 'Crypto_Spot', logo: 'crypto/XTVCBTC' }])
			expect(second).toEqual(first)
			expect(fetcher).toHaveBeenCalledTimes(1)

			await getCachedTradingViewSearch('BTC', fetcher)
			expect(fetcher).toHaveBeenCalledTimes(1)
		})

		it('returns [] for empty queries without hitting the network', async () => {
			const fetcher = vi.fn()
			await expect(getCachedTradingViewSearch('   ', fetcher)).resolves.toEqual([])
			expect(fetcher).not.toHaveBeenCalled()
		})
	})
}
