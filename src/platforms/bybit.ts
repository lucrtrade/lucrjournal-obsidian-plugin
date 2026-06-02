import { buildPlatform, type OhlcvAdapter, type OhlcvBar } from './factory'

import type { SymbolPair } from '../domains/symbol/pair'

// ccxt mirror: bybit.js#timeframes (l.140)
const INTERVALS: Record<string, string> = {
	'1m': '1', '5m': '5', '15m': '15', '30m': '30',
	'1h': '60', '2h': '120', '4h': '240', '1d': 'D', '1w': 'W', '1M': 'M',
}

// ccxt mirror: bybit.js#fetchOHLCV (l.2661)
function toMarketId(pair: SymbolPair): string {
	return `${pair.base}${pair.quote}`
}

// ccxt mirror: bybit.js#parseOHLCV (l.2610)
function toBar(row: unknown): OhlcvBar {
	if (!Array.isArray(row)) {
		throw new Error('bybit: unexpected kline row')
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

function listOf(body: unknown): unknown[] {
	const list = (body as { result?: { list?: unknown } }).result?.list
	if (!Array.isArray(list)) {
		throw new Error('bybit: unexpected kline body')
	}
	return list
}

// Verified live 2026-06-01: spot BTCUSDT (BTC/USDT), perp BTCUSDT.P (BTC/USDT:USDT)
const ohlcv = {
	maxLimit: 1000,
	// ccxt mirror: bybit.js#fetchOHLCV (l.2649)
	pageUrl({ pair, timeframe, cursorMs, limit }) {
		const interval = INTERVALS[timeframe]
		if (interval === undefined) {
			throw new Error(`bybit: unsupported timeframe ${timeframe}`)
		}
		const query = new URLSearchParams({
			category: pair.type === 'perp' ? 'linear' : 'spot',
			symbol: toMarketId(pair),
			interval,
			start: String(cursorMs),
			limit: String(limit),
		})
		return `https://api.bybit.com/v5/market/kline?${query.toString()}`
	},
	parsePage(body, _pair) {
		return listOf(body).map(toBar).reverse()
	},
} satisfies OhlcvAdapter

export const Bybit = buildPlatform({
	name: 'Bybit',
	exchangeId: 'bybit',
	homepage: 'https://www.bybit.com',
	icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAACfUlEQVRoge2awWoTURSG/3PGYsts2jtTcFMwiPgGJlapri2JKyGIxVp8jkrzJNWUPkBK3bqwSSa6cSnFkkUQF82k3YQYZO5xIRmbJiSdKeRmJN9qzp25d75/OAx3YAiDWK7rrgUBXjNTRkTuDrlmYhDhWISqzLLbbDY/AQj6zl8slFIPROiAiJyJWl4REfGZse77fq03xr0Dpdw3AFemVR4AiMgRIU8ptRWOAX+fPMAVc2rRIZKM7/s1BmCJcMm0UFS0xgcAFrmu+0RrfDQtFAet6TFrTZumReLCjFcMYM20SFyI5BEp5Qa48DZKGJqRXHkA4CTLA0j20wcwC2CeG6ZufP/Ob9x2/20sD7/eRLtLI2YMx1iAF6u/8DzdDevq9zm0u1bkdRLfQokPMLSFMpk0NjZehnWxuAfPC78h4DgKhcJOWHteDcXiXt8ahcIOHEcBAHy/he3tt5HExjmMDJBKpZDP58P66KjcN9m27b7zvRtcJJfLYmVlBQDQaDQiBxjn0CPxLTQLYJpZANPMAphmFsA0xnajn0/m+uo4W2nAYID9yjz2K/PXXifxLZT4AKSUK5cHU6kUMpl0WHteDfV6Paxt20Yulw3rer0+sFPM5bKwbRsA0G63USodRBIb5zAyQJJIfAvNApjmvwigTUtcA81EdGLaIi5EOGYRlE2LxEWEysws70yLxEVrvCcA1tKS+5MIy6aFoiCC5tlZ8xYDCJglO3bGlMEsTwEEFgB0Op0fCwvzDYCeGfa6Inqr1WodApd+9nAcJ601HUxrO4nglFnWfd//0hsb9hlkLS4uP2TGJpGsiuDeBB0HIMI3Eapqjd3z89MyLv1u8wfw/87pbhQB4QAAAABJRU5ErkJggg==" width="16" height="16" preserveAspectRatio="xMidYMid meet"/></svg>',
	ohlcv,
})
