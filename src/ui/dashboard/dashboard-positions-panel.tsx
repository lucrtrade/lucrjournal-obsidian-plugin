/// <reference types="vitest/importMeta" />

// src/ui/dashboard/dashboard-positions-panel.tsx

import {
	type ColumnFiltersState,
	type VisibilityState,
} from '@tanstack/react-table'
import { type App, TFile } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'

import {
	type Position,
	PositionDomain,
	type PositionTableLazyContent,
} from '../../domains'
import { applyTableFilterState, createDefaultTableFilterState, resolveTableFilterOptions, type TableFilterState } from '../../domains/core/table-filters'
import { positionFields, positionTableFilters, type PositionTableFieldDescriptor } from '../../domains/position/fields'
import { t } from '../../lang/helpers'
import {
	POSITION_TABLE_COLUMN_IDS,
	type PositionTableColumnId,
} from '../../settings/plugin-preferences'
import { tableRenderers, useDomainTable } from '../fields'
import { TableFilterPopover } from '../fields/table-filter-popover'

import { DashboardTableLayout } from './dashboard-table-layout'

import type { FieldDescriptor } from '../../domains/core/fields'
import type { DomainPersistedEntry } from '../../domains/core/type'
import type { LinkActivationEvent } from '../../views/link-activation'
import type { TableRendererRegistry } from '../fields'

type DashboardPositionsPanelProps = {
	app: App
	hiddenColumnIds: PositionTableColumnId[]
	onChangeHiddenColumnIds: (hiddenColumnIds: PositionTableColumnId[]) => void
	positionEntries: DomainPersistedEntry<Position>[]
	onSelectPosition: (positionId: string, event?: LinkActivationEvent) => void
	onSelectPlaybook: (filePath: string, event?: LinkActivationEvent) => void
	openedAtDateFilter: string | null
	accountFilter: string | null
	linkedAnalysisFilter: string | null
	linkedNewsFilter: string | null
	linkedPlaybookFilter: string | null
	onTableFilterOpenChange?: (isOpen: boolean) => void
	symbolFilter: string | null
}

