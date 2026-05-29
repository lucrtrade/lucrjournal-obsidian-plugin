/// <reference types="vitest/importMeta" />

import { createLogger } from '../../logger'

import { BuiltinSymbolList } from './constants'
import { buildTradingViewSymbolSearchQueries } from './search-candidates'
import { mergeSymbolSuggestions, type SymbolSuggestion } from './search-results'
import { getCachedTradingViewSearch } from './tradingview-cache'

type TradingViewRequester = Parameters<typeof getCachedTradingViewSearch>[1]

export type { SymbolSuggestion } from './search-results'

const logger = createLogger('symbol suggestion')
const BUILTIN_BY_NAME = new Map(BuiltinSymbolList.map((entry) => [entry.symbol_name.toUpperCase(), entry]))

export function findBuiltinSymbolSuggestions(
	input: string,
	excludedSymbols: ReadonlySet<string> = new Set(),
): SymbolSuggestion[] {
	const normalized = input.trim().toUpperCase()
	if (normalized.length < 2) {
		return []
	}

	return matchBuiltinByPrefix(normalized, normalizeSymbolSet(excludedSymbols))
}

export async function findSymbolSuggestions(
	input: string,
	requester: TradingViewRequester,
	excludedSymbols: ReadonlySet<string> = new Set(),
): Promise<SymbolSuggestion[]> {
	const normalized = input.trim().toUpperCase()
	if (normalized.length < 2) {
		return []
	}

	const excluded = normalizeSymbolSet(excludedSymbols)
	const builtinMatches = findBuiltinSymbolSuggestions(normalized, excluded)
	const queries = buildTradingViewSymbolSearchQueries(normalized, excluded)

	logger.debug('querying tradingview', { builtinMatches, excluded, normalized, queries })

	const tvResponses = await Promise.all(queries
		.map(async (candidate) => ({
			candidate,
			rows: await getCachedTradingViewSearch(candidate, requester),
		})))

	logger.debug('received tradingview symbol suggestions', { normalized, tvResponses })

	return mergeSymbolSuggestions(builtinMatches, tvResponses)
}

function normalizeSymbolSet(symbols: ReadonlySet<string>): Set<string> {
	return new Set(Array.from(symbols, (symbol) => symbol.trim().toUpperCase()).filter((symbol) => symbol.length > 0))
}

function matchBuiltinByPrefix(input: string, excluded: ReadonlySet<string>): SymbolSuggestion[] {
	const rows: SymbolSuggestion[] = []
	const seen = new Set<string>()
	for (const entry of BuiltinSymbolList) {
		if (!entry.symbol_name.startsWith(input)) {
			continue
		}
		pushBuiltin(rows, seen, excluded, entry.symbol_name)
		if (entry.symbol_name === input) {
			pushBuiltin(rows, seen, excluded, `M${entry.symbol_name}`)
		}
	}
	return rows
}

function pushBuiltin(rows: SymbolSuggestion[], seen: Set<string>, excluded: ReadonlySet<string>, symbol: string): void {
	const entry = BUILTIN_BY_NAME.get(symbol.toUpperCase())
	if (entry === undefined || seen.has(entry.symbol_name) || excluded.has(entry.symbol_name.toUpperCase())) {
		return
	}
	seen.add(entry.symbol_name)
	rows.push({
		symbol: entry.symbol_name,
		type: entry.type,
		logo: entry.logo,
	})
}

