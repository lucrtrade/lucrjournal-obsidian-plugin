/// <reference types="vitest/importMeta" />

import { TFile, type App } from 'obsidian'

import { t } from '../../lang/helpers'
import { getPersistedEntryDisplayName } from '../../utils'
import { defineTableFilters } from '../core/table-filters'
import { buildPositionBacklinkStats, type PositionBacklinkStats } from '../playbook/stats'
import { PositionDomain, type Position } from '../position'

import type { BaseFieldType } from '../core/fields'
import type { DomainPersistedEntry } from '../core/type'

export type LinkedEntryTableFieldType = BaseFieldType

type LinkedEntryBacklinkStats<Entry> = {
	entry: DomainPersistedEntry<Entry> & { file: TFile }
	linkedPositionEntries: (DomainPersistedEntry<Position> & { file: TFile })[]
	stats: PositionBacklinkStats
}

type LinkedEntryTableFrontmatter = {
	description?: string | null
	icon?: string | null
	source?: string | null
	impact?: 'high' | 'medium' | 'low' | null
	created?: string | null
	criteria?: string[] | null
	tags?: string[] | null
}

export type LinkedEntryStatsRow = {
	displayName: string
	description: string
	positionCount: number
	trades: number
	winRate: number
	netProfit: number
	largestProfit: number | null
	largestLoss: number | null
	entryStats: LinkedEntryBacklinkStats<{
		description?: string | null
		icon?: string | null
		source?: string | null
		impact?: 'high' | 'medium' | 'low' | null
		created?: string | null
		criteria?: string[] | null
		tags?: string[] | null
	}>
}

export type LinkedPositionSectionDefinition<Entry extends { icon?: string | null }> = {
	kind: 'news' | 'key_level' | 'confluence' | 'market_analysis'
	icon: string
	titleKey: string
	createLinkedEntry: (app: App, name: string) => Promise<DomainPersistedEntry<Entry>>
}

export const linkedEntryTableFilters = defineTableFilters<LinkedEntryStatsRow>([
	{
		id: 'byDate',
		type: 'date',
		label: () => t('DASHBOARD_ANALYSIS_TABLE_FILTER_DATE'),
		defaultValue: '',
		columnIds: ['created'],
		toColumnFilters: ({ value, currentFilters }) => value === ''
			? currentFilters
			: [...currentFilters, { id: 'created', value }],
	},
	{
		id: 'tags',
		type: 'combobox',
		label: () => t('DASHBOARD_ANALYSIS_TABLE_FILTER_TAGS'),
		defaultValue: '',
		placeholder: () => t('DASHBOARD_ANALYSIS_TABLE_FILTER_TAGS_PLACEHOLDER'),
		options: ({ entries }) =>
			[...new Set(entries.flatMap((entry) => entry.fm.entryStats.entry.fm.tags ?? []))]
				.map((tag) => String(tag).trim())
				.filter((tag) => tag !== '')
				.sort((left, right) => left.localeCompare(right))
				.map((tag) => ({
					value: tag,
					label: () => tag,
				})),
		columnIds: ['tags'],
		toColumnFilters: ({ value, currentFilters }) => value.trim() === ''
			? currentFilters
			: [...currentFilters, { id: 'tags', value }],
	},
])

export function listEntriesWithPositionStats<Entry>(
	app: App,
	entries: DomainPersistedEntry<Entry>[],
): LinkedEntryBacklinkStats<Entry>[] {
	const persistedEntries = entries
		.filter((entry): entry is DomainPersistedEntry<Entry> & { file: TFile } => entry.file instanceof TFile)
	const positionEntries = PositionDomain
		.totalEntries(app)
		.filter((entry): entry is DomainPersistedEntry<Position> & { file: TFile } => entry.file instanceof TFile)
	const linkedPositionsByEntryPath = new Map<string, (DomainPersistedEntry<Position> & { file: TFile })[]>()

	for (const positionEntry of positionEntries) {
		const resolvedLinks = app.metadataCache.resolvedLinks[positionEntry.file.path] ?? {}
		for (const entryPath of Object.keys(resolvedLinks)) {
			const linkedEntries = linkedPositionsByEntryPath.get(entryPath)
			if (linkedEntries === undefined) {
				linkedPositionsByEntryPath.set(entryPath, [positionEntry])
				continue
			}
			linkedEntries.push(positionEntry)
		}
	}

	return persistedEntries.map((entry) => {
		const linkedPositionEntries = linkedPositionsByEntryPath.get(entry.file.path) ?? []

		return {
			entry,
			linkedPositionEntries,
			stats: buildPositionBacklinkStats(linkedPositionEntries.map(({ fm }) => fm)),
		}
	})
}

