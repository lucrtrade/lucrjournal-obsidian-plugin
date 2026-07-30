// src/ui/dashboard/dashboard-table-layout.tsx

import { flexRender } from '@tanstack/react-table'
import { MarkdownView, TFile, type App, type ViewStateResult } from 'obsidian'
import { useEffect, useState } from 'react'

import { t } from '../../lang/helpers'
import {
	resolveTableCellClassName,
	resolveTableColumnWeightPx,
	resolveTableHeaderClassName,
	resolveTableMinWidthPx,
} from '../fields'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import { DashboardTableColumnVisibilityPopover } from './dashboard-table-column-visibility-popover'

import type { TableFieldLayout } from '../../domains/core/fields'
import type { Row, Table } from '@tanstack/react-table'
import type { MouseEvent, ReactNode } from 'react'

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildPaginationItems(currentPage: number, pageCount: number) {
	if (pageCount <= 5) {
		return Array.from({ length: pageCount }, (_, index) => index + 1)
	}
	if (currentPage <= 3) {
		return [1, 2, 3, 'ellipsis', pageCount]
	}
	if (currentPage >= pageCount - 2) {
		return [1, 'ellipsis', pageCount - 2, pageCount - 1, pageCount]
	}
	return [1, 'ellipsis', currentPage, currentPage + 1, 'ellipsis', pageCount]
}

function SortIndicator({ direction }: { direction: false | 'asc' | 'desc' }) {
	if (direction === false) {
		return null
	}
	return (
		<span className="lj:inline-flex lj:w-3 lj:items-center lj:justify-center lj:leading-none">
			{direction === 'asc' ? '↑' : '↓'}
		</span>
	)
}

const SOURCE_FILE_STATE_RESULT = { history: false } satisfies ViewStateResult

function resolveOpenSourceFile<T>(row: Row<T>, layout: TableFieldLayout | undefined): TFile | null {
	if (layout?.openSourceFile !== true) {
		return null
	}

	const file = (row.original as { file?: unknown }).file
	return file instanceof TFile ? file : null
}

async function openDashboardSourceFile(app: App, file: TFile) {
	const leaf = app.workspace.getLeaf('tab')
	await leaf.openFile(file)

	if (leaf.view instanceof MarkdownView) {
		await leaf.view.setState({ ...leaf.view.getState(), mode: 'source' }, SOURCE_FILE_STATE_RESULT)
	}
}

// ─── Public API ───────────────────────────────────────────────────────────────

type DashboardTableLayoutProps<T> = {
	app: App
	table: Table<T>
	searchPlaceholder: string
	filterContent?: (onClose: () => void) => ReactNode
	onNew?: () => void
	onFilterOpenChange?: (isOpen: boolean) => void
	newLabel?: string
	onRowClick?: (row: Row<T>, event: MouseEvent<HTMLTableRowElement>) => void
	showColumnVisibilityControl?: boolean
}

