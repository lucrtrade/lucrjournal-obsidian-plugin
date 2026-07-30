import { TFile, type App, type Editor } from 'obsidian'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureLucrJournalEditorAttachmentFiles } from './attachment-paste-drop'

function createFile(path: string) {
	const file = new TFile()
	file.path = path
	file.basename = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? path
	file.extension = path.split('.').pop() ?? ''
	return file
}

function createApp(existingPaths: string[] = [], frontmatter: Record<string, unknown> = {}) {
	const paths = new Set(existingPaths)
	const writes: Array<{ buffer: ArrayBuffer; path: string }> = []
	let frontmatterMutationCount = 0

	return {
		frontmatter,
		get frontmatterMutationCount() {
			return frontmatterMutationCount
		},
		writes,
		app: {
			fileManager: {
				processFrontMatter: async (_file: TFile, updater: (fm: Record<string, unknown>) => void) => {
					frontmatterMutationCount += 1
					updater(frontmatter)
				},
			},
			metadataCache: {
				getFileCache: () => ({ frontmatter }),
			},
			vault: {
				createBinary: async (path: string, buffer: ArrayBuffer) => {
					writes.push({ path, buffer })
					paths.add(path)
					return createFile(path)
				},
				createFolder: async (path: string) => {
					paths.add(path)
				},
				getAbstractFileByPath: (path: string) => paths.has(path) ? createFile(path) : null,
			},
		} as unknown as App,
	}
}

function createEditor() {
	const replacements: string[] = []
	return {
		replacements,
		editor: {
			replaceSelection: (replacement: string) => {
				replacements.push(replacement)
			},
		} as unknown as Editor,
	}
}

describe('LucrJournal editor attachment capture', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	// @story [[lucrjournal/attachment#^attachment-storage-layout]] Covers the exact plugin month path
	// @story [[lucrjournal/attachment#^editor-attachment-links]] Covers a plain basename link for a non-image file
	it('saves non-image pasted files to the LucrJournal attachments folder', async () => {
		const timestamp = new Date(2026, 4, 15, 10, 20, 30).getTime()
		vi.spyOn(Date, 'now').mockReturnValue(timestamp)
		const { app, writes } = createApp(['LucrJournal', 'LucrJournal/attachments'])
		const { editor, replacements } = createEditor()
		const sourceFile = createFile('LucrJournal/positions/POS-00001.md')
		const payload = new File(['pdf'], 'statement.pdf', { type: 'application/pdf' })

		const handled = await captureLucrJournalEditorAttachmentFiles(app, editor, sourceFile, [payload])

		expect(handled).toBe(true)
		expect(writes.map((write) => write.path)).toEqual(['LucrJournal/attachments/2026-05/2026-05-15_10-20-30-000_statement.pdf'])
		expect(replacements).toEqual(['[[2026-05-15_10-20-30-000_statement.pdf]]'])
	})

	// @story [[lucrjournal/attachment#^position-capture-reference]] Covers body and frontmatter reference synchronization
	it('appends pasted attachment tokens to position frontmatter', async () => {
		const timestamp = new Date(2026, 4, 15, 10, 20, 30).getTime()
		vi.spyOn(Date, 'now').mockReturnValue(timestamp)
		const state = createApp(['LucrJournal', 'LucrJournal/attachments'], {
			attachments: ['[[LucrJournal/attachments/existing.pdf]]'],
			chart_screenshots: ['[[legacy.png]]'],
			lucr_type: 'position',
		})
		const { editor } = createEditor()
		const sourceFile = createFile('LucrJournal/positions/POS-00001.md')
		const payload = new File(['pdf'], 'statement.pdf', { type: 'application/pdf' })

		const handled = await captureLucrJournalEditorAttachmentFiles(state.app, editor, sourceFile, [payload])

		expect(handled).toBe(true)
		expect(state.frontmatterMutationCount).toBe(1)
		expect(state.frontmatter.attachments).toEqual([
			'[[LucrJournal/attachments/existing.pdf]]',
			'[[2026-05-15_10-20-30-000_statement.pdf]]',
		])
		expect(Object.prototype.hasOwnProperty.call(state.frontmatter, 'chart_screenshots')).toBe(false)
	})

	// @story [[lucrjournal/attachment#^position-capture-reference]] Covers the non-position frontmatter boundary
	it('does not append attachment tokens to non-position LucrJournal notes', async () => {
		const timestamp = new Date(2026, 4, 15, 10, 20, 30).getTime()
		vi.spyOn(Date, 'now').mockReturnValue(timestamp)
		const state = createApp(['LucrJournal', 'LucrJournal/attachments'], { lucr_type: 'news' })
		const { editor } = createEditor()
		const sourceFile = createFile('LucrJournal/news/CPI.md')
		const payload = new File(['pdf'], 'statement.pdf', { type: 'application/pdf' })

		const handled = await captureLucrJournalEditorAttachmentFiles(state.app, editor, sourceFile, [payload])

		expect(handled).toBe(true)
		expect(state.frontmatterMutationCount).toBe(0)
		expect(state.frontmatter.attachments).toBeUndefined()
	})

	// @story [[lucrjournal/attachment#^editor-attachment-links]] Covers an embedded basename image link
	// @story [[lucrjournal/attachment#^attachment-path-collision]] Covers millisecond collision avoidance
	it('embeds image files and dedupes names in the attachments folder', async () => {
		const timestamp = new Date(2026, 4, 15, 10, 20, 30).getTime()
		vi.spyOn(Date, 'now').mockReturnValue(timestamp)
		const { app, writes } = createApp([
			'LucrJournal',
			'LucrJournal/attachments',
			'LucrJournal/attachments/2026-05',
			'LucrJournal/attachments/2026-05/2026-05-15_10-20-30-000_chart.png',
		])
		const { editor, replacements } = createEditor()
		const sourceFile = createFile('LucrJournal/positions/POS-00001.md')
		const payload = new File(['png'], 'chart.png', { type: 'image/png' })

		const handled = await captureLucrJournalEditorAttachmentFiles(app, editor, sourceFile, [payload])

		expect(handled).toBe(true)
		expect(writes.map((write) => write.path)).toEqual(['LucrJournal/attachments/2026-05/2026-05-15_10-20-30-001_chart.png'])
		expect(replacements).toEqual(['![[2026-05-15_10-20-30-001_chart.png]]'])
	})

	// @story [[lucrjournal/attachment#^editor-attachment-capture]] Covers the managed-folder boundary
	it('does not handle files outside the LucrJournal folder', async () => {
		const { app, writes } = createApp(['LucrJournal', 'LucrJournal/attachments'])
		const { editor, replacements } = createEditor()
		const sourceFile = createFile('Inbox/note.md')
		const payload = new File(['pdf'], 'statement.pdf', { type: 'application/pdf' })

		const handled = await captureLucrJournalEditorAttachmentFiles(app, editor, sourceFile, [payload])

		expect(handled).toBe(false)
		expect(writes).toEqual([])
		expect(replacements).toEqual([])
	})

	// @story [[lucrjournal/attachment#^editor-attachment-capture]] Covers the empty payload boundary
	it('does not handle empty payloads', async () => {
		const { app } = createApp(['LucrJournal', 'LucrJournal/attachments'])
		const { editor } = createEditor()
		const sourceFile = createFile('LucrJournal/positions/POS-00001.md')

		await expect(captureLucrJournalEditorAttachmentFiles(app, editor, sourceFile, [])).resolves.toBe(false)
	})
})