if (import.meta.vitest) {
	const { describe, expect, it, vi } = import.meta.vitest

	describe('findBuiltinSymbolSuggestions', () => {
		it('returns builtin prefix matches synchronously without a TradingView requester', () => {
			expect(findBuiltinSymbolSuggestions('XAG', new Set()).map((row) => row.symbol)).toEqual(['XAGUSD'])
		})

		it('excludes journal symbols from builtin prefix matches', () => {
			expect(findBuiltinSymbolSuggestions('XA', new Set(['XAGUSD'])).map((row) => row.symbol)).toEqual(['XAUUSD'])
		})
	})

	describe('findSymbolSuggestions', () => {
		it('surfaces the matching crypto perp builtin instantly without sending it to TV (BTC -> BTCUSDT.P)', async () => {
			const calls: string[] = []
			const fetcher = async (url: string) => {
				calls.push(decodeURIComponent(url.split('text=')[1]?.split('&')[0] ?? ''))
				return { ok: true, status: 200, json: async () => ({ symbols: [] }) }
			}
			const rows = await findSymbolSuggestions('BTC', fetcher)
			expect(rows[0]).toMatchObject({
				symbol: 'BTCUSDT.P',
				type: 'Crypto_Perp',
				logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
			})
			expect(calls).not.toContain('BTCUSDT.P')
			expect(calls).not.toContain('BTCUSDT')
			expect(calls.sort()).toEqual(['BTC', 'BTCUSDC', 'BTCUSDC.P'])
		})

		it('passes BTCUSDC.P through the TradingView path and keeps the exact typed row', async () => {
			const fetcher = async (url: string) => {
				const query = decodeURIComponent(url.split('text=')[1]?.split('&')[0] ?? '')
				return {
					ok: true,
					status: 200,
					json: async () => ({
						symbols: [
							{ symbol: `${query}_PREMIUM`, type: 'swap', logo: { logoid: 'crypto/XTVCBTC' } },
							{ symbol: query, type: 'swap', logo: { logoid: 'crypto/XTVCBTC' } },
						],
					}),
				}
			}

			await expect(findSymbolSuggestions('BTCUSDC.P', fetcher)).resolves.toEqual([{
				symbol: 'BTCUSDC.P',
				type: 'Crypto_Perp',
				logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
			}])
		})

		it('drops TV candidates that are already in the journal', async () => {
			const calls: string[] = []
			const fetcher = async (url: string) => {
				calls.push(decodeURIComponent(url.split('text=')[1]?.split('&')[0] ?? ''))
				return { ok: true, status: 200, json: async () => ({ symbols: [] }) }
			}
			const rows = await findSymbolSuggestions('BTC', fetcher, new Set(['BTCUSDT']))
			expect(rows[0]?.symbol).toBe('BTCUSDT.P')
			expect(calls.sort()).toEqual(['BTC', 'BTCUSDC', 'BTCUSDC.P'])
		})

		it('drops a builtin row that is already in the journal', async () => {
			const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ symbols: [] }) })
			const rows = await findSymbolSuggestions('BTC', fetcher, new Set(['BTCUSDT.P']))
			expect(rows.find((row) => row.symbol === 'BTCUSDT.P')).toBeUndefined()
		})

		it('returns matching CFD builtins by prefix', async () => {
			const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ symbols: [] }) }))
			const rows = await findSymbolSuggestions('XA', fetcher)
			expect(rows.map((row) => row.symbol).sort()).toEqual(['XAGUSD', 'XAUUSD'])
			expect(rows.find((row) => row.symbol === 'XAUUSD')).toMatchObject({
				type: 'CFD',
				logo: 'https://s3-symbol-logo.tradingview.com/metal/gold.svg',
			})
		})

		it('matches micro futures when the base future is typed', async () => {
			const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ symbols: [] }) }))
			expect((await findSymbolSuggestions('ES', fetcher)).map((row) => row.symbol)).toEqual(['ES', 'MES', 'ES35'])
			expect((await findSymbolSuggestions('NG', fetcher)).map((row) => row.symbol)).toEqual(['NG', 'MNG'])
			expect(fetcher).not.toHaveBeenCalled()
		})

		it('does zero TV requests when the user types an exact builtin name', async () => {
			const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ symbols: [] }) }))
			const rows = await findSymbolSuggestions('XAUUSD', fetcher)
			expect(rows.map((row) => row.symbol)).toEqual(['XAUUSD'])
			expect(fetcher).not.toHaveBeenCalled()
		})

		it('returns [] for sub-threshold input without calling TV or scanning builtins', async () => {
			const fetcher = vi.fn()
			await expect(findSymbolSuggestions('E', fetcher as never)).resolves.toEqual([])
			expect(fetcher).not.toHaveBeenCalled()
		})
	})
}
