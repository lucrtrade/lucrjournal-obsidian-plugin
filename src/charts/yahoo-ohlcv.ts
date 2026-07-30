/// <reference types="vitest/importMeta" />

import { requestUrl } from 'obsidian'

import type { OhlcvBar } from '../platforms/factory'

const REQUEST_RESOLUTION_ALIASES: Record<string, string> = {
	'1D': 'D',
	'1W': 'W',
	'1M': 'M',
	'1d': 'D',
	'1w': 'W',
}
// @story [[lucrjournal/market-data#^yahoo-resolution-intervals]] Maps the exposed future resolutions to Yahoo intervals.
const RESOLUTION_TO_INTERVAL: Record<string, string> = {
	1: '1m',
	5: '5m',
	15: '15m',
	30: '30m',
	60: '1h',
	D: '1d',
	W: '1wk',
	M: '1mo',
}
// @story [[lucrjournal/market-data#^yahoo-resolutions]] Lists only Yahoo-native future resolutions.
const YAHOO_SUPPORTED_RESOLUTIONS = ['1', '5', '15', '30', '60', 'D', 'W', 'M'] as const
// @story [[lucrjournal/market-data#^yahoo-ticker-alias]] Keeps the verified Yahoo futures alias local to the provider.
const YAHOO_TICKER_BY_SYMBOL = new Map([
	['E7', '6E'],
])

// @story [[lucrjournal/market-data#^yahoo-request-shape]] Defines the Yahoo chart endpoint used for futures requests.
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

type FetchYahooBarsParams = {
	symbol: string
	resolution: string
	fromSeconds: number
	toSeconds: number
}

export async function fetchYahooBars({
	symbol,
	resolution,
	fromSeconds,
	toSeconds,
}: FetchYahooBarsParams): Promise<OhlcvBar[]> {
	const interval = RESOLUTION_TO_INTERVAL[normalizeChartResolution(resolution)]
	if (interval === undefined) {
		throw new Error(`yahoo: unsupported resolution ${resolution}`)
	}

	const query = new URLSearchParams({
		interval,
		period1: String(fromSeconds),
		period2: String(toSeconds),
	})
	// @story [[lucrjournal/market-data#^yahoo-request-shape]] Sends the resolved futures ticker, interval, and time range.
	const url = `${YAHOO_CHART_BASE}/${resolveYahooTicker(symbol)}=F?${query.toString()}`
	const response = await requestUrl({ url, method: 'GET', throw: false })
	return parseYahooChart(response.json)
}

type YahooResult = { timestamp?: unknown; indicators?: unknown }
type YahooQuote = {
	open: (number | null)[]
	high: (number | null)[]
	low: (number | null)[]
	close: (number | null)[]
	volume?: (number | null)[]
}

function parseYahooChart(body: unknown): OhlcvBar[] {
	// @story [[lucrjournal/market-data#^yahoo-response-classification]] Distinguishes malformed responses, empty quotes, and usable rows.
	const result = readResult(body)
	const timestamps = Array.isArray(result.timestamp) ? result.timestamp : []
	const quote = readQuote(result)
	if (quote === null) {
		return []
	}

	const bars: OhlcvBar[] = []
	for (let i = 0; i < timestamps.length; i++) {
		const open = quote.open[i]
		const high = quote.high[i]
		const low = quote.low[i]
		const close = quote.close[i]
		if (open == null || high == null || low == null || close == null) {
			continue
		}
		bars.push({
			time: Number(timestamps[i]) * 1000,
			open: Number(open),
			high: Number(high),
			low: Number(low),
			close: Number(close),
			volume: Number(quote.volume?.[i] ?? 0),
		})
	}
	return bars
}

function readResult(body: unknown): YahooResult {
	const chart = (body as { chart?: { result?: unknown[] } } | null)?.chart
	const result = Array.isArray(chart?.result) ? chart.result[0] : undefined
	if (result === undefined || result === null || typeof result !== 'object') {
		throw new Error('yahoo: unexpected chart body')
	}
	return result
}

function readQuote(result: YahooResult): YahooQuote | null {
	const indicators = result.indicators as { quote?: unknown[] } | undefined
	const quote = Array.isArray(indicators?.quote) ? indicators.quote[0] : undefined
	return quote === undefined || quote === null ? null : (quote as YahooQuote)
}

function resolveYahooTicker(symbol: string): string {
	return YAHOO_TICKER_BY_SYMBOL.get(symbol) ?? symbol
}

function normalizeChartResolution(resolution: string): string {
	return REQUEST_RESOLUTION_ALIASES[resolution] ?? resolution
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	const body = {
		chart: {
			result: [{
				timestamp: [1700000000, 1700003600],
				indicators: {
					quote: [{
						open: [10, null],
						high: [12, null],
						low: [9, null],
						close: [11, null],
						volume: [100, null],
					}],
				},
			}],
		},
	}

	describe('parseYahooChart', () => {
		// @story [[lucrjournal/market-data#^yahoo-response-classification]] Covers Yahoo row normalization and failure classification.
		it('maps timestamps to ms and rows to bars', () => {
			expect(parseYahooChart(body)).toEqual([
				{ time: 1700000000000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
			])
		})

		it('skips bars with a null OHLC field', () => {
			expect(parseYahooChart(body)).toHaveLength(1)
		})

		it('returns an empty array when quote is absent', () => {
			expect(parseYahooChart({ chart: { result: [{ timestamp: [] }] } })).toEqual([])
		})

		it('throws on a malformed body', () => {
			expect(() => parseYahooChart({})).toThrow()
		})
	})

	describe('resolution support', () => {
		// @story [[lucrjournal/market-data#^yahoo-resolutions]] Covers the Yahoo resolution allowlist.
		it('exposes only Yahoo-native resolutions', () => {
			expect(YAHOO_SUPPORTED_RESOLUTIONS).toEqual(['1', '5', '15', '30', '60', 'D', 'W', 'M'])
		})

		it('excludes 2h and 4h', () => {
			expect(YAHOO_SUPPORTED_RESOLUTIONS).not.toContain('120')
			expect(YAHOO_SUPPORTED_RESOLUTIONS).not.toContain('240')
		})
	})

	describe('resolveYahooTicker', () => {
		// @story [[lucrjournal/market-data#^yahoo-ticker-alias]] Covers the E7 alias and direct M6E fallback.
		it('maps E7 to the liquid Yahoo Euro FX ticker', () => {
			expect(resolveYahooTicker('E7')).toBe('6E')
		})

		it('uses symbol names directly by default', () => {
			expect(resolveYahooTicker('M6E')).toBe('M6E')
		})
	})
}
