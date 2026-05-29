export function parseWikilinkHeading(title: string): { linkpath: string } | null {
	const match = title.trim().match(/^\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/)
	if (match === null) {
		return null
	}

	return {
		linkpath: match[1]!.trim(),
	}
}
