import { TFile, type App } from 'obsidian'

export type VirtualMarkdownFile = {
	path: string
	frontmatter: Record<string, unknown>
}

/**
 * A read-only App view that also "contains" files the plan is about to create,
 * so domain helpers (symbol lookup, fee model, next id, link resolution)
 * compute the same values the real write will produce.
 */
export function createPlanningApp(app: App, virtualFiles: VirtualMarkdownFile[]): App {
	const virtualByPath = new Map(virtualFiles.map((file) => [file.path, file]))
	const virtualTFiles = virtualFiles.map((file) => createVirtualTFile(file.path))

	const vault = {
		getName: () => app.vault.getName(),
		getMarkdownFiles: () => [...app.vault.getMarkdownFiles(), ...virtualTFiles],
		getAbstractFileByPath: (path: string) => virtualTFiles.find((file) => file.path === path) ?? app.vault.getAbstractFileByPath(path),
		read: (file: TFile) => app.vault.read(file),
	}
	const metadataCache = {
		getFileCache: (file: TFile) => {
			const virtualFile = virtualByPath.get(file.path)
			return virtualFile === undefined
				? app.metadataCache.getFileCache(file)
				: { frontmatter: virtualFile.frontmatter }
		},
		getFirstLinkpathDest: (linkpath: string, sourcePath: string) =>
			virtualTFiles.find((file) => file.basename === linkpath) ?? app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath),
	}

	return { vault, metadataCache, workspace: app.workspace, fileManager: app.fileManager } as unknown as App
}

export function createVirtualTFile(path: string): TFile {
	const name = path.split('/').pop() ?? path
	const basename = name.replace(/\.md$/, '')
	const file: unknown = Object.create(TFile.prototype)
	if (!(file instanceof TFile)) {
		throw new Error('Unable to create a virtual TFile')
	}
	return Object.assign(file, { path, name, basename, extension: 'md' })
}
