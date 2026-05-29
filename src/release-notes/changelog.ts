import changelogSource from '../../CHANGELOG.md?raw'

type ChangelogEntries = {
	versions: string[]
	bodies: Record<string, string>
}

let cached: ChangelogEntries | null = null

export function getChangelogEntries(): ChangelogEntries {
	if (cached !== null) {
		return cached
	}

	cached = parseChangelog(changelogSource)
	return cached
}

function parseChangelog(source: string): ChangelogEntries {
	const versions: string[] = []
	const bodies: Record<string, string> = {}
	const matches: Array<{ version: string; start: number; end: number }> = []
	const headingRegex = /^##\s+\[([^\]]+)\][^\n]*$/gm
	let match: RegExpExecArray | null

	while ((match = headingRegex.exec(source)) !== null) {
		const version = match[1]?.trim() ?? ''
		if (isReleasedVersion(version)) {
			matches.push({ version, start: match.index, end: match.index + match[0].length })
		}
	}

	for (let i = 0; i < matches.length; i += 1) {
		const current = matches[i]
		if (current === undefined) {
			throw new Error('Unknown changelog entry')
		}

		const next = matches[i + 1]
		versions.push(current.version)
		bodies[current.version] = source.slice(current.end, next?.start ?? source.length).trim()
	}

	return { versions, bodies }
}

function isReleasedVersion(value: string): boolean {
	return /^\d+\.\d+\.\d+/.test(value)
}

function parseSemver(value: string): [number, number, number] | null {
	const match = value.match(/^(\d+)\.(\d+)\.(\d+)/)
	if (match === null) {
		return null
	}

	return [
		Number.parseInt(match[1] ?? '0', 10),
		Number.parseInt(match[2] ?? '0', 10),
		Number.parseInt(match[3] ?? '0', 10),
	]
}

export function isVersionNewerThanOther(version: string, other: string): boolean {
	if (version === '' || other === '') {
		return version !== ''
	}

	const parsedVersion = parseSemver(version)
	const parsedOther = parseSemver(other)
	if (parsedVersion === null || parsedOther === null) {
		return false
	}

	return compareParsedSemver(parsedVersion, parsedOther) > 0
}

function compareSemverDesc(a: string, b: string): number {
	const parsedA = parseSemver(a)
	const parsedB = parseSemver(b)
	if (parsedA === null || parsedB === null) {
		return 0
	}

	return compareParsedSemver(parsedB, parsedA)
}

function compareParsedSemver(a: [number, number, number], b: [number, number, number]): number {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

export function selectChangelogVersions(
	versions: readonly string[],
	previousVersion: string,
	currentVersion: string,
): string[] {
	return versions
		.filter((version) => (
			previousVersion !== ''
			&& isVersionNewerThanOther(version, previousVersion)
			&& !isVersionNewerThanOther(version, currentVersion)
		))
		.sort(compareSemverDesc)
}

export function formatChangelogEntries(
	versions: readonly string[],
	bodies: Record<string, string>,
	emptyMessage: string,
): string {
	if (versions.length === 0) {
		return emptyMessage
	}

	if (versions.length === 1) {
		return bodies[versions[0] ?? ''] ?? ''
	}

	return versions.map((version) => `# ${version}\n\n${bodies[version] ?? ''}`).join('\n\n---\n\n')
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('release notes changelog', () => {
		it('compares semantic versions', () => {
			expect(isVersionNewerThanOther('1.0.39', '1.0.38')).toBe(true)
			expect(isVersionNewerThanOther('1.0.38', '1.0.38')).toBe(false)
			expect(isVersionNewerThanOther('1.0.37', '1.0.38')).toBe(false)
		})

		it('selects versions newer than previous and not newer than current', () => {
			expect(selectChangelogVersions(['1.0.40', '1.0.39', '1.0.38'], '1.0.38', '1.0.39'))
				.toEqual(['1.0.39'])
		})

		it('selects no versions on first install', () => {
			expect(selectChangelogVersions(['1.0.39'], '', '1.0.39')).toEqual([])
		})

		it('formats a single entry without adding another heading', () => {
			expect(formatChangelogEntries(['1.0.39'], { '1.0.39': '- changed' }, 'empty')).toBe('- changed')
		})
	})
}
