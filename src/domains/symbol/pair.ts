/// <reference types="vitest/importMeta" />

import { BuiltinSymbolList, type BuiltinSymbolConstant } from './constants'

import type { PositionSymbolType } from './position-model'

export type SymbolInfo = {
	logo: string | null
	name: string
	type: PositionSymbolType | null
	asset: string | null
}

export type SymbolPair = {
	base: string
	quote: string
	type: 'perp' | 'spot'
}

const BUILTIN_BY_NAME = new Map<string, BuiltinSymbolConstant>(
	BuiltinSymbolList.map((symbol) => [symbol.symbol_name, symbol]),
)

export const SpecialSuffixes = ['USDT', 'USDC'] as const

const SLASHLESS_QUOTE_SUFFIXES = [
	'FDUSD', 'USDC', 'USDT', 'BUSD', 'TUSD', 'USDP', 'USDD', 'USDS',
	'FRAX', 'EUSD', 'USTC', 'DAI',
	'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
	'CNY', 'HKD', 'KRW', 'SGD', 'TRY', 'BRL', 'MXN', 'ZAR', 'INR', 'RUB',
	'BTC', 'ETH', 'BNB', 'SOL', 'TON', 'TRX', 'XRP',
] as const

const DERIVATIVE_SUFFIX_PATTERN = /[.\-_](PERP|NEXT|PS|NW|P|F|S)$/u
const EXPLICIT_PAIR_PATTERN = /^([A-Z0-9]+)[/\-_]([A-Z0-9]+)(?::([A-Z0-9]+))?$/u

export function resolveSymbolInfo(symbolName: string): SymbolInfo {
	const normalized = symbolName.trim().toUpperCase()

	// Step 1: direct builtin match
	const direct = findBuiltin(normalized)
	if (direct !== undefined) {
		return buildFromBuiltin(direct)
	}

	// Step 2: canonical builtin match (e.g. BTC/USDT -> BTCUSDT, BTC/USDT:USDT -> BTCUSDT.P)
	const canonical = canonicalize(normalized)
	if (canonical !== normalized) {
		const canonicalBuiltin = findBuiltin(canonical)
		if (canonicalBuiltin !== undefined) {
			return buildFromBuiltin(canonicalBuiltin)
		}
	}

	// Step 3: derive from pair shape, fall back to raw normalized input
	const pair = parseSymbolPair(normalized)
	const name = shouldUseCanonicalName(canonical, normalized, pair) ? canonical : normalized
	return {
		name,
		logo: null,
		type: pair === null ? null : pair.type === 'perp' ? 'Crypto_Perp' : 'Crypto_Spot',
		asset: pair?.base ?? (normalized.length > 0 ? normalized : null),
	}
}

function findBuiltin(symbol: string): BuiltinSymbolConstant | undefined {
	return BUILTIN_BY_NAME.get(symbol) ?? BUILTIN_BY_NAME.get(symbol.replace(/\+$/u, ''))
}

function buildFromBuiltin(builtin: BuiltinSymbolConstant): SymbolInfo {
	const pair = parseSymbolPair(builtin.symbol_name)
	return {
		name: builtin.symbol_name,
		logo: builtin.logo,
		type: builtin.type,
		asset: pair?.base ?? builtin.symbol_name,
	}
}

function shouldUseCanonicalName(canonical: string, normalized: string, pair: SymbolPair | null): boolean {
	return canonical !== normalized && (canonical.endsWith('.P') || (pair !== null && isKnownCompactQuote(pair.quote)))
}

function isKnownCompactQuote(quote: string): boolean {
	return SLASHLESS_QUOTE_SUFFIXES.includes(quote as (typeof SLASHLESS_QUOTE_SUFFIXES)[number])
}

// Reduce a symbol to its canonical compact form so it can be matched against the builtin table.
// Examples: BTC/USDT -> BTCUSDT, BTC/USDT:USDT -> BTCUSDT.P, BTCUSDT_PERP -> BTCUSDT.P, XAUUSD+ -> XAUUSD
function canonicalize(symbol: string): string {
	let s = symbol.replace(/!+$/u, '').replace(/\d+!$/u, '').replace(/\+$/u, '')
	let isPerp = false

	const colonIdx = s.indexOf(':')
	if (colonIdx !== -1) {
		s = s.slice(0, colonIdx)
		isPerp = true
	}

	const deriv = s.match(DERIVATIVE_SUFFIX_PATTERN)
	if (deriv !== null) {
		s = s.slice(0, -deriv[0].length)
		isPerp = true
	}

	const sep = s.match(/^([A-Z0-9]+)[/\-_]([A-Z0-9]+)$/u)
	if (sep !== null) {
		s = `${sep[1]}${sep[2]}`
	}

	return isPerp ? `${s}.P` : s
}

