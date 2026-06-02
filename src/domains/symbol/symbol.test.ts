import { describe, expect, it } from 'vitest'

import { BuiltinSymbols } from './builtin'
import { BuiltinSymbolList } from './constants'
import { resolveSymbolInfo } from './pair'

describe('BuiltinSymbols', () => {
	it('keeps TradingView logo metadata for every builtin symbol constant', () => {
		const counts = new Map<string, number>()
		for (const symbol of BuiltinSymbolList) {
			counts.set(symbol.type, (counts.get(symbol.type) ?? 0) + 1)
			expect(BuiltinSymbols[symbol.symbol_name].type).toBe(symbol.type)
			expect(symbol.logo).toMatch(/^https:\/\/s3-symbol-logo\.tradingview\.com\/[A-Za-z0-9/-]+\.svg$/u)
			expect(symbol).not.toHaveProperty('price_base')
		}
		expect(counts.get('Crypto_Perp')).toBe(19)
		expect(counts.get('Crypto_Spot')).toBe(19)
		expect(counts.get('Future')).toBe(51)
		expect(counts.get('CFD')).toBe(50)
	})
})

describe('resolveSymbolInfo', () => {
	it('resolves public symbol info from symbol name only', () => {
		expect(resolveSymbolInfo('BTC/USDT.P')).toMatchObject({
			name: 'BTCUSDT.P',
			type: 'Crypto_Perp',
			asset: 'BTC',
		})
		expect(resolveSymbolInfo('BTCUSDT')).toMatchObject({
			name: 'BTCUSDT',
			type: 'Crypto_Spot',
			asset: 'BTC',
		})
		expect(resolveSymbolInfo('EURUSD')).toMatchObject({
			name: 'EURUSD',
			type: 'CFD',
			asset: 'EUR',
		})
	})

	it('infers builtin futures before any other symbol category', () => {
		expect(resolveSymbolInfo('es').type).toBe('Future')
	})

	it('infers crypto type from symbol name shape', () => {
		expect(resolveSymbolInfo('BTCUSDT.P').type).toBe('Crypto_Perp')
		expect(resolveSymbolInfo('BTC/USDT.P').type).toBe('Crypto_Perp')
		expect(resolveSymbolInfo('BTC/USDT:USDT').type).toBe('Crypto_Perp')
		expect(resolveSymbolInfo('BTCUSDT').type).toBe('Crypto_Spot')
		expect(resolveSymbolInfo('BTC/USDT').type).toBe('Crypto_Spot')
	})

	it('infers major CFD pairs from compact and slash pair names', () => {
		expect(resolveSymbolInfo('EURUSD').type).toBe('CFD')
		expect(resolveSymbolInfo('eur/usd').type).toBe('CFD')
		expect(resolveSymbolInfo('USDJPY').type).toBe('CFD')
		expect(resolveSymbolInfo('XAUUSD').type).toBe('CFD')
		expect(resolveSymbolInfo('XAUUSD+').type).toBe('CFD')
		expect(resolveSymbolInfo('XAGUSD').type).toBe('CFD')
		expect(resolveSymbolInfo('HK50').type).toBe('CFD')
		expect(resolveSymbolInfo('nikkei225').type).toBe('CFD')
		expect(resolveSymbolInfo('GER40').type).toBe('CFD')
	})

	it('leaves non-builtin symbols untyped', () => {
		expect(resolveSymbolInfo('TSLA').type).toBeNull()
		expect(resolveSymbolInfo('XAU').type).toBeNull()
		expect(resolveSymbolInfo('XAG').type).toBeNull()
	})
})
