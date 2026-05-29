/// <reference types="vitest/importMeta" />

import { TFile } from 'obsidian'

import { resolveHomepageFaviconUrl } from '../../icon/homepage-favicon'
import { t } from '../../lang/helpers'
import { getFileBasename, getPersistedEntryDisplayName, parseWikilinkHeading } from '../../utils'
import { AccountDomain } from '../account'
import { ConfluenceDomain } from '../analysis/confluence'
import { KeyLevelDomain } from '../analysis/key-level'
import { MarketAnalysisDomain } from '../analysis/market-analysis'
import { defineFields, TABLE_FIELD_DISPLAYS, type FieldDescriptor } from '../core/fields'
import { resolveIconDescriptor, type IconDescriptor } from '../core/icon-descriptor'
import { defineTableFilters, resolveTableFilterOptions, type TableFilterOption } from '../core/table-filters'
import { NewsDomain, resolveNewsTitleIcon } from '../news'
import { PlaybookDomain } from '../playbook'
import { resolveSymbolLogo, SymbolDomain } from '../symbol'
import { toSymbolLogoIconDescriptor } from '../symbol/catalog'

import { derivePositionAccountWikilink, derivePositionPlatformWikilink, PositionDomain } from './index'

import type { Position } from './index'
import type { DomainPersistedEntry, DomainRuntimeApp } from '../core/type'

export type PositionTableFieldDescriptor = FieldDescriptor<Position>
type PositionLinkedFilterScope = 'playbook' | 'news' | 'analysis'
type PositionFieldKey = Extract<keyof Position, string>
type PositionFieldWritebackType = NonNullable<PositionTableFieldDescriptor['writeback']>['type']
type SymbolFilterOption = TableFilterOption & {
	accountIcon: NonNullable<TableFilterOption['metaIcon']>
	accountLabel: string
}

