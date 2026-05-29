import type { IconDescriptor } from './icon-descriptor'
import type { DomainPersistedEntry, DomainRuntimeApp } from './type'
import type { ColumnFiltersState } from '@tanstack/react-table'

export type TableFilterOption = {
	value: string
	label: () => string
	icon?: string | IconDescriptor
	keywords?: string[]
	metaLabel?: () => string
	metaIcon?: string | IconDescriptor
}

type TableFilterOptionResolver<Schema> = (context: {
	app: DomainRuntimeApp
	entries: DomainPersistedEntry<Schema>[]
	state: Record<string, string>
}) => TableFilterOption[]

type TableFilterBase<Schema, TId extends string, TType extends string> = {
	id: TId
	type: TType
	label: () => string
	defaultValue: string
	placeholder?: () => string
	options?: TableFilterOption[] | TableFilterOptionResolver<Schema>
	columnIds?: readonly string[]
	toColumnFilters?: (context: {
		value: string
		currentFilters: ColumnFiltersState
		app: DomainRuntimeApp
		entries: DomainPersistedEntry<Schema>[]
		state: Record<string, string>
	}) => ColumnFiltersState
	matchesEntry?: (context: {
		value: string
		entry: DomainPersistedEntry<Schema>
		app: DomainRuntimeApp
		entries: DomainPersistedEntry<Schema>[]
		state: Record<string, string>
	}) => boolean
}

export type TableFilterDefinition<Schema, TId extends string = string> =
	| TableFilterBase<Schema, TId, 'segmented'>
	| TableFilterBase<Schema, TId, 'select'>
	| TableFilterBase<Schema, TId, 'combobox'>
	| TableFilterBase<Schema, TId, 'date'>

export type TableFilterState = Record<string, string>

export function defineTableFilters<Schema>(
	definitions: readonly TableFilterDefinition<Schema, string>[],
): readonly TableFilterDefinition<Schema, string>[] {
	return definitions
}

export function createDefaultTableFilterState<Schema>(
	definitions: readonly TableFilterDefinition<Schema, string>[],
): TableFilterState {
	return Object.fromEntries(
		definitions.map((definition) => [definition.id, definition.defaultValue]),
	)
}

export function resolveTableFilterOptions<Schema>(
	definition: TableFilterDefinition<Schema>,
	context: {
		app: DomainRuntimeApp
		entries: DomainPersistedEntry<Schema>[]
		state: Record<string, string>
	},
): TableFilterOption[] {
	if (definition.options === undefined) {
		return []
	}
	return typeof definition.options === 'function'
		? definition.options(context)
		: definition.options
}

export function applyTableFilterState<Schema>(
	params: {
		definitions: readonly TableFilterDefinition<Schema>[]
		state: Record<string, string>
		currentColumnFilters: ColumnFiltersState
		entries: DomainPersistedEntry<Schema>[]
		app: DomainRuntimeApp
	},
): {
	columnFilters: ColumnFiltersState
	entries: DomainPersistedEntry<Schema>[]
} {
	const { definitions, state, currentColumnFilters, entries, app } = params

	const nextColumnFilters = definitions.reduce<ColumnFiltersState>((filters, definition) => {
		if (definition.toColumnFilters === undefined) {
			return filters
		}

		const managedColumnIds = definition.columnIds
		const filtersWithoutManagedIds = managedColumnIds === undefined
			? filters
			: filters.filter((item) => !managedColumnIds.includes(item.id))

		return definition.toColumnFilters({
			value: state[definition.id] ?? definition.defaultValue,
			currentFilters: filtersWithoutManagedIds,
			app,
			entries,
			state,
		})
	}, currentColumnFilters)

	const filteredEntries = definitions.reduce<DomainPersistedEntry<Schema>[]>((currentEntries, definition) => {
		if (definition.matchesEntry === undefined) {
			return currentEntries
		}

		const value = state[definition.id] ?? definition.defaultValue
		if (value === definition.defaultValue) {
			return currentEntries
		}

		return currentEntries.filter((entry) => definition.matchesEntry?.({
			value,
			entry,
			app,
			entries,
			state,
		}) ?? true)
	}, entries)

	return {
		columnFilters: nextColumnFilters,
		entries: filteredEntries,
	}
}
