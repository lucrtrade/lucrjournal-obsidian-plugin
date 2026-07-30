/// <reference types="vitest/importMeta" />

import { getFileBasename, parseWikilinkHeading } from '../../utils'
import { coerceWikilink } from '../../utils/frontmatter-coerce'
import { extractSections } from '../../utils/markdown-sections'

import type { PositionSectionKind } from './index'
import type { App, TFile } from 'obsidian'

// @story [[lucrjournal/position-body#^position-section-contract]] Defines the canonical position section titles
export const POSITION_NOTES_SECTION = 'Notes'
export const POSITION_NEWS_SECTION = 'News'
export const POSITION_KEY_LEVEL_SECTION = 'Key Levels'
export const POSITION_CONFLUENCE_SECTION = 'Confluence'
export const POSITION_MARKET_ANALYSIS_SECTION = 'Market Analysis'

const POSITION_REQUIRED_TOP_LEVEL_SECTIONS = [
	POSITION_NOTES_SECTION,
] as const

const POSITION_OPTIONAL_TOP_LEVEL_SECTIONS = [
	POSITION_NEWS_SECTION,
	POSITION_KEY_LEVEL_SECTION,
	POSITION_CONFLUENCE_SECTION,
	POSITION_MARKET_ANALYSIS_SECTION,
] as const

const POSITION_ORDERED_TOP_LEVEL_SECTIONS = [
	...POSITION_REQUIRED_TOP_LEVEL_SECTIONS,
	...POSITION_OPTIONAL_TOP_LEVEL_SECTIONS,
] as const

// @story [[lucrjournal/position-body#^default-position-body]] Builds the exact new-position body skeleton
export function buildDefaultPositionBody() {
	return `\n# ${POSITION_NOTES_SECTION}\n`
}

// @story [[lucrjournal/position-body#^position-section-contract]] Maps every linked context kind to its canonical H1 title
export function getPositionSectionTitle(kind: PositionSectionKind) {
	switch (kind) {
		case 'news':
			return POSITION_NEWS_SECTION
		case 'key_level':
			return POSITION_KEY_LEVEL_SECTION
		case 'confluence':
			return POSITION_CONFLUENCE_SECTION
		case 'market_analysis':
			return POSITION_MARKET_ANALYSIS_SECTION
		default:
			kind satisfies never
			throw new Error('Unknown position section kind')
	}
}

// @story [[lucrjournal/position-body#^append-position-context]] Rejects an existing linkpath or appends its canonical H2 wikilink
export async function appendSectionEntry(
	app: App,
	positionFile: TFile,
	sectionTitle: string,
	entryFile: TFile,
): Promise<'appended' | 'exists'> {
	const currentContent = await app.vault.read(positionFile)
	const sectionBody = extractSectionBody(currentContent, sectionTitle)
	const existingSections = extractSections(sectionBody, 2)
	const entryWikilink = toWikilink(getFileBasename(entryFile))

	if (existingSections.some((section) => parseWikilinkHeading(section.title)?.linkpath === entryFile.basename)) {
		return 'exists'
	}

	const nextBody = appendLinkedSection(sectionBody, entryWikilink)
	const updatedContent = upsertTopLevelSection(currentContent, sectionTitle, nextBody)
	await app.vault.adapter.write(positionFile.path, updatedContent)
	return 'appended'
}

// @story [[lucrjournal/position-body#^ensure-position-section]] Creates only a missing exact-title top-level section
export async function ensureTopLevelSection(
	app: App,
	positionFile: TFile,
	sectionTitle: string,
): Promise<'created' | 'exists'> {
	const currentContent = await app.vault.read(positionFile)
	const section = extractSections(currentContent, 1).find((candidate) => candidate.title === sectionTitle)
	if (section !== undefined) {
		return 'exists'
	}

	const updatedContent = upsertTopLevelSection(currentContent, sectionTitle, '')
	await app.vault.adapter.write(positionFile.path, updatedContent)
	return 'created'
}

// @story [[lucrjournal/position-body#^position-playbook-writeback]] Writes one canonical playbook wikilink only when it changes
export async function setPositionPlaybookFrontmatter({
	app,
	positionFile,
	playbookFile,
}: {
	app: App
	positionFile: TFile
	playbookFile: TFile
}): Promise<'appended' | 'exists'> {
	const nextValue = toWikilink(getFileBasename(playbookFile))
	const currentValue = normalizeFrontmatterPlaybookValue(app, positionFile)
	if (currentValue === nextValue) {
		return 'exists'
	}

	await app.fileManager.processFrontMatter(positionFile, (frontmatter: Record<string, unknown>) => {
		frontmatter.playbook = nextValue
	})
	return 'appended'
}

