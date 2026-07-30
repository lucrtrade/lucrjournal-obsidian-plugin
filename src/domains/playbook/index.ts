/// <reference types="vitest/importMeta" />

import { type } from 'arktype'
import { TFile, normalizePath, type App } from 'obsidian'

import { buildRenamedEntryPath, sanitizeObsidianFileName, toNullableTrimmedValue } from '../../utils'
import { coerceFrontmatterField, coerceLiteral, coerceNullableString } from '../../utils/frontmatter-coerce'
import {
	ConfluenceDomain,
	isPublicConfluence,
	listPlaybookConfluenceEntries,
} from '../analysis/confluence'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce } from '../core/domain-timestamps'
import {
	assertNoPersistedEntryBasenameConflict,
	hasPersistedEntryBasenameConflict,
	PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR,
	syncRenamedDocumentTitle,
	type CreateEntryDescriptor,
} from '../core/entry-writer'
import { DomainBase } from '../core/factory'
import { defineForm, type CriteriaFormSection, type CriteriaFormValue } from '../core/form'
import { CriteriaDomain, buildDefaultPlaybookCriteriaPreset, collectCriteriaOptions, normalizeCriteria, normalizeCriteriaOptions } from '../criteria'
import { cleanupOrphanCriteriaFiles, ensureCriteriaFilesExist } from '../criteria/sync'

import {
	normalizePlaybookConfluenceName,
	parsePlaybookCriteriaSectionsMarkdown,
	serializePlaybookCriteriaSectionsMarkdown,
} from './markdown'

