import {
	type ColumnFiltersState,
	type FilterFn,
	type FilterFnOption,
	type PaginationState,
	type SortingFn,
	type SortingState,
	type Table,
	type VisibilityState,
	createColumnHelper,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { type Dispatch, type SetStateAction, useMemo, useRef, useState } from 'react'

import { getCurrentTimeZoneSetting, setCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import { toDateKeyInTimeZone } from '../../utils'

import { getSearchableFieldValues, matchesSearchQuery } from './table-search'

import type { TableRenderContext, TableRendererAlign, TableRendererRegistry } from './types'
import type { FieldDescriptor } from '../../domains/core/fields'
import type { DomainPersistedEntry } from '../../domains/core/type'

interface DomainTableState {
	sorting: SortingState
	setSorting: Dispatch<SetStateAction<SortingState>>
	columnFilters: ColumnFiltersState
	setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>
	columnVisibility: VisibilityState
	setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>
	pagination: PaginationState
	setPagination: Dispatch<SetStateAction<PaginationState>>
	globalFilter: string
	setGlobalFilter: Dispatch<SetStateAction<string>>
}

// Maps spec-level columnFilter string aliases to tanstack built-in filter fn names
const FILTER_FN_MAP: Record<string, string> = {
	by_date: 'by_date',
	equals: 'equals',
	includes: 'includesString',
	range: 'inNumberRange',
}

function normalizeByDateFilterValue(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null
	}
	const normalizedValue = value.trim()
	return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : null
}

function resolveDateFilterKey(value: unknown): string | null {
	if (typeof value === 'string') {
		const normalizedValue = value.trim()
		if (normalizedValue === '') {
			return null
		}
		const parsed = new Date(normalizedValue)
		return Number.isNaN(parsed.getTime()) ? null : toDateKeyInTimeZone(parsed, getCurrentTimeZoneSetting())
	}
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : toDateKeyInTimeZone(value, getCurrentTimeZoneSetting())
	}
	return null
}

// @story [[lucrjournal/fields#^by-date-filter]] Matches valid date filters in the configured timezone and ignores invalid filters
const BY_DATE_FILTER_FN: FilterFn<DomainPersistedEntry<unknown>> = (row, columnId, filterValue) => {
	const normalizedFilterValue = normalizeByDateFilterValue(filterValue)
	if (normalizedFilterValue === null) {
		return true
	}
	return resolveDateFilterKey(row.getValue(columnId)) === normalizedFilterValue
}

BY_DATE_FILTER_FN.autoRemove = (value: unknown) => normalizeByDateFilterValue(value) === null

