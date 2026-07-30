import { MarkdownView, TFile, WorkspaceLeaf, type App, type EventRef, type ViewState, type ViewStateResult } from 'obsidian'

import { LUCR_PLAYBOOK_VIEW_TYPE, LUCR_POSITION_VIEW_TYPE } from '../constant'

import { domainFileViewDescriptors, type DomainFileViewDescriptor } from './domain-file-view-registry'

type DomainFileRoutingPlugin = {
	app: App
	register: (callback: () => void) => void
}

type DomainMarkdownActionsPlugin = DomainFileRoutingPlugin & {
	registerEvent: (eventRef: EventRef) => void
}

const MARKDOWN_STATE_RESULT = { history: false } satisfies ViewStateResult
const markdownDomainFiles = new WeakMap<WorkspaceLeaf, string>()
const domainMarkdownActions = new WeakMap<MarkdownView, { element: HTMLElement; viewType: string }>()

export function createPositionFileViewState(filePath: string): ViewState {
	return createDomainFileViewState(filePath, LUCR_POSITION_VIEW_TYPE)
}

export function createPlaybookFileViewState(filePath: string): ViewState {
	return createDomainFileViewState(filePath, LUCR_PLAYBOOK_VIEW_TYPE)
}

function createDomainFileViewState(filePath: string, viewType: string): ViewState {
	return {
		active: true,
		state: { file: filePath },
		type: viewType,
	}
}

export function createMarkdownFileViewState(filePath: string, mode?: string): ViewState {
	return {
		active: true,
		state: mode === undefined ? { file: filePath } : { file: filePath, mode },
		type: 'markdown',
	}
}

export function markDomainFileOpenAsMarkdown(leaf: WorkspaceLeaf, filePath: string): void {
	markdownDomainFiles.set(leaf, filePath)
}

function clearDomainFileOpenAsMarkdown(leaf: WorkspaceLeaf): void {
	markdownDomainFiles.delete(leaf)
}

export async function openDomainFileAsMarkdown(
	leaf: WorkspaceLeaf,
	filePath: string,
	mode?: string,
	result: ViewStateResult = MARKDOWN_STATE_RESULT,
	app?: App,
): Promise<void> {
	// @story [[lucrjournal/runtime#^domain-to-markdown]] Marks the leaf before switching it to a history-free Markdown state.
	markDomainFileOpenAsMarkdown(leaf, filePath)
	await leaf.setViewState(createMarkdownFileViewState(filePath, mode), result)
	if (app !== undefined) {
		syncDomainMarkdownAction(app, leaf)
	}
}

export function shouldOpenPositionFileView(app: App, state: ViewState, leaf?: WorkspaceLeaf): boolean {
	return shouldOpenDomainFileView(app, state, LUCR_POSITION_VIEW_TYPE, leaf)
}

export function shouldOpenPlaybookFileView(app: App, state: ViewState, leaf?: WorkspaceLeaf): boolean {
	return shouldOpenDomainFileView(app, state, LUCR_PLAYBOOK_VIEW_TYPE, leaf)
}

function shouldOpenDomainFileView(app: App, state: ViewState, viewType: string, leaf?: WorkspaceLeaf): boolean {
	if (state.type !== 'markdown') {
		return false
	}

	const filePath = readViewStateFilePath(state)
	if (filePath === null) {
		return false
	}

	if (leaf !== undefined) {
		const markdownPath = markdownDomainFiles.get(leaf)
		if (markdownPath === filePath) {
			return false
		}
		if (markdownPath !== undefined) {
			// @story [[lucrjournal/runtime#^markdown-override-scope]] Clears a stale Markdown override when the leaf moves to another file.
			markdownDomainFiles.delete(leaf)
		}
	}

	return resolveDomainFileViewType(app, filePath) === viewType
}

export function resolveDomainFileViewState(app: App, state: ViewState, leaf?: WorkspaceLeaf): ViewState {
	if (state.type !== 'markdown') {
		return state
	}

	const filePath = readViewStateFilePath(state)
	const viewType = filePath === null ? null : resolveDomainFileViewType(app, filePath)
	// @story [[lucrjournal/runtime#^domain-default-view]] Rewrites valid domain Markdown state to its descriptor view type.
	// @story [[lucrjournal/runtime#^invalid-domain-stays-markdown]] Leaves incomplete or non-domain Markdown state unchanged.
	return viewType !== null && shouldOpenDomainFileView(app, state, viewType, leaf)
		? { ...state, type: viewType }
		: state
}

