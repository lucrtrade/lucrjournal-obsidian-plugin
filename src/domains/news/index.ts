/// <reference types="vitest/importMeta" />

import { type } from 'arktype'
import * as Obsidian from 'obsidian'
import { Notice, requestUrl } from 'obsidian'

import { t } from '../../lang/helpers'
import { resolveHttpPageTitle, sanitizeObsidianFileName, toNullableTrimmedValue } from '../../utils'
import { coerceFrontmatterField, coerceLiteral, coerceLowercaseString, coerceNullableString, coerceStringArray } from '../../utils/frontmatter-coerce'
import { listEntriesWithPositionStats, type LinkedEntryStatsRow } from '../analysis/linked-entry-stats'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce } from '../core/domain-timestamps'
import {
	assertNoPersistedEntryBasenameConflict,
	hasPersistedEntryBasenameConflict,
	PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR,
	type CreateEntryContext,
} from '../core/entry-writer'
import { DomainBase } from '../core/factory'
import { defineFields, TABLE_FIELD_DISPLAYS, type FieldDescriptor, type TitleFieldValue } from '../core/fields'
import { defineForm, type SelectOption, type SelectOptionTone } from '../core/form'
import { resolveIconDescriptor } from '../core/icon-descriptor'
import { collectVaultTagOptions } from '../core/tags'
import { SELECT_OPTION_COLOR_VARS } from '../core/ui'

