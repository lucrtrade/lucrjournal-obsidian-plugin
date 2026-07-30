import { describe, expect, it, vi } from 'vitest'

import { createTestTFile, createWorkspaceApp } from '../testing/obsidian'

import {
	consumeLinkActivationEvent,
	isCommandClick,
	openMarkdownFile,
	openVaultLinkText,
	resolveLinkPane,
} from './link-activation'

describe('link activation', () => {
	it('uses a new Obsidian tab pane for command-click', () => {
		// @story [[lucrjournal/runtime#^command-link-new-tab]] Covers resolving command-click link activation to a new tab.
		expect(isCommandClick({ metaKey: true })).toBe(true)
		expect(resolveLinkPane(false, { metaKey: true })).toBe('tab')
	})

	it('keeps the default pane for normal clicks', () => {
		// @story [[lucrjournal/runtime#^normal-link-pane]] Covers preserving the caller pane without command-click.
		expect(isCommandClick({ metaKey: false })).toBe(false)
		expect(resolveLinkPane('tab', { metaKey: false })).toBe('tab')
		expect(resolveLinkPane(false, undefined)).toBe(false)
	})

	it('opens markdown files in a new Obsidian tab for command-click', async () => {
		const file = createTestTFile('LucrJournal/news/CPI.md')
		const leaf = { openFile: vi.fn(async () => {}) }
		const getLeaf = vi.fn(() => leaf)
		const app = createWorkspaceApp({
			getLeaf,
		})

		await openMarkdownFile(app, file, { metaKey: true })

		expect(getLeaf).toHaveBeenCalledWith('tab')
		expect(leaf.openFile).toHaveBeenCalledWith(file)
	})

	it('opens markdown files in the default pane for normal clicks', async () => {
		const file = createTestTFile('LucrJournal/news/CPI.md')
		const leaf = { openFile: vi.fn(async () => {}) }
		const getLeaf = vi.fn(() => leaf)
		const app = createWorkspaceApp({
			getLeaf,
		})

		await openMarkdownFile(app, file, { metaKey: false })

		expect(getLeaf).toHaveBeenCalledWith('tab')
		expect(leaf.openFile).toHaveBeenCalledWith(file)
	})

	it('switches opened markdown files into source mode when requested', async () => {
		// @story [[lucrjournal/runtime#^source-link-state]] Covers direct source-mode Markdown state without openFile.
		const file = createTestTFile('LucrJournal/news/CPI.md')
		const leaf = {
			openFile: vi.fn(async () => {}),
			setViewState: vi.fn(async () => {}),
		}
		const getLeaf = vi.fn(() => leaf)
		const app = createWorkspaceApp({
			getLeaf,
		})

		await openMarkdownFile(app, file, null, { sourceMode: true })

		expect(leaf.openFile).not.toHaveBeenCalled()
		expect(leaf.setViewState).toHaveBeenCalledWith(
			{
				active: true,
				state: { file: 'LucrJournal/news/CPI.md', mode: 'source' },
				type: 'markdown',
			},
			{ history: false },
		)
	})

	it('opens vault link text in a new Obsidian tab for command-click', async () => {
		const openLinkText = vi.fn(async () => {})
		const app = createWorkspaceApp({
			openLinkText,
		})

		await openVaultLinkText(app, 'CPI', '', { metaKey: true })

		expect(openLinkText).toHaveBeenCalledWith('CPI', '', 'tab')
	})

	it('consumes link activation events when requested', () => {
		const event = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		}

		consumeLinkActivationEvent(event)

		expect(event.preventDefault).toHaveBeenCalledOnce()
		expect(event.stopPropagation).toHaveBeenCalledOnce()
	})
})
