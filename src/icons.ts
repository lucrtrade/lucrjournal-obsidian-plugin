import {
	GeneratedCoreIconsSvg,
	GeneratedPlatformIconsSvg,
} from './generated-icons/icon-assets.generated'
import { toSvgDataUri } from './icon/base64'

function toSvgDataUriMap<const T extends Record<string, string>>(icons: T): {
	readonly [Key in keyof T]: string
} {
	return Object.fromEntries(
		Object.entries(icons).map(([name, svg]) => [name, toSvgDataUri(svg)]),
	) as {
		readonly [Key in keyof T]: string
	}
}

const PlatformIconsSvg = {
	...GeneratedPlatformIconsSvg,
} as const

export const IconsSvg = {
	...GeneratedCoreIconsSvg,
	...GeneratedPlatformIconsSvg,
} as const

export const PlatformIcons = toSvgDataUriMap(PlatformIconsSvg)
