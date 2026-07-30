import type { PositionSymbolType } from './position-model'

// @story [[lucrjournal/symbol-search#^runtime-request-contract]] Defines the TradingView endpoint and request origin
const TradingViewOrigin = 'https://www.tradingview.com'
// @story [[lucrjournal/symbol-search#^tradingview-query-contract]] Defines the exact TradingView symbol search endpoint
const TradingViewSymbolSearchApi = 'https://symbol-search.tradingview.com/symbol_search/v3/'

type FetchRequester = (
	url: string,
	init: { headers: Record<string, string> },
) => Promise<{
	json: () => Promise<unknown>
	ok: boolean
	status: number
}>

type RequestUrlRequester = (
	options: { headers: Record<string, string>, throw: false, url: string },
) => Promise<{
	json: unknown
	status: number
}>

type TradingViewRequester = FetchRequester | RequestUrlRequester

// @story [[lucrjournal/symbol-search#^vendor-type-mapping]] Maps vendor categories into symbol domain types
const TV_TYPE_TO_ASSET_CATEGORY: Record<string, PositionSymbolType> = {
	commodity: 'CFD',
	crypto: 'Crypto_Spot',
	forex: 'CFD',
	futures: 'Future',
	index: 'CFD',
	spot: 'Crypto_Spot',
	swap: 'Crypto_Perp',
}

const PERP_SYMBOL_PATTERN = /\.P(?:ERP)?$|:/u

export type TradingViewSymbolRow = {
	symbol: string
	type: PositionSymbolType | null
	logo: string
}

// @story [[lucrjournal/symbol-search#^response-failure-classification]] Filters malformed or unusable provider rows
export async function searchTradingViewSymbols(
	requester: TradingViewRequester,
	query: string,
	preferredType?: PositionSymbolType,
): Promise<TradingViewSymbolRow[]> {
	// @story [[lucrjournal/symbol-search#^tradingview-query-contract]] Builds the required query and provider parameters
	const url = `${TradingViewSymbolSearchApi}?text=${encodeURIComponent(query)}&hl=0&lang=en&domain=production`
	const json = await requestTradingViewJson(requester, url)
	const symbols = recordField(json, 'symbols')

	if (!Array.isArray(symbols)) {
		return []
	}

	const normalized = query.trim().toUpperCase()
	const rows: TradingViewSymbolRow[] = []
	for (const row of symbols) {
		if (!isRecord(row)) {
			continue 
		}
		const symbol = stringField(row, 'symbol') ?? ''
		const logo = tradingViewLogoKey(row)
		if (symbol.length === 0 || logo === null) {
			continue 
		}
		rows.push({ symbol, type: mapTradingViewAssetCategory(symbol, stringField(row, 'type')), logo })
	}

	return rows
		.map((row, index) => ({ row, index, score: rankScore(row, normalized, preferredType) }))
		.sort((a, b) => a.score - b.score || a.index - b.index)
		.map((entry) => entry.row)
}

// @story [[lucrjournal/symbol-search#^remote-result-ranking]] Ranks exact and preferred-type rows
// @story [[lucrjournal/symbol-search#^remote-result-stability]] Uses provider indexes to stabilize equal scores
function rankScore(row: TradingViewSymbolRow, symbolName: string, preferredType: PositionSymbolType | undefined): number {
	const exact = row.symbol.toUpperCase() === symbolName ? 0 : 100
	const typeMatch = preferredType === undefined || row.type === null
		? 50
		: row.type === preferredType ? 0 : 50
	return exact + typeMatch
}

function mapTradingViewAssetCategory(symbol: string, rawType: string | null): PositionSymbolType | null {
	const mapped = rawType === null ? null : TV_TYPE_TO_ASSET_CATEGORY[rawType.toLowerCase()] ?? null
	// eslint-disable-next-line local/no-symbol-type-branching -- TradingView boundary mapping upgrades vendor spot rows for .P symbols.
	if (mapped === 'Crypto_Spot' && PERP_SYMBOL_PATTERN.test(symbol)) {
		return 'Crypto_Perp'
	}
	return mapped
}

// @story [[lucrjournal/symbol-search#^runtime-request-contract]] Sends the required headers through the runtime requester
// @story [[lucrjournal/symbol-search#^tradingview-query-contract]] Sends the fixed TradingView user agent
// @story [[lucrjournal/symbol-search#^response-failure-classification]] Rejects non-success TradingView responses
async function requestTradingViewJson(requester: TradingViewRequester, url: string): Promise<unknown> {
	const headers = {
		Origin: TradingViewOrigin,
		'user-agent': 'LucrJournal Symbol Logo Updater/1.0',
	}

	if (requester.name === 'requestUrl') {
		const response = await (requester as RequestUrlRequester)({ headers, throw: false, url })
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`TradingView symbol search failed: ${response.status}`)
		}

		return response.json
	}

	const response = await (requester as FetchRequester)(url, { headers })
	if (!response.ok) {
		throw new Error(`TradingView symbol search failed: ${response.status}`)
	}

	return await response.json()
}

// @story [[lucrjournal/symbol-search#^logo-field-precedence]] Resolves provider logo fields in stable precedence order
function tradingViewLogoKey(symbol: Record<string, unknown>): string | null {
	const logo = recordField(symbol, 'logo')
	return stringField(logo, 'logoid')
		?? stringField(symbol, 'logoid')
		?? stringField(symbol, 'base-currency-logoid')
		?? stringField(symbol, 'base_currency_logoid')
		?? stringField(symbol, 'currency-logoid')
		?? stringField(symbol, 'currency_logoid')
}

function recordField(row: unknown, key: string): Record<string, unknown> | null {
	if (!isRecord(row)) {
		return null
	}

	const value = row[key]
	return isRecord(value) ? value : null
}

function stringField(row: unknown, key: string): string | null {
	if (!isRecord(row)) {
		return null
	}

	const value = row[key]
	return typeof value === 'string' && value.length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
