/// <reference types="vitest/importMeta" />

import type { PositionSymbolType } from './position-model'
import type { TradingViewSymbolRow } from './tradingview'

const TRADINGVIEW_LOGO_BASE = 'https://s3-symbol-logo.tradingview.com'

export type SymbolSuggestion = {
	symbol: string
	type: PositionSymbolType | null
	logo: string | null
}

export type TradingViewSymbolSearchResponse = {
	candidate: string
	rows: TradingViewSymbolRow[]
}

export function mergeSymbolSuggestions(
	builtinMatches: SymbolSuggestion[],
	tvResponses: TradingViewSymbolSearchResponse[],
): SymbolSuggestion[] {
	const seen = new Set<string>()
	const merged: SymbolSuggestion[] = []

	for (const row of builtinMatches) {
		appendSuggestion(merged, seen, row)
	}

	for (const response of tvResponses) {
		for (const row of filterTradingViewSymbolRows(response)) {
			appendSuggestion(merged, seen, row)
		}
	}

	return merged
}

function filterTradingViewSymbolRows(response: TradingViewSymbolSearchResponse): SymbolSuggestion[] {
	const candidate = response.candidate.trim().toUpperCase()
	return response.rows
		.filter((row) => row.symbol.toUpperCase() === candidate && row.type !== null)
		.map((row) => ({
			symbol: row.symbol,
			type: row.type,
			logo: `${TRADINGVIEW_LOGO_BASE}/${row.logo}.svg`,
		}))
}

function appendSuggestion(merged: SymbolSuggestion[], seen: Set<string>, row: SymbolSuggestion): void {
	const key = row.symbol.toUpperCase()
	if (seen.has(key)) {
		return
	}

	seen.add(key)
	merged.push(row)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('filterTradingViewSymbolRows', () => {
		it('keeps only exact symbol matches for the query candidate', () => {
			expect(filterTradingViewSymbolRows({
				candidate: 'BTCUSDC.P',
				rows: [
					{ symbol: 'BTCUSDC.P', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' },
					{ symbol: 'BTCUSDC.P_PREMIUM', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' },
					{ symbol: 'BTCUSD.P', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' },
				],
			}).map((row) => row.symbol)).toEqual(['BTCUSDC.P'])
		})

		it('drops exact matches whose type is null', () => {
			expect(filterTradingViewSymbolRows({
				candidate: 'BTCUSDC.P',
				rows: [
					{ symbol: 'BTCUSDC.P', type: null, logo: 'crypto/XTVCBTC' },
					{ symbol: 'BTCUSDC.P', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' },
				],
			})).toEqual([{
				symbol: 'BTCUSDC.P',
				type: 'Crypto_Perp',
				logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
			}])
		})

		it('matches candidates case-insensitively but keeps TradingView symbol casing', () => {
			expect(filterTradingViewSymbolRows({
				candidate: 'btcusdc',
				rows: [{ symbol: 'BTCUSDC', type: 'Crypto_Spot', logo: 'crypto/XTVCBTC' }],
			})[0]?.symbol).toBe('BTCUSDC')
		})
	})

	describe('mergeSymbolSuggestions', () => {
		it('keeps builtin rows first, then exact typed TradingView rows in response order', () => {
			const rows = mergeSymbolSuggestions(
				[{ symbol: 'BTCUSDT.P', type: 'Crypto_Perp', logo: 'builtin.svg' }],
				[
					{ candidate: 'BTC', rows: [{ symbol: 'BTC', type: 'Future', logo: 'crypto/XTVCBTC' }] },
					{ candidate: 'BTCUSDC.P', rows: [{ symbol: 'BTCUSDC.P', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' }] },
					{ candidate: 'BTCUSDT', rows: [{ symbol: 'BTCUSDT', type: 'Crypto_Spot', logo: 'crypto/XTVCBTC' }] },
					{ candidate: 'BTCUSDC', rows: [{ symbol: 'BTCUSDC', type: 'Crypto_Spot', logo: 'crypto/XTVCBTC' }] },
				],
			)
			expect(rows.map((row) => row.symbol)).toEqual(['BTCUSDT.P', 'BTC', 'BTCUSDC.P', 'BTCUSDT', 'BTCUSDC'])
		})

		it('dedupes by symbol name case-insensitively and keeps first-seen row', () => {
			const rows = mergeSymbolSuggestions(
				[{ symbol: 'BTC', type: 'Future', logo: 'builtin.svg' }],
				[{ candidate: 'BTC', rows: [{ symbol: 'btc', type: 'Crypto_Spot', logo: 'crypto/XTVCBTC' }] }],
			)
			expect(rows).toEqual([{ symbol: 'BTC', type: 'Future', logo: 'builtin.svg' }])
		})

		it('drops non-exact and untyped TV rows before dedupe', () => {
			const rows = mergeSymbolSuggestions([], [
				{
					candidate: 'BTCUSDC.P',
					rows: [
						{ symbol: 'BTCUSDC.P_PREMIUM', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' },
						{ symbol: 'BTCUSDC.P', type: null, logo: 'crypto/XTVCBTC' },
					],
				},
			])
			expect(rows).toEqual([])
		})
	})
}
