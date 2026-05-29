/// <reference types="vitest/importMeta" />

import { TFile, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { roundAmountValue } from '../../utils'
import { PositionDomain, type Position } from '../position'

import { PlaybookDomain, type Playbook } from './index'

import type { DomainPersistedEntry } from '../core/type'

export type PositionBacklinkStats = {
	trades: number
	winRate: number
	netProfit: number
	largestProfit: number | null
	largestLoss: number | null
}

export type PlaybookEntryWithStats = {
	entry: DomainPersistedEntry<Playbook> & { file: TFile }
	linkedPositionEntries: (DomainPersistedEntry<Position> & { file: TFile })[]
	stats: PositionBacklinkStats
}

export function listPlaybookEntriesWithStats(app: App): PlaybookEntryWithStats[] {
	const playbookEntries = PlaybookDomain
		.totalEntries(app)
		.filter((entry): entry is DomainPersistedEntry<Playbook> & { file: TFile } => entry.file instanceof TFile)
	const positionEntries = PositionDomain
		.totalEntries(app)
		.filter((entry): entry is DomainPersistedEntry<Position> & { file: TFile } => entry.file instanceof TFile)

	return playbookEntries
		.map((playbookEntry) => {
			const linkedPositionEntries = positionEntries.filter((positionEntry) =>
				(app.metadataCache.resolvedLinks[positionEntry.file.path]?.[playbookEntry.file.path] ?? 0) > 0,
			)

			return {
				entry: playbookEntry,
				linkedPositionEntries,
				stats: buildPositionBacklinkStats(linkedPositionEntries.map(({ fm }) => fm)),
			}
		})
}

export function buildPositionBacklinkStats(positions: Position[]): PositionBacklinkStats {
	const trades = positions.length
	const realizedProfits: number[] = []

	for (const position of positions) {
		const profit = position.profit
		if (!PositionDomain.isClosed(position) || typeof profit !== 'number' || profit === 0) {
			continue
		}

		realizedProfits.push(profit)
	}

	const wins = realizedProfits.filter((profit) => profit > 0).length
	const winRate = realizedProfits.length === 0
		? 0
		: wins / realizedProfits.length * 100
	const netProfit = realizedProfits.reduce((total, profit) => roundAmountValue(total + profit), 0)
	const largestProfit = realizedProfits.filter((profit) => profit > 0).reduce<number | null>(
		(currentMax, profit) => currentMax === null ? profit : Math.max(currentMax, profit),
		null,
	)
	const largestLoss = realizedProfits.filter((profit) => profit < 0).reduce<number | null>(
		(currentMin, profit) => currentMin === null ? profit : Math.min(currentMin, profit),
		null,
	)

	return {
		trades,
		winRate,
		netProfit,
		largestProfit: largestProfit === null ? null : roundAmountValue(largestProfit),
		largestLoss: largestLoss === null ? null : roundAmountValue(largestLoss),
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('buildPositionBacklinkStats', () => {
		it('computes trades, win rate and net profit from linked positions', () => {
			expect(buildPositionBacklinkStats([
				{ lucr_type: 'position', status: 'close', profit: 100 },
				{ lucr_type: 'position', status: 'close', profit: -50 },
				{ lucr_type: 'position', status: 'close', profit: 0 },
				{ lucr_type: 'position', profit: null },
			])).toEqual({
				trades: 4,
				winRate: 50,
				netProfit: 50,
				largestProfit: 100,
				largestLoss: -50,
			})
		})

		it('treats positions with closed_at as closed even when legacy status stays open', () => {
			expect(buildPositionBacklinkStats([
				{
					lucr_type: 'position',
					status: 'open',
					closed_at: '2026-03-27T12:30:00+08:00',
					profit: 100,
				} as Position,
			])).toEqual({
				trades: 1,
				winRate: 100,
				netProfit: 100,
				largestProfit: 100,
				largestLoss: null,
			})
		})

		it('rounds backlink amount aggregates to the shared precision', () => {
			expect(buildPositionBacklinkStats([
				{ lucr_type: 'position', status: 'close', profit: 0.1 },
				{ lucr_type: 'position', status: 'close', profit: 0.2 },
				{ lucr_type: 'position', status: 'close', profit: -0.000012333333333 },
				{ lucr_type: 'position', status: 'close', profit: 0 },
			])).toEqual({
				trades: 4,
				winRate: 66.66666666666666,
				netProfit: 0.29998767,
				largestProfit: 0.2,
				largestLoss: -0.00001233,
			})
		})
	})

	describe('listPlaybookEntriesWithStats', () => {
		it('only counts position backlinks that resolve to each playbook file', () => {
			const playbookFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/playbooks/PBK-00001.md`, 'PBK-00001')
			const otherPlaybookFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/playbooks/PBK-00002.md`, 'PBK-00002')
			const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`, 'POS-00001')
			const unrelatedFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/analyses/news1.md`, 'news1')
			const app = {
				metadataCache: {
					resolvedLinks: {
						[positionFile.path]: {
							[playbookFile.path]: 1,
						},
						[unrelatedFile.path]: {
							[playbookFile.path]: 1,
						},
					},
					getFileCache: (file: TFile) => {
						if (file.path === playbookFile.path) {
							return {
								frontmatter: {
									lucr_type: 'playbook',
								},
							}
						}

						if (file.path === otherPlaybookFile.path) {
							return {
								frontmatter: {
									lucr_type: 'playbook',
								},
							}
						}

						if (file.path === positionFile.path) {
							return {
								frontmatter: {
									lucr_type: 'position',
									id: 1,
									status: 'close',
									profit: 100,
								},
							}
						}

						return {
							frontmatter: {
								lucr_type: 'analysis',
							},
						}
					},
				},
				vault: {
					getMarkdownFiles: () => [
						playbookFile,
						otherPlaybookFile,
						positionFile,
						unrelatedFile,
					],
				},
			} as unknown as App

			expect(listPlaybookEntriesWithStats(app)).toEqual([
				{
					entry: {
						file: playbookFile,
						fm: {
							lucr_type: 'playbook',
						},
					},
					linkedPositionEntries: [
						{
							file: positionFile,
							fm: {
								lucr_type: 'position',
								id: '1',
								status: 'close',
								profit: 100,
							},
						},
					],
					stats: {
						trades: 1,
						winRate: 100,
						netProfit: 100,
						largestProfit: 100,
						largestLoss: null,
					},
				},
				{
					entry: {
						file: otherPlaybookFile,
						fm: {
							lucr_type: 'playbook',
						},
					},
					linkedPositionEntries: [],
					stats: {
						trades: 0,
						winRate: 0,
						netProfit: 0,
						largestProfit: null,
						largestLoss: null,
					},
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
