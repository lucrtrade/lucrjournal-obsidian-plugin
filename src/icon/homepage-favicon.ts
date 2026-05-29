export function normalizeHomepageUrl(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return null
	}

	const normalizedValue = value.trim()
	if (normalizedValue === '') {
		return null
	}

	try {
		const url = new URL(normalizedValue)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return null
		}
		return url.toString()
	} catch {
		return null
	}
}

export function readHomepageHostname(value: string | null | undefined): string {
	const normalizedUrl = normalizeHomepageUrl(value)
	if (normalizedUrl === null) {
		return ''
	}

	return new URL(normalizedUrl).hostname
}

export function resolveHomepageFaviconUrl(value: string | null | undefined): string | null {
	const hostname = readHomepageHostname(value)
	return hostname === '' ? null : `https://icons.duckduckgo.com/ip3/${hostname}.ico`
}

