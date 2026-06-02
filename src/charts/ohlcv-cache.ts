/// <reference types="vitest/importMeta" />

import { type } from 'arktype'

import { buildCacheRegistry } from '../cache'

import type { OhlcvBar } from '../platforms/factory'

const OhlcvBarType = type({
	time: 'number',
	open: 'number',
	high: 'number',
	low: 'number',
	close: 'number',
	volume: 'number',
})

const OhlcvCacheEntryType = type({
	bars: OhlcvBarType.array(),
	coveredFrom: 'number',
	coveredTo: 'number',
})

export const CacheRegistry = buildCacheRegistry('market')(({ table }) => ({
	ohlcv: table({
		key: type('string'),
		value: OhlcvCacheEntryType,
		ttlMs: 15 * 60 * 1000,
	}),
}))

export function makeCacheKey(exchangeId: string, symbol: string, resolution: string): string {
	return `${exchangeId}:${symbol}:${resolution}`
}

export async function getOhlcvCache(key: string) {
	const result = await CacheRegistry.tables.ohlcv.get(key, { policy: 'strict' })
	return result.hit ? result.value : null
}

export async function mergeOhlcvCache(key: string, newBars: OhlcvBar[], from: number, to: number): Promise<void> {
	const existingResult = await CacheRegistry.tables.ohlcv.get(key, { policy: 'strict' })
	const existing = existingResult.hit ? existingResult.value : null
	const allBars = [...(existing?.bars ?? []), ...newBars]

	const deduped = new Map<number, OhlcvBar>()
	for (const bar of allBars) {
		deduped.set(bar.time, bar)
	}

	await CacheRegistry.tables.ohlcv.set(key, {
		bars: Array.from(deduped.values()).sort((left, right) => left.time - right.time),
		coveredFrom: Math.min(existing?.coveredFrom ?? from, from),
		coveredTo: Math.max(existing?.coveredTo ?? to, to),
	})
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('ohlcv cache helpers', () => {
		it('builds stable cache keys', () => {
			expect(makeCacheKey('binance', 'ETH/USDT', '60')).toBe('binance:ETH/USDT:60')
		})
	})
}
