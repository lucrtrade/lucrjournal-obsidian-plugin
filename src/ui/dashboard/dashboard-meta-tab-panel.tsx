// src/ui/dashboard/dashboard-meta-tab-panel.tsx

import { type ColumnFiltersState, type VisibilityState } from '@tanstack/react-table'
import { MarkdownView, Notice, TFile, type App, type ViewStateResult } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'

import {
	ConfluenceDomain,
	KeyLevelDomain,
	MarketAnalysisDomain,
	NewsDomain,
	confluenceTableFields,
	keyLevelTableFields,
	listConfluenceTableEntries,
	listKeyLevelTableEntries,
	listMarketAnalysisTableEntries,
	listNewsEntriesWithStats,
	listPublicConfluenceEntries,
	marketAnalysisTableFields,
	newsTableFields,
} from '../../domains'
import { linkedEntryTableFilters, toLinkedEntryStatsTableEntry, type LinkedEntryStatsRow, type LinkedEntryTableFieldType } from '../../domains/analysis/linked-entry-stats'
import { createDefaultTableFilterState, applyTableFilterState } from '../../domains/core/table-filters'
import { t } from '../../lang/helpers'
import { DASHBOARD_ANALYSIS_TABLE_COLUMN_IDS } from '../../settings/plugin-preferences'
import { getPersistedEntryDisplayName } from '../../utils'
import { tableRenderers, useDomainTable } from '../fields'
import { TableFilterPopover } from '../fields/table-filter-popover'
import { DashboardEmptyState } from '../primitives/dashboard-empty-state'

import { DashboardBacklinkedFileDeleteModal } from './dashboard-backlinked-file-delete-modal'
import { deleteDashboardBacklinkedFile } from './dashboard-entry-actions'
import { DashboardTableLayout } from './dashboard-table-layout'
import { NewLinkedEntryModal } from './new-linked-entry-modal'

import type { DashboardAnalysisTabId } from './dashboard-constants'
import type { FieldDescriptor } from '../../domains/core/fields'
import type { DomainPersistedEntry, DomainRuntimeFile } from '../../domains/core/type'
import type {
	DashboardAnalysisTableColumnId,
} from '../../settings/plugin-preferences'
import type { LinkActivationEvent } from '../../views/link-activation'
import type { TableRendererRegistry } from '../fields'

const LINKED_ENTRY_EDITOR_STATE_RESULT = { history: false } satisfies ViewStateResult

type DashboardMetaTabPanelProps = {
	app: App
	dataRevision: number
	icon: string
	label: string
	tabId: DashboardAnalysisTabId
	panelId: string
	hiddenColumnIds: DashboardAnalysisTableColumnId[]
	onChangeHiddenColumnIds: (hiddenColumnIds: DashboardAnalysisTableColumnId[]) => void
	onSelectLinkedEntryPositions: (filePath: string, event?: LinkActivationEvent) => void
	onTableFilterOpenChange?: (isOpen: boolean) => void
}