export function registerDomainFileRouting(plugin: DomainFileRoutingPlugin): void {
	const originalSetViewState = Reflect.get(WorkspaceLeaf.prototype, 'setViewState')
	const originalDetach = Reflect.get(WorkspaceLeaf.prototype, 'detach')

	const patchedSetViewState = function (
		this: WorkspaceLeaf,
		state: ViewState,
		...rest: [ViewStateResult?]
	) {
		return Reflect.apply(originalSetViewState, this, [resolveDomainFileViewState(plugin.app, state, this), ...rest])
	}
	const patchedDetach = function (this: WorkspaceLeaf) {
		markdownDomainFiles.delete(this)
		return Reflect.apply(originalDetach, this, [])
	}

	WorkspaceLeaf.prototype.setViewState = patchedSetViewState
	WorkspaceLeaf.prototype.detach = patchedDetach

	plugin.register(() => {
		// @story [[lucrjournal/runtime#^routing-patch-cleanup]] Restores only prototype methods still owned by this routing patch.
		if (WorkspaceLeaf.prototype.setViewState === patchedSetViewState) {
			WorkspaceLeaf.prototype.setViewState = originalSetViewState
		}
		if (WorkspaceLeaf.prototype.detach === patchedDetach) {
			WorkspaceLeaf.prototype.detach = originalDetach
		}
	})
}

export function registerDomainMarkdownActions(plugin: DomainMarkdownActionsPlugin): void {
	const syncLeaf = (leaf: WorkspaceLeaf | null) => {
		syncDomainMarkdownAction(plugin.app, leaf)
	}
	const syncActiveLeaf = () => {
		syncLeaf(plugin.app.workspace.getMostRecentLeaf())
	}

	// @story [[lucrjournal/runtime#^managed-runtime-resources]] Registers workspace routing listeners with the plugin lifecycle.
	plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', syncLeaf))
	plugin.registerEvent(plugin.app.workspace.on('file-open', syncActiveLeaf))
	syncActiveLeaf()
}

function syncDomainMarkdownAction(app: App, leaf: WorkspaceLeaf | null): void {
	if (!(leaf?.view instanceof MarkdownView)) {
		return
	}

	const view = leaf.view
	const action = domainMarkdownActions.get(view)
	const descriptor = view.file instanceof TFile ? resolveDomainFileViewDescriptor(app, view.file) : null
	if (descriptor === null) {
		action?.element.remove()
		domainMarkdownActions.delete(view)
		return
	}

	if (action?.viewType === descriptor.viewType) {
		return
	}
	action?.element.remove()

	domainMarkdownActions.set(view, {
		viewType: descriptor.viewType,
		element: view.addAction(
			'lucrtrade',
			descriptor.markdownActionLabel(),
			() => {
				if (!(view.file instanceof TFile)) {
					return
				}
				clearDomainFileOpenAsMarkdown(leaf)
				// @story [[lucrjournal/runtime#^markdown-to-domain]] Clears the override and returns the same leaf to its domain view without history.
				void leaf.setViewState(createDomainFileViewState(view.file.path, descriptor.viewType), MARKDOWN_STATE_RESULT)
			},
		),
	})
}

function readViewStateFilePath(state: ViewState): string | null {
	const filePath = state.state?.file
	return typeof filePath === 'string' && filePath !== '' ? filePath : null
}

function resolveDomainFileViewType(app: App, filePath: string): string | null {
	return resolveDomainFileDescriptor(app.metadataCache.getCache(filePath)?.frontmatter)?.viewType ?? null
}

function resolveDomainFileViewDescriptor(app: App, file: TFile): DomainFileViewDescriptor | null {
	return resolveDomainFileDescriptor(app.metadataCache.getFileCache(file)?.frontmatter)
}

function resolveDomainFileDescriptor(frontmatter: unknown): DomainFileViewDescriptor | null {
	return domainFileViewDescriptors.find((descriptor) => descriptor.refine(frontmatter) !== null) ?? null
}
