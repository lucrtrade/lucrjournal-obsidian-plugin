/// <reference types="vitest/importMeta" />

import { requestUrl } from 'obsidian'

import { createLogger } from '../../logger'

import { getCachedTradingViewSearch } from './tradingview-cache'

import type { PositionSymbolType } from './position-model'

const TRADINGVIEW_LOGO_BASE = 'https://s3-symbol-logo.tradingview.com'
const PERP_SYMBOL_PATTERN = /\.P(?:ERP)?$|:/u
const logger = createLogger('symbol metadata')

export type SymbolTradingViewMetadata = {
	type: PositionSymbolType
	logo: string
}

let tradingViewRequesterOverride: Parameters<typeof getCachedTradingViewSearch>[1] | null = null

export function setTradingViewRequesterForTests(
	requester: Parameters<typeof getCachedTradingViewSearch>[1] | null,
): void {
	tradingViewRequesterOverride = requester
}

// @story [[lucrjournal/symbol-search#^runtime-request-contract]] Routes production TradingView traffic through Obsidian requestUrl
async function obsidianTradingViewRequester(
	options: { headers: Record<string, string>, throw: false, url: string },
) {
	const response = await requestUrl({ ...options, throw: false }) as { json: unknown, status: number }
	return { json: response.json, status: response.status }
}

Object.defineProperty(obsidianTradingViewRequester, 'name', { value: 'requestUrl' })

export function resolveCurrentTradingViewRequester() {
	return tradingViewRequesterOverride ?? obsidianTradingViewRequester
}

// @story [[lucrjournal/symbol-search#^metadata-failure-isolated]] Converts remote metadata failures into an absent enhancement
// @story [[lucrjournal/symbol-search#^metadata-type-precedence]] Resolves trusted type precedence before accepting a remote logo
export async function enrichSymbolMetadataFromTradingView(
	name: string,
	currentType: PositionSymbolType | null,
	requester: Parameters<typeof getCachedTradingViewSearch>[1],
): Promise<SymbolTradingViewMetadata | null> {
	logger.debug('enriching symbol from tradingview', { currentType, name })
	let rows
	try {
		rows = await getCachedTradingViewSearch(name, requester)
	} catch (err: unknown) {
		logger.debug('tradingview symbol metadata failed', { currentType, err, name })
		return null
	}
	const normalizedName = normalizeTradingViewSymbolName(name)
	const callerType = PERP_SYMBOL_PATTERN.test(normalizedName) ? 'Crypto_Perp' : null

	for (const row of rows) {
		const exact = normalizeTradingViewSymbolName(row.symbol) === normalizedName
		const finalType = callerType ?? (exact ? row.type : null) ?? currentType
		if (finalType === null) {
			continue
		}

		const metadata = {
			type: finalType,
			logo: `${TRADINGVIEW_LOGO_BASE}/${row.logo}.svg`,
		}
		logger.debug('resolved tradingview symbol metadata', { name, metadata })
		return metadata
	}

	logger.debug('tradingview symbol metadata not found', { currentType, name, rowCount: rows.length })
	return null
}