export function DashboardMetaTabPanel({
	app,
	dataRevision,
	icon,
	label,
	tabId,
	panelId,
	hiddenColumnIds,
	onChangeHiddenColumnIds,
	onSelectLinkedEntryPositions,
	onTableFilterOpenChange,
}: DashboardMetaTabPanelProps) {
	const [deletingLinkedEntry, setDeletingLinkedEntry] = useState<LinkedEntryStatsRow['entryStats'] | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [isCreateOpen, setIsCreateOpen] = useState(false)
	const [tableFilterState, setTableFilterState] = useState(() => createDefaultTableFilterState(linkedEntryTableFilters))

	const scopedEntries = useMemo(
		() => readScopedEntries(app, tabId),
		[app, dataRevision, tabId],
	)
	const tableFields = resolveTableFields(tabId)
	const linkedEntryDomain = resolveLinkedEntryDomain(tabId)
	if (linkedEntryDomain === undefined) {
		throw new Error(`dashboard-meta-tab-panel: unsupported analysis tab "${tabId}"`)
	}
	const registry = useMemo(() => tableRenderers as TableRendererRegistry<LinkedEntryTableFieldType>, [])
	const newsEntriesWithStats = useMemo(
		() => tabId === 'News' ? listNewsEntriesWithStats(app) : [],
		[app, dataRevision, tabId],
	)
	const tableEntries = useMemo(
		() => readTableEntries(app, tabId, scopedEntries, newsEntriesWithStats),
		[app, dataRevision, newsEntriesWithStats, scopedEntries, tabId],
	)
	const filterResult = useMemo(
		() => applyTableFilterState({
			definitions: linkedEntryTableFilters,
			state: tableFilterState,
			currentColumnFilters: [],
			entries: tableEntries,
			app,
		}),
		[app, tableEntries, tableFilterState],
	)

	const tableContext = useMemo(
		() => ({
			app,
			extras: {
				onSelectLinkedEntryPositions,
				onDeleteRow: (entry: DomainPersistedEntry<unknown>) => {
					if (tabId === 'News') {
						setDeletingLinkedEntry(newsEntriesWithStats.find((item) => item.entry.file.path === entry.file.path) ?? null)
						return
					}

					const statsRow = (entry as DomainPersistedEntry<LinkedEntryStatsRow>).fm
					setDeletingLinkedEntry(statsRow.entryStats)
				},
			},
		}),
		[app, newsEntriesWithStats, onSelectLinkedEntryPositions, tabId],
	)

	const { table, state } = useDomainTable<
		unknown,
		FieldDescriptor<unknown> & { type: LinkedEntryTableFieldType }
	>(
		tableFields as readonly (FieldDescriptor<unknown> & { type: LinkedEntryTableFieldType })[],
		filterResult.entries,
		registry,
		tableContext,
		{ initialColumnVisibility: createColumnVisibilityState(tabId, hiddenColumnIds) },
	)

	useEffect(() => {
		setIsCreateOpen(false)
		setTableFilterState(createDefaultTableFilterState(linkedEntryTableFilters))
	}, [tabId])

	useEffect(() => {
		state.setColumnFilters((current) => areColumnFiltersEqual(current, filterResult.columnFilters) ? current : filterResult.columnFilters)
	}, [filterResult.columnFilters, state.setColumnFilters])

	// @story [[lucrjournal/fields#^filter-apply-reset]] Resets analysis pagination after search filter sorting or tab changes
	useEffect(() => {
		state.setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 })
	}, [state.globalFilter, state.columnFilters, state.sorting, tabId, tableFilterState])

	// @story [[lucrjournal/fields#^column-visibility-persistence]] Synchronizes the active analysis tab hidden columns into table state
	useEffect(() => {
		const nextVisibility = createColumnVisibilityState(tabId, hiddenColumnIds)
		state.setColumnVisibility((current) => areVisibilityStatesEqual(current, nextVisibility) ? current : nextVisibility)
	}, [hiddenColumnIds, state.setColumnVisibility, tabId])

	useEffect(() => {
		const nextHiddenColumnIds = collectHiddenColumnIds(tabId, state.columnVisibility)
		if (!areHiddenColumnIdsEqual(hiddenColumnIds, nextHiddenColumnIds)) {
			onChangeHiddenColumnIds(nextHiddenColumnIds)
		}
	}, [hiddenColumnIds, onChangeHiddenColumnIds, state.columnVisibility, tabId])

	const handleDelete = async () => {
		if (deletingLinkedEntry === null) {
			return
		}

		setIsSaving(true)
		try {
			await deleteDashboardBacklinkedFile({
				app,
				displayName: getPersistedEntryDisplayName(deletingLinkedEntry.entry),
				file: deletingLinkedEntry.entry.file,
				linkpath: deletingLinkedEntry.entry.file.basename,
			})
			setDeletingLinkedEntry(null)
		} catch {
			new Notice(t('DASHBOARD_BACKLINKED_FILE_DELETE_FAILED'))
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<>
			<section className="lj:flex lj:flex-1 lj:w-full lj:flex-col lj:gap-6" data-lj-panel={panelId}>
				{tableEntries.length === 0 ? (
					<DashboardEmptyState
						icon={icon}
						title={label}
						description={t(resolveMetaTabTableNoResultsKey(tabId))}
						actionLabel={t('DASHBOARD_META_TAB_NEW', { tab: label })}
						onAction={() => setIsCreateOpen(true)}
					/>
				) : (
					<DashboardTableLayout
						app={app}
						table={table}
						searchPlaceholder={t('DASHBOARD_ANALYSIS_TABLE_SEARCH_PLACEHOLDER', {
							category: resolveAnalysisSearchCategory(tabId),
						})}
						onFilterOpenChange={onTableFilterOpenChange}
						filterContent={(onClose) => (
							<TableFilterPopover
								title={t('DASHBOARD_ANALYSIS_TABLE_FILTER_TITLE')}
								definitions={linkedEntryTableFilters}
								value={tableFilterState}
								app={app}
								entries={tableEntries}
								onApply={setTableFilterState}
								onReset={() => setTableFilterState(createDefaultTableFilterState(linkedEntryTableFilters))}
								onClose={onClose}
							/>
						)}
						onNew={() => setIsCreateOpen(true)}
						newLabel={t('DASHBOARD_META_TAB_NEW', { tab: label })}
						onRowClick={(row) => {
							if (row.original.file instanceof TFile) {
								void openLinkedEntryFile(app, row.original.file)
							}
						}}
						showColumnVisibilityControl={shouldShowColumnVisibilityControl(tabId)}
					/>
				)}
			</section>
			<DashboardBacklinkedFileDeleteModal
				filePath={deletingLinkedEntry?.entry.file.path ?? null}
				isDeleting={isSaving}
				isOpen={deletingLinkedEntry !== null}
				itemName={deletingLinkedEntry === null ? null : getPersistedEntryDisplayName(deletingLinkedEntry.entry)}
				itemTypeLabel={t('DASHBOARD_META_ANALYSIS_TYPE_LABEL')}
				linkedPositionsCount={deletingLinkedEntry?.linkedPositionEntries.length ?? 0}
				linkpath={deletingLinkedEntry?.entry.file.basename ?? null}
				onClose={() => {
					if (!isSaving) {
						setDeletingLinkedEntry(null)
					}
				}}
				onConfirm={() => {
					void handleDelete()
				}}
			/>
			{isCreateOpen && (
				<NewLinkedEntryModal
					app={app}
					formDefinition={linkedEntryDomain.formDefinition}
					buildInitialFormValues={linkedEntryDomain.buildInitialFormValues.bind(linkedEntryDomain)}
					synchronizeFormValues={linkedEntryDomain.synchronizeFormValues.bind(linkedEntryDomain)}
					createEntry={linkedEntryDomain.createEntry.bind(linkedEntryDomain)}
					submitLabel={resolveCreateSubmitLabel(tabId)}
					toSubmitErrorMessage={(error) => {
						const errorMessageKey = linkedEntryDomain.toCreateEntryErrorMessageKey(error)
						return errorMessageKey === null ? null : t(errorMessageKey)
					}}
					isOpen
					title={t('DASHBOARD_META_TAB_NEW', { tab: label })}
					onClose={() => setIsCreateOpen(false)}
				/>
			)}
		</>
	)
}