export const positionTableFilters = defineTableFilters<Position>([
	{
		id: 'status',
		type: 'segmented',
		label: () => t('DASHBOARD_TABLE_FILTER_STATUS'),
		defaultValue: 'ALL',
		options: [
			{ value: 'ALL', label: () => t('DASHBOARD_TABLE_FILTER_STATUS_ALL') },
			{ value: 'WIN', label: () => t('DASHBOARD_TABLE_FILTER_STATUS_WIN') },
			{ value: 'LOSS', label: () => t('DASHBOARD_TABLE_FILTER_STATUS_LOSS') },
			{ value: 'OPEN', label: () => t('DASHBOARD_TABLE_FILTER_STATUS_OPEN') },
		],
		columnIds: ['status', 'profit'],
		toColumnFilters: ({ value, currentFilters }) => {
			if (value === 'OPEN') {
				return [...currentFilters, { id: 'status', value: 'open' }]
			}
			if (value === 'WIN') {
				return [...currentFilters, { id: 'status', value: 'close' }, { id: 'profit', value: [0.01, Infinity] }]
			}
			if (value === 'LOSS') {
				return [...currentFilters, { id: 'status', value: 'close' }, { id: 'profit', value: [-Infinity, 0] }]
			}
			return currentFilters
		},
	},
	{
		id: 'side',
		type: 'segmented',
		label: () => t('DASHBOARD_TABLE_FILTER_SIDE'),
		defaultValue: 'ALL',
		options: [
			{ value: 'ALL', label: () => t('DASHBOARD_TABLE_FILTER_SIDE_ALL') },
			{ value: 'LONG', label: () => t('DASHBOARD_TABLE_FILTER_SIDE_LONG') },
			{ value: 'SHORT', label: () => t('DASHBOARD_TABLE_FILTER_SIDE_SHORT') },
		],
		columnIds: ['side'],
		toColumnFilters: ({ value, currentFilters }) => value === 'ALL'
			? currentFilters
			: [...currentFilters, { id: 'side', value }],
	},
	{
		id: 'confidence',
		type: 'segmented',
		label: () => t('DASHBOARD_TABLE_FILTER_CONFIDENCE'),
		defaultValue: 'ALL',
		options: [
			{ value: 'ALL', label: () => t('DASHBOARD_TABLE_FILTER_CONFIDENCE_ALL') },
			{ value: 'HIGH', label: () => t('DASHBOARD_TABLE_FILTER_CONFIDENCE_HIGH') },
			{ value: 'MEDIUM', label: () => t('DASHBOARD_TABLE_FILTER_CONFIDENCE_MEDIUM') },
			{ value: 'LOW', label: () => t('DASHBOARD_TABLE_FILTER_CONFIDENCE_LOW') },
		],
		columnIds: ['confidence'],
		toColumnFilters: ({ value, currentFilters }) => value === 'ALL'
			? currentFilters
			: [...currentFilters, { id: 'confidence', value }],
	},
	{
		id: 'account',
		type: 'combobox',
		label: () => t('DASHBOARD_TABLE_FILTER_ACCOUNT'),
		defaultValue: '',
		placeholder: () => t('DASHBOARD_TABLE_FILTER_ACCOUNT_PLACEHOLDER'),
		options: ({ app, entries }) => listPositionAccountFilterOptions(app, entries),
		columnIds: ['account'],
		toColumnFilters: ({ value, currentFilters }) => value.trim() === ''
			? currentFilters
			: [...currentFilters, { id: 'account', value }],
	},
	{
		id: 'symbol',
		type: 'combobox',
		label: () => t('DASHBOARD_TABLE_FILTER_SYMBOL'),
		defaultValue: '',
		placeholder: () => t('DASHBOARD_POSITIONS_SEARCH_SYMBOL_PLACEHOLDER'),
		options: ({ app, entries, state }) => listPositionSymbolFilterOptions(app, entries, state.account ?? ''),
		columnIds: ['symbol'],
		toColumnFilters: ({ value, currentFilters }) => value.trim() === ''
			? currentFilters
			: [...currentFilters, { id: 'symbol', value }],
	},
	{
		id: 'linkedPlaybook',
		type: 'select',
		label: () => t('DASHBOARD_TABLE_FILTER_PLAYBOOK'),
		defaultValue: '',
		placeholder: () => t('DASHBOARD_TABLE_FILTER_PLAYBOOK_PLACEHOLDER'),
		options: ({ app }) => listPositionLinkedFilterOptions(app, 'playbook'),
		matchesEntry: ({ value, entry, app }) => hasResolvedLinkedEntry(entry, app, value),
	},
	{
		id: 'linkedNews',
		type: 'select',
		label: () => t('DASHBOARD_TABLE_FILTER_NEWS'),
		defaultValue: '',
		placeholder: () => t('DASHBOARD_TABLE_FILTER_NEWS_PLACEHOLDER'),
		options: ({ app }) => listPositionLinkedFilterOptions(app, 'news'),
		matchesEntry: ({ value, entry, app }) => hasResolvedLinkedEntry(entry, app, value),
	},
	{
		id: 'linkedAnalysis',
		type: 'select',
		label: () => t('DASHBOARD_TABLE_FILTER_ANALYSIS'),
		defaultValue: '',
		placeholder: () => t('DASHBOARD_TABLE_FILTER_ANALYSIS_PLACEHOLDER'),
		options: ({ app }) => listPositionLinkedFilterOptions(app, 'analysis'),
		matchesEntry: ({ value, entry, app }) => hasResolvedLinkedEntry(entry, app, value),
	},
])

function positionFmField(
	key: PositionFieldKey,
	field: Omit<PositionTableFieldDescriptor, 'key' | 'getValue'>,
): PositionTableFieldDescriptor {
	return { key, getValue: (entry) => entry.fm[key] ?? null, ...field }
}

function writeback(field: PositionFieldKey, type: PositionFieldWritebackType) {
	return { field, type, editable: true }
}