import type { CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import type { LinkedEntryTableFieldType, LinkedPositionSectionDefinition } from '../analysis/linked-entry-stats'
import type { IconDescriptor } from '../core/icon-descriptor'
import type { DomainValue } from '../core/type'
import type { App } from 'obsidian'

type NewsFormShape = {
	name: { type: 'text' }
	source: { type: 'url' }
}

const NEWS_NAME_REQUIRED_ERROR = 'NEWS_NAME_REQUIRED_ERROR'
const NEWS_SOURCE_DEFUDDLE_ERROR = 'NEWS_SOURCE_DEFUDDLE_ERROR'
const NEWS_FOLDER_NAME = 'news'
const DEFUDDLE_MARKDOWN_URL_PREFIX = 'https://defuddle.md/'

const NewsType = type({
	lucr_type: '"news"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'description?': 'string | null',
	'impact?': '"high" | "medium" | "low" | null',
	'icon?': 'string | null',
	'source?': 'string | null',
	'tags?': 'string[] | null',
})

const newsFormDefinition = defineForm<NewsFormShape>({
	name: {
		type: 'text',
		label: 'DASHBOARD_ENTRY_FIELD_NAME_LABEL',
		required: true,
		asyncPlaceholder: async (values) => {
			if (values.name.trim() !== '') {
				return undefined
			}

			const resolvedTitle = await resolveHttpPageTitle(values.source)
			return resolvedTitle ?? undefined
		},
		validate: (value, _values, context) => {
			const fileBaseName = sanitizeNewsFileBaseName(value)
			if (fileBaseName.length === 0) {
				return _values.source.trim() === ''
					? 'DASHBOARD_ENTRY_FIELD_NAME_REQUIRED'
					: undefined
			}
			if (context.app !== undefined && hasNewsNameConflict(context.app, value)) {
				return 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE'
			}
			return undefined
		},
	},
	source: {
		type: 'url',
		label: 'DASHBOARD_ENTRY_FIELD_SOURCE_LABEL',
		placeholder: 'DASHBOARD_ENTRY_FIELD_SOURCE_PLACEHOLDER',
		validate: (value) => value.trim() === '' || isValidHttpUrl(value) ? undefined : 'DASHBOARD_ENTRY_FIELD_SOURCE_INVALID',
	},
} as const)

function getNewsImpactSelectOptions(): SelectOption[] {
	return [
		{
			value: 'high',
			label: 'High',
			labelKey: 'DASHBOARD_ENTRY_IMPACT_HIGH',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.surfDangerSoft,
				text: SELECT_OPTION_COLOR_VARS.cDanger,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
		{
			value: 'medium',
			label: 'Medium',
			labelKey: 'DASHBOARD_ENTRY_IMPACT_MEDIUM',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.surfWarningSoft,
				text: SELECT_OPTION_COLOR_VARS.cWarning,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
		{
			value: 'low',
			label: 'Low',
			labelKey: 'DASHBOARD_ENTRY_IMPACT_LOW',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.surfSuccessSoft,
				text: SELECT_OPTION_COLOR_VARS.cSuccess,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
	]
}

function resolveNewsImpactTone(impact: News['impact']): SelectOptionTone | undefined {
	return getNewsImpactSelectOptions().find((option) => option.value === impact)?.tone
}

export function resolveNewsTitleIcon(news: Pick<News, 'icon' | 'impact'>): IconDescriptor | string | null | undefined {
	const impactTone = resolveNewsImpactTone(news.impact)
	const existingIcon = news.icon
	if (existingIcon != null) {
		const resolvedExistingIcon = resolveIconDescriptor(existingIcon)
		return resolvedExistingIcon?.kind === 'lucide' && impactTone !== undefined
			? { ...resolvedExistingIcon, color: impactTone.text }
			: existingIcon
	}

	return impactTone === undefined
		? { kind: 'lucide', value: 'newspaper' }
		: { kind: 'lucide', value: 'newspaper', color: impactTone.text }
}

class NewsDomainDefinition extends DomainBase<'news', typeof NewsType, typeof newsFormDefinition> {
	override readonly name = 'news' as const
	override readonly schema = NewsType
	override readonly options = { persisted: { folderName: NEWS_FOLDER_NAME } }
	override readonly formDefinition = newsFormDefinition
	override readonly createEntryDescriptor = {
		buildId(entry: News) {
			return entry.source ?? '' 
		},
		buildPayload(formValue: { name: string; source: string }) {
			const fileBaseName = sanitizeNewsFileBaseName(formValue.name)
			if (fileBaseName.length === 0) {
				throw new Error(NEWS_NAME_REQUIRED_ERROR) 
			}
			return NewsType.assert({
				lucr_type: 'news',
				source: toNullableTrimmedValue(formValue.source),
			})
		},
		validate(formValue: { name: string; source: string }, app: App) {
			assertNoPersistedEntryBasenameConflict(app, NEWS_FOLDER_NAME, formValue.name)
		},
		// @story [[lucrjournal/domain-model#^sourceless-news-identity]] Resolves source-less news to an empty document body
		async buildBody(entry: News, ctx: CreateEntryContext) {
			return await buildNewsBody(entry, ctx)
		},
		// @story [[lucrjournal/domain-model#^sourceless-news-identity]] Uses the sanitized form name as the file identity
		buildFileName(_entry: News, _ctx: CreateEntryContext, formValue: { name: string; source: string }) {
			const fileBaseName = sanitizeNewsFileBaseName(formValue.name)
			if (fileBaseName !== '') {
				return fileBaseName
			}
			throw new Error('news buildFileName requires resolved form name')
		},
	}
	impactOptions(): SelectOption[] {
		return getNewsImpactSelectOptions()
	}
	override toCreateEntryErrorMessageKey(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === NEWS_NAME_REQUIRED_ERROR) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_REQUIRED' as const
		}
		if (message === PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE' as const
		}
		return null
	}
	override coerce(record: CoercibleFrontmatter<typeof NewsType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'news'))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(record, 'description', coerceNullableString)
		coerceFrontmatterField(record, 'icon', coerceNullableString)
		coerceFrontmatterField(record, 'source', coerceNullableString)
		coerceFrontmatterField(record, 'impact', coerceLowercaseString)
		coerceFrontmatterField(record, 'tags', coerceStringArray)
		return record
	}
	override toDebugLabel(entry: News) {
		return `${this.name}:${entry.source ?? '-'}` 
	}
}
export const NewsDomain = new NewsDomainDefinition()

