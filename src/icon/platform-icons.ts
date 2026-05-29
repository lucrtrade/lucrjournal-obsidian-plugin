import { PlatformIcons } from '../icons'

export const PLATFORM_FALLBACK_ICON_NAME = 'landmark'

export function getInitialPlatformIconSrc(name: string): string | null {
	const trimmed = name.trim()
	if (trimmed.length === 0) {
		return null
	}

	return trimmed in PlatformIcons ? PlatformIcons[trimmed as keyof typeof PlatformIcons] : null
}
