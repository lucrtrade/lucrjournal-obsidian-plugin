/// <reference types="vitest/importMeta" />

import { TFile, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { getFileBasename, getPersistedEntryDisplayName, sanitizeObsidianFileName } from '../../utils'
import { listPositionConfluenceEntries, listPublicConfluenceEntries } from '../analysis/confluence'
import { KeyLevelDomain } from '../analysis/key-level'
import { MarketAnalysisDomain } from '../analysis/market-analysis'
import { NewsDomain } from '../news'
import { PlaybookDomain, type Playbook } from '../playbook'

import {
	POSITION_NEWS_SECTION,
	POSITION_KEY_LEVEL_SECTION,
	POSITION_CONFLUENCE_SECTION,
	POSITION_MARKET_ANALYSIS_SECTION,
	appendSectionEntry,
	getPositionSectionTitle,
	removeSectionEntryFromPosition,
	setPositionPlaybookFrontmatter,
} from './body'

import {
	PositionDomain,
	type PositionContextConfluenceGroup,
	type PositionContextKeyLevelGroup,
	type PositionContextMarketAnalysisGroup,
	type PositionContextNewsGroup,
	type PositionContextPlaybookGroup,
} from './index'

import type { DomainPersistedEntry } from '../core/type'

export {
	POSITION_NOTES_SECTION,
	POSITION_CONFLUENCE_SECTION,
	getPositionSectionTitle,
	removeSectionEntryFromPosition,
	removeAllSectionEntriesFromPositionByLinkpath,
	removePositionPlaybookFrontmatter,
	removePositionPlaybookFrontmatterByLinkpath,
} from './body'

export type PositionDetailsContextModel = {
	newsGroup: PositionContextNewsGroup
	keyLevelGroup: PositionContextKeyLevelGroup
	confluenceGroup: PositionContextConfluenceGroup
	marketAnalysisGroup: PositionContextMarketAnalysisGroup
	playbookGroup: PositionContextPlaybookGroup
}

// @story [[lucrjournal/position-body#^position-context-options]] Builds sorted available entries for a position-independent empty model
export function createEmptyPositionDetailsContextModel(app: App): PositionDetailsContextModel {
	return {
		newsGroup: {
			kind: 'news',
			sectionTitle: POSITION_NEWS_SECTION,
			linkedEntries: [],
			availableEntries: sortContextEntries(NewsDomain.totalEntries(app)),
			hasSection: false,
			hasContent: false,
		},
		keyLevelGroup: {
			kind: 'key_level',
			sectionTitle: POSITION_KEY_LEVEL_SECTION,
			linkedEntries: [],
			availableEntries: sortContextEntries(KeyLevelDomain.totalEntries(app)),
			hasSection: false,
			hasContent: false,
		},
		confluenceGroup: {
			kind: 'confluence',
			sectionTitle: POSITION_CONFLUENCE_SECTION,
			linkedEntries: [],
			availableEntries: sortContextEntries(listPublicConfluenceEntries(app)),
			hasSection: false,
			hasContent: false,
		},
		marketAnalysisGroup: {
			kind: 'market_analysis',
			sectionTitle: POSITION_MARKET_ANALYSIS_SECTION,
			linkedEntries: [],
			availableEntries: sortContextEntries(MarketAnalysisDomain.totalEntries(app)),
			hasSection: false,
			hasContent: false,
		},
		playbookGroup: {
			kind: 'playbook',
			playbookEntry: null,
			availablePlaybookEntries: sortContextEntries(PlaybookDomain.totalEntries(app)),
		},
	}
}

// @story [[lucrjournal/position-body#^position-context-options]] Replaces public confluence options with the current playbook visibility scope
export async function buildPositionDetailsContextModel(
	app: App,
	positionFile: TFile | null,
): Promise<PositionDetailsContextModel> {
	if (positionFile === null) {
		return createEmptyPositionDetailsContextModel(app)
	}

	const emptyModel = createEmptyPositionDetailsContextModel(app)
	const contextGroups = await PositionDomain.listContextGroups(app, positionFile)
	const playbookGroup = contextGroups.find((group): group is PositionContextPlaybookGroup => group.kind === 'playbook') ?? emptyModel.playbookGroup
	const newsGroup = contextGroups.find((group): group is PositionContextNewsGroup => group.kind === 'news') ?? emptyModel.newsGroup
	const keyLevelGroup = contextGroups.find((group): group is PositionContextKeyLevelGroup => group.kind === 'key_level') ?? emptyModel.keyLevelGroup
	const confluenceGroup = contextGroups.find((group): group is PositionContextConfluenceGroup => group.kind === 'confluence') ?? emptyModel.confluenceGroup
	const marketAnalysisGroup = contextGroups.find((group): group is PositionContextMarketAnalysisGroup => group.kind === 'market_analysis') ?? emptyModel.marketAnalysisGroup

	return {
		newsGroup,
		keyLevelGroup,
		confluenceGroup: {
			...confluenceGroup,
			availableEntries: sortContextEntries(await listPositionConfluenceEntries(app, playbookGroup.playbookEntry?.file ?? null)),
		},
		marketAnalysisGroup,
		playbookGroup,
	}
}

// @story [[lucrjournal/position-body#^add-position-context]] Reuses a normalized basename or creates one TFile-backed context entry
export async function addPositionSectionEntry<Entry>({
	app,
	availableEntries,
	createEntry,
	entryOptionValue,
	positionFile,
	sectionTitle,
}: {
	app: App
	availableEntries: DomainPersistedEntry<Entry>[]
	createEntry: (name: string) => Promise<DomainPersistedEntry<Entry>>
	entryOptionValue: string
	positionFile: TFile
	sectionTitle: string
}): Promise<{ entryFile: TFile; created: boolean; appendResult: 'appended' | 'exists' }> {
	const trimmedValue = entryOptionValue.trim()
	if (trimmedValue.length === 0) {
		throw new Error('Section entry option value is required')
	}

	const normalizedValue = sanitizeObsidianFileName(trimmedValue).trim().toLocaleLowerCase()
	const existingEntry = availableEntries.find((entry) => getFileBasename(entry.file).trim().toLocaleLowerCase() === normalizedValue)
	const entry = existingEntry ?? await createEntry(trimmedValue)
	if (!(entry.file instanceof TFile)) {
		throw new Error('Context entry file must be a TFile')
	}

	const appendResult = await appendSectionEntry(app, positionFile, sectionTitle, entry.file)

	return {
		entryFile: entry.file,
		created: existingEntry === undefined,
		appendResult,
	}
}

export async function removePositionSectionEntry({
	app,
	kind,
	linkpath,
	positionFile,
	sectionStart,
}: {
	app: App
	kind: 'news' | 'key_level' | 'confluence' | 'market_analysis'
	linkpath: string
	positionFile: TFile
	sectionStart: number
}): Promise<boolean> {
	return await removeSectionEntryFromPosition({
		app,
		linkpath,
		positionFile,
		sectionStart,
		sectionTitle: getPositionSectionTitle(kind),
	})
}

// @story [[lucrjournal/position-body#^add-position-playbook-context]] Uses exact playbook reuse before sanitized creation and frontmatter writeback
export async function addPlaybookContextEntry({
	app,
	playbookOptionValue,
	positionFile,
	availablePlaybookEntries,
}: {
	app: App
	playbookOptionValue: string
	positionFile: TFile
	availablePlaybookEntries: DomainPersistedEntry<Playbook>[]
}): Promise<{ playbookFile: TFile; created: boolean; appendResult: 'appended' | 'exists' }> {
	const trimmedValue = playbookOptionValue.trim()
	if (trimmedValue.length === 0) {
		throw new Error('Playbook option value is required')
	}

	const existingEntry = availablePlaybookEntries.find((entry) => getFileBasename(entry.file) === trimmedValue)
	const playbookEntry = existingEntry ?? await createContextPlaybook(app, trimmedValue)
	if (!(playbookEntry.file instanceof TFile)) {
		throw new Error('Context playbook file must be a TFile')
	}

	const appendResult = await setPositionPlaybookFrontmatter({
		app,
		positionFile,
		playbookFile: playbookEntry.file,
	})

	return {
		playbookFile: playbookEntry.file,
		created: existingEntry === undefined,
		appendResult,
	}
}

export function isPositionDetailsDataPath(path: string) {
	return path === LUCR_TRADE_ROOT_DIR || path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`)
}

async function createContextPlaybook(
	app: App,
	inputName: string,
): Promise<DomainPersistedEntry<Playbook>> {
	const trimmedName = sanitizeObsidianFileName(inputName)
	if (trimmedName.length === 0) {
		throw new Error('Playbook name is required')
	}

	const result = await PlaybookDomain.createEntry(app, { name: trimmedName, description: '', criteria: [] })

	return {
		file: result.file,
		fm: result.entry,
	}
}

function sortContextEntries<Entry>(
	entries: DomainPersistedEntry<Entry>[],
) {
	return [...entries].sort((left, right) => readDisplayName(left).localeCompare(readDisplayName(right)))
}

function readDisplayName<Entry>(entry: DomainPersistedEntry<Entry>) {
	return getPersistedEntryDisplayName(entry)
}
