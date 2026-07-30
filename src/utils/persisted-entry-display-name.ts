import { getFileBasename } from './file-basename'

function readOptionalPersistedEntryName(frontmatter: unknown): string | null {
	if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
		return null
	}

	const name: unknown = Reflect.get(frontmatter, 'name')
	if (typeof name !== 'string') {
		return null
	}

	const trimmedName = name.trim()
	return trimmedName === '' ? null : trimmedName
}

export function getPersistedEntryDisplayName(entry: {
	file: { path: string; basename?: string }
	fm: unknown
}) {
	// @story [[lucrjournal/content#^persisted-entry-display-name]] Prefers a non-empty persisted name and falls back to the file basename.
	return readOptionalPersistedEntryName(entry.fm) ?? getFileBasename(entry.file)
}