export const positionFields = defineFields<Position>([
	{
		key: 'status',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_TABLE_STATUS_ABBR'),
		getValue: (entry) =>
			entry.fm.closed_at != null || entry.fm.status === 'close' ? 'close' : 'open',
		columnFilter: 'equals',
		sortable: false,
		table: { width: 'icon', display: TABLE_FIELD_DISPLAYS.statusDot },
	},
	{
		key: 'account',
		usages: ['Table', 'Single'],
		type: 'text',
		label: () => t('DASHBOARD_TABLE_ACCOUNT'),
		getValue: (entry, app) => app == null ? null : derivePositionAccountWikilink(app, entry.fm),
		searchable: true,
		searchValue: (entry, app) => app == null
			? null
			: [derivePositionAccountWikilink(app, entry.fm), derivePositionPlatformWikilink(app, entry.fm)],
		columnFilter: 'equals',
		sortable: true,
		table: { width: '3xl', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.accountInline },
	},
	positionFmField('symbol', {
		usages: ['Table', 'Single', 'Card'],
		type: 'text',
		label: () => t('DASHBOARD_TABLE_SYMBOL'),
		searchable: true,
		columnFilter: 'equals',
		sortable: true,
		table: { width: 'xl', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.positionSymbol },
	}),
	positionFmField('profit', {
		usages: ['Table', 'Single'],
		type: 'number',
		label: () => t('DASHBOARD_TABLE_PROFIT'),
		columnFilter: 'range',
		sortable: true,
		table: { width: 'sm', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.editableProfitCurrency },
		writeback: writeback('profit', 'number'),
	}),
	positionFmField('side', {
		usages: ['Table', 'Single'],
		type: 'enum',
		label: () => t('DASHBOARD_TABLE_SIDE'),
		columnFilter: 'equals',
		sortable: true,
		options: PositionDomain.sideOptions(),
		table: { width: 'xs', display: TABLE_FIELD_DISPLAYS.enumBadgeSide },
	}),
	positionFmField('confidence', {
		usages: ['Table', 'Single'],
		type: 'enum',
		label: () => t('DASHBOARD_TABLE_CONFIDENCE'),
		columnFilter: {
			fn: (value, filterValue) => {
				if (filterValue == null || filterValue === '' || filterValue === 'ALL') {
					return true
				}
				if (value == null) {
					return false 
				}
				if (filterValue === 'HIGH') {
					return Number(value) >= 4 
				}
				if (filterValue === 'MEDIUM') {
					return Number(value) === 3 
				}
				if (filterValue === 'LOW') {
					return Number(value) <= 2 
				}
				return Number(value) === Number(filterValue)
			},
		},
		sortable: true,
		options: PositionDomain.confidenceOptions(),
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.confidenceRing },
		writeback: writeback('confidence', 'enum'),
	}),
	positionFmField('notional_value', {
		usages: ['Single'],
		type: 'number',
		label: () => t('DASHBOARD_TABLE_NOTIONAL_VALUE'),
		columnFilter: 'range',
		sortable: true,
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.editableValue },
		writeback: writeback('notional_value', 'number'),
	}),
	positionFmField('risk', {
		usages: ['Table', 'Single'],
		type: 'number',
		label: () => t('DASHBOARD_TABLE_RISK'),
		columnFilter: 'range',
		sortable: true,
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.currency },
	}),
	positionFmField('opened_at', {
		usages: ['Table', 'Single'],
		type: 'datetime',
		label: () => t('DASHBOARD_TABLE_OPENED_AT'),
		columnFilter: 'by_date',
		sortable: true,
		table: { width: 'lg', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.relativeDatetime },
		writeback: writeback('opened_at', 'datetime'),
	}),
	{
		key: 'playbooks',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_TABLE_PLAYBOOKS'),
		columnFilter: 'none',
		sortable: false,
		table: { width: '2xl', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.linkedPlaybooks },
		wikilinkOptions: (app) =>
			PlaybookDomain.totalEntries(app).map((e) => ({
				name: getFileBasename(e.file),
				link: `[[${getFileBasename(e.file)}]]`,
			})),
	},
	{
		key: 'analyses',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_TABLE_ANALYSES'),
		columnFilter: 'none',
		sortable: false,
		table: { width: '7xl', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.linkedGroups },
		wikilinkOptions: (app) => [
			...NewsDomain.totalEntries(app).map((e) => ({
				name: getFileBasename(e.file),
				link: `[[${getFileBasename(e.file)}]]`,
				type: 'news',
			})),
			...KeyLevelDomain.totalEntries(app).map((e) => ({
				name: getFileBasename(e.file),
				link: `[[${getFileBasename(e.file)}]]`,
				type: 'key-level',
			})),
			...ConfluenceDomain.totalEntries(app).map((e) => ({
				name: getFileBasename(e.file),
				link: `[[${getFileBasename(e.file)}]]`,
				type: 'confluence',
			})),
			...MarketAnalysisDomain.totalEntries(app).map((e) => ({
				name: getFileBasename(e.file),
				link: `[[${getFileBasename(e.file)}]]`,
				type: 'market-analysis',
			})),
		],
	},
] as PositionTableFieldDescriptor[])

