import { buildPlatform, type OhlcvAdapter, type OhlcvBar } from './factory'

import type { SymbolPair } from '../domains/symbol/pair'

// ccxt mirror: binance.js#timeframes (l.174)
const INTERVALS: Record<string, string> = {
	'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
	'1h': '1h', '2h': '2h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M',
}

// ccxt mirror: binance.js#fetchOHLCV (l.4801)
function toMarketId(pair: SymbolPair): string {
	return `${pair.base}${pair.quote}`
}

// ccxt mirror: binance.js#fetchOHLCV (l.4858, l.4864)
function endpoint(pair: SymbolPair): string {
	return pair.type === 'perp'
		? 'https://fapi.binance.com/fapi/v1/klines'
		: 'https://api.binance.com/api/v3/klines'
}

// ccxt mirror: binance.js#parseOHLCV (l.4691)
function toBar(row: unknown): OhlcvBar {
	if (!Array.isArray(row)) {
		throw new Error('binance: unexpected kline row')
	}
	return {
		time: Number(row[0]),
		open: Number(row[1]),
		high: Number(row[2]),
		low: Number(row[3]),
		close: Number(row[4]),
		volume: Number(row[5]),
	}
}

// Verified live 2026-06-01: spot BTCUSDT (BTC/USDT), perp BTCUSDT.P (BTC/USDT:USDT)
const ohlcv = {
	maxLimit: 1000,
	pageUrl({ pair, timeframe, cursorMs, limit }) {
		const interval = INTERVALS[timeframe]
		if (interval === undefined) {
			throw new Error(`binance: unsupported timeframe ${timeframe}`)
		}
		const query = new URLSearchParams({
			symbol: toMarketId(pair),
			interval,
			startTime: String(cursorMs),
			limit: String(limit),
		})
		return `${endpoint(pair)}?${query.toString()}`
	},
	parsePage(body, _pair) {
		if (!Array.isArray(body)) {
			throw new Error('binance: unexpected klines body')
		}
		return body.map(toBar)
	},
} satisfies OhlcvAdapter

const BINANCE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAIVBMVEVHcEzxuQjwuQvwuQvwuQrwuQrwuQvwuQrwuQrwuQvwuQs96DTAAAAACnRSTlMACex9etLZd7FlFauvgAAAATtJREFUWIWll9EagyAIRtHUyvd/4LXVDBQz/Lvbt85R0RCInp9lGbww4nOGDAcPGX48YLj4aUPhJw2MnzIIfsJQ8WZDwxsNCm8yqLzB0OFfG0KPzznYee+thop3zmioeSKboeVtBo23GHaVbwx7V+CiyleG6LoCoqjywhCfYnAbfDVMMQx4oqTyxZBG/DkHFj8Zye74wXMDGz/dQx6GyH6I3VzFpDfG80m7jcvyysbXl32FVJn2GZBiCHrgy5Y0hv+WBMG3hnIoos5fBnb+pYEdy6jzP4PIX9yQ+B9J578GULDYl+CqJeBBxLcRP0j4UZ74mMgLvp62/XO+HzShoCkNTKpwWocvFvhqwy9X/HrHC4zakMw8XmQ9GF7yXQNaqqLFMlquow0D2rKgTRPatqGNI9q6os0z2r6P+A/tMi2oe//ZPgAAAABJRU5ErkJggg==" width="16" height="16" preserveAspectRatio="xMidYMid meet"/></svg>'

export const Binance = buildPlatform({
	name: 'Binance',
	exchangeId: 'binance',
	homepage: 'https://www.binance.com',
	icon: BINANCE_ICON,
	simpleIcon: 'binance',
	ohlcv,
})
