/// <reference types="vitest/importMeta" />

import { Notice, TFile, type App } from 'obsidian'

import {
	ConfluenceDomain,
	isPublicConfluence,
	type Confluence,
	type Position,
	PositionDomain,
	removeAllSectionEntriesFromPositionByLinkpath,
	removePositionPlaybookFrontmatterByLinkpath,
} from '../../domains'
import { parsePlaybookCriteriaSectionsMarkdown } from '../../domains/playbook/markdown'
import { t } from '../../lang/helpers'

import type { DomainPersistedEntry } from '../../domains/core/type'

type PersistedConfluenceEntry = DomainPersistedEntry<Confluence> & { file: TFile }
type PersistedPositionEntry = DomainPersistedEntry<Position> & { file: TFile }

// @story [[lucrjournal/analysis#^dashboard-linked-entry-delete]] Removes position references before trashing a dashboard entry
export async function deleteDashboardBacklinkedFile({
	app,
	displayName,
	file,
	linkpath,
}: {
	app: App
	displayName: string
	file: TFile
	linkpath: string
}): Promise<void> {
	const positionEntries = PositionDomain
		.totalEntries(app)
		.filter((entry): entry is PersistedPositionEntry => entry.file instanceof TFile)
	let cleanedPositions = 0

	for (const positionEntry of positionEntries) {
		const removedCount = await removeAllSectionEntriesFromPositionByLinkpath({
			app,
			linkpath,
			positionFile: positionEntry.file,
		})
		const removedPlaybook = await removePositionPlaybookFrontmatterByLinkpath({
			app,
			linkpath,
			positionFile: positionEntry.file,
		})

		if (removedCount > 0 || removedPlaybook) {
			cleanedPositions += 1
		}
	}

	await cleanupOrphanPrivateConfluencesForDeletedPlaybook(app, file)
	await app.fileManager.trashFile(file)
	new Notice(t('DASHBOARD_BACKLINKED_FILE_DELETE_SUCCESS', {
		count: cleanedPositions,
		name: displayName,
	}))
}

async function cleanupOrphanPrivateConfluencesForDeletedPlaybook(app: App, playbookFile: TFile) {
	for (const confluenceEntry of await listOrphanPrivateConfluenceEntriesForDeletedPlaybook(app, playbookFile)) {
		await app.fileManager.trashFile(confluenceEntry.file)
	}
}

export async function listOrphanPrivateConfluenceEntriesForDeletedPlaybook(app: App, playbookFile: TFile) {
	if (!isPlaybookFile(app, playbookFile)) {
		return []
	}

	const playbookMarkdown = await app.vault.cachedRead(playbookFile)
	const confluenceNames = new Set(
		parsePlaybookCriteriaSectionsMarkdown(playbookMarkdown)
			.flatMap((section) => section.confluences.map((confluence) => confluence.name.toLocaleLowerCase())),
	)
	if (confluenceNames.size === 0) {
		return []
	}

	return ConfluenceDomain
		.totalEntries(app)
		.filter((confluenceEntry): confluenceEntry is PersistedConfluenceEntry =>
			confluenceEntry.file instanceof TFile
			&& !isPublicConfluence(confluenceEntry.fm)
			&& confluenceNames.has(confluenceEntry.file.basename.toLocaleLowerCase())
			&& !hasBacklinksExcludingSource(app.metadataCache.resolvedLinks, confluenceEntry.file.path, playbookFile.path))
}

function isPlaybookFile(app: App, file: TFile) {
	return app.metadataCache.getFileCache(file)?.frontmatter?.lucr_type === 'playbook'
}

function hasBacklinksExcludingSource(
	resolvedLinks: Record<string, Record<string, number>>,
	targetPath: string,
	excludedSourcePath: string,
) {
	return Object.entries(resolvedLinks).some(([sourcePath, links]) =>
		sourcePath !== excludedSourcePath && (links[targetPath] ?? 0) > 0)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('hasBacklinksExcludingSource', () => {
		it('ignores the deleted playbook as a backlink source', () => {
			expect(hasBacklinksExcludingSource({
				'LucrJournal/playbooks/PBK.md': {
					'LucrJournal/analyses/private.md': 1,
				},
			}, 'LucrJournal/analyses/private.md', 'LucrJournal/playbooks/PBK.md')).toBe(false)
		})

		it('keeps entries that are still linked elsewhere', () => {
			expect(hasBacklinksExcludingSource({
				'LucrJournal/playbooks/PBK.md': {
					'LucrJournal/analyses/private.md': 1,
				},
				'LucrJournal/positions/POS.md': {
					'LucrJournal/analyses/private.md': 1,
				},
			}, 'LucrJournal/analyses/private.md', 'LucrJournal/playbooks/PBK.md')).toBe(true)
		})
	})
}
