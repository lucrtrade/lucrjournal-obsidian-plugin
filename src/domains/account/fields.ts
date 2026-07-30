import { TFile, type App } from 'obsidian'

import { t } from '../../lang/helpers'
import { parseWikilinkHeading } from '../../utils'
import { defineFields, TABLE_FIELD_DISPLAYS, type FieldDescriptor } from '../core/fields'
import { derivePositionAccountWikilink, PositionDomain } from '../position'
import { SymbolDomain } from '../symbol'

import { AccountDomain } from './index'

import type { DomainPersistedEntry } from '../core/type'

type AccountSettingsTableRow = {
	lucr_type: 'account'
	account_wikilink: string
	display_name: string
	platform_name: string | null
	symbol_count: number
	position_count: number
}

export type AccountSettingsTableFieldDescriptor = FieldDescriptor<AccountSettingsTableRow>

// @story [[lucrjournal/fields#^searchable-field-projections]] Defines searchable account platform and display name fields
// @story [[lucrjournal/fields#^custom-sort-projections]] Defines locale ordering for account platform and display name
export const accountSettingsTableFields = defineFields<AccountSettingsTableRow>([
	{
		key: 'platform_name',
		usages: ['Table'],
		type: 'text',
		label: () => t('NEW_ACCOUNT_PLATFORM_LABEL'),
		searchable: true,
		getValue: (entry) => entry.fm.platform_name,
		columnFilter: 'none',
		sortable: true,
		compareFn: (left, right) => (left.fm.platform_name ?? '').localeCompare(right.fm.platform_name ?? ''),
		table: { width: 'xl', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.platformInline },
	},
	{
		key: 'display_name',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_SETTINGS_ACCOUNT_NAME_LABEL'),
		searchable: true,
		getValue: (entry) => entry.fm.display_name,
		columnFilter: 'none',
		sortable: true,
		compareFn: (left, right) => left.fm.display_name.localeCompare(right.fm.display_name),
		table: { width: 'fill', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.editableAccountName, openSourceFile: true },
	},
	{
		key: 'symbol_count',
		usages: ['Table'],
		type: 'number',
		label: () => t('DASHBOARD_SETTINGS_ACCOUNT_SYMBOLS_COUNT'),
		getValue: (entry) => entry.fm.symbol_count,
		columnFilter: 'range',
		sortable: true,
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.linkedSymbolCount },
	},
	{
		key: 'position_count',
		usages: ['Table'],
		type: 'number',
		label: () => t('DASHBOARD_SETTINGS_ACCOUNT_POSITIONS_COUNT'),
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
] as AccountSettingsTableFieldDescriptor[])

// @story [[lucrjournal/account-platform#^account-relation-counts]] Aggregates linked symbols and positions by exact account basename
export function listAccountTableEntries(
	app: App,
): Array<DomainPersistedEntry<AccountSettingsTableRow> & { file: TFile }> {
	const symbolCountByAccount = new Map<string, number>()
	const positionCountByAccount = new Map<string, number>()

	for (const symbolEntry of SymbolDomain.totalEntries(app)) {
		const accountBasename = parseWikilinkHeading(symbolEntry.fm.account)?.linkpath
		if (accountBasename == null) {
			continue
		}
		symbolCountByAccount.set(accountBasename, (symbolCountByAccount.get(accountBasename) ?? 0) + 1)
	}

	for (const positionEntry of PositionDomain.totalEntries(app)) {
		const accountWikilink = derivePositionAccountWikilink(app, positionEntry.fm)
		const accountBasename = accountWikilink == null
			? null
			: parseWikilinkHeading(accountWikilink)?.linkpath
		if (accountBasename == null) {
			continue
		}
		positionCountByAccount.set(accountBasename, (positionCountByAccount.get(accountBasename) ?? 0) + 1)
	}

	return AccountDomain.totalEntries(app)
		.filter((entry): entry is typeof entry & { file: TFile } => entry.file instanceof TFile)
		.map((entry) => ({
			file: entry.file,
			fm: {
				lucr_type: 'account',
				account_wikilink: `[[${entry.file.basename}]]`,
				display_name: AccountDomain.toDisplayName(entry.fm),
				platform_name: AccountDomain.toPlatformName(entry.fm),
				symbol_count: symbolCountByAccount.get(entry.file.basename) ?? 0,
				position_count: positionCountByAccount.get(entry.file.basename) ?? 0,
			},
		}))
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('account settings table fields', () => {
		it('does not expose removed fee settings', () => {
			expect(accountSettingsTableFields.map((item) => item.key)).toEqual([
				'platform_name',
				'display_name',
				'symbol_count',
				'position_count',
				'actions',
			])
		})

		it('opens the account source file from the Account Name cell', () => {
			const field = accountSettingsTableFields.find((item) => item.key === 'display_name') as {
				table?: { openSourceFile?: boolean }
			} | undefined
			expect(field?.table?.openSourceFile).toBe(true)
		})

		it('marks Positions as the linked positions jump target', () => {
			const field = accountSettingsTableFields.find((item) => item.key === 'position_count') as {
				table?: { display?: string }
			} | undefined
			expect(field?.table?.display).toBe('linked-position-count')
		})

		it('marks Symbols as the linked symbols jump target', () => {
			const field = accountSettingsTableFields.find((item) => item.key === 'symbol_count') as {
				table?: { display?: string }
			} | undefined
			expect(field?.table?.display).toBe('linked-symbol-count')
		})
	})
}
