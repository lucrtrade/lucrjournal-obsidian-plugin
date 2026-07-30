import { describe, expect, it } from 'vitest'

import { LUCR_JOURNAL_VIEW_TYPE } from '../constant'

import {
	createLucrJournalRouteViewState,
	DEFAULT_JOURNAL_ROUTE_STATE,
	resolveLucrJournalRouteStateFromViewState,
} from './lucr-journal-route'

describe('lucr journal route view state', () => {
	it('serializes a dashboard route into a new LucrJournal view state', () => {
		const route = {
			activeTab: 'Positions',
			kind: 'dashboard',
			positionsSymbolFilter: '[[SBL-Main-BTCUSDT]]',
		} as const

		expect(createLucrJournalRouteViewState(route)).toEqual({
			active: true,
			state: { route },
			type: LUCR_JOURNAL_VIEW_TYPE,
		})
	})

	it('uses the default dashboard route when view state is empty', () => {
		// @story [[lucrjournal/runtime#^empty-route-default]] Covers the default route for empty persisted view state.
		expect(resolveLucrJournalRouteStateFromViewState(null)).toBe(DEFAULT_JOURNAL_ROUTE_STATE)
		expect(resolveLucrJournalRouteStateFromViewState({})).toBe(DEFAULT_JOURNAL_ROUTE_STATE)
	})

	it('rejects invalid view state shapes', () => {
		// @story [[lucrjournal/runtime#^reject-invalid-route]] Covers rejecting invalid persisted state and route kinds.
		expect(() => resolveLucrJournalRouteStateFromViewState('bad')).toThrow('Invalid LucrJournal view state')
		expect(() => resolveLucrJournalRouteStateFromViewState({ route: { kind: 'bad' } }))
			.toThrow('Invalid LucrJournal route state')
	})

	it('keeps valid dashboard routes from persisted view state', () => {
		// @story [[lucrjournal/runtime#^persist-dashboard-route]] Covers preserving a persisted dashboard route object.
		const route = {
			activeTab: 'Playbook',
			kind: 'dashboard',
			selectedPlaybookPath: 'LucrJournal/playbooks/PBK-Breakout.md',
		} as const

		expect(resolveLucrJournalRouteStateFromViewState({ route })).toBe(route)
	})

	it('rejects persisted document routes', () => {
		// @story [[lucrjournal/runtime#^reject-invalid-route]] Covers rejecting the removed document route kind.
		expect(() => resolveLucrJournalRouteStateFromViewState({
			route: {
				documentKey: 'index',
				kind: 'document',
			},
		})).toThrow('Invalid LucrJournal route state')
	})
})
