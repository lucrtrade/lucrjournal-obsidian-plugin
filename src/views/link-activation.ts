import { openDomainFileAsMarkdown } from './domain-file-routing'

import type { App, PaneType, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian'

export type LinkActivationEvent = {
	metaKey?: boolean
	preventDefault?: () => void
	stopPropagation?: () => void
}

type MarkdownViewLike = {
	getState: () => Record<string, unknown>
	setState: (state: Record<string, unknown>, result?: ViewStateResult) => Promise<unknown>
}

type OpenMarkdownFileOptions = {
	defaultPane?: PaneType | boolean
	sourceMode?: boolean
	state?: Record<string, unknown>
	stateResult?: ViewStateResult
}

const DEFAULT_STATE_RESULT = { history: false } satisfies ViewStateResult

export function isCommandClick(event: LinkActivationEvent | null | undefined): boolean {
	return event?.metaKey === true
}

export function consumeLinkActivationEvent(event: LinkActivationEvent | null | undefined): void {
	event?.preventDefault?.()
	event?.stopPropagation?.()
}

export function resolveLinkPane(defaultPane: PaneType | boolean, event: LinkActivationEvent | null | undefined): PaneType | boolean {
	// @story [[lucrjournal/runtime#^command-link-new-tab]] Resolves command-click link activation to an Obsidian tab.
	// @story [[lucrjournal/runtime#^normal-link-pane]] Preserves the caller pane for ordinary link activation.
	return isCommandClick(event) ? 'tab' : defaultPane
}

export async function openMarkdownFile(
	app: App,
	file: TFile,
	event: LinkActivationEvent | null | undefined,
	options: OpenMarkdownFileOptions = {},
): Promise<WorkspaceLeaf> {
	const leaf = app.workspace.getLeaf(resolveLinkPane(options.defaultPane ?? 'tab', event))
	if (options.sourceMode === true) {
		// @story [[lucrjournal/runtime#^source-link-state]] Writes source-mode Markdown view state directly without opening the file first.
		await openDomainFileAsMarkdown(leaf, file.path, 'source', options.stateResult ?? DEFAULT_STATE_RESULT, app)
		return leaf
	}

	await leaf.openFile(file)

	if (options.state !== undefined) {
		const view = leaf.view as MarkdownViewLike
		await view.setState(options.state, options.stateResult ?? DEFAULT_STATE_RESULT)
	}

	return leaf
}

export async function openVaultLinkText(
	app: App,
	linktext: string,
	sourcePath: string,
	event: LinkActivationEvent | null | undefined,
	defaultPane: PaneType | boolean = false,
): Promise<void> {
	await app.workspace.openLinkText(linktext, sourcePath, resolveLinkPane(defaultPane, event))
}
