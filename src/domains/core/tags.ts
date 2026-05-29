/// <reference types="vitest/importMeta" />

import type { SelectOption } from './form'
import type { DomainRuntimeApp } from './type'

export interface TagOption {
	value: SelectOption['value']
	label?: SelectOption['label']
}

export function normalizeTag(tag: string): string {
	const trimmed = tag.trim()
	if (trimmed === '') {
		return ''
	}

	const withoutLeadingHash = trimmed.replace(/^#+/, '')
	const withHyphenatedWhitespace = withoutLeadingHash.replace(/\s+/gu, '-')
	const withoutInvalidCharacters = withHyphenatedWhitespace
		.replace(/#/gu, '')
		.replace(/,/gu, '')
		.replace(/\p{C}/gu, '')
	if (withoutInvalidCharacters === '' || /^\p{N}+$/u.test(withoutInvalidCharacters)) {
		return ''
	}

	return withoutInvalidCharacters
}

export function normalizeTags(tags: string[]): string[] {
	const dedupedTags: string[] = []
	const seen = new Set<string>()
	for (const tag of tags) {
		const normalizedTag = normalizeTag(tag)
		if (normalizedTag === '') {
			continue
		}

		const dedupeKey = normalizedTag.toLowerCase()
		if (seen.has(dedupeKey)) {
			continue
		}

		seen.add(dedupeKey)
		dedupedTags.push(normalizedTag)
	}

	return dedupedTags
}

export function normalizeTagOptions(options: readonly TagOption[]): TagOption[] {
	const seen = new Set<string>()
	const normalizedOptions: TagOption[] = []

	for (const option of options) {
		const value = normalizeTag(option.value)
		const dedupeKey = value.toLowerCase()
		if (value === '' || seen.has(dedupeKey)) {
			continue
		}

		seen.add(dedupeKey)
		const normalizedLabel = option.label?.trim()
		normalizedOptions.push({
			value,
			label: normalizedLabel === undefined || normalizedLabel === '' ? value : normalizedLabel,
		})
	}

	return normalizedOptions
}

export function collectVaultTagOptions(app: DomainRuntimeApp): TagOption[] {
	const runtimeTags = app.metadataCache.getTags?.()
	if (runtimeTags !== undefined) {
		return normalizeTagOptions(
			Object.keys(runtimeTags).map((tag) => ({ value: tag })),
		).sort(compareTagOptions)
	}

	const collectedTags = new Set<string>()
	for (const markdownFile of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(markdownFile)
		for (const tag of cache?.tags ?? []) {
			const normalizedTag = normalizeTag(tag.tag)
			if (normalizedTag !== '') {
				collectedTags.add(normalizedTag)
			}
		}

		const frontmatter = cache?.frontmatter
		const frontmatterTags = readRecordProperty(frontmatter, 'tags')
		if (!Array.isArray(frontmatterTags)) {
			continue
		}

		for (const tag of frontmatterTags) {
			const normalizedTag = normalizeTag(String(tag))
			if (normalizedTag !== '') {
				collectedTags.add(normalizedTag)
			}
		}
	}

	return [...collectedTags]
		.sort((left, right) => left.localeCompare(right))
		.map((value) => ({ value, label: value }))
}

function readRecordProperty(record: unknown, key: string): unknown {
	if (typeof record !== 'object' || record === null || Array.isArray(record)) {
		return undefined
	}

	if (!Object.prototype.hasOwnProperty.call(record, key)) {
		return undefined
	}

	return (record as Record<string, unknown>)[key]
}

function compareTagOptions(left: TagOption, right: TagOption): number {
	return left.value.localeCompare(right.value)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('normalizeTagOptions', () => {
		it('normalizes and deduplicates option values', () => {
			expect(normalizeTagOptions([
				{ value: 'macro' },
				{ value: '#macro', label: 'Macro' },
				{ value: 'swing' },
			])).toEqual([
				{ value: 'macro', label: 'macro' },
				{ value: 'swing', label: 'swing' },
			])
		})
	})

	describe('normalizeTag', () => {
		it('strips leading hash and replaces spaces with hyphen', () => {
			expect(normalizeTag('#macro setup')).toBe('macro-setup')
		})

		it('rejects numeric-only tags', () => {
			expect(normalizeTag('1984')).toBe('')
		})
	})

	describe('normalizeTags', () => {
		it('deduplicates tags case-insensitively', () => {
			expect(normalizeTags(['Macro', 'macro', '#MACRO', 'swing trade'])).toEqual(['Macro', 'swing-trade'])
		})
	})

	describe('collectVaultTagOptions', () => {
		it('prefers runtime tag registry when available', () => {
			expect(collectVaultTagOptions({
				vault: { getMarkdownFiles: () => [] },
				metadataCache: {
					getTags: () => ({ '#macro': 2, swing: 1 }),
					getFileCache: () => null,
				},
			})).toEqual([
				{ value: 'macro', label: 'macro' },
				{ value: 'swing', label: 'swing' },
			])
		})
	})
}