import type { CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import type { DomainValue } from '../core/type'

type PlaybookFormShape = {
	name: { type: 'text' }
	description: { type: 'text' }
	criteria: { type: 'criteria' }
}

const PLAYBOOK_FOLDER_NAME = 'playbooks'
const PLAYBOOK_NAME_REQUIRED_ERROR = 'PLAYBOOK_NAME_REQUIRED_ERROR'
const PLAYBOOK_DUPLICATE_CRITERIA_ERROR = 'PLAYBOOK_DUPLICATE_CRITERIA_ERROR'
const PLAYBOOK_DUPLICATE_CONFLUENCE_ERROR = 'PLAYBOOK_DUPLICATE_CONFLUENCE_ERROR'

const PlaybookType = type({
	lucr_type: '"playbook"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'description?': 'string | null',
})

const playbookFormDefinition = defineForm<PlaybookFormShape>({
	name: {
		type: 'text',
		label: 'DASHBOARD_ENTRY_FIELD_NAME_LABEL',
		required: true,
		validate: (value, _values, context) => {
			const fileBaseName = sanitizeObsidianFileName(value)
			if (fileBaseName.length === 0) {
				return 'DASHBOARD_ENTRY_FIELD_NAME_REQUIRED'
			}
			if (context.app !== undefined && hasPersistedEntryBasenameConflict(context.app, PLAYBOOK_FOLDER_NAME, value)) {
				return 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE'
			}
			return undefined
		},
	},
	description: {
		type: 'text',
		label: 'DASHBOARD_ENTRY_COLUMN_DESCRIPTION',
	},
	criteria: {
		type: 'criteria',
		label: 'DASHBOARD_PLAYBOOK_DETAILS_CONFLUENCES',
		buttonLabel: 'DASHBOARD_PLAYBOOK_CRITERIA_ADD_SECTION',
		placeholder: 'DASHBOARD_PLAYBOOK_CRITERIA_CONFLUENCE_PLACEHOLDER',
		defaultValue: buildDefaultPlaybookCriteriaPreset(),
		validate: (value) => {
			try {
				assertNoDuplicatePlaybookCriteriaNames(value)
				assertNoDuplicatePlaybookConfluenceNames(value)
				return undefined
			} catch (error) {
				if (error instanceof Error && error.message === PLAYBOOK_DUPLICATE_CRITERIA_ERROR) {
					return 'DASHBOARD_PLAYBOOK_CRITERIA_DUPLICATE'
				}
				if (error instanceof Error && error.message === PLAYBOOK_DUPLICATE_CONFLUENCE_ERROR) {
					return 'DASHBOARD_PLAYBOOK_CONFLUENCES_DUPLICATE'
				}
				throw error
			}
		},
		dynamicCriteriaOptions: (app) => collectCriteriaOptions(CriteriaDomain.totalEntries(app)).map((option) => ({
			value: option.value,
			label: option.label ?? option.value,
		})),
		dynamicOptions: (app) => listPlaybookConfluenceEntries(app).flatMap((entry) => entry.file.basename == null
			? []
			: [{
				value: entry.file.basename,
				label: entry.file.basename,
				description: isPublicConfluence(entry.fm) ? 'DASHBOARD_PLAYBOOK_CONFLUENCE_SCOPE_PUBLIC' : undefined,
				icon: isPublicConfluence(entry.fm) ? { kind: 'lucide' as const, value: 'globe' } : undefined,
			}]),
	},
} as const)

class PlaybookDomainDefinition extends DomainBase<'playbook', typeof PlaybookType, typeof playbookFormDefinition> {
	override readonly name = 'playbook' as const
	override readonly schema = PlaybookType
	override readonly options = { persisted: { folderName: PLAYBOOK_FOLDER_NAME } }
	override readonly formDefinition = playbookFormDefinition
	override readonly createEntryDescriptor: CreateEntryDescriptor<PlaybookFormValue, typeof PlaybookType.infer> = {
		buildId(entry) {
			return entry.description ?? ''
		},
		async dependencies(formValue, app) {
			const normalizedSections = normalizePlaybookCriteriaSections(formValue.criteria)
			await ensurePlaybookConfluencesExist(app, normalizedSections)
			// @story [[lucrjournal/playbook#^ensure-criteria-files]] Synchronizes criteria dependencies before playbook creation
			await ensureCriteriaFilesExist(app, normalizedSections.map((section) => section.criteriaName))
		},
		// @story [[lucrjournal/playbook#^playbook-create-payload]] Normalizes the persisted playbook description
		buildPayload(formValue) {
			const description = toNullableTrimmedValue(formValue.description)
			return PlaybookType.assert({
				lucr_type: 'playbook',
				description,
			})
		},
		validate(formValue, app) {
			assertNoDuplicatePlaybookCriteriaNames(formValue.criteria)
			assertNoDuplicatePlaybookConfluenceNames(formValue.criteria)
			assertNoPersistedEntryBasenameConflict(app, PLAYBOOK_FOLDER_NAME, formValue.name)
		},
		// @story [[lucrjournal/playbook#^playbook-create-payload]] Serializes only normalized structured sections
		buildBody(_entry, _ctx, formValue) {
			return serializePlaybookCriteriaSectionsMarkdown(normalizePlaybookCriteriaSections(formValue.criteria))
		},
		// @story [[lucrjournal/playbook#^playbook-create-payload]] Uses the sanitized form name as the file identity
		buildFileName(_entry, _ctx, formValue) {
			const fileBaseName = sanitizeObsidianFileName(formValue.name)
			if (fileBaseName !== '') {
				return fileBaseName
			}
			throw new Error(PLAYBOOK_NAME_REQUIRED_ERROR)
		},
	}

	override toCreateEntryErrorMessageKey(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === PLAYBOOK_NAME_REQUIRED_ERROR) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_REQUIRED' as const
		}
		if (message === PLAYBOOK_DUPLICATE_CRITERIA_ERROR) {
			return 'DASHBOARD_PLAYBOOK_CRITERIA_DUPLICATE' as const
		}
		if (message === PLAYBOOK_DUPLICATE_CONFLUENCE_ERROR) {
			return 'DASHBOARD_PLAYBOOK_CONFLUENCES_DUPLICATE' as const
		}
		if (message === PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE' as const
		}
		return null
	}

	override coerce(record: CoercibleFrontmatter<typeof PlaybookType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'playbook'))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(record, 'description', coerceNullableString)
		return record
	}

	override toDebugLabel(playbook: typeof PlaybookType.infer) {
		return `${this.name}:${playbook.description ?? '-'}`
	}
}

