export { type PlatformDefinition } from './factory'
import { Binance } from './binance'
import { Bitget } from './bitget'
import { Bybit } from './bybit'
import { InteractiveBrokers } from './interactive-brokers'
import { MetaTrader } from './metatrader'
import { OKX } from './okx'

import type { OhlcvAdapter, PlatformDefinition } from './factory'

// @story [[lucrjournal/account-platform#^preset-platforms]] Defines the exact built-in platform preset order
const PLATFORMS = [
	Binance,
	Bybit,
	OKX,
	Bitget,
	MetaTrader,
	InteractiveBrokers,
] as const

type PlatformName = (typeof PLATFORMS)[number]['name']

export const PLATFORM_NAMES = PLATFORMS.map((platform) => platform.name) as readonly PlatformName[]

const platformEntries = PLATFORMS.map((platform) => [platform.name, platform] as const) as ReadonlyArray<
	readonly [PlatformName, PlatformDefinition]
>

export const PLATFORM_TO_EXCHANGE_ID = Object.fromEntries(
	platformEntries.flatMap(([name, p]) =>
		p.exchangeId ? [[name, p.exchangeId]] : [],
	),
) as Readonly<Partial<Record<PlatformName, string>>>

// @story [[lucrjournal/market-data#^exchange-adapter-registry]] Registers only platforms with an exchange id and OHLCV adapter.
export const EXCHANGE_ID_TO_ADAPTER: ReadonlyMap<string, OhlcvAdapter> = new Map(
	platformEntries.flatMap(([, p]) =>
		p.exchangeId !== null && p.ohlcv !== undefined ? [[p.exchangeId, p.ohlcv] as const] : [],
	),
)