function listPositionSymbolFilterOptions(
	app: DomainRuntimeApp,
	entries: DomainPersistedEntry<Position>[],
	accountWikilink: string,
): TableFilterOption[] {
	const selectedAccountWikilink = accountWikilink.trim()
	const counts = entries.reduce((map, entry) => {
		const symbolWikilink = entry.fm.symbol
		if (symbolWikilink == null) {
			return map
		}
		if (selectedAccountWikilink !== '' && derivePositionAccountWikilink(app, entry.fm) !== selectedAccountWikilink) {
			return map
		}

		map.set(symbolWikilink, (map.get(symbolWikilink) ?? 0) + 1)
		return map
	}, new Map<string, number>())

	const options = [...counts.entries()]
		.flatMap(([symbolWikilink, count]) => {
			const symbolEntry = SymbolDomain.resolveEntry(app, symbolWikilink)
			if (symbolEntry === null) {
				return []
			}
			const symbolName = symbolEntry.fm.name
			const accountOption = resolveSymbolFilterAccountOption(app, symbolEntry.fm.account)

			return [{
				value: symbolWikilink,
				label: () => symbolName,
				icon: toSymbolLogoIconDescriptor(resolveSymbolLogo(app, symbolWikilink)),
				keywords: [symbolName, symbolWikilink, accountOption.label, String(count)],
				accountIcon: accountOption.icon,
				accountLabel: accountOption.label,
			} satisfies SymbolFilterOption]
		})
	const nameCounts = options.reduce((map, option) => {
		const symbolName = option.label()
		map.set(symbolName, (map.get(symbolName) ?? 0) + 1)
		return map
	}, new Map<string, number>())

	return options
		.map((option) => ({
			...option,
			metaLabel: selectedAccountWikilink === '' && (nameCounts.get(option.label()) ?? 0) > 1
				? () => option.accountLabel
				: undefined,
			metaIcon: selectedAccountWikilink === '' && (nameCounts.get(option.label()) ?? 0) > 1
				? option.accountIcon
				: undefined,
		}))
		.sort(compareSymbolFilterOptions)
}

function resolveSymbolFilterAccountOption(app: DomainRuntimeApp, accountWikilink: string): {
	icon: NonNullable<TableFilterOption['metaIcon']>
	label: string
} {
	const accountEntry = AccountDomain.findByWikilink(app, accountWikilink)
	if (accountEntry !== undefined) {
		return {
			icon: AccountDomain.resolveDisplayIcon(app, accountEntry.fm),
			label: AccountDomain.toDisplayName(accountEntry.fm),
		}
	}

	return {
		icon: AccountDomain.resolveIcon(),
		label: parseWikilinkHeading(accountWikilink)?.linkpath?.replace(/^ACC-/, '') ?? accountWikilink,
	}
}

function compareSymbolFilterOptions(left: TableFilterOption, right: TableFilterOption) {
	const labelCompare = left.label().localeCompare(right.label())
	if (labelCompare !== 0) {
		return labelCompare
	}
	return (left.metaLabel?.() ?? '').localeCompare(right.metaLabel?.() ?? '')
}

function listPositionAccountFilterOptions(
	app: DomainRuntimeApp,
	entries: DomainPersistedEntry<Position>[],
): TableFilterOption[] {
	const uniqueOptions = new Map<string, TableFilterOption>()

	for (const entry of entries) {
		const accountWikilink = derivePositionAccountWikilink(app, entry.fm)
		if (accountWikilink === null || uniqueOptions.has(accountWikilink)) {
			continue
		}

		const accountEntry = AccountDomain.findByWikilink(app, accountWikilink)
		const fallbackLabel = parseWikilinkHeading(accountWikilink)?.linkpath?.replace(/^ACC-/, '') ?? accountWikilink
		const label = accountEntry === undefined ? fallbackLabel : AccountDomain.toDisplayName(accountEntry.fm)
		uniqueOptions.set(accountWikilink, {
			value: accountWikilink,
			label: () => label,
			icon: accountEntry === undefined ? AccountDomain.resolveIcon() : AccountDomain.resolveDisplayIcon(app, accountEntry.fm),
			keywords: [label, accountWikilink],
		})
	}

	return [...uniqueOptions.values()].sort((left, right) => left.label().localeCompare(right.label()))
}

