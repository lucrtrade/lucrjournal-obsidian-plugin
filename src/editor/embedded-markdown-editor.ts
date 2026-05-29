import {
	MarkdownView,
	WorkspaceSplit,
	type App,
	type Editor,
	type EditorRangeOrCaret,
	type EventRef,
	type ViewStateResult,
	type WorkspaceLeaf,
} from 'obsidian'

import type { Logger } from '../logger'

export type EmbeddedEditorMode = 'live' | 'reading'

export type EmbeddedMarkdownEditorState = {
	view: MarkdownView
	leaf: WorkspaceLeaf
	saveTimeout: ReturnType<typeof activeWindow.setTimeout> | null
	editorChangeRef: EventRef | null
}

type CreateEmbeddedMarkdownEditorOptions = {
	app: App
	initialBody: string
	debounceMs: number
	readOnSaveBody: () => (body: string) => Promise<void>
	onSetup?: (view: MarkdownView) => void | Promise<void>
	normalizeH1?: boolean
	onH1Blocked?: () => void
	logger?: Logger
}

type CleanupEmbeddedMarkdownEditorOptions = {
	app: App
	onCleanup?: (view: MarkdownView) => void
	logger?: Logger
}

const EMBEDDED_EDITOR_CONTENT_CLASS = 'lj-embedded-editor-content'

const LIVE_STATE = { mode: 'source', source: false }
const READING_STATE = { mode: 'preview' }
const STATE_RESULT = { history: false } satisfies ViewStateResult

export async function createEmbeddedMarkdownEditor({
	app,
	initialBody,
	debounceMs,
	readOnSaveBody,
	onSetup,
	normalizeH1 = false,
	onH1Blocked,
	logger,
}: CreateEmbeddedMarkdownEditorOptions): Promise<EmbeddedMarkdownEditorState> {
	// @ts-expect-error WorkspaceSplit constructor accepts (workspace, direction) at runtime
	const split: WorkspaceSplit = new WorkspaceSplit(app.workspace, 'vertical')
	const leaf = app.workspace.createLeafInParent(split, 0)
	const view = new MarkdownView(leaf)
	await leaf.open(view)

	view.setViewData(initialBody, true)
	await onSetup?.(view)

	const state: EmbeddedMarkdownEditorState = {
		view,
		leaf,
		saveTimeout: null,
		editorChangeRef: null,
	}

	view.save = async () => {
		const editedBody = view.editor?.getValue() ?? view.getViewData()
		logger?.debug('embedded editor save fired', {
			bodyLength: editedBody.length,
			hasPendingTimeout: state.saveTimeout !== null,
		})
		await readOnSaveBody()(editedBody)
	}

	view.requestSave = () => {
		if (state.saveTimeout !== null) {
			window.clearTimeout(state.saveTimeout)
		}
		logger?.debug('embedded editor requestSave scheduled', {
			bodyLength: (view.editor?.getValue() ?? view.getViewData()).length,
		})
		state.saveTimeout = window.setTimeout(() => {
			state.saveTimeout = null
			void view.save()
		}, debounceMs)
	}

	if (normalizeH1) {
		state.editorChangeRef = app.workspace.on('editor-change', (editor, info) => {
			if (editor !== view.editor || info !== view) {
				return
			}

			const normalized = normalizeEditorTopLevelH1(editor)
			if (normalized) {
				onH1Blocked?.()
			}
		})
	} else {
		state.editorChangeRef = app.workspace.on('editor-change', (editor, info) => {
			if (editor !== view.editor || info !== view) {
				return
			}

			logger?.debug('embedded editor change detected', {
				bodyLength: editor.getValue().length,
			})
			view.requestSave()
		})
	}

	return state
}

export async function applyEmbeddedEditorMode(
	state: EmbeddedMarkdownEditorState,
	container: HTMLElement,
	modeKey: EmbeddedEditorMode,
) {
	const content = state.view.editor?.getValue() ?? state.view.getViewData()
	const modeState = modeKey === 'live' ? LIVE_STATE : READING_STATE

	await state.view.setState(modeState, STATE_RESULT)
	state.view.setViewData(content, true)
	container.empty()
	container.appendChild(state.view.contentEl)
	state.view.contentEl.addClass(EMBEDDED_EDITOR_CONTENT_CLASS)
	disableReadableLineWidth(state.view.contentEl)

	if (modeKey === 'live') {
		window.setTimeout(() => {
			state.view.editor?.focus()
		}, 50)
	}
}

export function cleanupEmbeddedMarkdownEditor(
	state: EmbeddedMarkdownEditorState,
	{ app, onCleanup, logger }: CleanupEmbeddedMarkdownEditorOptions,
) {
	logger?.debug('embedded editor cleanup', {
		hasPendingTimeout: state.saveTimeout !== null,
	})
	if (state.saveTimeout !== null) {
		window.clearTimeout(state.saveTimeout)
	}
	if (state.editorChangeRef !== null) {
		app.workspace.offref(state.editorChangeRef)
	}
	onCleanup?.(state.view)
	logger?.debug('embedded editor cleanup flush save')
	void state.view.save()
	state.leaf.detach()
}

function disableReadableLineWidth(contentEl: HTMLElement): void {
	const readableLineWidthElements: HTMLElement[] = Array.from(
		contentEl.querySelectorAll('.is-readable-line-width'),
	)

	for (const element of readableLineWidthElements) {
		element.classList.remove('is-readable-line-width')
	}
}

type EditorSelectionRange = ReturnType<Editor['listSelections']>[number]

function mapSelectionForHeadingNormalization(
	selection: EditorSelectionRange,
	linesWithH1: Set<number>,
): EditorRangeOrCaret {
	const mapPosition = ({ line, ch }: { line: number; ch: number }) => ({
		line,
		ch: linesWithH1.has(line) && ch >= 2 ? ch + 1 : ch,
	})

	return {
		from: mapPosition(selection.anchor),
		to: mapPosition(selection.head),
	}
}

function normalizeEditorTopLevelH1(editor: Editor): boolean {
	const changes = []
	const linesWithH1 = new Set<number>()

	for (let line = 0; line < editor.lineCount(); line += 1) {
		const lineText = editor.getLine(line)
		if (!lineText.startsWith('# ') || lineText.startsWith('## ')) {
			continue
		}

		linesWithH1.add(line)
		changes.push({
			from: { line, ch: 0 },
			to: { line, ch: 2 },
			text: '## ',
		})
	}

	if (changes.length === 0) {
		return false
	}

	editor.transaction({
		changes,
		selections: editor.listSelections().map((selection) =>
			mapSelectionForHeadingNormalization(selection, linesWithH1),
		),
	}, 'lucrjournal-embedded-editor-normalize-h1')

	return true
}
