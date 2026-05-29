import { BuiltinSymbols as BuiltinSymbolMetadata } from './builtin'

import type { PositionSymbolType } from './position-model'
type BuiltinSymbolDataRow = {
	contract_unit?: number
	symbol_name: string
}

const TRADINGVIEW_SYMBOL_LOGO_BASE_URL = 'https://s3-symbol-logo.tradingview.com'

const BuiltinSymbolData = [
	{ symbol_name: 'BTCUSDT.P' },
	{ symbol_name: 'ETHUSDT.P' },
	{ symbol_name: 'SOLUSDT.P' },
	{ symbol_name: 'XRPUSDT.P' },
	{ symbol_name: 'BNBUSDT.P' },
	{ symbol_name: 'DOGEUSDT.P' },
	{ symbol_name: 'ADAUSDT.P' },
	{ symbol_name: 'TRXUSDT.P' },
	{ symbol_name: 'LINKUSDT.P' },
	{ symbol_name: 'AVAXUSDT.P' },
	{ symbol_name: 'POLUSDT.P' },
	{ symbol_name: 'LTCUSDT.P' },
	{ symbol_name: 'XMRUSDT.P' },
	{ symbol_name: 'SUIUSDT.P' },
	{ symbol_name: 'APTUSDT.P' },
	{ symbol_name: 'UNIUSDT.P' },
	{ symbol_name: 'ATOMUSDT.P' },
	{ symbol_name: 'XLMUSDT.P' },
	{ symbol_name: 'USDCUSDT.P' },
	{ symbol_name: 'BTCUSDT' },
	{ symbol_name: 'ETHUSDT' },
	{ symbol_name: 'SOLUSDT' },
	{ symbol_name: 'XRPUSDT' },
	{ symbol_name: 'BNBUSDT' },
	{ symbol_name: 'DOGEUSDT' },
	{ symbol_name: 'ADAUSDT' },
	{ symbol_name: 'TRXUSDT' },
	{ symbol_name: 'LINKUSDT' },
	{ symbol_name: 'AVAXUSDT' },
	{ symbol_name: 'POLUSDT' },
	{ symbol_name: 'LTCUSDT' },
	{ symbol_name: 'XMRUSDT' },
	{ symbol_name: 'SUIUSDT' },
	{ symbol_name: 'APTUSDT' },
	{ symbol_name: 'UNIUSDT' },
	{ symbol_name: 'ATOMUSDT' },
	{ symbol_name: 'XLMUSDT' },
	{ symbol_name: 'USDCUSDT' },
	{ symbol_name: 'ES', contract_unit: 50 },
	{ symbol_name: 'MES', contract_unit: 5 },
	{ symbol_name: 'NQ', contract_unit: 20 },
	{ symbol_name: 'MNQ', contract_unit: 2 },
	{ symbol_name: 'RTY', contract_unit: 50 },
	{ symbol_name: 'M2K', contract_unit: 5 },
	{ symbol_name: 'NKD', contract_unit: 5 },
	{ symbol_name: 'YM', contract_unit: 5 },
	{ symbol_name: 'MYM', contract_unit: 0.5 },
	{ symbol_name: 'MBT', contract_unit: 0.1 },
	{ symbol_name: 'MET', contract_unit: 0.1 },
	{ symbol_name: '6A', contract_unit: 100000 },
	{ symbol_name: 'M6A', contract_unit: 10000 },
	{ symbol_name: '6B', contract_unit: 62500 },
	{ symbol_name: 'M6B', contract_unit: 6250 },
	{ symbol_name: '6C', contract_unit: 100000 },
	{ symbol_name: '6E', contract_unit: 125000 },
	{ symbol_name: 'E7', contract_unit: 62500 },
	{ symbol_name: 'M6E', contract_unit: 12500 },
	{ symbol_name: '6J', contract_unit: 12500000 },
	{ symbol_name: '6M', contract_unit: 500000 },
	{ symbol_name: '6N', contract_unit: 100000 },
	{ symbol_name: '6S', contract_unit: 125000 },
	{ symbol_name: 'HE', contract_unit: 40000 },
	{ symbol_name: 'LE', contract_unit: 40000 },
	{ symbol_name: 'ZC', contract_unit: 5000 },
	{ symbol_name: 'ZW', contract_unit: 5000 },
	{ symbol_name: 'ZS', contract_unit: 5000 },
	{ symbol_name: 'ZM', contract_unit: 100 },
	{ symbol_name: 'ZL', contract_unit: 60000 },
	{ symbol_name: 'CL', contract_unit: 1000 },
	{ symbol_name: 'MCL', contract_unit: 100 },
	{ symbol_name: 'QM', contract_unit: 500 },
	{ symbol_name: 'NG', contract_unit: 10000 },
	{ symbol_name: 'MNG', contract_unit: 1000 },
	{ symbol_name: 'QG', contract_unit: 2500 },
	{ symbol_name: 'RB', contract_unit: 42000 },
	{ symbol_name: 'HO', contract_unit: 42000 },
	{ symbol_name: 'GC', contract_unit: 100 },
	{ symbol_name: 'MGC', contract_unit: 10 },
	{ symbol_name: 'SI', contract_unit: 5000 },
	{ symbol_name: 'SIL', contract_unit: 1000 },
	{ symbol_name: 'HG', contract_unit: 25000 },
	{ symbol_name: 'MHG', contract_unit: 2500 },
	{ symbol_name: 'PL', contract_unit: 50 },
	{ symbol_name: 'ZT', contract_unit: 200000 },
	{ symbol_name: 'ZF', contract_unit: 100000 },
	{ symbol_name: 'ZN', contract_unit: 100000 },
	{ symbol_name: 'TN', contract_unit: 100000 },
	{ symbol_name: 'ZB', contract_unit: 100000 },
	{ symbol_name: 'UB', contract_unit: 100000 },
	{ symbol_name: 'XAUUSD', contract_unit: 100 },
	{ symbol_name: 'XAGUSD', contract_unit: 500 },
	{ symbol_name: 'EURUSD', contract_unit: 100000 },
	{ symbol_name: 'GBPUSD', contract_unit: 100000 },
	{ symbol_name: 'USDJPY', contract_unit: 100000 },
	{ symbol_name: 'USDCHF', contract_unit: 100000 },
	{ symbol_name: 'AUDUSD', contract_unit: 100000 },
	{ symbol_name: 'USDCAD', contract_unit: 100000 },
	{ symbol_name: 'NZDUSD', contract_unit: 100000 },
	{ symbol_name: 'EURGBP', contract_unit: 100000 },
	{ symbol_name: 'EURJPY', contract_unit: 100000 },
	{ symbol_name: 'GBPJPY', contract_unit: 100000 },
	{ symbol_name: 'AUDJPY', contract_unit: 100000 },
	{ symbol_name: 'CADJPY', contract_unit: 100000 },
	{ symbol_name: 'CHFJPY', contract_unit: 100000 },
	{ symbol_name: 'EURAUD', contract_unit: 100000 },
	{ symbol_name: 'EURCAD', contract_unit: 100000 },
	{ symbol_name: 'EURCHF', contract_unit: 100000 },
	{ symbol_name: 'GBPAUD', contract_unit: 100000 },
	{ symbol_name: 'GBPCAD', contract_unit: 100000 },
	{ symbol_name: 'GBPCHF', contract_unit: 100000 },
	{ symbol_name: 'AUDCAD', contract_unit: 100000 },
	{ symbol_name: 'AUDCHF', contract_unit: 100000 },
	{ symbol_name: 'AUDNZD', contract_unit: 100000 },
	{ symbol_name: 'CADCHF', contract_unit: 100000 },
	{ symbol_name: 'NZDJPY', contract_unit: 100000 },
	{ symbol_name: 'NZDCAD', contract_unit: 100000 },
	{ symbol_name: 'NZDCHF', contract_unit: 100000 },
	{ symbol_name: 'USDSGD', contract_unit: 100000 },
	{ symbol_name: 'SPI200', contract_unit: 1 },
	{ symbol_name: 'TWINDEX', contract_unit: 1 },
	{ symbol_name: 'UK100', contract_unit: 1 },
	{ symbol_name: 'US2000', contract_unit: 1 },
	{ symbol_name: 'CHINAH', contract_unit: 1 },
	{ symbol_name: 'NETH25', contract_unit: 1 },
	{ symbol_name: 'SWI20', contract_unit: 1 },
	{ symbol_name: 'HK50', contract_unit: 1 },
	{ symbol_name: 'HKTECH', contract_unit: 1 },
	{ symbol_name: 'NAS100', contract_unit: 1 },
	{ symbol_name: 'NIKKEI225', contract_unit: 1 },
	{ symbol_name: 'SA40', contract_unit: 1 },
	{ symbol_name: 'SGP20', contract_unit: 1 },
	{ symbol_name: 'SP500', contract_unit: 1 },
	{ symbol_name: 'CHINA50', contract_unit: 1 },
	{ symbol_name: 'DJ30', contract_unit: 1 },
	{ symbol_name: 'BVSPX', contract_unit: 1 },
	{ symbol_name: 'ES35', contract_unit: 1 },
	{ symbol_name: 'EU50', contract_unit: 1 },
	{ symbol_name: 'FRA40', contract_unit: 1 },
	{ symbol_name: 'GER40', contract_unit: 1 },
] as const satisfies readonly BuiltinSymbolDataRow[]

