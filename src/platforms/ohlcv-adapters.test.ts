import { describe, expect, it } from 'vitest'

import { EXCHANGE_ID_TO_ADAPTER } from '.'

const spot = { base: 'BTC', quote: 'USDT', type: 'spot' } as const
const perp = { base: 'BTC', quote: 'USDT', type: 'perp' } as const

describe('EXCHANGE_ID_TO_ADAPTER', () => {
	it('registers exactly the crypto exchanges', () => {
		expect([...EXCHANGE_ID_TO_ADAPTER.keys()].sort()).toEqual(['binance', 'bybit', 'okx'])
	})
})

describe('binance ohlcv adapter', () => {
	const adapter = EXCHANGE_ID_TO_ADAPTER.get('binance')!

	it('builds spot klines url', () => {
		expect(adapter.pageUrl({ pair: spot, timeframe: '1h', cursorMs: 1000, limit: 500, nowMs: 0 }))
			.toBe('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&startTime=1000&limit=500')
	})
	it('uses fapi host for perp', () => {
		const url = adapter.pageUrl({ pair: perp, timeframe: '4h', cursorMs: 0, limit: 10, nowMs: 0 })
		expect(url.startsWith('https://fapi.binance.com/fapi/v1/klines')).toBe(true)
		expect(url).toContain('interval=4h')
	})
	it('parses rows ascending with numeric fields', () => {
		expect(adapter.parsePage([[1000, '1', '2', '0.5', '1.5', '10', 9999]], spot))
			.toEqual([{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }])
	})
	it('throws on unsupported timeframe', () => {
		expect(() => adapter.pageUrl({ pair: spot, timeframe: '3m', cursorMs: 0, limit: 1, nowMs: 0 })).toThrow()
	})
})

describe('bybit ohlcv adapter', () => {
	const adapter = EXCHANGE_ID_TO_ADAPTER.get('bybit')!

	it('builds linear kline url for perp', () => {
		expect(adapter.pageUrl({ pair: perp, timeframe: '1h', cursorMs: 1000, limit: 200, nowMs: 0 }))
			.toBe('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&start=1000&limit=200')
	})
	it('parses descending list into ascending bars', () => {
		const body = { result: { list: [
			['2000', '2', '3', '1', '2', '9', '0'],
			['1000', '1', '2', '0.5', '1.5', '10', '0'],
		] } }
		const bars = adapter.parsePage(body, spot)
		expect(bars.map((b) => b.time)).toEqual([1000, 2000])
		expect(bars[0]).toEqual({ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 })
	})
	it('throws on unexpected body', () => {
		expect(() => adapter.parsePage({}, spot)).toThrow()
	})
})

describe('okx ohlcv adapter', () => {
	const adapter = EXCHANGE_ID_TO_ADAPTER.get('okx')!

	it('builds recent candles url with forward window', () => {
		const url = adapter.pageUrl({ pair: spot, timeframe: '1h', cursorMs: 10_000_000, limit: 100, nowMs: 10_000_001 })
		expect(url).toContain('/market/candles?')
		expect(url).toContain('instId=BTC-USDT')
		expect(url).toContain('bar=1H')
		expect(url).toContain('before=9999999')
		expect(url).toContain('after=370000000')
	})
	it('uses history-candles + utc suffix + SWAP id for old daily perp', () => {
		const url = adapter.pageUrl({ pair: perp, timeframe: '1d', cursorMs: 0, limit: 100, nowMs: 9_999_999_999_999 })
		expect(url).toContain('/market/history-candles?')
		expect(url).toContain('instId=BTC-USDT-SWAP')
		expect(url).toContain('bar=1Dutc')
	})
	it('parses spot volume from index 5 and reverses to ascending', () => {
		const body = { data: [
			['2000', '2', '3', '1', '2', '90', '91', '92', '1'],
			['1000', '1', '2', '0.5', '1.5', '50', '60', '70', '1'],
		] }
		const bars = adapter.parsePage(body, spot)
		expect(bars.map((b) => b.time)).toEqual([1000, 2000])
		expect(bars[0]).toEqual({ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 50 })
	})
	it('parses swap volume from index 6', () => {
		const bars = adapter.parsePage({ data: [['1000', '1', '2', '0.5', '1.5', '50', '60', '70', '1']] }, perp)
		expect(bars[0]?.volume).toBe(60)
	})
})
