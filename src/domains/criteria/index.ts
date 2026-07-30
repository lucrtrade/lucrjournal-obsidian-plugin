/// <reference types="vitest/importMeta" />

import { type } from 'arktype'

import { sanitizeObsidianFileName } from '../../utils'
import { coerceFrontmatterField, coerceLiteral, type CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import { BasenameDomainBase } from '../core/basename-domain'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce } from '../core/domain-timestamps'
import { type CriteriaFormValue } from '../core/form'

import type { DomainValue, DomainPersistedEntry } from '../core/type'

export interface CriteriaOption {
	value: string
	label?: string
}

const DEFAULT_CRITERIA_OPTIONS = [
	{ value: 'Entry Criteria' },
	{ value: 'Exit Criteria' },
] as const satisfies readonly CriteriaOption[]

// @story [[lucrjournal/playbook#^default-playbook-criteria]] Defines the sole new-playbook criteria placeholder
const DEFAULT_PLAYBOOK_CRITERIA_PRESET = {
	criteriaName: 'Entry Criteria',
	confluences: [{ name: '' }],
} as const satisfies CriteriaFormValue[number]

const CRITERIA_FOLDER_NAME = 'criteria'
const CRITERIA_NAME_REQUIRED_ERROR = 'CRITERIA_NAME_REQUIRED_ERROR'

const CriteriaType = type({
	lucr_type: '"criteria"',
	...DOMAIN_TIMESTAMP_FIELDS,
})

class CriteriaDomainDefinition extends BasenameDomainBase<'criteria', typeof CriteriaType> {
	override readonly name = 'criteria' as const
	override readonly schema = CriteriaType
	override readonly options = { persisted: { folderName: CRITERIA_FOLDER_NAME } }
	protected override readonly folderName = CRITERIA_FOLDER_NAME
	protected override readonly nameRequiredError = CRITERIA_NAME_REQUIRED_ERROR

	override coerce(record: CoercibleFrontmatter<typeof CriteriaType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'criteria'))
		applyDomainTimestampCoerce(record)
		return record
	}

	override toDebugLabel(_criteria: typeof CriteriaType.infer) {
		return this.name
	}
}

export const CriteriaDomain = new CriteriaDomainDefinition()

type Criteria = DomainValue<typeof CriteriaDomain>

// @story [[lucrjournal/playbook#^criteria-link-identity]] Sanitizes criteria names at the identity boundary
export function normalizeCriteria(value: string): string {
	return sanitizeObsidianFileName(value).trim()
}

function normalizeCriteriaWikilink(value: string): string | null {
	const normalizedName = normalizeCriteria(extractCriteriaBody(value))
	return normalizedName === '' ? null : `[[${normalizedName}]]`
}

export function parseCriteriaName(value: string): string {
	return normalizeCriteria(extractCriteriaBody(value))
}

// @story [[lucrjournal/playbook#^criteria-link-identity]] Produces unique canonical criteria wikilinks
export function normalizeCriteriaLinks(value: readonly string[] | string | null | undefined): string[] {
	const values = Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: typeof value === 'string'
			? [value]
			: []
	const seen = new Set<string>()
	const normalizedLinks: string[] = []

	for (const item of values) {
		const normalizedLink = normalizeCriteriaWikilink(item)
		if (normalizedLink == null) {
			continue
		}

		const normalizedKey = normalizedLink.toLocaleLowerCase()
		if (seen.has(normalizedKey)) {
			continue
		}

		seen.add(normalizedKey)
		normalizedLinks.push(normalizedLink)
	}

	return normalizedLinks
}

export function parseCriteriaNames(value: readonly string[] | string | null | undefined): string[] {
	return normalizeCriteriaLinks(value).map((link) => parseCriteriaName(link))
}

export function buildDefaultPlaybookCriteriaPreset(): CriteriaFormValue {
	return [{
		criteriaName: DEFAULT_PLAYBOOK_CRITERIA_PRESET.criteriaName,
		confluences: DEFAULT_PLAYBOOK_CRITERIA_PRESET.confluences.map((confluence) => ({ name: confluence.name })),
	}]
}