// @story [[lucrjournal/position-body#^position-playbook-writeback]] Clears an existing playbook frontmatter value
export async function removePositionPlaybookFrontmatter({
	app,
	positionFile,
}: {
	app: App
	positionFile: TFile
}): Promise<boolean> {
	const currentValue = normalizeFrontmatterPlaybookValue(app, positionFile)
	if (currentValue === null) {
		return false
	}

	await app.fileManager.processFrontMatter(positionFile, (frontmatter: Record<string, unknown>) => {
		frontmatter.playbook = null
	})
	return true
}

// @story [[lucrjournal/analysis#^dashboard-linked-entry-delete]] Clears an exact matching playbook frontmatter reference
// @story [[lucrjournal/position-body#^position-playbook-writeback]] Clears only an exact matching playbook wikilink
export async function removePositionPlaybookFrontmatterByLinkpath({
	app,
	positionFile,
	linkpath,
}: {
	app: App
	positionFile: TFile
	linkpath: string
}): Promise<boolean> {
	const currentValue = normalizeFrontmatterPlaybookValue(app, positionFile)
	if (currentValue !== toWikilink(linkpath)) {
		return false
	}

	await app.fileManager.processFrontMatter(positionFile, (frontmatter: Record<string, unknown>) => {
		frontmatter.playbook = null
	})
	return true
}

// @story [[lucrjournal/position-body#^remove-position-context]] Removes an exact linked block or one unambiguous fallback match
export async function removeSectionEntryFromPosition({
	app,
	linkpath,
	positionFile,
	sectionStart,
	sectionTitle,
}: {
	app: App
	linkpath: string
	positionFile: TFile
	sectionStart: number
	sectionTitle: string
}): Promise<boolean> {
	const currentContent = await app.vault.read(positionFile)
	const existingSections = extractSections(extractSectionBody(currentContent, sectionTitle), 2)
	const remainingSections = removeLinkedSection(existingSections, {
		linkpath,
		sectionStart,
	})

	if (remainingSections.length === existingSections.length) {
		return false
	}

	const updatedContent = upsertTopLevelSection(
		currentContent,
		sectionTitle,
		serializeLinkedSections(remainingSections),
	)
	await app.vault.adapter.write(positionFile.path, updatedContent)
	return true
}

// @story [[lucrjournal/position-body#^remove-position-section]] Deletes every exact-title H1 before reserializing the remainder
export async function removeTopLevelSectionFromPosition({
	app,
	positionFile,
	sectionTitle,
}: {
	app: App
	positionFile: TFile
	sectionTitle: string
}): Promise<boolean> {
	const currentContent = await app.vault.read(positionFile)
	const sections = extractSections(currentContent, 1).map(({ title, body }) => ({ title, body }))
	if (!sections.some((section) => section.title === sectionTitle)) {
		return false
	}

	const nextContent = serializeTopLevelContent(
		extractPreamble(currentContent),
		sections.filter((section) => section.title !== sectionTitle),
	)
	await app.vault.adapter.write(positionFile.path, nextContent)
	return true
}

// @story [[lucrjournal/analysis#^dashboard-linked-entry-delete]] Removes exact matching headings from every position context section
// @story [[lucrjournal/position-body#^remove-all-position-context]] Cleans exact linkpaths from context H1 sections while leaving Notes untouched
export async function removeAllSectionEntriesFromPositionByLinkpath({
	app,
	linkpath,
	positionFile,
}: {
	app: App
	linkpath: string
	positionFile: TFile
}): Promise<number> {
	const currentContent = await app.vault.read(positionFile)
	const sectionTitles = POSITION_ORDERED_TOP_LEVEL_SECTIONS.filter(
		(sectionTitle) => sectionTitle !== POSITION_NOTES_SECTION,
	)

	let removedCount = 0
	let nextContent = currentContent

	for (const sectionTitle of sectionTitles) {
		const existingSections = extractSections(extractSectionBody(nextContent, sectionTitle), 2)
		const remainingSections = existingSections.filter((section) => parseWikilinkHeading(section.title)?.linkpath !== linkpath)
		removedCount += existingSections.length - remainingSections.length
		nextContent = upsertTopLevelSection(
			nextContent,
			sectionTitle,
			serializeLinkedSections(remainingSections),
		)
	}

	if (removedCount === 0) {
		return 0
	}

	await app.vault.adapter.write(positionFile.path, nextContent)
	return removedCount
}

function readPositionPlaybookFrontmatterValue(app: App, positionFile: TFile): string | null {
	const frontmatter = app.metadataCache.getFileCache(positionFile)?.frontmatter
	if (frontmatter == null || !Object.prototype.hasOwnProperty.call(frontmatter, 'playbook')) {
		return null
	}

	const normalizedValue = coerceWikilink((frontmatter as Record<string, unknown>).playbook)
	return typeof normalizedValue === 'string' ? normalizedValue : null
}

function normalizeFrontmatterPlaybookValue(app: App, positionFile: TFile): string | null {
	return readPositionPlaybookFrontmatterValue(app, positionFile)
}

function extractSectionBody(content: string, sectionTitle: string) {
	return extractSections(content, 1).find((section) => section.title === sectionTitle)?.body ?? ''
}

