import { LUCR_JOURNAL_VIEW_TYPE } from '../constant'

type LucrJournalDashboardTabId = 'Overview' | 'Positions' | 'News' | 'Analysis' | 'Playbook'
type LucrJournalDashboardSettingsTabId = 'Accounts' | 'Symbols'
type LucrJournalDashboardAnalysisSubTabId = 'Key Levels' | 'Confluence' | 'Market Analysis'

export type LucrJournalDashboardRouteState = {
	kind: 'dashboard'
	activeTab?: LucrJournalDashboardTabId
	activeSettingsTab?: LucrJournalDashboardSettingsTabId
	isSettingsOpen?: boolean
	selectedPositionId?: string | null
	selectedPlaybookPath?: string | null
	selectedPositionTemplatePath?: string | null
	positionsOpenedAtDateFilter?: string | null
	positionsAccountFilter?: string | null
	positionsLinkedAnalysisFilter?: string | null
	positionsLinkedNewsFilter?: string | null
	positionsLinkedPlaybookFilter?: string | null
	positionsSymbolFilter?: string | null
	symbolsAccountFilter?: string | null
	activeAnalysisSubTab?: LucrJournalDashboardAnalysisSubTabId
}

export type LucrJournalRouteState = LucrJournalDashboardRouteState

export const DEFAULT_JOURNAL_ROUTE_STATE = {
	kind: 'dashboard',
} as const satisfies LucrJournalRouteState

export function createLucrJournalRouteViewState(route: LucrJournalRouteState) {
	return {
		active: true,
		state: { route },
		type: LUCR_JOURNAL_VIEW_TYPE,
	}
}

export function resolveLucrJournalRouteStateFromViewState(state: unknown): LucrJournalRouteState {
	if (state == null) {
		// @story [[lucrjournal/runtime#^empty-route-default]] Uses the dashboard route when persisted view state is empty.
		return DEFAULT_JOURNAL_ROUTE_STATE
	}
	if (typeof state !== 'object') {
		// @story [[lucrjournal/runtime#^reject-invalid-route]] Rejects non-object persisted view state.
		throw new Error('Invalid LucrJournal view state')
	}

	const route = (state as { route?: unknown }).route
	if (route === undefined) {
		// @story [[lucrjournal/runtime#^empty-route-default]] Uses the dashboard route when persisted state has no route.
		return DEFAULT_JOURNAL_ROUTE_STATE
	}
	if (!isLucrJournalRouteState(route)) {
		// @story [[lucrjournal/runtime#^reject-invalid-route]] Rejects persisted routes outside the dashboard route kind.
		throw new Error('Invalid LucrJournal route state')
	}
	// @story [[lucrjournal/runtime#^persist-dashboard-route]] Preserves a persisted dashboard route for view rendering.
	return route
}

function isLucrJournalRouteState(value: unknown): value is LucrJournalRouteState {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const kind = (value as { kind?: unknown }).kind
	return kind === 'dashboard'
}
