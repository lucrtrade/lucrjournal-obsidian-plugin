import type { PositionSymbolType } from './position-model'

const TradingViewOrigin = 'https://www.tradingview.com'
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

export async function searchTradingViewSymbols(
	requester: TradingViewRequester,
	query: string,
	preferredType?: PositionSymbolType,
): Promise<TradingViewSymbolRow[]> {
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
