/// <reference types="vitest/importMeta" />

export const POSITION_TABLE_COLUMN_IDS = [
	'status',
	'symbol',
	'account',
	'profit',
	'side',
	'confidence',
	'notional_value',
	'risk',
	'opened_at',
	'playbooks',
	'analyses',
] as const

export type PositionTableColumnId = typeof POSITION_TABLE_COLUMN_IDS[number]
const DEFAULT_POSITION_TABLE_HIDDEN_COLUMN_IDS = ['analyses'] satisfies PositionTableColumnId[]
const _DASHBOARD_PREFERENCE_TAB_IDS = [
	'Positions',
	'News',
	'Confluence',
	'Key Levels',
	'Market Analysis',
] as const

type DashboardPreferenceTabId = typeof _DASHBOARD_PREFERENCE_TAB_IDS[number]

const DASHBOARD_ANALYSIS_TAB_IDS = [
	'News',
	'Confluence',
	'Key Levels',
	'Market Analysis',
] as const

export type DashboardAnalysisPreferenceTabId = typeof DASHBOARD_ANALYSIS_TAB_IDS[number]

export const DASHBOARD_ANALYSIS_TABLE_COLUMN_IDS = [
	'name',
	'description',
	'trades',
	'winRate',
	'netProfit',
	'largestProfit',
	'largestLoss',
	'created',
	'title',
	'source',
	'positionCount',
	'impact',
	'tags',
	'actions',
] as const

export type DashboardAnalysisTableColumnId = typeof DASHBOARD_ANALYSIS_TABLE_COLUMN_IDS[number]
type DashboardPreferenceColumnId =
	| PositionTableColumnId
	| DashboardAnalysisTableColumnId

// @story [[lucrjournal/fields#^column-visibility-persistence]] Defines the only persisted table layout state and its tab keys
export type PluginPreferences = {
	[TabId in DashboardPreferenceTabId]?: {
		hiddenColumnIds: DashboardPreferenceColumnId[]
	}
}

// @story [[lucrjournal/fields#^column-visibility-persistence]] Normalizes persisted hidden columns and applies tab defaults
export function createPluginPreferences(persistedPreferences: unknown): PluginPreferences {
	const preferences = isRecord(persistedPreferences)
		? persistedPreferences
		: null
	const positionsPreference = isRecord(preferences?.Positions)
		? preferences.Positions
		: isRecord(preferences?.positionsTable)
			? preferences.positionsTable
			: null
	const analysisTables = isRecord(preferences?.analysisTables)
		? preferences.analysisTables
		: null

	const normalizedPreferences: PluginPreferences = {
		Positions: {
			hiddenColumnIds: normalizePositionTableHiddenColumnIds(
				positionsPreference?.hiddenColumnIds ?? DEFAULT_POSITION_TABLE_HIDDEN_COLUMN_IDS,
			),
		},
	}

	for (const tabId of DASHBOARD_ANALYSIS_TAB_IDS) {
		const directPreference = isRecord(preferences?.[tabId]) ? preferences[tabId] : null
		const legacyPreference = isRecord(analysisTables?.[tabId]) ? analysisTables[tabId] : null
		normalizedPreferences[tabId] = {
			hiddenColumnIds: normalizeDashboardAnalysisTableHiddenColumnIds(
				directPreference?.hiddenColumnIds ?? legacyPreference?.hiddenColumnIds ?? null,
			),
		}
	}

	return normalizedPreferences
}

function normalizeDashboardAnalysisTableHiddenColumnIds(
	value: unknown,
): DashboardAnalysisTableColumnId[] {
	if (!Array.isArray(value)) {
		return []
	}

	const hiddenColumnIds = value.filter(isDashboardAnalysisTableColumnId)
	return [...new Set(hiddenColumnIds)]
}

function normalizePositionTableHiddenColumnIds(value: unknown): PositionTableColumnId[] {
	if (!Array.isArray(value)) {
		return []
	}

	const hiddenColumnIds = value.filter(isPositionTableColumnId)
	return [...new Set(hiddenColumnIds)]
}

function isPositionTableColumnId(value: unknown): value is PositionTableColumnId {
	return typeof value === 'string' && POSITION_TABLE_COLUMN_IDS.includes(value as PositionTableColumnId)
}

function isDashboardAnalysisTableColumnId(value: unknown): value is DashboardAnalysisTableColumnId {
	return typeof value === 'string'
		&& DASHBOARD_ANALYSIS_TABLE_COLUMN_IDS.includes(value as DashboardAnalysisTableColumnId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('createPluginPreferences', () => {
		// @story [[lucrjournal/fields#^column-visibility-persistence]] Covers the positions-only default hidden column
		it('defaults positions table hidden columns to analyses', () => {
			expect(createPluginPreferences(null).Positions?.hiddenColumnIds).toEqual(['analyses'])
		})

		it('defaults analysis table hidden columns to an empty list for all tabs', () => {
			expect(createPluginPreferences(null)).toEqual({
				Positions: { hiddenColumnIds: ['analyses'] },
				News: { hiddenColumnIds: [] },
				Confluence: { hiddenColumnIds: [] },
				'Key Levels': { hiddenColumnIds: [] },
				'Market Analysis': { hiddenColumnIds: [] },
			})
		})

		it('keeps explicitly empty positions table hidden columns', () => {
			expect(createPluginPreferences({
				Positions: {
					hiddenColumnIds: [],
				},
			}).Positions?.hiddenColumnIds).toEqual([])
		})

		// @story [[lucrjournal/fields#^column-visibility-persistence]] Covers removal of unknown and duplicate hidden column ids
		it('keeps only known positions table column ids', () => {
			expect(createPluginPreferences({
				Positions: {
					hiddenColumnIds: ['risk', 'analyses', 'unknown', 'risk'],
				},
			}).Positions?.hiddenColumnIds).toEqual(['risk', 'analyses'])
		})

		it('keeps only known analysis table column ids', () => {
			expect(createPluginPreferences({
				News: {
					hiddenColumnIds: ['tags', 'actions', 'unknown', 'tags'],
				},
			}).News?.hiddenColumnIds).toEqual(['tags', 'actions'])
		})

		it('migrates legacy nested preferences shape', () => {
			expect(createPluginPreferences({
				positionsTable: {
					hiddenColumnIds: ['risk'],
				},
				analysisTables: {
					News: {
						hiddenColumnIds: ['actions'],
					},
				},
			})).toEqual({
				Positions: { hiddenColumnIds: ['risk'] },
				News: { hiddenColumnIds: ['actions'] },
				Confluence: { hiddenColumnIds: [] },
				'Key Levels': { hiddenColumnIds: [] },
				'Market Analysis': { hiddenColumnIds: [] },
			})
		})
	})
}
