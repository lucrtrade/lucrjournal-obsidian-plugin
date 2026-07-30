import { TFile, type App } from 'obsidian'

import { t } from '../../lang/helpers'
import { parseWikilinkHeading } from '../../utils'
import { AccountDomain } from '../account'
import { defineFields, TABLE_FIELD_DISPLAYS, type FieldDescriptor } from '../core/fields'
import { defineTableFilters, type TableFilterOption } from '../core/table-filters'
import { PositionDomain } from '../position'

import { resolvePositionSymbolModel, type SymbolContractUnitTableValue } from './position-model'

import { type PositionSymbolType, SymbolDomain, type SymbolEntryValue } from './index'

import type { IconDescriptor } from '../core/icon-descriptor'
import type { DomainPersistedEntry, DomainRuntimeApp } from '../core/type'

type SymbolTableRow = {
	lucr_type: 'symbol'
	account: string
	account_label: string
	logo: string | null
	symbol: string
	symbol_wikilink: string
	type: PositionSymbolType | null
	fee_value: number | null
	contract_unit: SymbolContractUnitTableValue
	position_count: number
}

export type SymbolTableFieldDescriptor = FieldDescriptor<SymbolTableRow>

export const symbolTableFilters = defineTableFilters<SymbolTableRow>([
	{
		id: 'account',
		type: 'combobox',
		label: () => t('DASHBOARD_TABLE_FILTER_ACCOUNT'),
		defaultValue: '',
		placeholder: () => t('DASHBOARD_SYMBOLS_FILTER_ACCOUNT_PLACEHOLDER'),
		options: ({ app, entries }) => listSymbolAccountFilterOptions(app, entries),
		columnIds: ['account'],
		toColumnFilters: ({ value, currentFilters }) => value.trim() === ''
			? currentFilters
			: [...currentFilters, { id: 'account', value }],
	},
])

// @story [[lucrjournal/fields#^searchable-field-projections]] Projects symbol names instead of stored wikilinks into global search
// @story [[lucrjournal/fields#^custom-sort-projections]] Defines symbol account fee and contract-unit ordering
// @story [[lucrjournal/fields#^symbol-cell-writeback]] Declares the editable symbol type and special fee and contract-unit displays
export const symbolTableFields = defineFields<SymbolTableRow>([
	{
		key: 'account',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_TABLE_ACCOUNT'),
		getValue: (entry) => entry.fm.account,
		columnFilter: 'equals',
		sortable: true,
		compareFn: (left, right) => left.fm.account_label.localeCompare(right.fm.account_label),
		table: { width: '3xl', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.accountInline },
	},
	{
		key: 'symbol',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_TABLE_SYMBOL'),
		searchable: true,
		getValue: (entry) => entry.fm.symbol_wikilink,
		searchValue: (entry) => entry.fm.symbol,
		columnFilter: 'none',
		sortable: true,
		table: { width: 'xl', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.positionSymbol, openSourceFile: true },
	},
	{
		key: 'type',
		usages: ['Table'],
		type: 'enum',
		label: () => t('DASHBOARD_SYMBOLS_TABLE_TYPE'),
		getValue: (entry) => entry.fm.type ?? null,
		columnFilter: 'none',
		sortable: true,
		options: SymbolDomain.typeOptions(),
		table: { width: 'lg', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.enumBadgeSide },
		writeback: { field: 'type', type: 'enum', editable: true },
	},
	{
		key: 'fee',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_SYMBOLS_TABLE_FEE'),
		getValue: (entry) => entry.fm,
		columnFilter: 'none',
		sortable: true,
		compareFn: (left, right) => {
			const leftDisplay = left.fm.fee_value ?? -1
			const rightDisplay = right.fm.fee_value ?? -1
			return leftDisplay - rightDisplay
		},
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.editableFeeModel },
	},
	{
		key: 'contract_unit',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_SYMBOLS_TABLE_CONTRACT_UNIT'),
		getValue: (entry) => entry.fm.contract_unit,
		columnFilter: 'none',
		sortable: true,
		compareFn: (left, right) => (left.fm.contract_unit.value ?? -1) - (right.fm.contract_unit.value ?? -1),
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.editableContractUnit },
	},
	{
		key: 'position_count',
		usages: ['Table'],
		type: 'number',
		label: () => t('DASHBOARD_SYMBOLS_TABLE_POSITION_COUNT'),
		getValue: (entry) => entry.fm.position_count,
		columnFilter: 'range',
		sortable: true,
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.linkedPositionCount },
	},
	{
		key: 'actions',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_ENTRY_COLUMN_ACTIONS'),
		columnFilter: 'none',
		sortable: false,
		table: { width: 'action', display: TABLE_FIELD_DISPLAYS.rowActions },
	},
] as SymbolTableFieldDescriptor[])