export function normalizeCriteriaOptions(options: readonly CriteriaOption[]): CriteriaOption[] {
	const seen = new Set<string>()
	const normalizedOptions: CriteriaOption[] = []

	for (const option of options) {
		const value = normalizeCriteria(option.value)
		if (value === '') {
			continue
		}

		const normalizedKey = value.toLocaleLowerCase()
		if (seen.has(normalizedKey)) {
			continue
		}

		seen.add(normalizedKey)
		const normalizedLabel = option.label == null ? undefined : normalizeCriteria(option.label)
		normalizedOptions.push({
			value,
			label: normalizedLabel == null || normalizedLabel === '' ? value : normalizedLabel,
		})
	}

	return normalizedOptions
}

// @story [[lucrjournal/playbook#^criteria-option-source]] Merges defaults and persisted basenames into one sorted source
export function collectCriteriaOptions(
	entries: readonly Pick<DomainPersistedEntry<Criteria>, 'file'>[],
): CriteriaOption[] {
	return normalizeCriteriaOptions(
		[
			...DEFAULT_CRITERIA_OPTIONS,
			...entries.flatMap((entry) => entry.file.basename == null ? [] : [{ value: entry.file.basename }]),
		],
	).sort(compareCriteriaOptions)
}

function compareCriteriaOptions(left: CriteriaOption, right: CriteriaOption): number {
	return left.value.localeCompare(right.value)
}

function extractCriteriaBody(value: string): string {
	const trimmed = value.trim()
	if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]')) {
		return trimmed
	}

	return trimmed.slice(2, -2).split(/[|#^]/, 1)[0]?.trim() ?? ''
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('normalizeCriteria', () => {
		// @story [[lucrjournal/playbook#^criteria-link-identity]] Covers criteria basename sanitization
		it('sanitizes criteria names to valid Obsidian basenames', () => {
			expect(normalizeCriteria(' Enter/Criteria:1 ')).toBe('Enter∕Criteria꞉1')
		})
	})

	describe('normalizeCriteriaLinks', () => {
		// @story [[lucrjournal/playbook#^criteria-link-identity]] Covers raw link normalization empty removal and deduplication
		it('normalizes raw values to unique wikilinks', () => {
			expect(normalizeCriteriaLinks([
				' [[Enter Criteria]] ',
				'Enter/Criteria',
				'Enter∕Criteria',
				'[[Enter Criteria]]',
				'',
			])).toEqual([
				'[[Enter Criteria]]','[[Enter∕Criteria]]',
			])
		})
	})

	describe('parseCriteriaNames', () => {
		it('returns normalized basenames', () => {
			expect(parseCriteriaNames([
				'[[Entry Criteria]]',
				'Exit/Criteria',
			])).toEqual([
				'Entry Criteria',
				'Exit∕Criteria',
			])
		})
	})

	describe('collectCriteriaOptions', () => {
		// @story [[lucrjournal/playbook#^criteria-option-source]] Covers default merge deduplication and sorted output
		it('collects default and persisted criteria basenames', () => {
			expect(collectCriteriaOptions([
				{ file: { basename: 'Breakout' } },
				{ file: { basename: 'Mean Reversion' } },
				{ file: { basename: 'Entry Criteria' } },
			] as Array<Pick<DomainPersistedEntry<Criteria>, 'file'>>)).toEqual([
				{ value: 'Breakout', label: 'Breakout' },
				{ value: 'Entry Criteria', label: 'Entry Criteria' },
				{ value: 'Exit Criteria', label: 'Exit Criteria' },
				{ value: 'Mean Reversion', label: 'Mean Reversion' },
			])
		})
	})

	describe('buildDefaultPlaybookCriteriaPreset', () => {
		// @story [[lucrjournal/playbook#^default-playbook-criteria]] Covers the isolated preset value and placeholder
		it('builds the stable new-playbook preset section', () => {
			expect(buildDefaultPlaybookCriteriaPreset()).toEqual([
				{
					criteriaName: 'Entry Criteria',
					confluences: [{ name: '' }],
				},
			])
		})
	})
}