function toLinkedEntryStatsRow(
	row: LinkedEntryBacklinkStats<LinkedEntryTableFrontmatter>,
): LinkedEntryStatsRow {
	return {
		displayName: getPersistedEntryDisplayName(row.entry),
		description: row.entry.fm.description?.trim() ?? '',
		positionCount: row.linkedPositionEntries.length,
		trades: row.stats.trades,
		winRate: row.stats.winRate,
		netProfit: row.stats.netProfit,
		largestProfit: row.stats.largestProfit,
		largestLoss: row.stats.largestLoss,
		entryStats: row,
	}
}

export function toLinkedEntryStatsTableEntry(
	row: LinkedEntryBacklinkStats<LinkedEntryTableFrontmatter>,
): DomainPersistedEntry<LinkedEntryStatsRow> & { file: TFile } {
	return {
		file: row.entry.file,
		fm: toLinkedEntryStatsRow(row),
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('listEntriesWithPositionStats', () => {
		it('builds news backlink stats from position resolved links only once per position source set', () => {
			const newsFile = createMockTFile('LucrTrade/news/cpi.md', 'cpi')
			const otherNewsFile = createMockTFile('LucrTrade/news/fed.md', 'fed')
			const positionFile = createMockTFile('LucrTrade/positions/POS-1.md', 'POS-1')
			const secondPositionFile = createMockTFile('LucrTrade/positions/POS-2.md', 'POS-2')
			const unrelatedFile = createMockTFile('LucrTrade/analyses/weekly.md', 'weekly')
			const app = {
				metadataCache: {
					resolvedLinks: {
						[positionFile.path]: {
							[newsFile.path]: 1,
						},
						[secondPositionFile.path]: {
							[newsFile.path]: 1,
							[otherNewsFile.path]: 1,
						},
						[unrelatedFile.path]: {
							[newsFile.path]: 1,
						},
					},
					getFileCache: (file: TFile) => {
						if (file.path === newsFile.path) {
							return { frontmatter: { lucr_type: 'news' } } 
						}
						if (file.path === otherNewsFile.path) {
							return { frontmatter: { lucr_type: 'news' } } 
						}
						if (file.path === positionFile.path) {
							return { frontmatter: { lucr_type: 'position', id: 1, status: 'close', profit: 10 } } 
						}
						if (file.path === secondPositionFile.path) {
							return { frontmatter: { lucr_type: 'position', id: 2, status: 'close', profit: -5 } } 
						}
						return { frontmatter: { lucr_type: 'confluence', name: 'weekly' } }
					},
				},
				vault: {
					getMarkdownFiles: () => [newsFile, otherNewsFile, positionFile, secondPositionFile, unrelatedFile],
				},
			} as unknown as App

			const rows = listEntriesWithPositionStats(app, [
				{ file: newsFile, fm: { lucr_type: 'news' } },
				{ file: otherNewsFile, fm: { lucr_type: 'news' } },
			])

			expect(rows.map((row) => ({
				path: row.entry.file.path,
				linkedPaths: row.linkedPositionEntries.map((entry) => entry.file.path),
				trades: row.stats.trades,
			}))).toEqual([
				{
					path: newsFile.path,
					linkedPaths: [positionFile.path, secondPositionFile.path],
					trades: 2,
				},
				{
					path: otherNewsFile.path,
					linkedPaths: [secondPositionFile.path],
					trades: 1,
				},
			])
		})
	})

	function createMockTFile(path: string, basename: string): TFile {
		const file = new TFile()
		file.path = path
		file.basename = basename
		file.extension = 'md'
		return file
	}
}
