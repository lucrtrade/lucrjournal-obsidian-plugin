import { useCallback, useEffect, useRef, type RefObject } from 'react'

import {
	applyEmbeddedEditorMode,
	cleanupEmbeddedMarkdownEditor,
	createEmbeddedMarkdownEditor,
	type EmbeddedEditorMode,
	type EmbeddedMarkdownEditorState,
} from '../../editor/embedded-markdown-editor'

import type { Logger } from '../../logger'
import type { App, MarkdownView } from 'obsidian'

type HookEmbeddedEditorState = EmbeddedMarkdownEditorState & {
	handleKeydown: (event: KeyboardEvent) => void
}

type UseEmbeddedMarkdownEditorOptions = {
	app: App
	/**
	 * Initial content to load into the editor via `view.setViewData`.
	 * If you need to load the body asynchronously, pass `''` here and
	 * use `onSetup` to call `view.setViewData` with the real content.
	 */
	initialBody: string
	/**
	 * Debounce delay in ms before flushing a pending save.
	 * Default: 2000
	 */
	debounceMs?: number
	onSaveBody: (body: string) => Promise<void>
	/**
	 * Called after `leaf.open(view)` (and after `view.setViewData(initialBody)`).
	 * May be async. Use this to register editor-specific overrides or to load
	 * and set the real body if it needs to be fetched.
	 * When provided, the hook awaits this callback before mounting the editor.
	 */
	onSetup?: (view: MarkdownView) => void | Promise<void>
	/**
	 * Called during cleanup, before `leaf.detach()`.
	 * Use this to unregister editor overrides and track disposal.
	 */
	onCleanup?: (view: MarkdownView) => void
	/**
	 * When true, the editor-change listener will normalise top-level H1
	 * headings to H2 in real-time. Obsidian's native requestSave mechanism
	 * drives the debounced saves in this mode.
	 * When false (default), the editor-change listener explicitly triggers
	 * `view.requestSave()` on every change.
	 */
	normalizeH1?: boolean
	/**
	 * Called after H1 normalisation occurs during an editor-change event
	 * (only fires when `normalizeH1` is true and a heading was actually
	 * converted). Use this to show a user-facing Notice.
	 */
	onH1Blocked?: () => void
	logger?: Logger
}

type UseEmbeddedMarkdownEditorResult = {
	containerRef: RefObject<HTMLDivElement | null>
	handleDoubleClick: () => void
	/**
	 * Re-apply the current mode with new body content. Useful after an
	 * out-of-band save that normalises the content (e.g. H1 normalisation
	 * that rewrites the underlying file and needs to reload the section).
	 */
	reloadBody: (newBody: string) => Promise<void>
}

export function useEmbeddedMarkdownEditor({
	app,
	initialBody,
	debounceMs = 2000,
	onSaveBody,
	onSetup,
	onCleanup,
	normalizeH1 = false,
	onH1Blocked,
	logger,
}: UseEmbeddedMarkdownEditorOptions): UseEmbeddedMarkdownEditorResult {
	const containerRef = useRef<HTMLDivElement>(null)
	const editorRef = useRef<HookEmbeddedEditorState | null>(null)
	const activeModeRef = useRef<EmbeddedEditorMode>('live')
	const onSaveBodyRef = useRef(onSaveBody)

	onSaveBodyRef.current = onSaveBody

	const applyMode = useCallback(
		async (state: HookEmbeddedEditorState, container: HTMLElement, modeKey: EmbeddedEditorMode) => {
			await applyEmbeddedEditorMode(state, container, modeKey)
			activeModeRef.current = modeKey
		},
		[],
	)

	const reloadBody = useCallback(
		async (newBody: string) => {
			const state = editorRef.current
			const container = containerRef.current
			if (state === null || container === null) {
				return
			}
			state.view.setViewData(newBody, true)
			await applyMode(state, container, activeModeRef.current)
		},
		[applyMode],
	)

	// @story [[lucrjournal/primitives#^embedded-editor-mount]] Creates and mounts one live editor after setup completes
	useEffect(() => {
		const container = containerRef.current
		if (container === null) {
			return
		}

		let disposed = false

		const setup = async () => {
			const editorState = await createEmbeddedMarkdownEditor({
				app,
				initialBody,
				debounceMs,
				readOnSaveBody: () => onSaveBodyRef.current,
				onSetup,
				normalizeH1,
				onH1Blocked,
				logger,
			})
			const handleKeydown = (event: KeyboardEvent) => {
				if (event.key === 'Escape' && editorRef.current !== null && activeModeRef.current !== 'reading') {
					void applyMode(editorRef.current, container, 'reading')
				}
			}

			const state: HookEmbeddedEditorState = {
				...editorState,
				handleKeydown,
			}

			if (disposed) {
				logger?.debug('embedded editor disposed before mount completed')
				// @story [[lucrjournal/primitives#^embedded-editor-cleanup]] Cleans up an editor that finishes setup after disposal
				cleanupEmbeddedMarkdownEditor(state, { app, onCleanup, logger })
				return
			}

			editorRef.current = state
			await applyMode(state, container, 'live')
			container.addEventListener('keydown', state.handleKeydown)
		}

		void setup()

		// @story [[lucrjournal/primitives#^embedded-editor-cleanup]] Removes hook listeners and releases the mounted editor
		return () => {
			disposed = true
			const state = editorRef.current
			if (state !== null) {
				logger?.debug('embedded editor cleanup', {
					hasPendingTimeout: state.saveTimeout !== null,
				})
				if (state.saveTimeout !== null) {
					window.clearTimeout(state.saveTimeout)
				}
				container.removeEventListener('keydown', state.handleKeydown)
				cleanupEmbeddedMarkdownEditor(state, { app, onCleanup, logger })
				editorRef.current = null
			}
		}
	}, [app, applyMode, initialBody, debounceMs, onSetup, onCleanup, normalizeH1, onH1Blocked, logger])

	const handleDoubleClick = useCallback(() => {
		const state = editorRef.current
		const container = containerRef.current
		if (activeModeRef.current === 'reading' && state !== null && container !== null) {
			void applyMode(state, container, 'live')
		}
	}, [applyMode])

	return { containerRef, handleDoubleClick, reloadBody }
}
