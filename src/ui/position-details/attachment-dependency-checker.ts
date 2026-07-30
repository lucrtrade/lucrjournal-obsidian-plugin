/// <reference types="vitest/importMeta" />

import { TFile, type App } from 'obsidian'

import { parseAttachmentToken, resolvePositionAttachments } from '../../attachments/position-attachments'
import { LUCR_TRADE_ATTACHMENTS_DIR } from '../../constant'
import { PositionDomain, type Position } from '../../domains'

import type { PositionAttachment } from './use-position-details-media'
import type { DomainPersistedEntry } from '../../domains/core/type'

type AttachmentDependencyResult = {
	otherReferencesCount: number
	referencingPositions: DomainPersistedEntry<Position>[]
}

/**
 * Scans all position vault entries and returns the positions that reference
 * `attachment`, optionally excluding `excludeFile` (e.g. the file being deleted).
 *
 * The `excludeFile` skips only the **first** matching token for the given file
 * to mirror the logic in `removePositionAttachment` (where the token is about
 * to be removed). Subsequent tokens on the same file still count as references.
 */
// @story [[lucrjournal/attachment#^remove-attachment-file]] Counts remaining position frontmatter references before file deletion
export function checkAttachmentDependencies(
	app: App,
	attachment: PositionAttachment,
	excludeFile?: TFile,
): AttachmentDependencyResult {
	const referencingPositions: DomainPersistedEntry<Position>[] = []

	for (const entry of PositionDomain.totalEntries(app)) {
		if (!(entry.file instanceof TFile)) {
			continue
		}

		const entryFile = entry.file
		const frontmatter = app.metadataCache.getFileCache(entryFile)?.frontmatter
		const tokens = resolvePositionAttachments((frontmatter ?? entry.fm))

		let skippedExclusion = false
		const referencesAttachment = tokens.some((token) => {
			// When this file is the excluded file, skip the first matching token
			// (it represents the token about to be removed).
			if (
				entryFile.path === excludeFile?.path &&
				!skippedExclusion &&
				token === attachment.token
			) {
				skippedExclusion = true
				return false
			}

			return resolveAttachmentReferenceKey(app, entryFile, token) === attachment.referenceKey
		})

		if (referencesAttachment) {
			referencingPositions.push(entry)
		}
	}

	return {
		otherReferencesCount: referencingPositions.length,
		referencingPositions,
	}
}

function resolveAttachmentReferenceKey(
	app: App,
	positionFile: TFile,
	token: string,
): string | null {
	const parsed = parseAttachmentToken(token)
	if (parsed === null) {
		return null
	}

	if (parsed.kind === 'external') {
		return `external:${parsed.url}`
	}

	const resolved = app.metadataCache.getFirstLinkpathDest(parsed.linkpath, positionFile.path)
	if (resolved === null) {
		return `vault:${parsed.linkpath}`
	}

	return `vault:${resolved.path}`
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('checkAttachmentDependencies', () => {
		const makeApp = (entries: Array<{ path: string; tokens: string[] }>) => ({
			vault: {
				getMarkdownFiles: () => entries.map((e) => Object.assign(new TFile(), { path: e.path, basename: e.path })),
				getAbstractFileByPath: () => null,
			},
			metadataCache: {
				getFileCache: (file: TFile) => {
					const entry = entries.find((e) => e.path === file.path)
					if (!entry) {
						return null 
					}
					return {
						frontmatter: entry.tokens.length > 0
							? { lucr_type: 'position', attachments: entry.tokens }
							: { lucr_type: 'position' },
					}
				},
				getFirstLinkpathDest: (linkpath: string) => {
					if (linkpath.startsWith(`${LUCR_TRADE_ATTACHMENTS_DIR}/`)) {
						const f = new TFile()
						f.path = linkpath
						return f
					}
					return null
				},
			},
			fileManager: {} as App['fileManager'],
		}) as unknown as App

		// @story [[lucrjournal/attachment#^remove-attachment-file]] Covers excluding the reference being removed
		it('returns zero count when no other position references the attachment', () => {
			const posFile = Object.assign(new TFile(), { path: 'pos/a.md', basename: 'a' })
			const app = makeApp([{ path: 'pos/a.md', tokens: [`[[${LUCR_TRADE_ATTACHMENTS_DIR}/img.png|lbl]]`] }])
			const attachment: PositionAttachment = {
				kind: 'vault',
				path: `${LUCR_TRADE_ATTACHMENTS_DIR}/img.png`,
				referenceKey: `vault:${LUCR_TRADE_ATTACHMENTS_DIR}/img.png`,
				token: `[[${LUCR_TRADE_ATTACHMENTS_DIR}/img.png|lbl]]`,
				src: '',
				label: 'lbl',
				extension: 'png',
				fileSizeBytes: 0,
				id: `vault:${LUCR_TRADE_ATTACHMENTS_DIR}/img.png:0:0`,
			}

			const result = checkAttachmentDependencies(app, attachment, posFile)
			expect(result.otherReferencesCount).toBe(0)
			expect(result.referencingPositions).toHaveLength(0)
		})

		// @story [[lucrjournal/attachment#^remove-attachment-file]] Covers preserving a file referenced by another position
		it('returns other positions that reference the same attachment', () => {
			const posFileA = Object.assign(new TFile(), { path: 'pos/a.md', basename: 'a' })
			const app = makeApp([
				{ path: 'pos/a.md', tokens: [`[[${LUCR_TRADE_ATTACHMENTS_DIR}/img.png|a]]`] },
				{ path: 'pos/b.md', tokens: [`[[${LUCR_TRADE_ATTACHMENTS_DIR}/img.png|b]]`] },
			])
			const attachment: PositionAttachment = {
				kind: 'vault',
				path: `${LUCR_TRADE_ATTACHMENTS_DIR}/img.png`,
				referenceKey: `vault:${LUCR_TRADE_ATTACHMENTS_DIR}/img.png`,
				token: `[[${LUCR_TRADE_ATTACHMENTS_DIR}/img.png|a]]`,
				src: '',
				label: 'a',
				extension: 'png',
				fileSizeBytes: 0,
				id: `vault:${LUCR_TRADE_ATTACHMENTS_DIR}/img.png:0:0`,
			}

			const result = checkAttachmentDependencies(app, attachment, posFileA)
			expect(result.otherReferencesCount).toBe(1)
			expect(result.referencingPositions[0]!.file.path).toBe('pos/b.md')
		})
	})
}