function resolveTableFields(tabId: DashboardAnalysisTabId) {
	switch (tabId) {
		case 'News':
			return newsTableFields
		case 'Confluence':
			return confluenceTableFields
		case 'Key Levels':
			return keyLevelTableFields
		case 'Market Analysis':
			return marketAnalysisTableFields
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for table fields')
	}
}

function resolveCreateSubmitLabel(tabId: DashboardAnalysisTabId) {
	switch (tabId) {
		case 'News':
			return t('NEW_NEWS_SAVE')
		case 'Confluence':
			return t('NEW_CONFLUENCE_SAVE')
		case 'Key Levels':
			return t('NEW_KEY_LEVEL_SAVE')
		case 'Market Analysis':
			return t('NEW_MARKET_ANALYSIS_SAVE')
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for create submit label')
	}
}

function resolveAnalysisSearchCategory(tabId: DashboardAnalysisTabId) {
	switch (tabId) {
		case 'News':
			return t('TAB_NEWS').toLowerCase()
		case 'Confluence':
			return t('TAB_CONFLUENCE').toLowerCase()
		case 'Key Levels':
			return t('TAB_KEY_LEVEL').toLowerCase()
		case 'Market Analysis':
			return t('TAB_MARKET_ANALYSIS').toLowerCase()
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for search category')
	}
}

function resolveMetaTabTableNoResultsKey(tabId: DashboardAnalysisTabId) {
	switch (tabId) {
		case 'News':
			return 'DASHBOARD_META_TAB_TABLE_NO_RESULTS_NEWS'
		case 'Confluence':
			return 'DASHBOARD_META_TAB_TABLE_NO_RESULTS_CONFLUENCE'
		case 'Key Levels':
			return 'DASHBOARD_META_TAB_TABLE_NO_RESULTS_KEY_LEVELS'
		case 'Market Analysis':
			return 'DASHBOARD_META_TAB_TABLE_NO_RESULTS_MARKET_ANALYSIS'
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for no-results copy')
	}
}

function readScopedEntries(app: App, tabId: DashboardAnalysisTabId) {
	switch (tabId) {
		case 'News':
			return NewsDomain.totalEntries(app) as DomainPersistedEntry<{
				description?: string | null
				source?: string | null
				impact?: 'high' | 'medium' | 'low' | null
				created?: string | null
				tags?: string[] | null
			}, DomainRuntimeFile>[]
		case 'Confluence':
			return listPublicConfluenceEntries(app) as DomainPersistedEntry<{ description?: string | null; public?: boolean }, DomainRuntimeFile>[]
		case 'Key Levels':
			return KeyLevelDomain.totalEntries(app) as DomainPersistedEntry<{ description?: string | null }, DomainRuntimeFile>[]
		case 'Market Analysis':
			return MarketAnalysisDomain.totalEntries(app) as DomainPersistedEntry<{ description?: string | null }, DomainRuntimeFile>[]
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for scoped entries')
	}
}

