import { describe, expect, it, vi } from 'vitest'

import { LUCR_JOURNAL_VIEW_TYPE } from '../constant'
import { createWorkspaceApp } from '../testing/obsidian'

import { LucrJournalView } from './lucr-journal-view'

describe('LucrJournalView route activation', () => {
	it('opens command-click routes in a new Obsidian tab', async () => {
		// @story [[lucrjournal/runtime#^command-route-new-tab]] Covers new-tab route state and leaf reveal for command-click.
		const route = {
			activeTab: 'Playbook',
			kind: 'dashboard',
			selectedPlaybookPath: 'LucrJournal/playbooks/Breakout.md',
		} as const
		const leaf = { setViewState: vi.fn(async () => {}) }
		const workspace = {
			getLeaf: vi.fn(() => leaf),
			revealLeaf: vi.fn(async () => {}),
		}
		const view = Object.assign(Object.create(LucrJournalView.prototype), {
			app: createWorkspaceApp(workspace),
		}) as LucrJournalView

		await view.openRoute(route, { metaKey: true })

		expect(workspace.getLeaf).toHaveBeenCalledWith('tab')
		expect(leaf.setViewState).toHaveBeenCalledWith({
			active: true,
			state: { route },
			type: LUCR_JOURNAL_VIEW_TYPE,
		})
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf)
	})
})
