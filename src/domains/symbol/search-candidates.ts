/// <reference types="vitest/importMeta" />

import { BuiltinSymbolList } from './constants'
import { SpecialSuffixes } from './pair'

const PAIR_SUFFIXES = SpecialSuffixes.flatMap((s) => [`${s}`, `${s}.P`])
const BUILTIN_SYMBOL_NAMES = new Set(BuiltinSymbolList.map((entry) => entry.symbol_name.toUpperCase()))

function expandSymbolSearchCandidates(input: string): string[] {
	const normalized = input.trim().toUpperCase()
	if (normalized.length < 2) {
		return []
	}

	const candidates = [normalized]
	const alreadyHasSuffix = PAIR_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
	if (!alreadyHasSuffix) {
		for (const suffix of PAIR_SUFFIXES) {
			candidates.push(`${normalized}${suffix}`)
		}
	}

	return Array.from(new Set(candidates))
}

export function buildTradingViewSymbolSearchQueries(
	input: string,
	excludedSymbols: ReadonlySet<string> = new Set(),
	builtinSymbols: ReadonlySet<string> = BUILTIN_SYMBOL_NAMES,
): string[] {
	const excluded = normalizeSymbolSet(excludedSymbols)
	const builtins = normalizeSymbolSet(builtinSymbols)
	const normalized = input.trim().toUpperCase()
	if (normalized.length < 2 || builtins.has(normalized)) {
		return []
	}

	const candidates = expandSymbolSearchCandidates(normalized)
	return candidates.filter((candidate) => !excluded.has(candidate) && !builtins.has(candidate))
}

function normalizeSymbolSet(symbols: ReadonlySet<string>): Set<string> {
	return new Set(Array.from(symbols, (symbol) => symbol.trim().toUpperCase()).filter((symbol) => symbol.length > 0))
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	const builtins = new Set(['BTCUSDT.P', 'XAUUSD'])

	describe('expandSymbolSearchCandidates', () => {
		it('expands a bare base to base + USDT/USDC spot and perp candidates in stable order', () => {
			expect(expandSymbolSearchCandidates('BTC')).toEqual([
				'BTC', 'BTCUSDT', 'BTCUSDT.P', 'BTCUSDC', 'BTCUSDC.P',
			])
		})

		it('expands non-crypto-looking inputs the same way and lets TradingView/cache absorb misses', () => {
			expect(expandSymbolSearchCandidates('NQ')).toEqual([
				'NQ', 'NQUSDT', 'NQUSDT.P', 'NQUSDC', 'NQUSDC.P',
			])
			expect(expandSymbolSearchCandidates('XAU')).toEqual([
				'XAU', 'XAUUSDT', 'XAUUSDT.P', 'XAUUSDC', 'XAUUSDC.P',
			])
		})

		it('does not double-expand inputs that already carry a supported generated suffix', () => {
			expect(expandSymbolSearchCandidates('BTCUSDT')).toEqual(['BTCUSDT'])
			expect(expandSymbolSearchCandidates('BTCUSDT.P')).toEqual(['BTCUSDT.P'])
			expect(expandSymbolSearchCandidates('BTCUSDC')).toEqual(['BTCUSDC'])
			expect(expandSymbolSearchCandidates('BTCUSDC.P')).toEqual(['BTCUSDC.P'])
		})

		it('normalizes whitespace and case before expanding', () => {
			expect(expandSymbolSearchCandidates('  btc ')).toEqual([
				'BTC', 'BTCUSDT', 'BTCUSDT.P', 'BTCUSDC', 'BTCUSDC.P',
			])
		})

		it('returns [] below the two-character threshold', () => {
			expect(expandSymbolSearchCandidates('B')).toEqual([])
			expect(expandSymbolSearchCandidates('')).toEqual([])
			expect(expandSymbolSearchCandidates('   ')).toEqual([])
		})
	})

	describe('buildTradingViewSymbolSearchQueries', () => {
		it('removes builtin candidates because builtin rows are resolved locally', () => {
			expect(buildTradingViewSymbolSearchQueries('BTC', new Set(), builtins)).toEqual([
				'BTC', 'BTCUSDT', 'BTCUSDC', 'BTCUSDC.P',
			])
		})

		it('removes journal symbols because they belong in the journal section', () => {
			expect(buildTradingViewSymbolSearchQueries('BTC', new Set(['BTCUSDT']), builtins)).toEqual([
				'BTC', 'BTCUSDC', 'BTCUSDC.P',
			])
		})

		it('returns no TV query for exact builtin inputs', () => {
			expect(buildTradingViewSymbolSearchQueries('XAUUSD', new Set(), builtins)).toEqual([])
			expect(buildTradingViewSymbolSearchQueries('BTCUSDT.P', new Set(), builtins)).toEqual([])
		})

		it('keeps exact non-builtin suffix inputs as the only TV query', () => {
			expect(buildTradingViewSymbolSearchQueries('WIFUSDT.P', new Set(), builtins)).toEqual(['WIFUSDT.P'])
			expect(buildTradingViewSymbolSearchQueries('BTCUSDC.P', new Set(), builtins)).toEqual(['BTCUSDC.P'])
		})

		it('normalizes excluded and builtin sets before filtering', () => {
			expect(buildTradingViewSymbolSearchQueries(' btc ', new Set([' btcusdc ']), new Set([' btcusdt.p ']))).toEqual([
				'BTC', 'BTCUSDT', 'BTCUSDC.P',
			])
		})

		it('dedupes candidates after expansion', () => {
			expect(new Set(buildTradingViewSymbolSearchQueries('BTC', new Set(), builtins)).size)
				.toBe(buildTradingViewSymbolSearchQueries('BTC', new Set(), builtins).length)
		})
	})
}