// @story [[lucrjournal/position-body#^position-body-reserialization]] Preserves preamble and sibling H1 bodies while replacing one title
function upsertTopLevelSection(content: string, sectionTitle: string, sectionBody: string) {
	const sections = extractSections(content, 1).map(({ title, body }) => ({ title, body }))
	const nextSections = sections.filter((section) => section.title !== sectionTitle)
	const trimmedBody = sectionBody.trim()
	nextSections.splice(findInsertionIndex(nextSections, sectionTitle), 0, {
		title: sectionTitle,
		body: trimmedBody,
	})

	return serializeTopLevelContent(extractPreamble(content), nextSections)
}

function appendLinkedSection(sectionBody: string, entryWikilink: string) {
	const trimmedSectionBody = sectionBody.trim()
	const nextHeading = `## ${entryWikilink}`

	if (trimmedSectionBody.length === 0) {
		return `${nextHeading}\n`
	}

	return `${trimmedSectionBody}\n\n${nextHeading}\n`
}

function serializeLinkedSections(sections: ReturnType<typeof extractSections>) {
	return sections
		.map((section) => {
			const headingLine = `## ${section.title}`
			const trimmedBody = section.body.trim()
			return trimmedBody.length === 0 ? headingLine : `${headingLine}\n\n${trimmedBody}`
		})
		.join('\n\n')
}

type LinkedSectionIdentity = {
	linkpath: string
	sectionStart: number
}

// @story [[lucrjournal/position-body#^remove-position-context]] Uses stable section identity before the unique-linkpath fallback
function removeLinkedSection(
	sections: ReturnType<typeof extractSections>,
	identity: LinkedSectionIdentity,
) {
	const exactIndex = sections.findIndex((section) => (
		section.start === identity.sectionStart
		&& parseWikilinkHeading(section.title)?.linkpath === identity.linkpath
	))
	if (exactIndex !== -1) {
		return sections.filter((_, index) => index !== exactIndex)
	}

	const matchingIndexes = sections.flatMap((section, index) => (
		parseWikilinkHeading(section.title)?.linkpath === identity.linkpath ? [index] : []
	))

	return matchingIndexes.length === 1
		? sections.filter((_, index) => index !== matchingIndexes[0])
		: sections
}

function toWikilink(baseName: string) {
	return `[[${baseName}]]`
}

function findInsertionIndex(
	sections: Array<{ title: string; body: string }>,
	sectionTitle: string,
) {
	const targetOrder = POSITION_ORDERED_TOP_LEVEL_SECTIONS.indexOf(
		sectionTitle as (typeof POSITION_ORDERED_TOP_LEVEL_SECTIONS)[number],
	)
	if (targetOrder === -1) {
		return sections.length
	}

	const nextIndex = sections.findIndex((section) => {
		const existingOrder = POSITION_ORDERED_TOP_LEVEL_SECTIONS.indexOf(
			section.title as (typeof POSITION_ORDERED_TOP_LEVEL_SECTIONS)[number],
		)

		return existingOrder !== -1 && existingOrder > targetOrder
	})

	return nextIndex === -1 ? sections.length : nextIndex
}

function extractPreamble(content: string) {
	const firstHeadingStart = content.search(/^# /m)
	return firstHeadingStart === -1 ? content : content.slice(0, firstHeadingStart)
}

// @story [[lucrjournal/position-body#^position-body-reserialization]] Emits normalized H1 spacing and one trailing newline
function serializeTopLevelContent(
	preamble: string,
	sections: Array<{ title: string; body: string }>,
) {
	const trimmedPreamble = preamble.trimEnd()
	const serializedSections = sections
		.map((section) => {
			const headingLine = `# ${section.title}`
			const trimmedBody = section.body.trim()
			return trimmedBody.length === 0 ? headingLine : `${headingLine}\n\n${trimmedBody}`
		})
		.join('\n\n')

	if (trimmedPreamble.length === 0) {
		return serializedSections.length === 0 ? '' : `${serializedSections}\n`
	}

	if (serializedSections.length === 0) {
		return `${trimmedPreamble}\n`
	}

	return `${trimmedPreamble}\n\n${serializedSections}\n`
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('appendLinkedSection', () => {
		it('appends a new linked heading to the end of a section', () => {
			expect(appendLinkedSection('## [[news1]]\n\nalpha', '[[keylevel2]]')).toBe('## [[news1]]\n\nalpha\n\n## [[keylevel2]]\n')
			expect(appendLinkedSection('', '[[news1]]')).toBe('## [[news1]]\n')
		})
	})

	describe('serializeLinkedSections', () => {
		it('serializes remaining linked sections back into the body', () => {
			expect(serializeLinkedSections([
				{ title: '[[news1]]', body: 'alpha', start: 0, end: 0 },
				{ title: '[[keylevel1]]', body: '', start: 0, end: 0 },
			])).toBe('## [[news1]]\n\nalpha\n\n## [[keylevel1]]')
		})
	})
}