export const PlaybookDomain = new PlaybookDomainDefinition()

export type Playbook = DomainValue<typeof PlaybookDomain>
type PlaybookFormValue = {
	name: string
	description: string
	criteria: CriteriaFormValue
}

export { normalizePlaybookConfluenceName } from './markdown'

export async function loadPlaybookCriteriaSections(app: App, file: TFile): Promise<CriteriaFormValue> {
	return normalizePlaybookCriteriaSections(parsePlaybookCriteriaSectionsMarkdown(await app.vault.cachedRead(file)))
}

export async function savePlaybookCriteriaSections(
	app: App,
	file: TFile,
	sections: readonly CriteriaFormSection[],
	previousSections?: readonly CriteriaFormSection[],
): Promise<void> {
	assertNoDuplicatePlaybookCriteriaNames(sections)
	assertNoDuplicatePlaybookConfluenceNames(sections)
	const normalizedSections = normalizePlaybookCriteriaSections(sections)
	const normalizedPreviousSections = previousSections === undefined
		? undefined
		: normalizePlaybookCriteriaSections(previousSections)

	await maybeRenameCommittedConfluence(app, normalizedPreviousSections, normalizedSections)
	await maybeRenameCommittedCriteria(app, normalizedPreviousSections, normalizedSections)
	await ensurePlaybookConfluencesExist(app, normalizedSections)
	// @story [[lucrjournal/playbook#^ensure-criteria-files]] Synchronizes criteria dependencies before structured writeback
	await ensureCriteriaFilesExist(app, normalizedSections.map((section) => section.criteriaName))

	// @story [[lucrjournal/playbook#^playbook-body-replacement]] Preserves only frontmatter before replacing the structured body
	const existingMarkdown = await app.vault.cachedRead(file)
	const { frontmatterBlock } = splitMarkdownFrontmatter(existingMarkdown)
	const nextBody = serializePlaybookCriteriaSectionsMarkdown(normalizedSections)
	await app.vault.modify(file, `${frontmatterBlock}${nextBody}`)

	const removedCriteriaNames = normalizedPreviousSections == null
		? []
		: normalizedPreviousSections
			.map((section) => section.criteriaName)
			.filter((criteriaName) => !normalizedSections.some((section) => section.criteriaName === criteriaName))

	// @story [[lucrjournal/playbook#^cleanup-orphan-criteria]] Triggers candidate cleanup only for removed criteria names
	if (removedCriteriaNames.length > 0) {
		await cleanupOrphanCriteriaFiles(app, await loadAllPlaybookMarkdowns(app), removedCriteriaNames)
	}
}

export function resolvePlaybookCriteriaSectionOptions(
	app: App,
	sections: readonly CriteriaFormSection[],
) {
	return normalizeCriteriaOptions([
		...collectCriteriaOptions(CriteriaDomain.totalEntries(app)),
		...sections.map((section) => ({ value: section.criteriaName })),
	])
}

function normalizePlaybookCriteriaSections(sections: readonly CriteriaFormSection[]): CriteriaFormValue {
	const seenConfluenceNames = new Set<string>()
	const normalizedSections: CriteriaFormValue = []

	for (const section of sections) {
		const normalizedCriteriaName = normalizeCriteria(section.criteriaName)
		const normalizedConfluences = section.confluences.flatMap((confluence) => {
			const normalizedName = normalizePlaybookConfluenceName(confluence.name)
			if (normalizedName === '' || seenConfluenceNames.has(normalizedName.toLocaleLowerCase())) {
				return []
			}

			seenConfluenceNames.add(normalizedName.toLocaleLowerCase())
			return [{ name: normalizedName }]
		})

		if (normalizedCriteriaName === '' || normalizedConfluences.length === 0) {
			continue
		}

		normalizedSections.push({
			criteriaName: normalizedCriteriaName,
			confluences: normalizedConfluences,
		})
	}

	return normalizedSections
}

