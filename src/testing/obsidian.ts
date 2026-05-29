import { TFile, type App } from 'obsidian'

export function createTestTFile(path: string): TFile {
	const fileName = path.split('/').pop() ?? path
	const dotIndex = fileName.lastIndexOf('.')
	const basename = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex)
	const extension = dotIndex === -1 ? '' : fileName.slice(dotIndex + 1)

	return Object.assign(new TFile(), {
		basename,
		extension,
		path,
	})
}

export function createWorkspaceApp(workspace: Record<string, unknown>): App {
	return { workspace } as unknown as App
}