function listPositionLinkedFilterOptions(
	app: DomainRuntimeApp,
	scope: PositionLinkedFilterScope,
) {
	switch (scope) {
		case 'playbook':
			return buildLinkedFilterOptions(PlaybookDomain.totalEntries(app), {
				fallbackIcon: { kind: 'lucide', value: 'book-open' },
			}).sort(compareLinkedFilterOptions)
		case 'news':
			return buildLinkedFilterOptions(NewsDomain.totalEntries(app)).sort(compareLinkedFilterOptions)
		case 'analysis':
			return [
				...buildLinkedFilterOptions(KeyLevelDomain.totalEntries(app), {
					metaLabel: t('TAB_KEY_LEVEL'),
					fallbackIcon: { kind: 'lucide', value: 'crosshair' },
				}),
				...buildLinkedFilterOptions(ConfluenceDomain.totalEntries(app), {
					metaLabel: t('TAB_CONFLUENCE'),
					fallbackIcon: { kind: 'lucide', value: 'git-merge' },
				}),
				...buildLinkedFilterOptions(MarketAnalysisDomain.totalEntries(app), {
					metaLabel: t('TAB_MARKET_ANALYSIS'),
					fallbackIcon: { kind: 'lucide', value: 'sunrise' },
				}),
			].sort(compareLinkedFilterOptions)
		default:
			scope satisfies never
			throw new Error('Unknown position linked filter scope')
	}
}

function buildLinkedFilterOptions(
	entries: DomainPersistedEntry<unknown>[],
	{
		metaLabel,
		fallbackIcon,
	}: {
		metaLabel?: string
		fallbackIcon?: IconDescriptor
	} = {},
): TableFilterOption[] {
	return entries.map((entry) => {
		const displayName = getPersistedEntryDisplayName(entry)
		return {
			value: entry.file.path,
			label: () => displayName,
			icon: resolveLinkedFilterOptionIcon(entry, fallbackIcon),
			keywords: [
				displayName,
				getFileBasename(entry.file),
				entry.file.path,
				...(metaLabel === undefined ? [] : [metaLabel]),
			],
			metaLabel: metaLabel === undefined ? undefined : () => metaLabel,
		}
	})
}

function resolveLinkedFilterOptionIcon(
	entry: DomainPersistedEntry<unknown>,
	fallbackIcon?: IconDescriptor,
) : string | IconDescriptor | undefined {
	const fm = entry.fm as {
		lucr_type?: string
		icon?: string | IconDescriptor | null
		source?: string | null
		impact?: 'high' | 'medium' | 'low' | null
	}

	if (fm.lucr_type === 'news') {
		return resolveNewsTitleIcon({
			icon: typeof fm.icon === 'string' ? fm.icon : null,
			impact: fm.impact,
		}) ?? fallbackIcon
	}

	if (typeof fm.icon === 'string') {
		return resolveIconDescriptor(fm.icon, { fallbackImageName: fm.icon }) ?? { kind: 'image', value: fm.icon }
	}

	if (fm.icon != null) {
		return fm.icon
	}

	const faviconUrl = resolveHomepageFaviconUrl(fm.source)
	return faviconUrl == null ? fallbackIcon : { kind: 'url', value: faviconUrl } as const
}

function compareLinkedFilterOptions(left: TableFilterOption, right: TableFilterOption) {
	const labelCompare = left.label().localeCompare(right.label())
	if (labelCompare !== 0) {
		return labelCompare
	}
	return (left.metaLabel?.() ?? '').localeCompare(right.metaLabel?.() ?? '')
}

function hasResolvedLinkedEntry(
	entry: DomainPersistedEntry<Position>,
	app: DomainRuntimeApp,
	targetPath: string,
) {
	return (app.metadataCache.resolvedLinks?.[entry.file.path]?.[targetPath] ?? 0) > 0
}