// @story [[lucrjournal/playbook#^unique-playbook-criteria]] Rejects duplicate normalized criteria names
function assertNoDuplicatePlaybookCriteriaNames(sections: readonly CriteriaFormSection[]) {
	const seenCriteriaNames = new Set<string>()

	for (const section of sections) {
		const normalizedCriteriaName = normalizeCriteria(section.criteriaName)
		if (normalizedCriteriaName === '') {
			continue
		}

		const normalizedKey = normalizedCriteriaName.toLocaleLowerCase()
		if (seenCriteriaNames.has(normalizedKey)) {
			throw new Error(PLAYBOOK_DUPLICATE_CRITERIA_ERROR)
		}
		seenCriteriaNames.add(normalizedKey)
	}
}

// @story [[lucrjournal/playbook#^unique-playbook-confluences]] Rejects duplicate normalized confluences across sections
function assertNoDuplicatePlaybookConfluenceNames(sections: readonly CriteriaFormSection[]) {
	const seenConfluenceNames = new Set<string>()

	for (const section of sections) {
		for (const confluence of section.confluences) {
			const normalizedName = normalizePlaybookConfluenceName(confluence.name)
			if (normalizedName === '') {
				continue
			}

			const normalizedKey = normalizedName.toLocaleLowerCase()
			if (seenConfluenceNames.has(normalizedKey)) {
				throw new Error(PLAYBOOK_DUPLICATE_CONFLUENCE_ERROR)
			}
			seenConfluenceNames.add(normalizedKey)
		}
	}
}

// @story [[lucrjournal/analysis#^playbook-private-confluence]] Creates missing playbook confluences as private entries
async function ensurePlaybookConfluencesExist(
	app: App,
	sections: readonly CriteriaFormSection[],
): Promise<void> {
	const existingConfluenceEntries = ConfluenceDomain.totalEntries(app)
	const existingConfluencesByName = new Map(
		existingConfluenceEntries.flatMap((entry) => entry.file.basename == null
			? []
			: [[entry.file.basename.toLocaleLowerCase(), entry] as const]),
	)

	for (const confluence of sections.flatMap((section) => section.confluences)) {
		const normalizedName = normalizePlaybookConfluenceName(confluence.name)
		if (normalizedName === '') {
			continue
		}

		const existingEntry = existingConfluencesByName.get(normalizedName.toLocaleLowerCase())
		if (existingEntry === undefined) {
			const createdEntry = await ConfluenceDomain.createEntry(
				app,
				{ name: normalizedName, description: '' },
				{ confluencePublic: false },
			)
			const createdFile = app.vault.getAbstractFileByPath(createdEntry.file.path)
			if (createdFile instanceof TFile) {
				existingConfluencesByName.set(normalizedName.toLocaleLowerCase(), {
					file: createdFile,
					fm: createdEntry.entry,
				})
			}
		}
	}
}

// @story [[lucrjournal/analysis#^committed-confluence-rename]] Renames one unambiguous committed confluence before playbook writeback
async function maybeRenameCommittedConfluence(
	app: App,
	previousSections: readonly CriteriaFormSection[] | undefined,
	nextSections: readonly CriteriaFormSection[],
) {
	if (previousSections === undefined) {
		return
	}

	const previousConfluences = previousSections.flatMap((section) => section.confluences)
	const nextConfluences = nextSections.flatMap((section) => section.confluences)
	if (previousConfluences.length !== nextConfluences.length) {
		return
	}

	const changedIndexes = previousConfluences.flatMap((confluence, index) => {
		const nextConfluence = nextConfluences[index]
		if (nextConfluence === undefined || nextConfluence.name === confluence.name) {
			return []
		}
		return [index]
	})
	if (changedIndexes.length !== 1) {
		return
	}

	const changedIndex = changedIndexes[0]
	if (changedIndex === undefined) {
		return
	}

	const previousConfluence = previousConfluences[changedIndex]
	const nextConfluence = nextConfluences[changedIndex]
	if (previousConfluence === undefined || nextConfluence === undefined) {
		return
	}

	const previousName = normalizePlaybookConfluenceName(previousConfluence.name)
	const nextName = normalizePlaybookConfluenceName(nextConfluence.name)
	if (previousName === '' || nextName === '' || previousName === nextName) {
		return
	}

	const existingNextEntry = ConfluenceDomain.totalEntries(app).find((entry) => entry.file.basename === nextName)
	if (existingNextEntry !== undefined) {
		return
	}

	const previousEntry = ConfluenceDomain.totalEntries(app).find((entry) => entry.file.basename === previousName)
	if (previousEntry === undefined || !(previousEntry.file instanceof TFile)) {
		return
	}

	const nextPath = buildRenamedEntryPath(previousEntry.file, nextName)
	if (nextPath === null) {
		return
	}

	const existingFile = app.vault.getAbstractFileByPath(normalizePath(nextPath))
	if (existingFile !== null) {
		return
	}

	await app.fileManager.renameFile(previousEntry.file, nextPath)
	await syncRenamedDocumentTitle(app, previousEntry.file, nextName)
}