export function parseSymbolPair(symbol: string | null | undefined): SymbolPair | null {
	if (typeof symbol !== 'string') {
		return null
	}

	const trimmed = symbol.trim().toUpperCase()
		.replace(/!+$/u, '').replace(/\d+!$/u, '').replace(/\+$/u, '')
	if (trimmed.length === 0) {
		return null
	}

	const derivative = trimmed.match(DERIVATIVE_SUFFIX_PATTERN)
	const normalized = derivative === null ? trimmed : trimmed.slice(0, -derivative[0].length)
	const typeHint: SymbolPair['type'] | null = derivative === null ? null : 'perp'

	const separated = normalized.match(EXPLICIT_PAIR_PATTERN)
	if (separated !== null) {
		const [, base = '', quote = '', settle = ''] = separated
		if (base.length > 0 && quote.length > 0) {
			return { base, quote, type: typeHint ?? (settle.length > 0 ? 'perp' : 'spot') }
		}
	}

	for (const suffix of SLASHLESS_QUOTE_SUFFIXES) {
		if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
			return { base: normalized.slice(0, -suffix.length), quote: suffix, type: typeHint ?? 'spot' }
		}
	}

	return /^[A-Z]{6}$/u.test(normalized)
		? { base: normalized.slice(0, 3), quote: normalized.slice(3), type: 'spot' }
		: null
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('resolveSymbolInfo', () => {
		const testcases: ReadonlyArray<{ input: string; expected: Partial<SymbolInfo> }> = [
			// Step 1: direct builtin match
			{ input: 'BTCUSDT', expected: { name: 'BTCUSDT', type: 'Crypto_Spot', asset: 'BTC' } },
			{ input: 'BTCUSDT.P', expected: { name: 'BTCUSDT.P', type: 'Crypto_Perp', asset: 'BTC' } },
			{ input: 'EURUSD', expected: { name: 'EURUSD', type: 'CFD', asset: 'EUR' } },
			{ input: 'ES', expected: { name: 'ES', type: 'Future', asset: 'ES' } },

			// Step 1: trailing + stripped to match builtin (XAU itself is NOT a builtin; XAUUSD is CFD)
			{ input: 'XAUUSD+', expected: { name: 'XAUUSD', type: 'CFD', asset: 'XAU' } },

			// Step 2: canonicalized to spot builtin
			{ input: 'BTC/USDT', expected: { name: 'BTCUSDT', type: 'Crypto_Spot', asset: 'BTC' } },
			{ input: 'BTC-USDT', expected: { name: 'BTCUSDT', type: 'Crypto_Spot', asset: 'BTC' } },
			{ input: 'BTC_USDT', expected: { name: 'BTCUSDT', type: 'Crypto_Spot', asset: 'BTC' } },

			// Step 2: canonicalized to perp builtin (all variants converge on BTCUSDT.P)
			{ input: 'BTC/USDT.P', expected: { name: 'BTCUSDT.P', type: 'Crypto_Perp', asset: 'BTC' } },
			{ input: 'BTC/USDT:USDT', expected: { name: 'BTCUSDT.P', type: 'Crypto_Perp', asset: 'BTC' } },
			{ input: 'BTCUSDT.PERP', expected: { name: 'BTCUSDT.P', type: 'Crypto_Perp', asset: 'BTC' } },
			{ input: 'BTCUSDT_PERP', expected: { name: 'BTCUSDT.P', type: 'Crypto_Perp', asset: 'BTC' } },
			{ input: 'BTCUSDT.NEXT', expected: { name: 'BTCUSDT.P', type: 'Crypto_Perp', asset: 'BTC' } },

			// Step 3: non-builtin pair (canonical not in builtins, derived from pair shape)
			{ input: 'BTCFDUSD', expected: { name: 'BTCFDUSD', type: 'Crypto_Spot', asset: 'BTC' } },

			{ input: 'FOOUSDC', expected: { name: 'FOOUSDC', type: 'Crypto_Spot', asset: 'FOO' } },
			{ input: 'FOO/USDT', expected: { name: 'FOOUSDT', type: 'Crypto_Spot', asset: 'FOO' } },
			{ input: 'FOO/USDC:USDC', expected: { name: 'FOOUSDC.P', type: 'Crypto_Perp', asset: 'FOO' } },

			{ input: 'ETH_USDC', expected: { name: 'ETHUSDC', type: 'Crypto_Spot', asset: 'ETH' } },
			{ input: 'FOO/USDT.P', expected: { name: 'FOOUSDT.P', type: 'Crypto_Perp', asset: 'FOO' } },
			{ input: 'FOO/BAR', expected: { name: 'FOO/BAR', type: 'Crypto_Spot', asset: 'FOO', logo: null } },

			// Step 3: unknown, no pair detected
			{ input: 'FOO+', expected: { name: 'FOO+', type: null, asset: 'FOO+', logo: null } },

			// trim + uppercase normalization happens before step 1
			{ input: '  btcusdt  ', expected: { name: 'BTCUSDT', type: 'Crypto_Spot', asset: 'BTC' } },
			{ input: 'btc/usdt:usdt', expected: { name: 'BTCUSDT.P', type: 'Crypto_Perp', asset: 'BTC' } },
		]

		for (const { input, expected } of testcases) {
			it(`resolves ${JSON.stringify(input)}`, () => {
				expect(resolveSymbolInfo(input)).toMatchObject(expected)
			})
		}
	})

	describe('parseSymbolPair', () => {
		it('parses slashless crypto spot pairs into base and quote', () => {
			expect(parseSymbolPair('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT', type: 'spot' })
		})

		it('matches slashless quotes longest-first', () => {
			expect(parseSymbolPair('BTCFDUSD')).toEqual({ base: 'BTC', quote: 'FDUSD', type: 'spot' })
			expect(parseSymbolPair('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT', type: 'spot' })
		})

		it('parses explicit pair separators', () => {
			expect(parseSymbolPair('BTC-USDT')).toEqual({ base: 'BTC', quote: 'USDT', type: 'spot' })
			expect(parseSymbolPair('ETH_USDC')).toEqual({ base: 'ETH', quote: 'USDC', type: 'spot' })
		})

		it('parses slash and perp pairs into base and quote', () => {
			expect(parseSymbolPair('BTC/USDT.P')).toEqual({ base: 'BTC', quote: 'USDT', type: 'perp' })
			expect(parseSymbolPair('BTC/USDT:USDT')).toEqual({ base: 'BTC', quote: 'USDT', type: 'perp' })
		})

		it('strips derivative suffixes before parsing pairs', () => {
			expect(parseSymbolPair('BTCUSDT_PERP')).toEqual({ base: 'BTC', quote: 'USDT', type: 'perp' })
			expect(parseSymbolPair('BTCUSDT.NEXT')).toEqual({ base: 'BTC', quote: 'USDT', type: 'perp' })
		})

		it('falls back to six-letter forex pairs', () => {
			expect(parseSymbolPair('EURUSD')).toEqual({ base: 'EUR', quote: 'USD', type: 'spot' })
		})

		it('returns null for non-pair symbols', () => {
			expect(parseSymbolPair('ES')).toBeNull()
			expect(parseSymbolPair(null)).toBeNull()
		})
	})

	describe('canonicalize', () => {
		it('strips pair separators', () => {
			expect(canonicalize('BTC/USDT')).toBe('BTCUSDT')
			expect(canonicalize('BTC-USDT')).toBe('BTCUSDT')
			expect(canonicalize('BTC_USDT')).toBe('BTCUSDT')
		})

		it('normalizes perp markers to .P', () => {
			expect(canonicalize('BTC/USDT.P')).toBe('BTCUSDT.P')
			expect(canonicalize('BTC/USDT:USDT')).toBe('BTCUSDT.P')
			expect(canonicalize('BTCUSDT.PERP')).toBe('BTCUSDT.P')
			expect(canonicalize('BTCUSDT_PERP')).toBe('BTCUSDT.P')
		})

		it('strips trailing TradingView quirks', () => {
			expect(canonicalize('XAUUSD+')).toBe('XAUUSD')
			expect(canonicalize('BTCUSDT!')).toBe('BTCUSDT')
		})
	})

	describe('BUILTIN_BY_NAME map', () => {
		it('maps every builtin symbol constant to its own asset key', () => {
			expect(BuiltinSymbolList).toHaveLength(139)
			for (const symbol of BuiltinSymbolList) {
				expect(BUILTIN_BY_NAME.get(symbol.symbol_name)?.symbol_name).toBe(symbol.symbol_name)
			}
		})
	})
}