function normalizeTradingViewSymbolName(name: string): string {
	return name.trim().toUpperCase()
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it, vi } = import.meta.vitest

	afterEach(() => {
		vi.restoreAllMocks()
	})

	function tvResponse(rows: { symbol: string, type?: string, logoid?: string }[]) {
		return vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				symbols: rows.map((row) => ({
					symbol: row.symbol,
					type: row.type,
					logo: row.logoid === undefined ? undefined : { logoid: row.logoid },
				})),
			}),
		}))
	}

	describe('enrichSymbolMetadataFromTradingView', () => {
		// @story [[lucrjournal/symbol-search#^runtime-request-contract]] Covers the production requester adapter
		it('uses Obsidian requestUrl for the default TradingView requester', async () => {
			const Obsidian = await import('obsidian')
			const requestUrlSpy = vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
				json: { symbols: [] },
				status: 200,
			} as Awaited<ReturnType<typeof requestUrl>>)

			await getCachedTradingViewSearch('REQURLTEST', resolveCurrentTradingViewRequester())

			expect(requestUrlSpy).toHaveBeenCalledTimes(1)
			const options = requestUrlSpy.mock.calls[0]?.[0] as {
				headers: Record<string, string>
				throw: boolean
				url: string
			}
			expect(options.headers.Origin).toBe('https://www.tradingview.com')
			expect(options.throw).toBe(false)
			expect(options.url).toContain('text=REQURLTEST')
		})

		it('returns null when TradingView returns nothing', async () => {
			const requester = tvResponse([])
			await expect(enrichSymbolMetadataFromTradingView('FOOBAR', null, requester)).resolves.toBeNull()
		})

		// @story [[lucrjournal/symbol-search#^metadata-failure-isolated]] Covers recoverable remote metadata failure
		it('returns null when TradingView search fails', async () => {
			const requester = vi.fn(async () => {
				throw new Error('offline')
			})

			await expect(enrichSymbolMetadataFromTradingView('FOOBAR', null, requester)).resolves.toBeNull()
		})

		it('returns null when TV rows exist but none has a logo', async () => {
			const requester = tvResponse([{ symbol: 'FOOBAR', type: 'spot' }])
			await expect(enrichSymbolMetadataFromTradingView('FOOBAR', null, requester)).resolves.toBeNull()
		})

		// @story [[lucrjournal/symbol-search#^metadata-type-precedence]] Covers perpetual caller precedence and exact-row selection
		it('prefers the exact match with a logo over the first match', async () => {
			const requester = tvResponse([
				{ symbol: 'WIFUSDT', type: 'spot', logoid: 'crypto/WRONG' },
				{ symbol: 'WIFUSDT.P', type: 'spot', logoid: 'crypto/XTVCWIF' },
			])
			await expect(enrichSymbolMetadataFromTradingView('WIFUSDT.P', null, requester)).resolves.toEqual({
				type: 'Crypto_Perp',
				logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCWIF.svg',
			})
		})

		it('returns the typed row.type without any string lookups (mapping happens in tradingview.ts)', async () => {
			const requester = tvResponse([{ symbol: 'NQ1!', type: 'futures', logoid: 'indices/nasdaq-100' }])
			await expect(enrichSymbolMetadataFromTradingView('NQ1!', null, requester)).resolves.toEqual({
				type: 'Future',
				logo: 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100.svg',
			})
		})

		// @story [[lucrjournal/symbol-search#^metadata-type-precedence]] Covers caller perpetual markers over provider spot types
		it('forces Crypto_Perp when the caller-supplied name carries .P even if the matched row mapped to Crypto_Spot', async () => {
			const requester = tvResponse([{ symbol: 'WIFUSDT', type: 'spot', logoid: 'crypto/XTVCWIF' }])
			const result = await enrichSymbolMetadataFromTradingView('WIFUSDT.P', null, requester)
			expect(result?.type).toBe('Crypto_Perp')
		})

		// @story [[lucrjournal/symbol-search#^metadata-type-precedence]] Covers caller type fallback for unmapped provider rows
		it('keeps the caller-supplied currentType when TV maps the matched row to null but has a logo', async () => {
			const requester = tvResponse([{ symbol: 'WHATEVER', type: 'stock', logoid: 'foo/bar' }])
			const result = await enrichSymbolMetadataFromTradingView('WHATEVER', 'CFD', requester)
			expect(result).toEqual({
				type: 'CFD',
				logo: 'https://s3-symbol-logo.tradingview.com/foo/bar.svg',
			})
		})

		it('skips untyped TV rows when a later exact row has a mapped type', async () => {
			const requester = tvResponse([
				{ symbol: 'LINK', type: 'stock', logoid: 'stocks/link' },
				{ symbol: 'LINK', type: 'forex', logoid: 'crypto/XTVCLINK' },
			])
			const result = await enrichSymbolMetadataFromTradingView('LINK', null, requester)
			expect(result).toEqual({
				type: 'CFD',
				logo: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCLINK.svg',
			})
		})

		it('does not use non-exact TV row type when the caller has no trusted type', async () => {
			const requester = tvResponse([{ symbol: 'LINKUSD', type: 'forex', logoid: 'crypto/XTVCLINK' }])
			await expect(enrichSymbolMetadataFromTradingView('LINK', null, requester)).resolves.toBeNull()
		})

		// @story [[lucrjournal/symbol-search#^metadata-type-precedence]] Covers rejection when no trusted type source exists
		it('returns null when TV has a logo but neither the row nor the caller can supply a type', async () => {
			const requester = tvResponse([{ symbol: 'WHATEVER', type: 'stock', logoid: 'foo/bar' }])
			await expect(enrichSymbolMetadataFromTradingView('WHATEVER', null, requester)).resolves.toBeNull()
		})
	})
}