export type News = DomainValue<typeof NewsDomain>
// @story [[lucrjournal/analysis#^position-linked-entry-defaults]] Creates position-linked news without a source
async function createLinkedNewsEntry(app: App, name: string) {
	const result = await NewsDomain.createEntry(app, { name, source: '' })
	return { file: result.file, fm: result.entry }
}
export function listNewsEntriesWithStats(app: App) {
	return listEntriesWithPositionStats(app, NewsDomain.totalEntries(app))
}
export const newsLinkedPositionSection = {
	kind: 'news',
	icon: 'newspaper',
	titleKey: 'TAB_NEWS',
	createLinkedEntry: createLinkedNewsEntry,
} as const satisfies LinkedPositionSectionDefinition<News>
type NewsTableFieldDescriptor = FieldDescriptor<LinkedEntryStatsRow> & { type: LinkedEntryTableFieldType }
// @story [[lucrjournal/fields#^searchable-field-projections]] Defines news title source and tag search fields
// @story [[lucrjournal/fields#^custom-sort-projections]] Defines locale ordering for news titles and joined tags
// @story [[lucrjournal/fields#^tag-filter]] Defines normalized substring matching for news tags
// @story [[lucrjournal/fields#^news-source-writeback]] Declares the source preview cell over persisted news source
export const newsTableFields = defineFields<LinkedEntryStatsRow>([
	{
		key: 'created',
		usages: ['Table'],
		type: 'datetime',
		label: () => t('DASHBOARD_ENTRY_COLUMN_DATE'),
		getValue: (entry) => entry.fm.entryStats.entry.fm.created,
		columnFilter: 'by_date',
		sortable: true,
		table: { width: 'lg', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.relativeDatetime },
	},
	{
		key: 'title',
		usages: ['Table'],
		type: 'title',
		label: () => t('DASHBOARD_ENTRY_COLUMN_TITLE'),
		searchable: true,
		getValue: (entry): TitleFieldValue => ({
			title: entry.fm.entryStats.entry.file.basename ?? '',
			icon: resolveNewsTitleIcon(entry.fm.entryStats.entry.fm),
			source: entry.fm.entryStats.entry.fm.source,
		}),
		sortable: true,
		compareFn: (left, right) => (left.fm.entryStats.entry.file.basename ?? '').localeCompare(right.fm.entryStats.entry.file.basename ?? ''),
		table: { width: 'fill', cellOverflow: 'clip' },
	},
	{
		key: 'source',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_ENTRY_COLUMN_SOURCE'),
		searchable: true,
		getValue: (entry) => entry.fm.entryStats.entry.fm.source,
		columnFilter: 'includes',
		sortable: true,
		table: { width: 'fill-secondary', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.sourcePreview },
	},
	{
		key: 'positionCount',
		usages: ['Table'],
		type: 'number',
		label: () => t('DASHBOARD_ENTRY_COLUMN_POSITION_COUNT'),
		getValue: (entry) => entry.fm.positionCount,
		columnFilter: 'range',
		sortable: true,
		table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.linkedPositionCount },
	},
	{
		key: 'impact',
		usages: ['Table'],
		type: 'enum',
		label: () => t('DASHBOARD_ENTRY_COLUMN_IMPACT'),
		getValue: (entry) => entry.fm.entryStats.entry.fm.impact,
		columnFilter: 'equals',
		options: NewsDomain.impactOptions(),
		sortable: true,
		table: { width: 'md', display: TABLE_FIELD_DISPLAYS.enumBadgeProminent },
		writeback: { field: 'impact', type: 'enum', editable: true },
	},
	{
		key: 'tags',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_ENTRY_COLUMN_TAGS'),
		searchable: true,
		getValue: (entry) => entry.fm.entryStats.entry.fm.tags ?? [],
		dynamicTagOptions: (app) => collectVaultTagOptions(app),
		columnFilter: {
			fn: (value, filterValue) => {
				if (typeof filterValue !== 'string' || filterValue.trim() === '') {
					return true 
				}
				if (!Array.isArray(value)) {
					return false 
				}
				const normalizedFilter = filterValue.trim().toLowerCase().replace(/^#/, '')
				return value.some((tag) => String(tag).toLowerCase().replace(/^#/, '').includes(normalizedFilter))
			},
		},
		sortable: true,
		compareFn: (left, right) =>
			(left.fm.entryStats.entry.fm.tags ?? []).join(' ').localeCompare((right.fm.entryStats.entry.fm.tags ?? []).join(' ')),
		table: { width: 'xl', cellOverflow: 'visible', display: TABLE_FIELD_DISPLAYS.tagList },
	},
	{
		key: 'actions',
		usages: ['Table'],
		type: 'text',
		label: () => t('DASHBOARD_ENTRY_COLUMN_ACTIONS'),
		columnFilter: 'none',
		sortable: false,
		table: { width: 'action', display: TABLE_FIELD_DISPLAYS.rowActions },
	},
] as NewsTableFieldDescriptor[])

function isValidHttpUrl(value: string): boolean {
	try {
		const url = new URL(value.trim())
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

export async function fetchNewsBodyFromSource(source: string): Promise<string> {
	try {
		const response = await requestUrl({
			url: `${DEFUDDLE_MARKDOWN_URL_PREFIX}${source}`,
			headers: {
				Accept: 'text/markdown,text/plain,*/*;q=0.8',
			},
			throw: false,
		})

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`defuddle request failed: ${response.status}`)
		}

		return stripMarkdownFrontmatter(response.text)
	} catch {
		new Notice(t('DASHBOARD_ENTRY_SOURCE_DEFUDDLE_FAILED'))
		throw new Error(NEWS_SOURCE_DEFUDDLE_ERROR)
	}
}

export function isDefuddleFetchError(error: unknown): boolean {
	return error instanceof Error && error.message === NEWS_SOURCE_DEFUDDLE_ERROR
}

// @story [[lucrjournal/analysis#^position-linked-entry-defaults]] Keeps source-less linked news bodies empty
async function buildNewsBody(entry: News, ctx: CreateEntryContext): Promise<string> {
	void ctx
	const source = entry.source?.trim()
	if (source == null || source === '') {
		return ''
	}

	try {
		return await fetchNewsBodyFromSource(source)
	} catch {
		return ''
	}
}

export function stripMarkdownFrontmatter(markdown: string): string {
	if (!markdown.startsWith('---\n')) {
		return markdown
	}

	const fenceEnd = markdown.indexOf('\n---\n', 4)
	if (fenceEnd === -1) {
		return markdown
	}

	return markdown.slice(fenceEnd + 5)
}

export function extractFrontmatterBlock(content: string): string {
	if (!content.startsWith('---\n')) {
		return ''
	}
	const end = content.indexOf('\n---\n', 4)
	if (end === -1) {
		return ''
	}
	return content.slice(0, end + 5)
}

function hasNewsNameConflict(app: App, rawName: string) {
	return hasPersistedEntryBasenameConflict(app, NEWS_FOLDER_NAME, sanitizeNewsFileBaseName(rawName))
}

function sanitizeNewsFileBaseName(value: string): string {
	return sanitizeObsidianFileName(value).trim()
}
if (import.meta.vitest) {
	const { beforeEach, describe, expect, it, vi } = import.meta.vitest

	describe('NewsDomain', () => {
		it('accepts the stable persisted fields', () => {
			expect(NewsType.allows({
				lucr_type: 'news',
				description: 'News sample',
				icon: 'newspaper',
				source: 'https://example.com/news/cpi',
				impact: 'high',
				tags: ['macro', 'cpi'],
			})).toBe(true)
		})

		it('colors the fallback title icon from impact tone', () => {
			expect(resolveNewsTitleIcon({
				icon: null,
				impact: 'high',
			})).toEqual({
				kind: 'lucide',
				value: 'newspaper',
				color: SELECT_OPTION_COLOR_VARS.cDanger,
			})
		})

		it('colors persisted lucide title icon from impact tone', () => {
			expect(resolveNewsTitleIcon({
				icon: 'newspaper',
				impact: 'high',
			})).toEqual({
				kind: 'lucide',
				value: 'newspaper',
				color: SELECT_OPTION_COLOR_VARS.cDanger,
			})
		})

		it('allows empty name validation when source is present', () => {
			expect(newsFormDefinition.name.validate?.('', { name: '', source: 'https://example.com/news/cpi' }, {}))
				.toBeUndefined()
		})

		it('keeps empty name validation error when source is empty', () => {
			expect(newsFormDefinition.name.validate?.('', { name: '', source: '' }, {}))
				.toBe('DASHBOARD_ENTRY_FIELD_NAME_REQUIRED')
		})

		it('builds an empty body when source is empty', async () => {
			await expect(buildNewsBody({
				lucr_type: 'news',
				source: null,
			}, { fileBaseName: 'CPI' })).resolves.toBe('')
		})

		// @story [[lucrjournal/domain-model#^sourceless-news-identity]] Covers the source-less path and empty document body
		it('creates source-less news with an empty body', async () => {
			const created: Array<{ path: string; content: string }> = []
			const app = {
				vault: {
					getMarkdownFiles: () => [],
					create: async (path: string, content: string) => {
						created.push({ path, content })
						return { path }
					},
				},
			} as unknown as App

			await NewsDomain.createEntry(app, { name: 'CPI', source: '' })

			expect(created[0]?.path).toBe('LucrJournal/news/CPI.md')
			expect(created[0]?.content).toContain('lucr_type: "news"')
			expect(created[0]?.content).toMatch(/\n---\n$/)
		})
	})

	describe('extractFrontmatterBlock', () => {
		it('returns empty string when no frontmatter', () => {
			expect(extractFrontmatterBlock('# Hello\n')).toBe('')
		})
		it('returns full block including trailing newline', () => {
			const content = '---\nlucr_type: news\n---\n# Title\n'
			expect(extractFrontmatterBlock(content)).toBe('---\nlucr_type: news\n---\n')
		})
		it('returns empty string when frontmatter fence never closes', () => {
			expect(extractFrontmatterBlock('---\nlucr_type: news\n')).toBe('')
		})
		it('round-trips with stripMarkdownFrontmatter', () => {
			const content = '---\nlucr_type: news\n---\n# Title\n'
			const block = extractFrontmatterBlock(content)
			const body = stripMarkdownFrontmatter(content)
			expect(block + body).toBe(content)
		})
	})

	describe('fetchNewsBodyFromSource', () => {
		beforeEach(() => {
			vi.restoreAllMocks()
		})

		it('strips frontmatter from fetched markdown', async () => {
			vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
				status: 200,
				text: '---\nlucr_type: news\n---\n# CPI\n',
			} as Awaited<ReturnType<typeof requestUrl>>)

			await expect(fetchNewsBodyFromSource('https://example.com/news/cpi')).resolves.toBe('# CPI\n')
		})

		it('shows a notice when defuddle request fails', async () => {
			const noticeSpy = vi.fn()
			vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
				status: 503,
				text: '',
			} as Awaited<ReturnType<typeof requestUrl>>)
			vi.spyOn(Obsidian, 'Notice').mockImplementation(class {
				constructor(message: string) {
					noticeSpy(message)
				}
			} as typeof Obsidian.Notice)

			await expect(fetchNewsBodyFromSource('https://example.com/news/cpi')).rejects.toThrow(NEWS_SOURCE_DEFUDDLE_ERROR)
			expect(noticeSpy).toHaveBeenCalledWith(t('DASHBOARD_ENTRY_SOURCE_DEFUDDLE_FAILED'))
		})

		it('identifies defuddle fetch errors', () => {
			expect(isDefuddleFetchError(new Error(NEWS_SOURCE_DEFUDDLE_ERROR))).toBe(true)
			expect(isDefuddleFetchError(new Error('other'))).toBe(false)
		})
	})
}
