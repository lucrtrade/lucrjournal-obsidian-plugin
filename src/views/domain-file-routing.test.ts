import { MarkdownView } from 'obsidian'
import { describe, expect, it, vi } from 'vitest'

import { LUCR_PLAYBOOK_VIEW_TYPE, LUCR_POSITION_VIEW_TYPE } from '../constant'
import { createTestTFile } from '../testing/obsidian'

import {
	createMarkdownFileViewState,
	createPlaybookFileViewState,
	createPositionFileViewState,
	markDomainFileOpenAsMarkdown,
	openDomainFileAsMarkdown,
	registerDomainMarkdownActions,
	resolveDomainFileViewState,
	shouldOpenPlaybookFileView,
	shouldOpenPositionFileView,
} from './domain-file-routing'

const domainRoutingCases = [
	{
		actionLabel: 'Open as Position View',
		createViewState: createPositionFileViewState,
		filePath: 'LucrJournal/positions/POS-00001.md',
		frontmatter: { lucr_type: 'position' },
		name: 'position',
		shouldOpen: shouldOpenPositionFileView,
		viewType: LUCR_POSITION_VIEW_TYPE,
	},
	{
		actionLabel: 'Open as Playbook View',
		createViewState: createPlaybookFileViewState,
		filePath: 'LucrJournal/playbooks/Breakout.md',
		frontmatter: { lucr_type: 'playbook' },
		name: 'playbook',
		shouldOpen: shouldOpenPlaybookFileView,
		viewType: LUCR_PLAYBOOK_VIEW_TYPE,
	},
] as const

