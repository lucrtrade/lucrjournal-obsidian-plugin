export { type PlatformDefinition } from './factory'
import { Binance } from './binance'
import { Bitget } from './bitget'
import { Bybit } from './bybit'
import { InteractiveBrokers } from './interactive-brokers'
import { MetaTrader } from './metatrader'
import { OKX } from './okx'

import type { PlatformDefinition } from './factory'

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

export const PLATFORM_TO_CCXT_ID = Object.fromEntries(
	platformEntries.flatMap(([name, p]) =>
		p.ccxtId ? [[name, p.ccxtId]] : [],
	),
) as Readonly<Partial<Record<PlatformName, string>>>