function readTableEntries(
	app: App,
	tabId: DashboardAnalysisTabId,
	_scopedEntries: ReturnType<typeof readScopedEntries>,
	newsEntriesWithStats: ReturnType<typeof listNewsEntriesWithStats>,
) {
	switch (tabId) {
		case 'News':
			return newsEntriesWithStats.map(toLinkedEntryStatsTableEntry)
		case 'Confluence':
			return listConfluenceTableEntries(app)
		case 'Key Levels':
			return listKeyLevelTableEntries(app)
		case 'Market Analysis':
			return listMarketAnalysisTableEntries(app)
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for table entries')
	}
}

function resolveLinkedEntryDomain(tabId: DashboardAnalysisTabId) {
	switch (tabId) {
		case 'News':
			return NewsDomain
		case 'Confluence':
			return ConfluenceDomain
		case 'Key Levels':
			return KeyLevelDomain
		case 'Market Analysis':
			return MarketAnalysisDomain
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for linked-entry domain')
	}
}

function createColumnVisibilityState(tabId: DashboardAnalysisTabId, hiddenColumnIds: DashboardAnalysisTableColumnId[]): VisibilityState {
	return Object.fromEntries(
		resolveAnalysisTableColumnOrder(tabId).map((columnId) => [columnId, !hiddenColumnIds.includes(columnId)]),
	)
}

function collectHiddenColumnIds(tabId: DashboardAnalysisTabId, columnVisibility: VisibilityState): DashboardAnalysisTableColumnId[] {
	return resolveAnalysisTableColumnOrder(tabId).filter((columnId) => columnVisibility[columnId] === false)
}

function shouldShowColumnVisibilityControl(tabId: DashboardAnalysisTabId) {
	switch (tabId) {
		case 'Key Levels':
		case 'Confluence':
			return false
		case 'News':
		case 'Market Analysis':
			return true
		default:
			tabId satisfies never
			throw new Error('Unknown dashboard analysis tab for column visibility control')
	}
}

function areHiddenColumnIdsEqual(
	left: DashboardAnalysisTableColumnId[],
	right: DashboardAnalysisTableColumnId[],
): boolean {
	return left.length === right.length && left.every((columnId, index) => columnId === right[index])
}

function areVisibilityStatesEqual(left: VisibilityState, right: VisibilityState): boolean {
	return DASHBOARD_ANALYSIS_TABLE_COLUMN_IDS.every((columnId) => left[columnId] === right[columnId])
}

function areColumnFiltersEqual(left: ColumnFiltersState, right: ColumnFiltersState): boolean {
	return left.length === right.length
		&& left.every((filter, index) => {
			const target = right[index]
			return target?.id === filter.id
				&& target.value === filter.value
		})
}

function resolveAnalysisTableColumnOrder(tabId: DashboardAnalysisTabId): DashboardAnalysisTableColumnId[] {
	return tabId === 'News'
		? ['created', 'title', 'source', 'positionCount', 'impact', 'tags', 'actions']
		: ['created', 'title', 'positionCount', 'tags', 'actions']
}

async function openLinkedEntryFile(app: App, file: TFile) {
	const leaf = app.workspace.getLeaf('tab')
	await leaf.openFile(file)

	if (leaf.view instanceof MarkdownView) {
		await leaf.view.setState({ ...leaf.view.getState(), mode: 'source' }, LINKED_ENTRY_EDITOR_STATE_RESULT)
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('resolveMetaTabTableNoResultsKey', () => {
		it('maps every dashboard analysis tab to its no-results copy key', () => {
			expect(resolveMetaTabTableNoResultsKey('News')).toBe('DASHBOARD_META_TAB_TABLE_NO_RESULTS_NEWS')
			expect(resolveMetaTabTableNoResultsKey('Confluence')).toBe('DASHBOARD_META_TAB_TABLE_NO_RESULTS_CONFLUENCE')
			expect(resolveMetaTabTableNoResultsKey('Key Levels')).toBe('DASHBOARD_META_TAB_TABLE_NO_RESULTS_KEY_LEVELS')
			expect(resolveMetaTabTableNoResultsKey('Market Analysis')).toBe('DASHBOARD_META_TAB_TABLE_NO_RESULTS_MARKET_ANALYSIS')
		})
	})
}
