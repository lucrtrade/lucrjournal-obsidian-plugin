import type { type } from 'arktype'

export interface DomainDefinitionOptions {
	persisted: null | {
		folderName: string
	}
}

export interface DomainRuntimeFile {
	path: string
	basename?: string
}

export interface DomainPersistedEntry<
	Frontmatter,
	File extends DomainRuntimeFile = DomainRuntimeFile,
> {
	file: File
	fm: Frontmatter
}

export interface DomainRuntimeApp {
	vault: {
		getMarkdownFiles(): DomainRuntimeFile[]
	}
	metadataCache: {
		getTags?: () => Record<string, unknown>
		resolvedLinks?: Record<string, Record<string, number>>
		getFileCache(file: DomainRuntimeFile): {
			frontmatter?: unknown
			tags?: Array<{ tag: string }>
		} | null
	}
}

export type DomainValue<TDomain extends { schema: type.Any }> =
	TDomain['schema']['infer']