// @story [[lucrjournal/playbook#^committed-criteria-rename]] Renames one unambiguous committed criteria file
async function maybeRenameCommittedCriteria(
	app: App,
	previousSections: readonly CriteriaFormSection[] | undefined,
	nextSections: readonly CriteriaFormSection[],
) {
	if (previousSections?.length !== nextSections.length) {
		return
	}

	const changedIndexes = previousSections.flatMap((section, index) => {
		const nextSection = nextSections[index]
		if (nextSection === undefined || nextSection.criteriaName === section.criteriaName) {
			return []
		}
		return [index]
	})
	if (changedIndexes.length !== 1) {
		return
	}

	const changedIndex = changedIndexes[0]
	if (changedIndex === undefined) {
		return
	}

	const previousSection = previousSections[changedIndex]
	const nextSection = nextSections[changedIndex]
	if (previousSection === undefined || nextSection === undefined) {
		return
	}

	const previousName = normalizeCriteria(previousSection.criteriaName)
	const nextName = normalizeCriteria(nextSection.criteriaName)
	if (previousName === '' || nextName === '' || previousName === nextName) {
		return
	}

	const existingNextEntry = CriteriaDomain.totalEntries(app).find((entry) => entry.file.basename === nextName)
	if (existingNextEntry !== undefined) {
		return
	}

	const previousEntry = CriteriaDomain.totalEntries(app).find((entry) => entry.file.basename === previousName)
	if (previousEntry === undefined || !(previousEntry.file instanceof TFile)) {
		return
	}

	const nextPath = buildRenamedEntryPath(previousEntry.file, nextName)
	if (nextPath === null) {
		return
	}

	const existingFile = app.vault.getAbstractFileByPath(normalizePath(nextPath))
	if (existingFile !== null) {
		return
	}

	await app.fileManager.renameFile(previousEntry.file, nextPath)
	await syncRenamedDocumentTitle(app, previousEntry.file, nextName)
}

async function loadAllPlaybookMarkdowns(app: App): Promise<string[]> {
	const markdowns: string[] = []
	for (const playbookEntry of PlaybookDomain.totalEntries(app)) {
		if (!(playbookEntry.file instanceof TFile)) {
			continue
		}

		markdowns.push(await app.vault.cachedRead(playbookEntry.file))
	}

	return markdowns
}