describe('domain file routing', () => {
	for (const item of domainRoutingCases) {
		it(`rewrites markdown ${item.name} files to the domain file view`, () => {
			// @story [[lucrjournal/runtime#^domain-default-view]] Covers routing both valid domain types to their structured view state.
			const app = createDomainRoutingApp({
				[item.filePath]: item.frontmatter,
			})
			const state = {
				active: true,
				state: { file: item.filePath },
				type: 'markdown',
			}

			expect(item.shouldOpen(app, state)).toBe(true)
			expect(resolveDomainFileViewState(app, state)).toEqual({
				...state,
				type: item.viewType,
			})
			expect(item.createViewState(item.filePath)).toEqual({
				active: true,
				state: { file: item.filePath },
				type: item.viewType,
			})
		})
	}

	it('keeps non-domain and incomplete markdown states unchanged', () => {
		// @story [[lucrjournal/runtime#^invalid-domain-stays-markdown]] Covers preserving non-domain and invalid domain Markdown state.
		const app = createDomainRoutingApp({
			'LucrJournal/news/CPI.md': { lucr_type: 'news' },
			'LucrJournal/positions/Broken.md': { lucr_type: 'position', confidence: 99 },
		})
		const missingFileState = { type: 'markdown' }
		const newsState = { state: { file: 'LucrJournal/news/CPI.md' }, type: 'markdown' }
		const brokenPositionState = { state: { file: 'LucrJournal/positions/Broken.md' }, type: 'markdown' }
		const positionCanvasState = { state: { file: 'LucrJournal/positions/POS-00001.md' }, type: 'canvas' }

		expect(shouldOpenPositionFileView(app, missingFileState)).toBe(false)
		expect(shouldOpenPositionFileView(app, newsState)).toBe(false)
		expect(shouldOpenPositionFileView(app, brokenPositionState)).toBe(false)
		expect(shouldOpenPositionFileView(app, positionCanvasState)).toBe(false)
		expect(resolveDomainFileViewState(app, newsState)).toBe(newsState)
	})

	it('honors leaf markdown mode until the leaf opens another file', () => {
		// @story [[lucrjournal/runtime#^markdown-override-scope]] Covers scoping the Markdown override to one leaf and file path.
		const app = createDomainRoutingApp({
			'LucrJournal/positions/POS-00001.md': { lucr_type: 'position' },
			'LucrJournal/positions/POS-00002.md': { lucr_type: 'position' },
		})
		const leaf = {}
		const first = { state: { file: 'LucrJournal/positions/POS-00001.md' }, type: 'markdown' }
		const second = { state: { file: 'LucrJournal/positions/POS-00002.md' }, type: 'markdown' }

		markDomainFileOpenAsMarkdown(leaf as never, 'LucrJournal/positions/POS-00001.md')

		expect(shouldOpenPositionFileView(app, first, leaf as never)).toBe(false)
		expect(resolveDomainFileViewState(app, first, leaf as never)).toBe(first)
		expect(shouldOpenPositionFileView(app, second, leaf as never)).toBe(true)
	})

	it('opens a position file as markdown without source mode by default', async () => {
		// @story [[lucrjournal/runtime#^domain-to-markdown]] Covers the history-free Markdown state used by the domain header action.
		const leaf = { setViewState: vi.fn(async () => {}) }

		await openDomainFileAsMarkdown(leaf as never, 'LucrJournal/positions/POS-00001.md')

		expect(leaf.setViewState).toHaveBeenCalledWith(
			createMarkdownFileViewState('LucrJournal/positions/POS-00001.md'),
			{ history: false },
		)
	})

	it('syncs the markdown header action after opening a domain file as markdown', async () => {
		const file = createTestTFile('LucrJournal/playbooks/Breakout.md')
		const app = createDomainRoutingApp({
			[file.path]: { lucr_type: 'playbook' },
		})
		const action = { callback: () => {}, remove: vi.fn() }
		const leaf = { setViewState: vi.fn(async () => {}) }
		const view = Object.assign(new MarkdownView(leaf as never), {
			file,
			addAction: vi.fn((_icon: string, _title: string, callback: () => void) => {
				action.callback = callback
				return action
			}),
		})
		leaf.setViewState.mockImplementation(async () => {
			Object.assign(leaf, { view })
		})

		await openDomainFileAsMarkdown(leaf as never, file.path, undefined, undefined, app)

		expect(view.addAction).toHaveBeenCalledWith('lucrtrade', 'Open as Playbook View', expect.any(Function))
	})

	for (const item of domainRoutingCases) {
		it(`adds a markdown header action for valid ${item.name} notes and switches back to domain view`, () => {
			// @story [[lucrjournal/runtime#^markdown-to-domain]] Covers returning both domain types from Markdown to their structured view.
			const file = createTestTFile(item.filePath)
			const app = createDomainRoutingApp({
				[file.path]: item.frontmatter,
			})
			const action = { callback: () => {}, remove: vi.fn() }
			const leaf = { setViewState: vi.fn(async () => {}) }
			const view = Object.assign(new MarkdownView(leaf as never), {
				file,
				addAction: vi.fn((_icon: string, _title: string, callback: () => void) => {
					action.callback = callback
					return action
				}),
			})
			Object.assign(leaf, { view })
			const plugin = createMarkdownActionPlugin(app, leaf)

			markDomainFileOpenAsMarkdown(leaf as never, file.path)
			registerDomainMarkdownActions(plugin)

			action.callback()

			expect(view.addAction).toHaveBeenCalledWith('lucrtrade', item.actionLabel, expect.any(Function))
			expect(leaf.setViewState).toHaveBeenCalledWith(item.createViewState(file.path), { history: false })
			expect(item.shouldOpen(app, createMarkdownFileViewState(file.path), leaf as never)).toBe(true)
		})
	}

	it('removes the markdown header action when the active markdown file is not a domain file', () => {
		const positionFile = createTestTFile('LucrJournal/positions/POS-00001.md')
		const newsFile = createTestTFile('LucrJournal/news/CPI.md')
		const app = createDomainRoutingApp({
			[positionFile.path]: { lucr_type: 'position' },
			[newsFile.path]: { lucr_type: 'news' },
		})
		const action = { callback: vi.fn(), remove: vi.fn() }
		const leaf = {}
		const view = Object.assign(new MarkdownView(leaf as never), {
			file: positionFile,
			addAction: vi.fn(() => action),
		})
		Object.assign(leaf, { view })
		const plugin = createMarkdownActionPlugin(app, leaf)

		registerDomainMarkdownActions(plugin)
		view.file = newsFile
		plugin.handlers.get('file-open')?.(newsFile)

		expect(view.addAction).toHaveBeenCalledOnce()
		expect(action.remove).toHaveBeenCalledOnce()
	})
})

function createDomainRoutingApp(frontmatterByPath: Record<string, Record<string, unknown>>) {
	return {
		metadataCache: {
			getCache: (path: string) => ({ frontmatter: frontmatterByPath[path] }),
			getFileCache: (file: { path: string }) => ({ frontmatter: frontmatterByPath[file.path] }),
		},
	} as never
}

function createMarkdownActionPlugin(app: object, leaf: unknown) {
	const handlers = new Map<string, (value: unknown) => void>()
	return {
		app: {
			...app,
			workspace: {
				getMostRecentLeaf: () => leaf,
				on: vi.fn((name: string, callback: (value: unknown) => void) => {
					handlers.set(name, callback)
					return { name }
				}),
			},
		},
		handlers,
		register: vi.fn((_callback: () => void) => {}),
		registerEvent: vi.fn((_eventRef: unknown) => {}),
	} as unknown as {
		app: Parameters<typeof registerDomainMarkdownActions>[0]['app']
		handlers: Map<string, (value: unknown) => void>
		register: (callback: () => void) => void
		registerEvent: (eventRef: unknown) => void
	}
}
