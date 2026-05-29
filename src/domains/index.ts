import { TFile } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../constant'
import { parseWikilinkHeading } from '../utils'

import { AccountDomain } from './account'
import { ConfluenceDomain } from './analysis/confluence'
import { KeyLevelDomain } from './analysis/key-level'
import { MarketAnalysisDomain } from './analysis/market-analysis'
import { CriteriaDomain } from './criteria'
import { NewsDomain } from './news'
import { PlatformDomain } from './platform'
import { PlaybookDomain } from './playbook'
import { PositionDomain } from './position'
import { SymbolDomain } from './symbol'
import { TemplateDomain } from './template'

import type { App } from 'obsidian'

export * from './account'
export * from './account/fields'
export * from './core/constant'
export * from './core/entry-writer'
export * from './core/factory'
export * from './core/form'
export * from './platform'
export * from './position/body'
export * from './playbook'
export * from './playbook/stats'
export * from './position'
export * from './position/context'
export * from './symbol'
export * from './symbol/fields'
export * from './symbol/catalog'
export * from './core/tags'
export * from './template'
export * from './news'
export * from './analysis/key-level'
export * from './analysis/confluence'
export * from './criteria'
export * from './analysis/market-analysis'
export * from './analysis/linked-entry-stats'
export type * from './core/type'
export * from './core/icon-descriptor'

export type AccountDeletionScope = {
	accountFile: TFile
	symbolFiles: TFile[]
	positionFiles: TFile[]
	platformFile: TFile | null
}

export type SymbolDeletionScope = {
	positionFiles: TFile[]
	symbolFile: TFile
}

type AccountEntry = ReturnType<typeof AccountDomain.totalEntries>[number]
type SymbolEntry = ReturnType<typeof SymbolDomain.totalEntries>[number]

type PersistedPositionEntry = {
	file: TFile
	fm: {
		symbol?: string | null
	}
}

export function gatherAccountDeletionScope(app: App, entry: AccountEntry): AccountDeletionScope | null {
	if (!(entry.file instanceof TFile)) {
		return null
	}
	const accountFile: TFile = entry.file
	const accountBasename = accountFile.basename

	const symbolFiles = (SymbolDomain.totalEntries(app) as { file: unknown; fm: { account?: string | null } }[])
		.filter((candidate): candidate is { file: TFile; fm: { account?: string | null } } => candidate.file instanceof TFile)
		.filter((candidate) => parseWikilinkHeading(candidate.fm.account ?? '')?.linkpath === accountBasename)
		.map((candidate) => candidate.file)

	const symbolBasenames = new Set(symbolFiles.map((file) => file.basename))
	const positionFiles = (PositionDomain.totalEntries(app) as { file: unknown; fm: { symbol?: string | null } }[])
		.filter((e): e is PersistedPositionEntry => e.file instanceof TFile)
		.filter((e) => {
			const basename = parseWikilinkHeading(e.fm.symbol ?? '')?.linkpath
			return basename !== undefined && symbolBasenames.has(basename)
		})
		.map((e) => e.file)

	const platformName = AccountDomain.toPlatformName(entry.fm)
	let platformFile: TFile | null = null
	if (platformName != null) {
		const accountsOnPlatform = AccountDomain
			.totalEntries(app)
			.filter((e) => AccountDomain.toPlatformName(e.fm) === platformName)
		if (accountsOnPlatform.length === 1) {
			const candidate = app.vault.getAbstractFileByPath(
				`${LUCR_TRADE_ROOT_DIR}/${PlatformDomain.options.persisted.folderName}/${platformName}.md`,
			)
			if (candidate instanceof TFile) {
				platformFile = candidate
			}
		}
	}

	return { accountFile, symbolFiles, positionFiles, platformFile }
}

export async function deleteAccount(app: App, scope: AccountDeletionScope): Promise<void> {
	for (const positionFile of scope.positionFiles) {
		await app.fileManager.trashFile(positionFile)
	}
	for (const symbolFile of scope.symbolFiles) {
		await app.fileManager.trashFile(symbolFile)
	}
	await app.fileManager.trashFile(scope.accountFile)
	if (scope.platformFile != null) {
		await app.fileManager.trashFile(scope.platformFile)
	}
}

export function gatherSymbolDeletionScope(app: App, entry: SymbolEntry): SymbolDeletionScope | null {
	if (!(entry.file instanceof TFile)) {
		return null
	}
	const symbolFile: TFile = entry.file
	const symbolBasename = symbolFile.basename

	const positionFiles = (PositionDomain.totalEntries(app) as { file: unknown; fm: { symbol?: string | null } }[])
		.filter((e): e is PersistedPositionEntry => e.file instanceof TFile)
		.filter((e) => parseWikilinkHeading(e.fm.symbol ?? '')?.linkpath === symbolBasename)
		.map((e) => e.file)

	return { symbolFile, positionFiles }
}

export async function deleteSymbol(app: App, scope: SymbolDeletionScope): Promise<void> {
	for (const positionFile of scope.positionFiles) {
		await app.fileManager.trashFile(positionFile)
	}
	await app.fileManager.trashFile(scope.symbolFile)
}

export const Domains = [
	PositionDomain,
	NewsDomain,
	KeyLevelDomain,
	ConfluenceDomain,
	CriteriaDomain,
	MarketAnalysisDomain,
	TemplateDomain,
	AccountDomain,
	PlaybookDomain,
	PlatformDomain,
	SymbolDomain,
] as const

// type DomainValueMapFromDomains<
// 	TDomains extends typeof Domains
// > = {
// 	[Domain in TDomains[number] as Domain['name']]: DomainValue<Domain>
// }
// export type DomainValueMap = DomainValueMapFromDomains<typeof Domains>
