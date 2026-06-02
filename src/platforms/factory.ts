import type { SymbolPair } from '../domains/symbol/pair'

export type OhlcvBar = {
	time: number
	open: number
	high: number
	low: number
	close: number
	volume: number
}

export type OhlcvPageRequest = {
	pair: SymbolPair
	timeframe: string
	cursorMs: number
	limit: number
	nowMs: number
}

export type OhlcvAdapter = {
	maxLimit: number
	pageUrl(request: OhlcvPageRequest): string
	parsePage(body: unknown, pair: SymbolPair): OhlcvBar[]
}

export type PlatformDefinition = {
	name: string
	exchangeId: string | null
	homepage: string
	icon: string
	simpleIcon?: string
	ohlcv?: OhlcvAdapter
}

export function buildPlatform<const T extends PlatformDefinition>(config: T): T {
	return config
}