export function listSymbolTableEntries(
	app: App,
): Array<DomainPersistedEntry<SymbolTableRow> & { file: TFile }> {
	const positionCountBySymbolWikilink = new Map<string, number>()

	for (const positionEntry of PositionDomain.totalEntries(app)) {
		const symbolWikilink = positionEntry.fm.symbol
		if (typeof symbolWikilink !== 'string') {
			continue
		}

		positionCountBySymbolWikilink.set(
			symbolWikilink,
			(positionCountBySymbolWikilink.get(symbolWikilink) ?? 0) + 1,
		)
	}

	return SymbolDomain.totalEntries(app)
		.filter((entry): entry is DomainPersistedEntry<SymbolEntryValue> & { file: TFile } => entry.file instanceof TFile)
		.map((entry) => {
			const symbolWikilink = `[[${entry.file.basename}]]`
			return {
				file: entry.file,
				fm: {
					lucr_type: 'symbol',
					account: entry.fm.account,
					account_label: resolveSymbolAccountLabel(app, entry.fm.account),
					logo: entry.fm.logo ?? null,
					symbol: entry.fm.name,
					symbol_wikilink: symbolWikilink,
					type: entry.fm.type ?? null,
					fee_value: entry.fm.fee_value ?? null,
					contract_unit: resolvePositionSymbolModel(entry.fm.type ?? null)
						.resolveContractUnitTableValue(entry.fm.name, entry.fm.contract_unit),
					position_count: positionCountBySymbolWikilink.get(symbolWikilink) ?? 0,
				},
			}
		})
}

function listSymbolAccountFilterOptions(
	app: DomainRuntimeApp,
	entries: DomainPersistedEntry<SymbolTableRow>[],
): TableFilterOption[] {
	const uniqueOptions = new Map<string, TableFilterOption>()

	for (const entry of entries) {
		if (!uniqueOptions.has(entry.fm.account)) {
			uniqueOptions.set(entry.fm.account, {
				value: entry.fm.account,
				label: () => entry.fm.account_label,
				icon: resolveSymbolAccountFilterIcon(app, entry.fm.account),
				keywords: [entry.fm.account_label, entry.fm.account],
			})
		}
	}

	return [...uniqueOptions.values()].sort((left, right) => left.label().localeCompare(right.label()))
}

function resolveSymbolAccountLabel(
	app: App,
	accountWikilink: string,
): string {
	const accountLinkpath = parseWikilinkHeading(accountWikilink)?.linkpath
	if (accountLinkpath == null) {
		return accountWikilink
	}

	const accountEntry = AccountDomain.totalEntries(app)
		.find((entry) => entry.file instanceof TFile && entry.file.basename === accountLinkpath)
	return accountEntry == null
		? accountLinkpath.replace(/^ACC-/, '')
		: AccountDomain.toDisplayName(accountEntry.fm)
}

const SYMBOL_ACCOUNT_FALLBACK_ICON = AccountDomain.resolveIcon()

function resolveSymbolAccountFilterIcon(
	app: DomainRuntimeApp,
	accountWikilink: string,
): IconDescriptor {
	const accountLinkpath = parseWikilinkHeading(accountWikilink)?.linkpath
	if (accountLinkpath == null) {
		return SYMBOL_ACCOUNT_FALLBACK_ICON
	}

	const accountEntry = AccountDomain.totalEntries(app)
		.find((entry) => entry.file instanceof TFile && entry.file.basename === accountLinkpath)
	if (accountEntry == null) {
		return SYMBOL_ACCOUNT_FALLBACK_ICON
	}

	return AccountDomain.resolveDisplayIcon(app, accountEntry.fm)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('symbol table fields', () => {
		it('opens the symbol source file from the Symbol cell', () => {
			const field = symbolTableFields.find((item) => item.key === 'symbol') as {
				table?: { openSourceFile?: boolean }
			} | undefined
			expect(field?.table?.openSourceFile).toBe(true)
		})

		it('marks Position Count as the symbol positions jump target', () => {
			const field = symbolTableFields.find((item) => item.key === 'position_count') as {
				table?: { display?: string }
			} | undefined
			expect(field?.table?.display).toBe('linked-position-count')
		})

		it('keeps the Type badge inside its table column', () => {
			const field = symbolTableFields.find((item) => item.key === 'type')
			expect(field?.table).toMatchObject({ width: 'lg', cellOverflow: 'clip' })
		})
	})
}