// @story [[lucrjournal/playbook#^playbook-body-replacement]] Recognizes the only frontmatter block preserved by structured save
function splitMarkdownFrontmatter(markdown: string): { frontmatterBlock: string; body: string } {
	if (!markdown.startsWith('---\n')) {
		return { frontmatterBlock: '', body: markdown }
	}

	const fenceEnd = markdown.indexOf('\n---\n', 4)
	if (fenceEnd === -1) {
		return { frontmatterBlock: '', body: markdown }
	}

	return {
		frontmatterBlock: markdown.slice(0, fenceEnd + 5),
		body: markdown.slice(fenceEnd + 5),
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('normalizePlaybookCriteriaSections', () => {
		it('keeps section order while deduplicating confluences globally', () => {
			expect(normalizePlaybookCriteriaSections([
				{
					criteriaName: ' Entry Criteria ',
					confluences: [{ name: 'confluence1' }, { name: 'confluence1' }],
				},
				{
					criteriaName: 'Exit/Criteria',
					confluences: [{ name: 'confluence2' }, { name: 'confluence/3' }],
				},
			])).toEqual([
				{
					criteriaName: 'Entry Criteria',
					confluences: [{ name: 'confluence1' }],
				},
				{
					criteriaName: 'Exit∕Criteria',
					confluences: [{ name: 'confluence2' }, { name: 'confluence∕3' }],
				},
			])
		})
	})

	describe('assertNoDuplicatePlaybookCriteriaNames', () => {
		// @story [[lucrjournal/playbook#^unique-playbook-criteria]] Covers duplicate normalized criteria rejection
		it('rejects duplicate normalized criteria names', () => {
			expect(() => assertNoDuplicatePlaybookCriteriaNames([
				{
					criteriaName: ' Entry∕Criteria ',
					confluences: [{ name: 'confluence1' }],
				},
				{
					criteriaName: 'Entry/Criteria',
					confluences: [{ name: 'confluence2' }],
				},
			])).toThrow(PLAYBOOK_DUPLICATE_CRITERIA_ERROR)
		})
	})

	describe('assertNoDuplicatePlaybookConfluenceNames', () => {
		// @story [[lucrjournal/playbook#^unique-playbook-confluences]] Covers global duplicate confluence rejection
		it('rejects duplicate confluence names across the same playbook', () => {
			expect(() => assertNoDuplicatePlaybookConfluenceNames([
				{
					criteriaName: 'Entry Criteria',
					confluences: [{ name: 'confluence/a' }],
				},
				{
					criteriaName: 'Exit Criteria',
					confluences: [{ name: 'confluence∕a' }],
				},
			])).toThrow(PLAYBOOK_DUPLICATE_CONFLUENCE_ERROR)
		})
	})

	describe('resolvePlaybookCriteriaSectionOptions', () => {
		it('includes persisted criteria and current draft section names', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [],
				},
				metadataCache: {
					getFileCache: () => null,
				},
			} as unknown as App

			expect(resolvePlaybookCriteriaSectionOptions(app, [{
				criteriaName: 'Custom Criteria',
				confluences: [{ name: 'confluence1' }],
			}])).toEqual([
				{ value: 'Entry Criteria', label: 'Entry Criteria' },
				{ value: 'Exit Criteria', label: 'Exit Criteria' },
				{ value: 'Custom Criteria', label: 'Custom Criteria' },
			])
		})
	})

	describe('playbookFormDefinition', () => {
		// @story [[lucrjournal/playbook#^default-playbook-criteria]] Covers the new playbook criteria preset
		it('seeds new playbooks with the default preset criteria section', () => {
			expect(PlaybookDomain.buildInitialFormValues()).toMatchObject({
				criteria: [{
					criteriaName: 'Entry Criteria',
					confluences: [{ name: '' }],
				}],
			})
		})

		// @story [[lucrjournal/analysis#^confluence-scope-lists]] Covers complete playbook confluence option visibility
		it('shows public and private confluence options', () => {
			const publicFile = createMockTFile('LucrJournal/analyses/public.md', 'public')
			const privateFile = createMockTFile('LucrJournal/analyses/private.md', 'private')
			const app = {
				vault: {
					getMarkdownFiles: () => [publicFile, privateFile],
				},
				metadataCache: {
					getFileCache: (file: TFile) => {
						if (file.path === publicFile.path) {
							return { frontmatter: { lucr_type: 'confluence', public: true } }
						}
						return { frontmatter: { lucr_type: 'confluence', public: false } }
					},
				},
			} as unknown as App

			const options = PlaybookDomain.formDefinition.criteria.dynamicOptions?.(
				app,
				{ name: 'PBK-1', description: '', criteria: [] },
				{},
			)

			expect(options?.map((option) => option.value)).toEqual(['public', 'private'])
			expect(options?.find((option) => option.value === 'public')?.icon).toEqual({ kind: 'lucide', value: 'globe' })
			expect(options?.find((option) => option.value === 'private')?.icon).toBeUndefined()
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
