/// <reference types="vitest/importMeta" />

import type { CriteriaOption } from '../criteria'
import type { SelectOption } from './form'
import type { IconDescriptor } from './icon-descriptor'
import type { TagOption } from './tags'
import type { DomainPersistedEntry, DomainRuntimeApp } from './type'

type Usage = 'Table' | 'Single' | 'Card'

interface BaseFieldTypeRegistry {
	title: true
	text: true
	number: true
	enum: true
	datetime: true
	wikilink: true
	'wikilink-array': true
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface FieldTypeRegistry extends BaseFieldTypeRegistry {}

export type BaseFieldType = keyof BaseFieldTypeRegistry
export type FieldType = keyof FieldTypeRegistry

interface WikilinkValue {
	name: string
	link: string
	icon?: IconDescriptor
	type?: string
}

type FieldTagOptionResolver<Schema> = (
	app: DomainRuntimeApp,
	entry: DomainPersistedEntry<Schema>,
) => TagOption[]

type FieldCriteriaOptionResolver<Schema> = (
	app: DomainRuntimeApp,
	entry: DomainPersistedEntry<Schema>,
) => CriteriaOption[]

export interface TitleFieldValue {
	title: string
	icon?: IconDescriptor | string | null
	source?: string | null
}

type ColumnFilterConfig =
  | 'equals'
  | 'by_date'
  | 'includes'
  | 'range'
  | 'none'
  | { fn: (value: unknown, filterValue: unknown) => boolean }

export type TableColumnWidth =
	| 'fill'
	| 'fill-secondary'
	| 'icon'
	| 'action'
	| 'xs'
	| 'sm'
	| 'md'
	| 'lg'
	| 'xl'
	| '2xl'
	| '3xl'
	| '4xl'
	| '5xl'
	| '6xl'
	| '7xl'

export const TABLE_FIELD_DISPLAYS = {
	relativeDatetime: 'relative-datetime',
	statusDot: 'status-dot',
	positionSymbol: 'position-symbol',
	accountInline: 'account-inline',
	platformInline: 'platform-inline',
	enumBadgeProminent: 'enum-badge-prominent',
	enumBadgeSide: 'enum-badge-side',
	confidenceRing: 'confidence-ring',
	editableProfitCurrency: 'editable-profit-currency',
	editableValue: 'editable-value',
	editableNumber: 'editable-number',
	editableAccountName: 'editable-account-name',
	editableFeeModel: 'editable-fee-model',
	editableContractUnit: 'editable-contract-unit',
	editableCurrency: 'editable-currency',
	editableDescription: 'editable-description',
	sourcePreview: 'source-preview',
	tagList: 'tag-list',
	percentage: 'percentage',
	currency: 'currency',
	profitCurrency: 'profit-currency',
	linkedPositionCount: 'linked-position-count',
	linkedSymbolCount: 'linked-symbol-count',
	rowActions: 'row-actions',
	linkedPlaybooks: 'linked-playbooks',
	linkedGroups: 'linked-groups',
} as const

type TableFieldDisplay = typeof TABLE_FIELD_DISPLAYS[keyof typeof TABLE_FIELD_DISPLAYS]

export interface TableFieldLayout {
	width?: TableColumnWidth
	cellOverflow?: 'clip' | 'visible'
	display?: TableFieldDisplay
	openSourceFile?: boolean
}

interface FieldWriteback {
	field: string
	type: 'text' | 'number' | 'enum' | 'datetime' | 'wikilink' | 'wikilink-array'
	editable: boolean
}

export interface FieldDescriptor<Schema> {
	key: string
	usages: Usage[]
	type: FieldType
	label: () => string
	getValue?: (entry: DomainPersistedEntry<Schema>, app?: DomainRuntimeApp) => unknown
	searchable?: boolean
	searchValue?: (entry: DomainPersistedEntry<Schema>, app?: DomainRuntimeApp) => unknown
	options?: SelectOption[]
	sortable?: boolean
	compareFn?: (
		a: DomainPersistedEntry<Schema>,
		b: DomainPersistedEntry<Schema>,
	) => number
	table?: TableFieldLayout
	columnFilter?: ColumnFilterConfig
	/** When true, the field is display-only and writeback is suppressed even if `writeback` is defined. */
	readonly?: boolean
	writeback?: FieldWriteback
	wikilinkOptions?: (app: DomainRuntimeApp) => WikilinkValue[]
	tagOptions?: TagOption[]
	dynamicTagOptions?: FieldTagOptionResolver<Schema>
	criteriaOptions?: CriteriaOption[]
	dynamicCriteriaOptions?: FieldCriteriaOptionResolver<Schema>
}

export function defineFields<Schema>(
	fields: FieldDescriptor<Schema>[],
): FieldDescriptor<Schema>[] {
	return fields
}

// --- in-source tests ---
if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('defineFields', () => {
		it('returns the same array (identity helper)', () => {
			const fields = defineFields<{ name: string | null }>([
				{
					key: 'name',
					usages: ['Table'],
					type: 'text',
					label: () => 'NAME',
					getValue: (entry) => entry.fm.name,
				},
			])
			expect(fields).toHaveLength(1)
			expect(fields[0]!.key).toBe('name')
		})

		it('field without getValue is valid (display-only)', () => {
			const fields = defineFields<{ status: string | null }>([
				{
					key: 'status',
					usages: ['Table'],
					type: 'text',
					label: () => 'STATUS',
				},
			])
			expect(fields[0]!.getValue).toBeUndefined()
		})

		it('field can appear in multiple usages', () => {
			const fields = defineFields<{ profit: number | null }>([
				{
					key: 'profit',
					usages: ['Table', 'Single'],
					type: 'number',
					label: () => 'PROFIT',
					getValue: (entry) => entry.fm.profit,
					table: { width: 'sm', cellOverflow: 'clip' },
					writeback: { field: 'profit', type: 'number', editable: true },
				},
			])
			expect(fields[0]!.usages).toContain('Table')
			expect(fields[0]!.usages).toContain('Single')
			expect(fields[0]!.table).toEqual({ width: 'sm', cellOverflow: 'clip' })
		})
	})
}
