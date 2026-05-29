/// <reference types="vitest/importMeta" />

import { AccountDomain, derivePositionAccountWikilink, type Position } from '../../domains'
import { getFileBasename, parseWikilinkHeading } from '../../utils'

import type { DomainPersistedEntry } from '../../domains/core/type'
import type { App } from 'obsidian'

type AccountEntry = ReturnType<typeof AccountDomain.totalEntries>[number]

type FilterPositionEntriesByAccountSelectionArgs = {
	app: App
	positionEntries: DomainPersistedEntry<Position>[]
	accountEntries: AccountEntry[]
	selectedAccountValue: string
	allAccountsValue: string
}

export function filterPositionEntriesByAccountSelection({
	app,
	positionEntries,
	accountEntries,
	selectedAccountValue,
	allAccountsValue,
}: FilterPositionEntriesByAccountSelectionArgs): DomainPersistedEntry<Position>[] {
	if (selectedAccountValue === allAccountsValue) {
		return positionEntries
	}

	const normalizedSelectedAccount = selectedAccountValue.trim().toLocaleLowerCase()
	const selectedAccountEntry = accountEntries.find(({ fm }) =>
		AccountDomain.toDisplayName(fm).trim().toLocaleLowerCase() === normalizedSelectedAccount,
	)
	if (selectedAccountEntry === undefined) {
		return []
	}

	const selectedAccountFileBasename = getFileBasename(selectedAccountEntry.file)
	return positionEntries.filter(({ fm }) => {
		const accountWikilink = derivePositionAccountWikilink(app, fm)
		if (accountWikilink === null) {
			return false
		}
		return parseWikilinkHeading(accountWikilink)?.linkpath === selectedAccountFileBasename
	})
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('filterPositionEntriesByAccountSelection', () => {
		it('returns all positions when the all-accounts option is selected', () => {
			const positions = filterPositionEntriesByAccountSelection({
				app: {} as App,
				positionEntries: [
					{ file: { path: 'LucrJournal/positions/POS-00001.md' }, fm: { lucr_type: 'position', symbol: '[[SBL-Main-BTCUSDT]]' } },
					{ file: { path: 'LucrJournal/positions/POS-00002.md' }, fm: { lucr_type: 'position', symbol: '[[SBL-Alt-BTCUSDT]]' } },
				] as DomainPersistedEntry<Position>[],
				accountEntries: [],
				selectedAccountValue: '__all__',
				allAccountsValue: '__all__',
			})

			expect(positions).toHaveLength(2)
		})

		it('filters positions by the selected account entry basename', () => {
			const symbolFiles = [
				{ path: 'LucrJournal/symbols/SBL-Main-BTCUSDT.md' },
				{ path: 'LucrJournal/symbols/SBL-Alt-BTCUSDT.md' },
			]
			const app = {
				vault: { getMarkdownFiles: () => symbolFiles },
				metadataCache: {
					getFileCache: (file: { path: string }) => file.path.includes('SBL-Main')
						? { frontmatter: { lucr_type: 'symbol', name: 'BTCUSDT', account: '[[ACC-Main]]' } }
						: { frontmatter: { lucr_type: 'symbol', name: 'BTCUSDT', account: '[[ACC-Alt]]' } },
				},
			} as unknown as App
			const positions = filterPositionEntriesByAccountSelection({
				app,
				positionEntries: [
					{ file: { path: 'POS-00001.md' }, fm: { lucr_type: 'position', symbol: '[[SBL-Main-BTCUSDT]]' } },
					{ file: { path: 'POS-00002.md' }, fm: { lucr_type: 'position', symbol: '[[SBL-Alt-BTCUSDT]]' } },
					{ file: { path: 'POS-00003.md' }, fm: { lucr_type: 'position', symbol: '[[SBL-Main-BTCUSDT]]' } },
				] as DomainPersistedEntry<Position>[],
				accountEntries: [
					{ fm: { lucr_type: 'account', name: 'Main' }, file: { path: 'LucrJournal/accounts/ACC-Main.md' } },
					{ fm: { lucr_type: 'account', name: 'Alt' }, file: { path: 'LucrJournal/accounts/ACC-Alt.md' } },
				] as AccountEntry[],
				selectedAccountValue: 'Main',
				allAccountsValue: '__all__',
			})

			expect(positions.map(({ file }) => file.path)).toEqual([
				'POS-00001.md',
				'POS-00003.md',
			])
		})

		it('returns an empty list when the selected account does not exist', () => {
			const positions = filterPositionEntriesByAccountSelection({
				app: {} as App,
				positionEntries: [
					{ file: { path: 'LucrJournal/positions/POS-00001.md' }, fm: { lucr_type: 'position', symbol: '[[SBL-Main-BTCUSDT]]' } },
				] as DomainPersistedEntry<Position>[],
				accountEntries: [
					{ fm: { lucr_type: 'account', name: 'Main' }, file: { path: 'LucrJournal/accounts/ACC-Main.md' } },
				] as AccountEntry[],
				selectedAccountValue: 'Desk',
				allAccountsValue: '__all__',
			})

			expect(positions).toEqual([])
		})
	})
}
