import { type ColumnFiltersState } from '@tanstack/react-table'
import { TFile, type App } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'

import {
	SymbolDomain,
	deleteSymbol,
	gatherSymbolDeletionScope,
	listSymbolTableEntries,
	symbolTableFields,
	symbolTableFilters,
	type SymbolDeletionScope,
	type SymbolTableFieldDescriptor,
} from '../../domains'
import { applyTableFilterState, createDefaultTableFilterState, type TableFilterState } from '../../domains/core/table-filters'
import { t } from '../../lang/helpers'
import { tableRenderers, useDomainTable } from '../fields'
import { TableFilterPopover } from '../fields/table-filter-popover'

import { DashboardTableLayout } from './dashboard-table-layout'
import { NewLinkedEntryModal } from './new-linked-entry-modal'
import { SymbolDeleteModal } from './symbol-delete-modal'

import type { DomainPersistedEntry } from '../../domains/core/type'
import type { LinkActivationEvent } from '../../views/link-activation'
import type { TableRendererRegistry } from '../fields'

type DashboardSymbolsPanelProps = {
	app: App
	dataRevision: number
	accountFilter?: string | null
	onSelectSymbolPositions: (symbolWikilink: string, event?: LinkActivationEvent) => void
	preferredAccount?: string
}

const NEW_SYMBOL_MODAL_MAX_WIDTH_CLASS_NAME = 'lj:max-w-md'

export function DashboardSymbolsPanel({
	app,
	dataRevision,
	accountFilter,
	onSelectSymbolPositions,
	preferredAccount,
}: DashboardSymbolsPanelProps) {
	const [tableFilterState, setTableFilterState] = useState(() => createSymbolTableFilterState(accountFilter ?? null))
	const [isCreateOpen, setIsCreateOpen] = useState(false)
	const [deleteScope, setDeleteScope] = useState<SymbolDeletionScope | null>(null)
	const [deletingEntry, setDeletingEntry] = useState<ReturnType<typeof SymbolDomain.totalEntries>[number] | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)
	const [editingFeeFilePath, setEditingFeeFilePath] = useState<string | null>(null)
	const symbolEntries = useMemo(() => listSymbolTableEntries(app), [app, dataRevision])
	const registry = useMemo(() => tableRenderers as TableRendererRegistry<SymbolTableFieldDescriptor['type']>, [])
	const filterResult = useMemo(
		() => applyTableFilterState({
			definitions: symbolTableFilters,
			state: tableFilterState,
			currentColumnFilters: [],
			entries: symbolEntries,
			app,
		}),
		[app, symbolEntries, tableFilterState],
	)
	const { table, state } = useDomainTable(
		symbolTableFields,
		filterResult.entries,
		registry,
		{
			app,
			extras: {
				editingFeeFilePath,
				setEditingFeeFilePath,
				onSelectSymbolPositions,
				onDeleteRow: (rowEntry: DomainPersistedEntry<unknown>) => {
					if (!(rowEntry.file instanceof TFile)) {
						return
					}

					const symbolEntry = SymbolDomain.totalEntries(app)
						.find((entry) => entry.file instanceof TFile && entry.file.path === rowEntry.file.path)
					if (symbolEntry === undefined) {
						return
					}

					const scope = gatherSymbolDeletionScope(app, symbolEntry)
					if (scope === null) {
						return
					}
					setDeletingEntry(symbolEntry)
					setDeleteScope(scope)
				},
			},
		},
	)

	// @story [[lucrjournal/fields#^filter-apply-reset]] Resets symbol pagination after search filter or sorting changes
	useEffect(() => {
		state.setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 })
	}, [state.globalFilter, state.columnFilters, state.sorting, tableFilterState])

	useEffect(() => {
		state.setColumnFilters((current) => areColumnFiltersEqual(current, filterResult.columnFilters) ? current : filterResult.columnFilters)
	}, [filterResult.columnFilters, state.setColumnFilters])

	useEffect(() => {
		setTableFilterState((current) => {
			const nextAccountFilter = accountFilter ?? ''
			return current.account === nextAccountFilter
				? current
				: { ...current, account: nextAccountFilter }
		})
	}, [accountFilter])

	const buildInitialFormValues = useMemo(() => (
		(context?: { app?: App }) => ({
			...SymbolDomain.buildInitialFormValues(context),
			account: preferredAccount ?? '',
		})
	), [preferredAccount])

	const handleCancelDelete = () => {
		setDeletingEntry(null)
		setDeleteScope(null)
	}

	const handleConfirmDelete = async () => {
		if (deleteScope === null) {
			return
		}
		setIsDeleting(true)
		await deleteSymbol(app, deleteScope)
		setIsDeleting(false)
		setDeletingEntry(null)
		setDeleteScope(null)
	}

	return (
		<>
			<DashboardTableLayout
				app={app}
				table={table}
				searchPlaceholder={t('DASHBOARD_POSITIONS_SEARCH_SYMBOL_PLACEHOLDER')}
				filterContent={(onClose) => (
					<TableFilterPopover
						title={t('DASHBOARD_SYMBOLS_FILTER_TITLE')}
						definitions={symbolTableFilters}
						value={tableFilterState}
						app={app}
						entries={symbolEntries}
						onApply={setTableFilterState}
						onReset={() => setTableFilterState(createDefaultTableFilterState(symbolTableFilters))}
						onClose={onClose}
					/>
				)}
				onNew={() => setIsCreateOpen(true)}
				newLabel={t('NEW_SYMBOL_SAVE')}
				showColumnVisibilityControl={false}
			/>
			<NewLinkedEntryModal
				app={app}
				title={t('NEW_SYMBOL_TITLE')}
				submitLabel={t('NEW_SYMBOL_SAVE')}
				formDefinition={SymbolDomain.formDefinition}
				buildInitialFormValues={buildInitialFormValues}
				synchronizeFormValues={SymbolDomain.synchronizeFormValues.bind(SymbolDomain)}
				createEntry={SymbolDomain.createEntry.bind(SymbolDomain)}
				toSubmitErrorMessage={(error) => {
					const errorMessageKey = SymbolDomain.toCreateEntryErrorMessageKey(error)
					return errorMessageKey == null ? null : t(errorMessageKey)
				}}
				maxWidthClassName={NEW_SYMBOL_MODAL_MAX_WIDTH_CLASS_NAME}
				isOpen={isCreateOpen}
				onClose={() => setIsCreateOpen(false)}
			/>
			<SymbolDeleteModal
				isOpen={deleteScope !== null}
				isDeleting={isDeleting}
				symbolDisplayName={deletingEntry?.fm.name ?? ''}
				symbolFile={deleteScope?.symbolFile ?? null}
				positionFiles={deleteScope?.positionFiles ?? []}
				onClose={handleCancelDelete}
				onConfirm={() => void handleConfirmDelete()}
			/>
		</>
	)
}

function createSymbolTableFilterState(accountFilter: string | null): TableFilterState {
	return {
		...createDefaultTableFilterState(symbolTableFilters),
		account: accountFilter ?? '',
	}
}

function areColumnFiltersEqual(left: ColumnFiltersState, right: ColumnFiltersState): boolean {
	return left.length === right.length
		&& left.every((columnFilter, index) => {
			const target = right[index]
			return target?.id === columnFilter.id
				&& target.value === columnFilter.value
		})
}
