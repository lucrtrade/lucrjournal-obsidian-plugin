// Reads the persisted `created` timestamp from a refined domain entry's frontmatter. The
// frontmatter value is the source of truth users edit; the file's stat ctime is not.
export function getPersistedEntryCreated(fm: unknown): string | null {
	if (typeof fm !== 'object' || fm === null) {
		return null
	}

	const created: unknown = Reflect.get(fm, 'created')
	return typeof created === 'string' && created.trim() !== '' ? created : null
}
