import { PlatformIcons } from '../icons'

// @story [[lucrjournal/account-platform#^platform-asset-fallback]] Defines the shared platform fallback icon
export const PLATFORM_FALLBACK_ICON_NAME = 'landmark'

// @story [[lucrjournal/account-platform#^platform-asset-fallback]] Resolves only exact generated platform asset keys
export function getInitialPlatformIconSrc(name: string): string | null {
	const trimmed = name.trim()
	if (trimmed.length === 0) {
		return null
	}

	return trimmed in PlatformIcons ? PlatformIcons[trimmed as keyof typeof PlatformIcons] : null
}
