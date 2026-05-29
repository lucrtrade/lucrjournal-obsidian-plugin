/// <reference types="vitest/importMeta" />

import { TFile } from 'obsidian'

import type { App } from 'obsidian'

export function getFileTags(app: App, file: TFile): string[] {
	const cache = app.metadataCache.getFileCache(file)
	if (cache === null) {
		return []
	}

	const frontmatterTags: unknown = cache.frontmatter?.tags
	if (Array.isArray(frontmatterTags)) {
		return frontmatterTags.map((tag) => String(tag).replace(/^#/, ''))
	}

	const inlineTags = cache.tags
	if (Array.isArray(inlineTags)) {
		return inlineTags.map((tagCache) => tagCache.tag.replace(/^#/, ''))
	}

	return []
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	const makeApp = (cache: unknown) => ({
		metadataCache: {
			getFileCache: () => cache,
		},
	} as unknown as App)
	const sentinelFile = new TFile()

	describe('getFileTags', () => {
		it('returns an empty list when the file has no cached metadata', () => {
			expect(getFileTags(makeApp(null), sentinelFile)).toEqual([])
		})

		it('strips the leading hash from frontmatter tags', () => {
			expect(getFileTags(makeApp({ frontmatter: { tags: ['#alpha', 'beta'] } }), sentinelFile))
				.toEqual(['alpha', 'beta'])
		})

		it('falls back to inline tags when frontmatter does not declare tags', () => {
			expect(getFileTags(
				makeApp({ frontmatter: {}, tags: [{ tag: '#inline' }] }),
				sentinelFile,
			)).toEqual(['inline'])
		})

		it('returns an empty list when neither frontmatter nor inline tags exist', () => {
			expect(getFileTags(makeApp({ frontmatter: {} }), sentinelFile)).toEqual([])
		})
	})
}
