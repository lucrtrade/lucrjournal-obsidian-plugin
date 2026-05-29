/// <reference types="vitest/importMeta" />

import { TFile, type App } from 'obsidian'

import { ConfluenceDomain } from '../analysis/confluence'
import { listPlaybookCriteriaNamesFromMarkdown } from '../playbook/markdown'

import { CriteriaDomain, normalizeCriteria, parseCriteriaNames } from './index'

export async function ensureCriteriaFilesExist(
	app: App,
	criteriaNames: readonly string[],
): Promise<void> {
	const existingCriteriaNames = new Set(
		CriteriaDomain.totalEntries(app)
			.flatMap((entry) => entry.file.basename == null ? [] : [entry.file.basename.toLocaleLowerCase()]),
	)

	for (const criteriaName of criteriaNames) {
		const normalizedName = normalizeCriteria(criteriaName)
		if (normalizedName === '' || existingCriteriaNames.has(normalizedName.toLocaleLowerCase())) {
			continue
		}

		await CriteriaDomain.createEntry(app, { name: normalizedName })
		existingCriteriaNames.add(normalizedName.toLocaleLowerCase())
	}
}

export async function cleanupOrphanCriteriaFiles(
	app: App,
	playbookMarkdowns: readonly string[],
	candidateCriteriaNames?: readonly string[],
): Promise<string[]> {
	const referencedCriteriaNames = collectReferencedCriteriaNames(app, playbookMarkdowns)
	const candidateNames = candidateCriteriaNames
		?? CriteriaDomain.totalEntries(app).flatMap((entry) => entry.file.basename == null ? [] : [entry.file.basename])

	const removedCriteriaNames: string[] = []
	for (const candidateName of candidateNames) {
		const normalizedName = normalizeCriteria(candidateName)
		if (normalizedName === '' || referencedCriteriaNames.has(normalizedName.toLocaleLowerCase())) {
			continue
		}

		const existingEntry = CriteriaDomain.totalEntries(app).find((entry) => entry.file.basename === normalizedName)
		if (existingEntry === undefined || !(existingEntry.file instanceof TFile)) {
			continue
		}

		await app.fileManager.trashFile(existingEntry.file)
		removedCriteriaNames.push(normalizedName)
	}

	return removedCriteriaNames
}

function collectReferencedCriteriaNames(app: App, playbookMarkdowns: readonly string[]): Set<string> {
	const referencedCriteriaNames = new Set<string>()

	for (const markdown of playbookMarkdowns) {
		for (const criteriaName of listPlaybookCriteriaNamesFromMarkdown(markdown)) {
			referencedCriteriaNames.add(criteriaName.toLocaleLowerCase())
		}
	}

	for (const confluenceEntry of ConfluenceDomain.totalEntries(app)) {
		for (const criteriaName of parseCriteriaNames(confluenceEntry.fm.criteria)) {
			referencedCriteriaNames.add(criteriaName.toLocaleLowerCase())
		}
	}

	return referencedCriteriaNames
}