export type BuiltinSymbolName = (typeof BuiltinSymbolData)[number]['symbol_name']

export type BuiltinSymbolConstant = BuiltinSymbolDataRow & {
	logo: string
	symbol_name: BuiltinSymbolName
	type: PositionSymbolType
}

function builtinSymbol({ symbol_name, contract_unit }: BuiltinSymbolDataRow & { symbol_name: BuiltinSymbolName }): BuiltinSymbolConstant {
	const symbol = BuiltinSymbolMetadata[symbol_name]
	return {
		...(contract_unit === undefined ? {} : { contract_unit }),
		logo: `${TRADINGVIEW_SYMBOL_LOGO_BASE_URL}/${symbol.logo}.svg`,
		symbol_name,
		type: symbol.type,
	}
}

export const BuiltinSymbolList = BuiltinSymbolData.map(builtinSymbol) satisfies readonly BuiltinSymbolConstant[]

const BuiltinSymbolsByType = groupBuiltinSymbolsByType()

const BuiltinSymbolsByFutureName: ReadonlyMap<string, BuiltinSymbolConstant> = new Map(
	builtinSymbolsByType('Future').map((symbol) => [symbol.symbol_name, symbol]),
)

const BuiltinSymbolsByCfdName: ReadonlyMap<string, BuiltinSymbolConstant> = new Map(
	builtinSymbolsByType('CFD').map((symbol) => [symbol.symbol_name, symbol]),
)

