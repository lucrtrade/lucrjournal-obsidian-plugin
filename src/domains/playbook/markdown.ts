/// <reference types="vitest/importMeta" />

import { sanitizeObsidianFileName } from '../../utils'
import { extractSections } from '../../utils/markdown-sections'
import { normalizeCriteria } from '../criteria'

import type { CriteriaFormSection, CriteriaFormValue } from '../core/form'

type PlaybookHeadingReference = {
	kind: 'criteria'
	name: string
}

const PLAYBOOK_CRITERIA_HEADING_LEVEL = 1
const PLAYBOOK_CONFLUENCE_HEADING_LEVEL = 2

export function normalizePlaybookConfluenceName(value: string): string {
	return sanitizeObsidianFileName(value).trim()
}

export function parsePlaybookCriteriaSectionsMarkdown(markdown: string): CriteriaFormValue {
	const body = stripMarkdownFrontmatter(markdown)
	const sections = extractSections(body, PLAYBOOK_CRITERIA_HEADING_LEVEL)
	const normalizedSections: CriteriaFormValue = []
	const seenConfluenceNames = new Set<string>()

	for (const section of sections) {
		const criteriaHeading = parsePlaybookHeading(section.title)
		if (criteriaHeading === null) {
			continue
		}

		const confluences = extractSections(section.body, PLAYBOOK_CONFLUENCE_HEADING_LEVEL)
			.flatMap(({ title }) => {
				const linkedHeading = parsePlaybookHeading(title)
				if (linkedHeading === null) {
					return []
				}

				const normalizedName = normalizePlaybookConfluenceName(linkedHeading.name)
				if (normalizedName === '' || seenConfluenceNames.has(normalizedName.toLocaleLowerCase())) {
					return []
				}

				seenConfluenceNames.add(normalizedName.toLocaleLowerCase())
				return [{ name: normalizedName }]
			})

		if (confluences.length === 0) {
			continue
		}

		normalizedSections.push({
			criteriaName: criteriaHeading.name,
			confluences,
		})
	}

	return normalizedSections
}

export function serializePlaybookCriteriaSectionsMarkdown(
	sections: readonly CriteriaFormSection[],
): string {
	const normalizedSections = normalizePlaybookCriteriaSectionsForMarkdown(sections)
	if (normalizedSections.length === 0) {
		return ''
	}

	return `${normalizedSections.map((section) => [
		`# [[${section.criteriaName}]]`,
		'',
		...section.confluences.flatMap((confluence) => [`## [[${confluence.name}]]`, '']),
	].join('\n').trimEnd()).join('\n\n')}\n`
}

export function listPlaybookCriteriaNamesFromMarkdown(markdown: string): string[] {
	return normalizePlaybookCriteriaSectionsForMarkdown(parsePlaybookCriteriaSectionsMarkdown(markdown))
		.map((section) => section.criteriaName)
}

function normalizePlaybookCriteriaSectionsForMarkdown(
	sections: readonly CriteriaFormSection[],
): CriteriaFormValue {
	const seenCriteriaNames = new Set<string>()
	const seenConfluenceNames = new Set<string>()
	const normalizedSections: CriteriaFormValue = []

	for (const section of sections) {
		const normalizedCriteriaName = normalizeCriteria(section.criteriaName)
		if (normalizedCriteriaName === '') {
			continue
		}

		const normalizedCriteriaKey = normalizedCriteriaName.toLocaleLowerCase()
		if (seenCriteriaNames.has(normalizedCriteriaKey)) {
			continue
		}

		const normalizedConfluences = section.confluences.flatMap((confluence) => {
			const normalizedConfluenceName = normalizePlaybookConfluenceName(confluence.name)
			if (normalizedConfluenceName === '') {
				return []
			}

			const normalizedConfluenceKey = normalizedConfluenceName.toLocaleLowerCase()
			if (seenConfluenceNames.has(normalizedConfluenceKey)) {
				return []
			}

			seenConfluenceNames.add(normalizedConfluenceKey)
			return [{ name: normalizedConfluenceName }]
		})

		if (normalizedConfluences.length === 0) {
			continue
		}

		seenCriteriaNames.add(normalizedCriteriaKey)
		normalizedSections.push({
			criteriaName: normalizedCriteriaName,
			confluences: normalizedConfluences,
		})
	}

	return normalizedSections
}

function parsePlaybookHeading(title: string): PlaybookHeadingReference | null {
	const match = title.match(/^\[\[([^\]]+)\]\]$/)
	if (match === null) {
		return null
	}

	const normalizedName = normalizeCriteria(match[1] ?? '')
	if (normalizedName === '') {
		return null
	}

	return {
		kind: 'criteria',
		name: normalizedName,
	}
}

function stripMarkdownFrontmatter(markdown: string): string {
	if (!markdown.startsWith('---\n')) {
		return markdown
	}

	const fenceEnd = markdown.indexOf('\n---\n', 4)
	if (fenceEnd === -1) {
		return markdown
	}

	return markdown.slice(fenceEnd + 5)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('parsePlaybookCriteriaSectionsMarkdown', () => {
		it('parses criteria H1 and confluence H2 hierarchy', () => {
			expect(parsePlaybookCriteriaSectionsMarkdown([
				'---',
				'lucr_type: "playbook"',
				'---',
				'',
				'# [[Enter Criteria]]',
				'',
				'## [[confluence1]]',
				'',
				'## [[confluence2]]',
				'',
				'# [[Exit Criteria]]',
				'',
				'## [[confluence3]]',
			].join('\n'))).toEqual([
				{
					criteriaName: 'Enter Criteria',
					confluences: [{ name: 'confluence1' }, { name: 'confluence2' }],
				},
				{
					criteriaName: 'Exit Criteria',
					confluences: [{ name: 'confluence3' }],
				},
			])
		})
	})

	describe('serializePlaybookCriteriaSectionsMarkdown', () => {
		it('serializes the stable criteria-first markdown structure', () => {
			expect(serializePlaybookCriteriaSectionsMarkdown([
				{
					criteriaName: 'Enter Criteria',
					confluences: [{ name: 'confluence1' }, { name: 'confluence2' }],
				},
				{
					criteriaName: 'Exit Criteria',
					confluences: [{ name: 'confluence3' }],
				},
			])).toBe([
				'# [[Enter Criteria]]',
				'',
				'## [[confluence1]]',
				'',
				'## [[confluence2]]',
				'',
				'# [[Exit Criteria]]',
				'',
				'## [[confluence3]]',
				'',
			].join('\n'))
		})
	})
}