export function DashboardTableLayout<T>({
	app,
	table,
	searchPlaceholder,
	filterContent,
	onNew,
	onFilterOpenChange,
	newLabel,
	onRowClick,
	showColumnVisibilityControl = true,
}: DashboardTableLayoutProps<T>) {
	const [showFilters, setShowFilters] = useState(false)
	const [showColumnVisibility, setShowColumnVisibility] = useState(false)

	const globalFilter = table.getState().globalFilter as string | undefined
	const rows = table.getRowModel().rows
	const totalRows = table.getFilteredRowModel().rows.length
	const { pageIndex, pageSize } = table.getState().pagination
	const pageCount = table.getPageCount()
	const currentPage = pageIndex + 1
	const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1
	const endRow = totalRows === 0 ? 0 : Math.min((pageIndex + 1) * pageSize, totalRows)
	const paginationItems = buildPaginationItems(currentPage, pageCount)
	const visibleColumns = table.getVisibleLeafColumns()
	// @story [[lucrjournal/fields#^column-width-layout]] Sizes the table and visible columns from descriptor width weights
	const tableMinWidthPx = resolveTableMinWidthPx(
		visibleColumns.map((column) => column.columnDef.meta?.tableLayout),
	)
	const tableTotalWeightPx = tableMinWidthPx

	useEffect(() => {
		onFilterOpenChange?.(showFilters)
		return () => onFilterOpenChange?.(false)
	}, [onFilterOpenChange, showFilters])

	return (
		<div className="lj:flex lj:flex-1 lj:flex-col lj:gap-6">
			{/* Toolbar */}
			<div className="lj:mb-2 lj:flex lj:items-center lj:justify-between lj:gap-4">
				<div className="lj:flex lj:items-center lj:gap-4">
					{/* Search */}
					<div className="lj:relative">
						<ObsidianIcon
							name="search"
							className="lj:absolute lj:left-3 lj:top-1/2 lj:size-4 lj:-translate-y-1/2 lj:text-lj-c-hint"
						/>
						<input
							type="text"
							value={globalFilter ?? ''}
							onChange={(event) => table.setGlobalFilter(event.target.value)}
							data-lj-control="dashboard-table-search"
							placeholder={searchPlaceholder}
							className="lj:h-9 lj:w-72 lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-segmented lj:pl-10 lj:pr-4 lj:text-xs lj:text-lj-c-strong"
						/>
					</div>
					{/* Filter button */}
					{filterContent !== undefined && (
						<div className="lj:relative">
							<button
								type="button"
								onClick={() => setShowFilters((v) => !v)}
								data-lj-control="dashboard-table-filter"
								className={`lj:inline-flex lj:h-9 lj:w-9 lj:items-center lj:justify-center lj:rounded-md lj:border lj:border-lj-alpha-10 lj:transition-colors ${
									showFilters
										? 'lj:bg-lj-alpha-10 lj:text-lj-c-strong'
										: 'lj:text-lj-c-muted-half lj:hover:bg-lj-surf-button-hover lj:hover:text-lj-c-strong'
								}`}
							>
								<ObsidianIcon name="filter" className="lj:size-4" />
							</button>
							{showFilters && filterContent(() => setShowFilters(false))}
						</div>
					)}
				</div>
				<div className="lj:flex lj:items-center lj:gap-5">
					{/* New button */}
					{onNew !== undefined && newLabel !== undefined && (
						<button
							type="button"
							onClick={onNew}
							className="lj:inline-flex lj:h-9 lj:appearance-none lj:items-center lj:justify-center lj:gap-2 lj:rounded-lg lj:border-0 lj:bg-lj-c-strong lj:px-4 lj:text-xs lj:font-medium lj:text-lj-c-inv lj:shadow-none lj:transition-[opacity,transform] lj:hover:opacity-95 lj:hover:-translate-y-px"
						>
							<ObsidianIcon name="plus" className="lj:size-4" />
							{newLabel}
						</button>
					)}
					{showColumnVisibilityControl && (
						<div className="lj:relative">
							<button
								type="button"
								onClick={() => setShowColumnVisibility((v) => !v)}
								data-lj-control="dashboard-table-columns"
								className={`lj:inline-flex lj:h-9 lj:w-9 lj:appearance-none lj:items-center lj:justify-center lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-transparent lj:shadow-none lj:transition-colors ${
									showColumnVisibility
										? 'lj:bg-lj-alpha-10 lj:text-lj-c-strong'
										: 'lj:text-lj-c-muted-half lj:hover:bg-lj-surf-button-hover lj:hover:text-lj-c-strong'
								}`}
							>
								<ObsidianIcon name="sliders-horizontal" className="lj:size-4" />
							</button>
							{showColumnVisibility && (
								<DashboardTableColumnVisibilityPopover
									table={table}
									onClose={() => setShowColumnVisibility(false)}
								/>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Table */}
			<div className="lj-scrollbar-hidden lj:w-full lj:overflow-x-auto lj:pb-8">
				<table
					className="lj:w-full lj:table-fixed lj:border-collapse lj:text-left"
					style={{ minWidth: `${tableMinWidthPx}px` }}
				>
					<colgroup>
						{visibleColumns.map((column) => (
							<col
								key={column.id}
								style={{ width: `${((resolveTableColumnWeightPx(column.columnDef.meta?.tableLayout) / tableTotalWeightPx) * 100).toFixed(2)}%` }}
							/>
						))}
					</colgroup>
					<thead>
						<tr className="lj:border-b lj:border-lj-alpha-10-5 lj:text-[10px] lj:uppercase lj:tracking-[0.2em] lj:text-lj-c-muted-ghost">
							{table.getHeaderGroups()[0]?.headers.map((header) => {
								const meta = header.column.columnDef.meta
								const align = meta?.align ?? 'left'
								return (
									<th
										key={header.id}
										className={`lj:align-middle lj:px-4 lj:py-3 lj:font-normal lj:whitespace-nowrap ${resolveTableHeaderClassName(meta?.tableLayout, align)} ${header.column.getCanSort() ? 'lj:cursor-pointer lj:select-none' : ''}`}
										onClick={header.column.getToggleSortingHandler()}
									>
										{/* @story [[lucrjournal/fields#^sorting-comparator]] Delegates sortable header state transitions to TanStack */}
										<span className="lj:inline-flex lj:items-center lj:gap-1 lj:leading-none lj:whitespace-nowrap">
											<span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
											<SortIndicator direction={header.column.getIsSorted()} />
										</span>
									</th>
								)
							})}
						</tr>
					</thead>
					<tbody className="lj:text-xs lj:font-mono">
						{rows.length === 0 ? (
							<tr>
								<td
									colSpan={table.getVisibleLeafColumns().length}
									className="lj:py-14 lj:text-center lj:text-xs lj:text-lj-c-hint"
								>
									{t('DASHBOARD_TABLE_NO_RESULTS')}
								</td>
							</tr>
						) : rows.map((row) => (
							<tr
								key={row.id}
								onClick={onRowClick !== undefined ? (event) => onRowClick(row, event) : undefined}
								className={`lj:h-12 lj:border-b lj:border-lj-alpha-5 lj:transition-colors lj:hover:bg-lj-surf-panel-subtle ${onRowClick !== undefined ? 'lj:cursor-pointer' : ''}`}
							>
								{row.getVisibleCells().map((cell) => {
									const sourceFile = resolveOpenSourceFile(row, cell.column.columnDef.meta?.tableLayout)
									return (
										<td
											key={cell.id}
											onClick={sourceFile === null ? undefined : (event) => {
												event.stopPropagation()
												void openDashboardSourceFile(app, sourceFile)
											}}
											className={`lj:h-12 lj:px-4 lj:py-1.5 lj:align-middle ${resolveTableCellClassName(cell.column.columnDef.meta?.tableLayout, cell.column.columnDef.meta?.align ?? 'left')}`}
										>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Pagination */}
			<div className="lj:flex lj:items-center lj:justify-between lj:border-t lj:border-lj-alpha-5 lj:px-2 lj:py-3">
				<div className="lj:flex lj:items-center lj:text-xs lj:text-lj-c-muted">
					{t('DASHBOARD_TABLE_SHOWING_RANGE', {
						start: String(startRow),
						end: String(endRow),
						total: String(totalRows),
					})}
				</div>
				<div className="lj:flex lj:items-center lj:gap-1">
					<button
						type="button"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
						aria-label={t('DASHBOARD_TABLE_PREVIOUS_PAGE')}
						className="lj:rounded-md lj:p-1.5 lj:text-lj-c-muted-mid lj:transition-colors lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<ObsidianIcon name="chevron-left" className="lj:size-4" />
					</button>
					<div className="lj:flex lj:items-center lj:gap-0.5 lj:px-2">
						{paginationItems.map((item, index) => {
							if (item === 'ellipsis') {
								return (
									<span
										key={`ellipsis-${index}`}
										className="lj:flex lj:h-7 lj:w-7 lj:items-center lj:justify-center lj:text-xs lj:text-lj-c-hint"
									>
										...
									</span>
								)
							}
							if (typeof item !== 'number') {
								return null
							}
							const isActive = item === currentPage
							return (
								<button
									key={item}
									type="button"
									onClick={() => table.setPageIndex(item - 1)}
									className={`lj:flex lj:h-7 lj:w-7 lj:items-center lj:justify-center lj:rounded-md lj:text-xs lj:font-medium lj:transition-colors ${
										isActive
											? 'lj:border lj:border-lj-alpha-10 lj:text-lj-c-strong'
											: 'lj:text-lj-c-tertiary'
									}`}
								>
									{item}
								</button>
							)
						})}
					</div>
					<button
						type="button"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
						aria-label={t('DASHBOARD_TABLE_NEXT_PAGE')}
						className="lj:rounded-md lj:p-1.5 lj:text-lj-c-muted-mid lj:transition-colors lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<ObsidianIcon name="chevron-right" className="lj:size-4" />
					</button>
				</div>
			</div>
		</div>
	)
}
