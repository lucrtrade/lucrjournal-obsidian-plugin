/// <reference types="vitest/importMeta" />

import { Notice, type App, type MarkdownView, type TFile } from 'obsidian'
import { useCallback, useRef } from 'react'

import { t } from '../../lang/helpers'
import {
	extractSection,
	hasTopLevelH1,
	normalizeSectionBody,
	spliceSection,
} from '../../utils/markdown-sections'

import { useEmbeddedMarkdownEditor } from './use-embedded-markdown-editor'

type EmbeddedEditorProps = {
	app: App
	file: TFile
	section: string
}

export function EmbeddedEditor({ app, file, section }: EmbeddedEditorProps) {
	// Track whether the component is currently mounted so that async callbacks
	// (e.g. post-save H1 reload) do not run after unmount.
	const disposedRef = useRef(false)

	// Stable ref to reloadBody so that onSaveBody can call it without being
	// listed as a dependency (reloadBody is returned by the hook below).
	const reloadBodyRef = useRef<((newBody: string) => Promise<void>) | null>(null)

	const onSetup = useCallback(
		async (view: MarkdownView) => {
			disposedRef.current = false
			const fullContent = await app.vault.read(file)
			const { body } = extractSection(fullContent, section)
			view.setViewData(normalizeSectionBody(body), true)
		},
		[app, file, section],
	)

	const onCleanup = useCallback((_view: MarkdownView) => {
		disposedRef.current = true
	}, [])

	const onSaveBody = useCallback(
		async (rawBody: string) => {
			const foundTopLevelH1 = hasTopLevelH1(rawBody)
			const editedBody = normalizeSectionBody(rawBody)
			const currentFull = await app.vault.read(file)
			const updated = spliceSection(currentFull, section, editedBody)
			await app.vault.adapter.write(file.path, updated)

			if (foundTopLevelH1 && !disposedRef.current) {
				new Notice(t('EMBEDDED_EDITOR_H1_SAVE_NORMALIZED'))
				// Re-read the saved section and reload the editor view.
				const freshFull = await app.vault.read(file)
				const { body: freshBody } = extractSection(freshFull, section)
				await reloadBodyRef.current?.(normalizeSectionBody(freshBody))
			}
		},
		[app, file, section],
	)

	const onH1Blocked = useCallback(() => {
		new Notice(t('EMBEDDED_EDITOR_H1_BLOCKED'))
	}, [])

	const { containerRef, handleDoubleClick, reloadBody } = useEmbeddedMarkdownEditor({
		app,
		initialBody: '', // real body is loaded asynchronously in onSetup
		debounceMs: 2000,
		onSaveBody,
		onSetup,
		onCleanup,
		normalizeH1: true,
		onH1Blocked,
	})

	// Keep the reloadBodyRef in sync with the latest reloadBody from the hook.
	reloadBodyRef.current = reloadBody

	return (
		<div
			ref={containerRef}
			data-lj-panel="note-editor"
			onDoubleClick={handleDoubleClick}
			className="lj:flex-1 lj:overflow-hidden lj:rounded-md lj:min-h-[400px] lj:relative"
		/>
	)
}