export function DashboardPositionsPanel({
	app,
	hiddenColumnIds,
	onChangeHiddenColumnIds,
	positionEntries,
	onSelectPosition,
	onSelectPlaybook,
	openedAtDateFilter,
	accountFilter,
	linkedAnalysisFilter,
	linkedNewsFilter,
	linkedPlaybookFilter,
	onTableFilterOpenChange,
	symbolFilter,
}: DashboardPositionsPanelProps) {
	const [tableFilterState, setTableFilterState] = useState(() => createPositionTableFilterState({
		app,
		positionEntries,
		accountFilter,
		linkedAnalysisFilter,
		linkedNewsFilter,
		linkedPlaybookFilter,
		symbolFilter,
	}))
	const [tableLazyContent, setTableLazyContent] = useState<Record<string, PositionTableLazyContent>>({})
	const registry = useMemo(() => tableRenderers as TableRendererRegistry<PositionTableFieldDescriptor['type']>, [])
	const tableContext = useMemo(
		() => ({ app, extras: { tableLazyContent, onSelectPlaybook } }),
		[app, onSelectPlaybook, tableLazyContent],
	)
	const filterResult = useMemo(
		() => applyTableFilterState({
			definitions: positionTableFilters,
			state: tableFilterState,
			currentColumnFilters: [],
			entries: positionEntries,
			app,
		}),
		[app, positionEntries, tableFilterState],
	)
	const { table, state } = useDomainTable<
		Position,
		FieldDescriptor<Position>
	>(
		positionFields,
		filterResult.entries,
		registry,
		tableContext,
		{ initialColumnVisibility: createColumnVisibilityState(hiddenColumnIds) },
	)

	const paginatedPositionEntries = useMemo(
		() => table
			.getRowModel()
			.rows
			.flatMap((row) => row.original.file instanceof TFile ? [row.original] : []),
		[table, state.pagination, state.columnFilters, state.columnVisibility, state.globalFilter, state.sorting, filterResult.entries],
	)
	const paginatedPositionEntrySignature = paginatedPositionEntries
		.map((entry) => entry.file.path)
		.join('|')
	const paginatedPositionEntriesForEffect = useMemo(
		() => paginatedPositionEntries,
		[paginatedPositionEntrySignature],
	)

	// @story [[lucrjournal/fields#^filter-apply-reset]] Resets positions pagination after search filter or sorting changes
	useEffect(() => {
		state.setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 })
	}, [state.globalFilter, state.columnFilters, state.sorting, tableFilterState])

	useEffect(() => {
		state.setColumnFilters((current) => areColumnFiltersEqual(current, filterResult.columnFilters) ? current : filterResult.columnFilters)
	}, [filterResult.columnFilters, state.setColumnFilters])

	useEffect(() => {
		table.setColumnFilters((current) => {
			const nextFilters = [...filterResult.columnFilters.filter((filter) => filter.id !== 'opened_at')]
			if (openedAtDateFilter !== null) {
				nextFilters.push({ id: 'opened_at', value: openedAtDateFilter })
			}
			return areColumnFiltersEqual(current, nextFilters) ? current : nextFilters
		})
	}, [table, openedAtDateFilter, filterResult.columnFilters])

	useEffect(() => {
		setTableFilterState((current) => {
			const next = createPositionTableFilterState({
				app,
				positionEntries,
				accountFilter,
				linkedAnalysisFilter,
				linkedNewsFilter,
				linkedPlaybookFilter,
				symbolFilter,
			})
			return current.account === next.account
				&& current.linkedAnalysis === next.linkedAnalysis
				&& current.linkedNews === next.linkedNews
				&& current.linkedPlaybook === next.linkedPlaybook
				&& current.symbol === next.symbol
				? current
				: next
		})
	}, [accountFilter, app, linkedAnalysisFilter, linkedNewsFilter, linkedPlaybookFilter, positionEntries, symbolFilter])

	useEffect(() => {
		if (paginatedPositionEntriesForEffect.length === 0) {
			return
		}

		let cancelled = false

		void PositionDomain.lazyRenderTableContent(app, paginatedPositionEntriesForEffect).then((contents) => {
			if (cancelled) {
				return
			}

			setTableLazyContent((current) => ({
				...current,
				...Object.fromEntries(contents),
			}))
		})

		return () => {
			cancelled = true
		}
	}, [app, filterResult.entries, paginatedPositionEntriesForEffect])

	// @story [[lucrjournal/fields#^column-visibility-persistence]] Synchronizes persisted positions hidden columns into table state
	useEffect(() => {
		const nextVisibility = createColumnVisibilityState(hiddenColumnIds)
		state.setColumnVisibility((current) => areVisibilityStatesEqual(current, nextVisibility) ? current : nextVisibility)
	}, [hiddenColumnIds])

	useEffect(() => {
		const nextHiddenColumnIds = collectHiddenColumnIds(state.columnVisibility)
		if (!areHiddenColumnIdsEqual(hiddenColumnIds, nextHiddenColumnIds)) {
			onChangeHiddenColumnIds(nextHiddenColumnIds)
		}
	}, [state.columnVisibility, onChangeHiddenColumnIds])

	return (
		<DashboardTableLayout
			app={app}
			table={table}
			searchPlaceholder={t('DASHBOARD_POSITIONS_SEARCH_SYMBOL_PLACEHOLDER')}
			onFilterOpenChange={onTableFilterOpenChange}
			filterContent={(onClose) => (
				<TableFilterPopover
					title={t('DASHBOARD_TABLE_FILTER_TITLE')}
					definitions={positionTableFilters}
					value={tableFilterState}
					app={app}
					entries={positionEntries}
					onApply={(next) => setTableFilterState(normalizePositionTableFilterState(app, positionEntries, next))}
					normalizeDraft={(next) => normalizePositionTableFilterState(app, positionEntries, next)}
					onReset={() => setTableFilterState(createDefaultTableFilterState(positionTableFilters))}
					onClose={onClose}
				/>
			)}
			onRowClick={(row, event) => {
				const positionId = String(row.original.fm.id ?? row.index)
				onSelectPosition(positionId, event)
			}}
		/>
	)
}

function createColumnVisibilityState(hiddenColumnIds: PositionTableColumnId[]): VisibilityState {
	return Object.fromEntries(
		POSITION_TABLE_COLUMN_IDS.map((columnId) => [columnId, !hiddenColumnIds.includes(columnId)]),
	)
}

