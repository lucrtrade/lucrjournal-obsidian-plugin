import { describe, expect, it } from 'vitest'

import { searchTradingViewSymbols } from './tradingview'

describe('searchTradingViewSymbols', () => {
	// @story [[lucrjournal/symbol-search#^runtime-request-contract]] Covers the Obsidian requestUrl request shape
	it('reads symbol rows through Obsidian requestUrl', async () => {
		async function requestUrl(options: { headers: Record<string, string>, throw: boolean, url: string }) {
			expect(options.url).toContain('text=EURUSD')
			expect(options.throw).toBe(false)
			expect(options.headers.Origin).toBe('https://www.tradingview.com')
			return {
				json: {
					symbols: [
						{ symbol: 'EURUSD', type: 'forex', logo: { logoid: 'country/EU', logoid2: 'country/US', style: 'pair' } },
					],
				},
				status: 200,
			}
		}

		await expect(searchTradingViewSymbols(requestUrl, 'EURUSD')).resolves.toEqual([
			{ symbol: 'EURUSD', type: 'CFD', logo: 'country/EU' },
		])
	})

	// @story [[lucrjournal/symbol-search#^vendor-type-mapping]] Covers every mapped vendor category and perpetual upgrade
	it('normalizes rows and drops entries without a logo', async () => {
		async function fetch(url: string) {
			expect(url).toContain('text=BTC')
			return {
				ok: true,
				status: 200,
				json: async () => ({
					symbols: [
						{ symbol: 'BTCUSDT.P', type: 'spot', logo: { logoid: 'crypto/XTVCBTC' } },
						{ symbol: 'BTCUSDC.P', type: 'swap', logo: { logoid: 'crypto/XTVCBTC' } },
						{ symbol: 'BTCUSDT', type: 'spot', logo: { logoid: 'crypto/XTVCBTC' } },
						{ symbol: 'NQ1!', type: 'futures', logo: { logoid: 'indices/nasdaq-100' } },
						{ symbol: 'EURUSD', type: 'forex', logo: { logoid: 'country/EU' } },
						{ symbol: 'GC1!', type: 'commodity', logo: { logoid: 'commodity/gold' } },
						{ symbol: 'AAPL', type: 'stock', logo: { logoid: 'us-aapl' } },
						{ symbol: 'BAD' },
					],
				}),
			}
		}

		await expect(searchTradingViewSymbols(fetch, 'BTC')).resolves.toEqual([
			{ symbol: 'BTCUSDT.P', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' },
			{ symbol: 'BTCUSDC.P', type: 'Crypto_Perp', logo: 'crypto/XTVCBTC' },
			{ symbol: 'BTCUSDT', type: 'Crypto_Spot', logo: 'crypto/XTVCBTC' },
			{ symbol: 'NQ1!', type: 'Future', logo: 'indices/nasdaq-100' },
			{ symbol: 'EURUSD', type: 'CFD', logo: 'country/EU' },
			{ symbol: 'GC1!', type: 'CFD', logo: 'commodity/gold' },
			{ symbol: 'AAPL', type: null, logo: 'us-aapl' },
		])
	})

	// @story [[lucrjournal/symbol-search#^remote-result-ranking]] Covers exact-match ranking before non-exact rows
	it('puts exact symbol matches first so callers can take [0]', async () => {
		async function fetch() {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					symbols: [
						{ symbol: 'BTCUSDT.P', type: 'swap', logo: { logoid: 'wrong' } },
						{ symbol: 'BTCUSDT', type: 'spot', logo: { logoid: 'crypto/XTVCBTC' } },
					],
				}),
			}
		}

		const [best] = await searchTradingViewSymbols(fetch, 'BTCUSDT')
		expect(best).toEqual({ symbol: 'BTCUSDT', type: 'Crypto_Spot', logo: 'crypto/XTVCBTC' })
	})

	// @story [[lucrjournal/symbol-search#^remote-result-ranking]] Covers preferred-type ranking among exact rows
	it('prefers the preferred type when multiple rows share the same exact symbol', async () => {
		async function fetch() {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					symbols: [
						{ symbol: 'ZS', type: 'stock', logo: { logoid: 'zscaler' } },
						{ symbol: 'ZS', type: 'futures', logo: { logoid: 'commodity/soybean' } },
					],
				}),
			}
		}

		const [best] = await searchTradingViewSymbols(fetch, 'ZS', 'Future')
		expect(best?.logo).toBe('commodity/soybean')
	})
})