export function useDomainTable<Schema, TField extends FieldDescriptor<Schema>>(
	fields: readonly TField[],
	entries: DomainPersistedEntry<Schema>[],
	renderers: TableRendererRegistry<TField['type']>,
	context: TableRenderContext,
	options?: {
		initialColumnVisibility?: VisibilityState
		initialPageSize?: number
		initialGlobalFilter?: string
	},
): {
	table: Table<DomainPersistedEntry<Schema>>
	state: DomainTableState
} {
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
		options?.initialColumnVisibility ?? {},
	)
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: options?.initialPageSize ?? 20,
	})
	const [globalFilter, setGlobalFilter] = useState<string>(
		options?.initialGlobalFilter ?? '',
	)

	// Context stored in a ref so column defs don't rebuild on every context change
	const contextRef = useRef(context)
	contextRef.current = context

	const columnHelper = useMemo(
		() => createColumnHelper<DomainPersistedEntry<Schema>>(),
		[],
	)

	const columns = useMemo(() => {
		// @story [[lucrjournal/fields#^column-order]] Preserves descriptor order while selecting table fields
		return fields
			.filter((f) => f.usages.includes('Table'))
			.map((field) => {
				const renderer = renderers[field.type as TField['type']]
				// @story [[lucrjournal/fields#^renderer-dispatch]] Fails closed when a table field type lacks a registered renderer
				if (renderer === undefined) {
					throw new Error(`useDomainTable: no renderer registered for field type "${field.type}" (key: "${field.key}")`)
				}
				const meta = {
					field: field as FieldDescriptor<unknown>,
					tableLayout: field.table,
					align: renderer.align,
				} satisfies { field: FieldDescriptor<unknown>; tableLayout?: FieldDescriptor<unknown>['table']; align: TableRendererAlign }

				// Resolve filterFn
				const filterConfig = field.columnFilter
				let filterFn: FilterFnOption<DomainPersistedEntry<Schema>> | undefined
				let enableColumnFilter = true

				if (filterConfig === undefined || filterConfig === 'none') {
					enableColumnFilter = false
				} else if (typeof filterConfig === 'string') {
					// Cast: FILTER_FN_MAP values are known built-in tanstack filter fn names
					filterFn = (FILTER_FN_MAP[filterConfig] ?? filterConfig) as FilterFnOption<DomainPersistedEntry<Schema>>
				} else {
					const customFn = filterConfig.fn
					const wrappedFn: FilterFn<DomainPersistedEntry<Schema>> = (row, columnId, filterValue) => {
						const value = row.getValue(columnId)
						return customFn(value, filterValue)
					}
					wrappedFn.autoRemove = (val: unknown) => val === undefined || val === null || val === '' || val === 'ALL'
					filterFn = wrappedFn
				}

				// Resolve sortingFn
				// @story [[lucrjournal/fields#^sorting-comparator]] Uses descriptor entry comparators before TanStack value inference
				let sortingFn: SortingFn<DomainPersistedEntry<Schema>> | undefined
				if (field.compareFn !== undefined) {
					const compareFn = field.compareFn
					sortingFn = (rowA, rowB) => compareFn(rowA.original, rowB.original)
				}

				if (field.getValue === undefined) {
					// Display-only column
					return columnHelper.display({
						id: field.key,
						header: field.label,
						enableColumnFilter,
						enableSorting: field.sortable ?? false,
						meta,
						cell: ({ row }) => {
							const ctx = contextRef.current
							return renderer.renderCell(undefined, row.original, field as FieldDescriptor<unknown>, ctx)
						},
					})
				}

				const getValue = field.getValue
				return columnHelper.accessor(
					(entry) => getValue(entry, contextRef.current.app),
					{
						id: field.key,
						header: field.label,
						enableColumnFilter,
						enableSorting: field.sortable ?? false,
						...(filterFn !== undefined ? { filterFn } : {}),
						...(sortingFn !== undefined ? { sortingFn } : {}),
						meta,
						cell: ({ getValue: getCellValue, row }) => {
							const ctx = contextRef.current
							return renderer.renderCell(getCellValue(), row.original, field as FieldDescriptor<unknown>, ctx)
						},
					},
				)
			})
	}, [fields, renderers, columnHelper])

	const searchableFields = useMemo(
		() => fields.filter((field) => field.usages.includes('Table') && field.searchable === true),
		[fields],
	)

	const table = useReactTable({
		data: entries,
		columns,
		filterFns: {
			by_date: BY_DATE_FILTER_FN,
		},
		// @story [[lucrjournal/fields#^filter-conjunction]] Adds global search to TanStack column filtering
		globalFilterFn: (row, _columnId, filterValue) => {
			if (typeof filterValue !== 'string') {
				return true
			}
			return matchesSearchQuery(
				getSearchableFieldValues(row.original, searchableFields, contextRef.current.app),
				filterValue,
			)
		},
		state: { sorting, columnFilters, columnVisibility, pagination, globalFilter },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		onPaginationChange: setPagination,
		onGlobalFilterChange: setGlobalFilter,
		autoResetPageIndex: false,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(), // handles both column filters AND globalFilter in v8
		getPaginationRowModel: getPaginationRowModel(),
		// @story [[lucrjournal/fields#^sorting-comparator]] Delegates stable multi-column sorting to TanStack
		getSortedRowModel: getSortedRowModel(),
	})

	const state = useMemo<DomainTableState>(() => ({
		sorting,
		setSorting,
		columnFilters,
		setColumnFilters,
		columnVisibility,
		setColumnVisibility,
		pagination,
		setPagination,
		globalFilter,
		setGlobalFilter,
	}), [
		sorting,
		columnFilters,
		columnVisibility,
		pagination,
		globalFilter,
	])

	return { table, state }
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('BY_DATE_FILTER_FN', () => {
		// @story [[lucrjournal/fields#^by-date-filter]] Covers configured-timezone calendar date matching
		it('matches datetime strings by calendar date in the configured timezone', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
			expect(BY_DATE_FILTER_FN({
				getValue: () => '2026-04-13T23:30:00-04:00',
			} as never, 'created', '2026-04-14', undefined as never)).toBe(true)
		})

		// @story [[lucrjournal/fields#^by-date-filter]] Covers fail-open removal of empty and invalid date filters
		it('ignores empty or invalid date filter values', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
			expect(BY_DATE_FILTER_FN({
				getValue: () => '2026-04-13T12:00:00+08:00',
			} as never, 'created', '', undefined as never)).toBe(true)
			expect(BY_DATE_FILTER_FN({
				getValue: () => '2026-04-13T12:00:00+08:00',
			} as never, 'created', 'not-a-date', undefined as never)).toBe(true)
		})

		it('returns false when the row date does not match the selected day', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
			expect(BY_DATE_FILTER_FN({
				getValue: () => '2026-04-13T12:00:00+08:00',
			} as never, 'created', '2026-04-12', undefined as never)).toBe(false)
		})
	})
}