function groupBuiltinSymbolsByType() {
	const groups = new Map<BuiltinSymbolConstant['type'], BuiltinSymbolConstant[]>()
	for (const symbol of BuiltinSymbolList) {
		const group = groups.get(symbol.type)
		if (group === undefined) {
			groups.set(symbol.type, [symbol])
			continue
		}

		group.push(symbol)
	}

	return groups
}

function builtinSymbolsByType(type: BuiltinSymbolConstant['type']): readonly BuiltinSymbolConstant[] {
	const symbols = BuiltinSymbolsByType.get(type)
	if (symbols === undefined) {
		throw new Error('Unknown builtin symbol type')
	}

	return symbols
}

function normalizeBuiltinSymbolName(symbolName: string): string {
	return symbolName.trim().toLocaleUpperCase().replace('/', '').replace(/(?:\.P(?:ERP)?|:USDT|:USDC|:USD)?$/u, '').replace(/\+$/, '')
}

export function findBuiltinFutureSymbol(symbolName: string | null | undefined) {
	if (typeof symbolName !== 'string') {
		return null
	}

	const normalizedSymbolName = normalizeBuiltinSymbolName(symbolName)
	return BuiltinSymbolsByFutureName.get(normalizedSymbolName) ?? null
}

export function findBuiltinCfdSymbol(symbolName: string | null | undefined) {
	if (typeof symbolName !== 'string') {
		return null
	}

	const normalizedSymbolName = normalizeBuiltinSymbolName(symbolName)
	return BuiltinSymbolsByCfdName.get(normalizedSymbolName) ?? null
}
