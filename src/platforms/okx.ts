import { buildPlatform, type OhlcvAdapter, type OhlcvBar } from './factory'

import type { SymbolPair } from '../domains/symbol/pair'

// ccxt mirror: okx.js#timeframes (l.154)
const INTERVALS: Record<string, string> = {
	'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
	'1h': '1H', '2h': '2H', '4h': '4H', '1d': '1D', '1w': '1W', '1M': '1M',
}

const TF_SECONDS: Record<string, number> = {
	'1m': 60, '5m': 300, '15m': 900, '30m': 1800,
	'1h': 3600, '2h': 7200, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000,
}

// ccxt mirror: okx market['id']
function toMarketId(pair: SymbolPair): string {
	return pair.type === 'perp' ? `${pair.base}-${pair.quote}-SWAP` : `${pair.base}-${pair.quote}`
}

// ccxt mirror: okx.js#parseOHLCV (l.2554)
function toBar(row: unknown, volumeIndex: number): OhlcvBar {
	if (!Array.isArray(row)) {
		throw new Error('okx: unexpected candle row')
	}
	return {
		time: Number(row[0]),
		open: Number(row[1]),
		high: Number(row[2]),
		low: Number(row[3]),
		close: Number(row[4]),
		volume: Number(row[volumeIndex]),
	}
}

function dataOf(body: unknown): unknown[] {
	const data = (body as { data?: unknown }).data
	// @story [[lucrjournal/market-data#^invalid-market-data-fails]] Rejects malformed OKX payloads.
	if (!Array.isArray(data)) {
		throw new Error('okx: unexpected candles body')
	}
	return data
}

// Verified live 2026-06-01: spot BTCUSDT (BTC-USDT), perp BTCUSDT.P (BTC-USDT-SWAP)
// @story [[lucrjournal/market-data#^okx-ohlcv-contract]] Defines OKX market ids, history windows, intervals, and volume fields.
const ohlcv = {
	maxLimit: 300,
	// ccxt mirror: okx.js#fetchOHLCV (l.2602)
	pageUrl({ pair, timeframe, cursorMs, limit, nowMs }) {
		const seconds = TF_SECONDS[timeframe]
		const baseBar = INTERVALS[timeframe]
		if (seconds === undefined || baseBar === undefined) {
			throw new Error(`okx: unsupported timeframe ${timeframe}`)
		}
		const durationMs = seconds * 1000
		const bar = seconds >= 21600 ? `${baseBar}utc` : baseBar
		const path = cursorMs < nowMs - 1439 * durationMs ? 'history-candles' : 'candles'
		const query = new URLSearchParams({
			instId: toMarketId(pair),
			bar,
			limit: String(limit),
			before: String(Math.max(cursorMs - 1, 0)),
			after: String(cursorMs + durationMs * limit),
		})
		return `https://www.okx.com/api/v5/market/${path}?${query.toString()}`
	},
	parsePage(body, pair) {
		const volumeIndex = pair.type === 'spot' ? 5 : 6
		return dataOf(body).map((row) => toBar(row, volumeIndex)).reverse()
	},
} satisfies OhlcvAdapter

export const OKX = buildPlatform({
	name: 'OKX',
	exchangeId: 'okx',
	homepage: 'https://www.okx.com',
	icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJAAAACQCAMAAADQmBKKAAAAVFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///+/v79AQECgoKCQkJAQEBAgICAwMDDf39/Pz8+Pj4/380QvAAAAEHRSTlMA3+9AIM+fcIAQf7+vUJCPrZ+0KwAAAdhJREFUeNrt3O1ugjAYhuG2fBQE5sunbDv/85wN0ZmMVtNFeNye+3+TKyAYTfuq1RKbZ9rI89JVbRP1YEluZJNM3tzXlAcjG6ZtisRx6UPoZmnZIZ34PEfZqfWLlGayW1m64tGyYzrF8jgRlueHKJPdy249BwHo+O1JBKLkCtr9A7SkS6Qb5ipQnrBLZrlEVmAqkD5BLuM8jQDlHrRcgMrPICNAGZiX4qUE6RlzWVULVLmqBKoM6S3k0kqwMmggeTHQaex8DVPswtMvQEPrb4xfGA/qWn9d9EKCCCKIIIIIIogggggiiCCCXhY0tv6G+IXxoGnofI2TzL2v8MJ4ULiP1tv7JLHFg/o20CzBtgf1Eowgggi6RhBBSwQRRNA1gghaIogggh5pRgMFf0rLvZ6ykaD3NXMjAf9BI4gggggiiCCCCCKIIIII+qcguI0Ep9B+gMiFn27hnzlGsUNY593O4R1WAji2fVuFdWZSpMY7Egh3aBLrMTOIB2+h7lmjsI4Ca+UqBCarXCXMJdKpwrpEhVoqQb7PNO6YDfUmABXIo1oARm2gjddBG0CkU/yRUXu+IN9eZezYuWJzkilKFSq18aR4Trhmu+F+jw8ctHWl5XkZneV2XfMFxCf3Ec1FG6QAAAAASUVORK5CYII=" width="16" height="16" preserveAspectRatio="xMidYMid meet"/></svg>',
	simpleIcon: 'okx',
	ohlcv,
})
