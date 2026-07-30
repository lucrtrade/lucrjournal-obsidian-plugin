import { TFile, normalizePath, type App, type Editor, type EventRef } from 'obsidian'

import {
	applyAttachmentTokensToFrontmatter,
	buildAttachmentFileName,
	buildAttachmentMonthFolder,
	buildAttachmentTimestamp,
} from '../attachments/position-attachments'
import { LUCR_TRADE_ATTACHMENTS_DIR, LUCR_TRADE_ROOT_DIR } from '../constant'

type AttachmentCapturePlugin = {
	app: App
	registerEvent: (eventRef: EventRef) => void
}

// @story [[lucrjournal/attachment#^editor-attachment-capture]] Registers guarded paste and drop capture
export function registerLucrJournalAttachmentCapture(plugin: AttachmentCapturePlugin) {
	plugin.registerEvent(plugin.app.workspace.on('editor-paste', (event, editor, info) => {
		if (event.defaultPrevented) {
			return
		}

		const files = extractClipboardFiles(event)
		if (!shouldCaptureLucrJournalEditorAttachments(info.file, files)) {
			return
		}

		event.preventDefault()
		void captureLucrJournalEditorAttachmentFiles(plugin.app, editor, info.file, files)
	}))
	plugin.registerEvent(plugin.app.workspace.on('editor-drop', (event, editor, info) => {
		if (event.defaultPrevented) {
			return
		}

		const files = extractDropFiles(event)
		if (!shouldCaptureLucrJournalEditorAttachments(info.file, files)) {
			return
		}

		event.preventDefault()
		void captureLucrJournalEditorAttachmentFiles(plugin.app, editor, info.file, files)
	}))
}

export async function captureLucrJournalEditorAttachmentFiles(
	app: App,
	editor: Editor,
	sourceFile: TFile | null,
	files: File[],
) {
	// @story [[lucrjournal/attachment#^editor-attachment-capture]] Rejects files outside the managed Markdown boundary
	if (!isLucrJournalMarkdownFile(sourceFile) || files.length === 0) {
		return false
	}

	await ensureAttachmentDirectory(app)
	const editorLinks: string[] = []
	const attachmentTokens: string[] = []
	const baseTimestamp = Date.now()
	for (let i = 0; i < files.length; i++) {
		const file = files[i]!
		const path = await resolveAvailableAttachmentPath(app, file, baseTimestamp + i)
		await app.vault.createBinary(path, await file.arrayBuffer())
		editorLinks.push(buildEditorAttachmentLink(path, file))
		attachmentTokens.push(buildAttachmentToken(path))
	}

	// @story [[lucrjournal/attachment#^editor-attachment-links]] Inserts ordered embedded or plain basename links
	editor.replaceSelection(editorLinks.join('\n'))
	if (isPositionFile(app, sourceFile)) {
		// @story [[lucrjournal/attachment#^position-capture-reference]] Mirrors position body links into frontmatter
		await app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
			applyAttachmentTokensToFrontmatter(frontmatter as Record<string, unknown>, attachmentTokens)
		})
	}
	return true
}

function extractClipboardFiles(event: ClipboardEvent) {
	return Array.from(event.clipboardData?.files ?? [])
}

function extractDropFiles(event: DragEvent) {
	return Array.from(event.dataTransfer?.files ?? [])
}

function shouldCaptureLucrJournalEditorAttachments(file: TFile | null, files: File[]) {
	return isLucrJournalMarkdownFile(file) && files.length > 0
}

async function ensureAttachmentDirectory(app: App, timestamp = Date.now()) {
	for (const folder of [LUCR_TRADE_ROOT_DIR, LUCR_TRADE_ATTACHMENTS_DIR, buildAttachmentMonthFolder(timestamp)]) {
		if (app.vault.getAbstractFileByPath(folder) === null) {
			await app.vault.createFolder(folder)
		}
	}
}

function isLucrJournalMarkdownFile(file: TFile | null): file is TFile {
	return file instanceof TFile
		&& file.extension === 'md'
		&& file.path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`)
}

function isPositionFile(app: App, file: TFile) {
	return app.metadataCache.getFileCache(file)?.frontmatter?.lucr_type === 'position'
}

// @story [[lucrjournal/attachment#^attachment-path-collision]] Advances timestamps until the attachment path is free
async function resolveAvailableAttachmentPath(app: App, file: File, firstTimestamp: number) {
	let timestamp = firstTimestamp
	let path = buildAttachmentPath(file, timestamp)
	while (app.vault.getAbstractFileByPath(path) !== null) {
		timestamp++
		path = buildAttachmentPath(file, timestamp)
	}
	await ensureAttachmentDirectory(app, timestamp)
	return path
}

function buildAttachmentPath(file: File, timestamp: number) {
	const { extension, originalName } = splitAttachmentFileName(file.name)
	return normalizePath(`${buildAttachmentMonthFolder(timestamp)}/${buildAttachmentFileName(buildAttachmentTimestamp(timestamp), originalName, extension)}`)
}

function splitAttachmentFileName(name: string) {
	const normalized = name.trim()
	const dotIndex = normalized.lastIndexOf('.')
	if (dotIndex > 0) {
		return {
			extension: normalized.slice(dotIndex + 1),
			originalName: normalized.slice(0, dotIndex),
		}
	}

	return {
		extension: '',
		originalName: normalized.length > 0 ? normalized : 'attachment',
	}
}

function buildAttachmentToken(path: string) {
	return `[[${path.split('/').pop() ?? path}]]`
}

function buildEditorAttachmentLink(path: string, file: File) {
	const token = buildAttachmentToken(path)
	return isImageAttachment(file) ? `!${token}` : token
}

function isImageAttachment(file: File) {
	return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(file.name)
}
