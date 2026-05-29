/// <reference types="vitest/importMeta" />

import { type } from 'arktype'
import { TFile, type App } from 'obsidian'

import { t } from '../../lang/helpers'
import { coerceFrontmatterField, coerceStringArray } from '../../utils/frontmatter-coerce'
import { DOMAIN_TIMESTAMP_FIELDS } from '../core/domain-timestamps'
import { defineFields, TABLE_FIELD_DISPLAYS } from '../core/fields'
import { CriteriaDomain, collectCriteriaOptions, normalizeCriteriaLinks, parseCriteriaName } from '../criteria'
import { parsePlaybookCriteriaSectionsMarkdown } from '../playbook/markdown'

import {
	listEntriesWithPositionStats,
	type LinkedPositionSectionDefinition,
	toLinkedEntryStatsTableEntry,
} from './linked-entry-stats'
import { SimpleAnalysisDomainBase, type SimpleAnalysisTableFieldDescriptor } from './simple-analysis-domain'

import type { CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import type { CreateEntryContext } from '../core/entry-writer'
import type { DomainValue } from '../core/type'

const ConfluenceType = type({
	lucr_type: '"confluence"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'public?': 'boolean',
	'criteria?': 'string[] | null',
	'description?': 'string | null',
	'icon?': 'string | null',
	'tags?': 'string[] | null',
})

const CONFLUENCE_FOLDER_NAME = 'analyses'
const CONFLUENCE_NAME_REQUIRED_ERROR = 'CONFLUENCE_NAME_REQUIRED_ERROR'

class ConfluenceDomainDefinition extends SimpleAnalysisDomainBase<'confluence', typeof ConfluenceType> {
	override readonly name = 'confluence' as const
	override readonly schema = ConfluenceType
	protected override readonly folderName = CONFLUENCE_FOLDER_NAME
	protected override readonly nameRequiredError = CONFLUENCE_NAME_REQUIRED_ERROR
	protected override readonly defaultIcon = { kind: 'lucide', value: 'git-merge' } as const
	override readonly options = { persisted: { folderName: CONFLUENCE_FOLDER_NAME } }

	protected override buildPayloadFields(formValue: { name: string; description?: string }, ctx: CreateEntryContext) {
		return {
			...super.buildPayloadFields(formValue, ctx),
			public: ctx.confluencePublic ?? true,
		}
	}

	override builtinProperties() {
		return {
			public: 'checkbox',
		} as const
	}

	override coerce(record: CoercibleFrontmatter<typeof ConfluenceType['inferIn']>) {
		this.coerceSimpleAnalysisRecord(record)
		delete record.playbook
		if (!Object.prototype.hasOwnProperty.call(record, 'public')) {
			record.public = true
		}
		coerceFrontmatterField(record, 'public', normalizeConfluencePublic)
		coerceFrontmatterField(record, 'criteria', (value) => {
			const normalizedValue = normalizeCriteriaLinks(coerceStringArray(value) as string[] | string | null)
			return normalizedValue.length === 0 ? null : normalizedValue
		})
		return record
	}

	override tableFields() {
		return [
			this.tableCreatedField(),
			this.tableTitleField(),
			this.tablePositionCountField(),
			this.tableCriteriaField(),
			this.tableTagsField(),
			this.tableActionsField(),
		]
	}

	private tableCriteriaField(): SimpleAnalysisTableFieldDescriptor {
		return {
			key: 'criteria',
			usages: ['Table'],
			type: 'wikilink-array',
			label: () => t('DASHBOARD_ENTRY_COLUMN_CRITERIA'),
			getValue: (entry) => normalizeCriteriaLinks(entry.fm.entryStats.entry.fm.criteria).map((link) => ({
				name: parseCriteriaName(link),
				link,
			})),
			dynamicCriteriaOptions: (app) => collectCriteriaOptions(CriteriaDomain.totalEntries(app)),
			columnFilter: 'includes',
			sortable: true,
			compareFn: (left, right) =>
				stringifyCriteriaNames(left.fm.entryStats.entry.fm.criteria).localeCompare(stringifyCriteriaNames(right.fm.entryStats.entry.fm.criteria)),
			table: { width: 'xl', cellOverflow: 'visible', display: TABLE_FIELD_DISPLAYS.tagList },
			readonly: true,
			writeback: { field: 'criteria', type: 'wikilink-array', editable: true },
		}
	}
}

export const ConfluenceDomain = new ConfluenceDomainDefinition()

export type Confluence = DomainValue<typeof ConfluenceDomain>

async function createLinkedConfluenceEntry(app: App, name: string) {
	const result = await ConfluenceDomain.createEntry(app, { name, description: '' })
	return { file: result.file, fm: result.entry }
}

function normalizeConfluencePublic(value: unknown): boolean {
	if (value === false) {
		return false
	}

	if (typeof value === 'string') {
		const normalizedValue = value.trim().toLocaleLowerCase()
		if (normalizedValue === 'false' || normalizedValue === 'private' || normalizedValue === '0' || normalizedValue === 'no') {
			return false
		}
	}

	return true
}

export function isPublicConfluence(entry: Pick<Confluence, 'public'>) {
	return entry.public !== false
}

export function listPublicConfluenceEntries(app: App) {
	return ConfluenceDomain.totalEntries(app).filter((entry) => isPublicConfluence(entry.fm))
}

export function listPlaybookConfluenceEntries(app: App) {
	return ConfluenceDomain.totalEntries(app)
}

export async function listPositionConfluenceEntries(
	app: App,
	playbookFile: TFile | null,
) {
	const entries = ConfluenceDomain.totalEntries(app)
	if (playbookFile === null) {
		return entries.filter((entry) => isPublicConfluence(entry.fm))
	}

	const playbookPrivateConfluenceNames = new Set(
		parsePlaybookCriteriaSectionsMarkdown(await app.vault.cachedRead(playbookFile))
			.flatMap((section) => section.confluences.map((confluence) => confluence.name.toLocaleLowerCase())),
	)

	return entries.filter((entry) =>
		isPublicConfluence(entry.fm)
		|| playbookPrivateConfluenceNames.has((entry.file.basename ?? '').toLocaleLowerCase()))
}

export function listConfluenceTableEntries(app: App) {
	return listEntriesWithPositionStats(app, listPublicConfluenceEntries(app)).map(toLinkedEntryStatsTableEntry)
}

export const confluenceLinkedPositionSection = {
	kind: 'confluence',
	icon: 'git-merge',
	titleKey: 'TAB_CONFLUENCE',
	createLinkedEntry: createLinkedConfluenceEntry,
} as const satisfies LinkedPositionSectionDefinition<Confluence>

export const confluenceTableFields = defineFields(ConfluenceDomain.tableFields())

function stringifyCriteriaNames(criteria: readonly string[] | null | undefined) {
	return normalizeCriteriaLinks(criteria).map((link) => parseCriteriaName(link)).join('\n')
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('ConfluenceDomain', () => {
		it('accepts the stable persisted fields', () => {
			expect(ConfluenceType.allows({
				lucr_type: 'confluence',
				public: false,
				criteria: ['[[Breakout]]'],
				description: 'Confluence sample',
				icon: 'git-merge',
			})).toBe(true)
		})

		it('creates entries with optional description frontmatter', () => {
			expect(Reflect.has(ConfluenceDomain.formDefinition, 'description')).toBe(true)
			expect(ConfluenceDomain.createEntryDescriptor.buildPayload({
				name: 'Breakout stack',
				description: '  Trend plus volume  ',
			}, {})).toMatchObject({
				lucr_type: 'confluence',
				description: 'Trend plus volume',
				public: true,
			})
			expect(ConfluenceDomain.createEntryDescriptor.buildPayload({
				name: 'Pullback stack',
				description: '   ',
			}, {})).toMatchObject({
				description: null,
			})
		})

		it('coerces criteria arrays to normalized wikilinks', () => {
			expect(ConfluenceDomain.coerce({
				lucr_type: 'confluence',
				criteria: [' [[Breakout]] ', 'Exit/Criteria', 'Breakout'],
			}).criteria).toEqual(['[[Breakout]]', '[[Exit∕Criteria]]'])

			expect(ConfluenceDomain.coerce({
				lucr_type: 'confluence',
				criteria: ['   '],
			}).criteria).toBeNull()
		})

		it('coerces visibility to public by default and ignores legacy playbook owners', () => {
			expect(ConfluenceDomain.coerce({
				lucr_type: 'confluence',
				playbook: '[[PBK-1]]',
			})).toMatchObject({ public: true })

			expect(ConfluenceDomain.coerce({
				lucr_type: 'confluence',
				public: false,
			}).public).toBe(false)

			expect(ConfluenceDomain.coerce({
				lucr_type: 'confluence',
				public: 'private' as unknown as boolean,
			}).public).toBe(false)
		})

		it('lists public confluences for public visibility', () => {
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

			expect(listPublicConfluenceEntries(app).map((entry) => entry.file.basename)).toEqual(['public'])
		})

		it('lists public and current-playbook private confluences for position visibility', async () => {
			const publicFile = createMockTFile('LucrJournal/analyses/public.md', 'public')
			const currentPrivateFile = createMockTFile('LucrJournal/analyses/current-private.md', 'current-private')
			const otherPrivateFile = createMockTFile('LucrJournal/analyses/other-private.md', 'other-private')
			const playbookFile = createMockTFile('LucrJournal/playbooks/PBK.md', 'PBK')
			const app = {
				vault: {
					getMarkdownFiles: () => [publicFile, currentPrivateFile, otherPrivateFile],
					cachedRead: async () => '# [[Setup]]\n## [[current-private]]\n',
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

			expect((await listPositionConfluenceEntries(app, null)).map((entry) => entry.file.basename)).toEqual(['public'])
			expect((await listPositionConfluenceEntries(app, playbookFile)).map((entry) => entry.file.basename)).toEqual(['public', 'current-private'])
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