// --- in-source tests ---
if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('positionFields', () => {
		it('splits linked filters into playbook, news, and analysis', () => {
			expect(positionTableFilters.map((filter) => filter.id)).toEqual([
				'status',
				'side',
				'confidence',
				'account',
				'symbol',
				'linkedPlaybook',
				'linkedNews',
				'linkedAnalysis',
			])
		})

		it('covers all 11 existing column ids', () => {
			const keys = positionFields.map((f) => f.key)
			for (const id of ['status', 'symbol', 'account', 'profit', 'side',
				'confidence', 'notional_value', 'risk', 'opened_at', 'playbooks', 'analyses']) {
				expect(keys).toContain(id)
			}
		})

		it('every Table field has a unique key', () => {
			const tableFields = positionFields.filter((f) => f.usages.includes('Table'))
			const keys = tableFields.map((f) => f.key)
			expect(new Set(keys).size).toBe(keys.length)
		})

		it('editable fields have writeback defined', () => {
			const editableKeys = ['profit', 'confidence', 'notional_value', 'opened_at']
			for (const key of editableKeys) {
				const field = positionFields.find((f) => f.key === key)
				expect(field?.writeback?.editable, `${key} should have editable writeback`).toBe(true)
			}
		})

		it('status getValue returns open or close', () => {
			const field = positionFields.find((f) => f.key === 'status')!
			const openEntry = { file: { path: 'x.md' }, fm: { status: 'open' as const, closed_at: null } }
			const closedEntry = { file: { path: 'y.md' }, fm: { status: 'open' as const, closed_at: '2026-01-01T00:00:00+08:00' } }
			expect(field.getValue!(openEntry as never)).toBe('open')
			expect(field.getValue!(closedEntry as never)).toBe('close')
		})

		it('limits searchable position fields to symbol and account scope', () => {
			const searchableKeys = positionFields
				.filter((field) => field.searchable === true)
				.map((field) => field.key)
			expect(searchableKeys).toEqual(['account', 'symbol'])
		})

		it('account column getValue derives from symbol entry instead of fm.account', () => {
			const accountField = positionFields.find((f) => f.key === 'account')!
			const symbolFile = { path: 'LucrJournal/symbols/SBL-Main-BTCUSDT.md' } as unknown
			const app = {
				vault: { getMarkdownFiles: () => [symbolFile] },
				metadataCache: {
					getFileCache: () => ({
						frontmatter: {
							lucr_type: 'symbol',
							name: 'BTCUSDT',
							account: '[[ACC-Main]]',
							platform: '[[Binance]]',
						},
					}),
				},
			} as never
			const entry = { file: { path: 'p.md' }, fm: { lucr_type: 'position', symbol: '[[SBL-Main-BTCUSDT]]' } } as never
			expect(accountField.getValue!(entry, app)).toBe('[[ACC-Main]]')
		})

		it('limits symbol filter options to the selected account', () => {
			const symbolFilter = positionTableFilters.find((filter) => filter.id === 'symbol')!
			const app = createPositionFilterApp()
			const entries = [
				createPositionEntry('POS-00001.md', '[[SBL-Main-BTCUSDT]]'),
				createPositionEntry('POS-00002.md', '[[SBL-Alt-BTCUSDT]]'),
			]

			const options = resolveTableFilterOptions(symbolFilter, {
				app,
				entries,
				state: { account: '[[ACC-Main]]' },
			})

			expect(options.map((option) => option.value)).toEqual(['[[SBL-Main-BTCUSDT]]'])
		})

		it('shows account label for duplicate symbol names across accounts', () => {
			const symbolFilter = positionTableFilters.find((filter) => filter.id === 'symbol')!
			const app = createPositionFilterApp()
			const entries = [
				createPositionEntry('POS-00001.md', '[[SBL-Main-BTCUSDT]]'),
				createPositionEntry('POS-00002.md', '[[SBL-Alt-BTCUSDT]]'),
			]

			const options = resolveTableFilterOptions(symbolFilter, {
				app,
				entries,
				state: { account: '' },
			})

			expect(options.map((option) => [option.label(), option.metaLabel?.(), option.metaIcon])).toEqual([
				['BTCUSDT', 'Alt', { kind: 'platform', value: 'Bybit' }],
				['BTCUSDT', 'Main', { kind: 'platform', value: 'Binance' }],
			])
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
			createMockTFile('LucrJournal/symbols/SBL-Main-BTCUSDT.md', 'SBL-Main-BTCUSDT'),
			createMockTFile('LucrJournal/symbols/SBL-Alt-BTCUSDT.md', 'SBL-Alt-BTCUSDT'),
			createMockTFile('LucrJournal/accounts/ACC-Main.md', 'ACC-Main'),
			createMockTFile('LucrJournal/accounts/ACC-Alt.md', 'ACC-Alt'),
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
			['LucrJournal/accounts/ACC-Main.md', {
				lucr_type: 'account',
				name: 'Main',
				platform: '[[Binance]]',
			}],
			['LucrJournal/accounts/ACC-Alt.md', {
				lucr_type: 'account',
				name: 'Alt',
				platform: '[[Bybit]]',
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

	function createMockTFile(path: string, basename: string) {
		return Object.assign(new TFile(), { path, basename })
	}
}