function createPositionTableFilterState({
	app,
	positionEntries,
	accountFilter,
	linkedAnalysisFilter,
	linkedNewsFilter,
	linkedPlaybookFilter,
	symbolFilter,
}: {
	app: App
	positionEntries: DomainPersistedEntry<Position>[]
	accountFilter: string | null
	linkedAnalysisFilter: string | null
	linkedNewsFilter: string | null
	linkedPlaybookFilter: string | null
	symbolFilter: string | null
}): TableFilterState {
	return normalizePositionTableFilterState(app, positionEntries, {
		...createDefaultTableFilterState(positionTableFilters),
		account: accountFilter ?? '',
		linkedAnalysis: linkedAnalysisFilter ?? '',
		linkedNews: linkedNewsFilter ?? '',
		linkedPlaybook: linkedPlaybookFilter ?? '',
		symbol: symbolFilter ?? '',
	})
}

function normalizePositionTableFilterState(
	app: App,
	positionEntries: DomainPersistedEntry<Position>[],
	state: TableFilterState,
): TableFilterState {
	if ((state.account ?? '') === '' || (state.symbol ?? '') === '') {
		return state
	}

	const symbolFilter = positionTableFilters.find((filter) => filter.id === 'symbol')
	if (symbolFilter === undefined) {
		throw new Error('Position symbol filter is missing')
	}

	const symbolOptions = resolveTableFilterOptions(symbolFilter, {
		app,
		entries: positionEntries,
		state,
	})
	return symbolOptions.some((option) => option.value === state.symbol)
		? state
		: { ...state, symbol: '' }
}

function collectHiddenColumnIds(columnVisibility: VisibilityState): PositionTableColumnId[] {
	return POSITION_TABLE_COLUMN_IDS.filter((columnId) => columnVisibility[columnId] === false)
}

function areHiddenColumnIdsEqual(left: PositionTableColumnId[], right: PositionTableColumnId[]): boolean {
	return left.length === right.length && left.every((columnId, index) => columnId === right[index])
}

function areVisibilityStatesEqual(left: VisibilityState, right: VisibilityState): boolean {
	return POSITION_TABLE_COLUMN_IDS.every((columnId) => left[columnId] === right[columnId])
}

function areColumnFiltersEqual(left: ColumnFiltersState, right: ColumnFiltersState): boolean {
	return left.length === right.length
		&& left.every((columnFilter, index) => {
			const target = right[index]
			return target?.id === columnFilter.id
				&& target.value === columnFilter.value
		})
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('createPositionTableFilterState', () => {
		// @story [[lucrjournal/fields#^position-scope-filters]] Covers clearing a symbol outside the selected account scope
		it('clears symbol filter when it does not belong to the selected account', () => {
			const createState = createPositionTableFilterState

			const state = createState({
				app: createPositionFilterApp(),
				positionEntries: [
					createPositionEntry('POS-00001.md', '[[SBL-Main-BTCUSDT]]'),
					createPositionEntry('POS-00002.md', '[[SBL-Alt-BTCUSDT]]'),
				],
				accountFilter: '[[ACC-Main]]',
				linkedAnalysisFilter: null,
				linkedNewsFilter: null,
				linkedPlaybookFilter: null,
				symbolFilter: '[[SBL-Alt-BTCUSDT]]',
			})

			expect(state.symbol).toBe('')
		})
	})

	function createPositionEntry(path: string, symbol: string): DomainPersistedEntry<Position> {
		return {
			file: { path },
			fm: { lucr_type: 'position', symbol } as Position,
		}
	}

	function createPositionFilterApp() {
		const files = [
			{ path: 'LucrJournal/symbols/SBL-Main-BTCUSDT.md' },
			{ path: 'LucrJournal/symbols/SBL-Alt-BTCUSDT.md' },
		]
		const frontmatterByPath = new Map<string, Record<string, unknown>>([
			['LucrJournal/symbols/SBL-Main-BTCUSDT.md', {
				lucr_type: 'symbol',
				name: 'BTCUSDT',
				account: '[[ACC-Main]]',
			}],
			['LucrJournal/symbols/SBL-Alt-BTCUSDT.md', {
				lucr_type: 'symbol',
				name: 'BTCUSDT',
				account: '[[ACC-Alt]]',
			}],
		])
		return {
			vault: { getMarkdownFiles: () => files },
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatterByPath.get(file.path),
				}),
			},
		} as never
	}
}
