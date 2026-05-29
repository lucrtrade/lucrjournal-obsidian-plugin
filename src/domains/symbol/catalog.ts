import type { IconDescriptor } from '../core/icon-descriptor'

export {
	resolveSymbolInfo,
} from './pair'

export function toSymbolLogoUrl(logo: string | null | undefined): string | null {
	const normalizedLogo = logo?.trim() ?? ''
	return normalizedLogo.length === 0 ? null : normalizedLogo
}

export function toSymbolLogoIconDescriptor(logo: string | null | undefined): IconDescriptor | undefined {
	const logoUrl = toSymbolLogoUrl(logo)
	return logoUrl === null ? undefined : { kind: 'url', value: logoUrl }
}
