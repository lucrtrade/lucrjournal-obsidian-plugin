/// <reference types="vitest/importMeta" />

import { LUCR_TRADE_ATTACHMENTS_DIR } from '../constant'

import type { Position } from '../domains'

const IMAGE_MIME_TYPE_TO_EXTENSION = {
	'image/gif': 'gif',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/svg+xml': 'svg',
	'image/webp': 'webp',
} as const

type ParsedAttachmentToken =
	| {
		kind: 'external'
		label: string | null
		url: string
	}
	| {
		kind: 'vault'
		label: string | null
		linkpath: string
	}

export function resolvePositionAttachments(position: Position | Record<string, unknown>): string[] {
	const record = position as Record<string, unknown>
	const attachments = normalizeAttachmentField(record.attachments)

	if (attachments.length > 0) {
		return attachments
	}

	return normalizeAttachmentField(record.chart_screenshots)
}

export function parseAttachmentToken(token: string): ParsedAttachmentToken | null {
	const normalizedToken = token.trim()
	if (normalizedToken.length === 0) {
		return null
	}

	const wikilinkMatch = normalizedToken.match(/^!?\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/)
	if (wikilinkMatch) {
		return {
			kind: 'vault',
			linkpath: wikilinkMatch[1]!.trim(),
			label: wikilinkMatch[2]?.trim() ?? null,
		}
	}

	const markdownImageMatch = normalizedToken.match(/^!\[[^\]]*]\((.+?)\)$/)
	if (markdownImageMatch) {
		const target = markdownImageMatch[1]!.trim()
		if (target.startsWith('http://') || target.startsWith('https://')) {
			return {
				kind: 'external',
				url: target,
				label: null,
			}
		}

		return {
			kind: 'vault',
			linkpath: target,
			label: null,
		}
	}

	if (normalizedToken.startsWith('http://') || normalizedToken.startsWith('https://')) {
		return {
			kind: 'external',
			url: normalizedToken,
			label: null,
		}
	}

	return {
		kind: 'vault',
		linkpath: normalizedToken,
		label: null,
	}
}

export function buildAttachmentToken(fileName: string, _label: string): string {
	return `[[${fileName.split('/').pop() ?? fileName}]]`
}

export function buildAttachmentMonthFolder(timestamp: number): string {
	const date = new Date(timestamp)
	return `${LUCR_TRADE_ATTACHMENTS_DIR}/${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function buildAttachmentTimestamp(timestamp: number): string {
	const date = new Date(timestamp)
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0'),
	].join('-')
		+ '_'
		+ [
			String(date.getHours()).padStart(2, '0'),
			String(date.getMinutes()).padStart(2, '0'),
			String(date.getSeconds()).padStart(2, '0'),
			String(date.getMilliseconds()).padStart(3, '0'),
		].join('-')
}

export function buildAttachmentFileName(timestamp: string, originalName: string, extension: string): string {
	const normalizedExtension = normalizeAttachmentExtension(extension)
	return `${timestamp}_${sanitizeAttachmentFileSegment(originalName)}${normalizedExtension === '' ? '' : `.${normalizedExtension}`}`
}

export function buildPositionAttachmentFileName(timestamp: string, extension: string, originalName: string): string {
	return buildAttachmentFileName(timestamp, originalName, extension)
}

export function buildPositionAttachmentPath(fileName: string, timestamp: number): string {
	return `${buildAttachmentMonthFolder(timestamp)}/${fileName}`
}

export function resolveImageExtensionFromMimeType(mimeType: string | null | undefined): string | null {
	if (typeof mimeType !== 'string') {
		return null
	}

	return IMAGE_MIME_TYPE_TO_EXTENSION[mimeType.toLowerCase() as keyof typeof IMAGE_MIME_TYPE_TO_EXTENSION]
}

export function isSupportedImageMimeType(mimeType: string | null | undefined): boolean {
	return !!resolveImageExtensionFromMimeType(mimeType)
}

function normalizeAttachmentField(value: unknown): string[] {
	if (typeof value === 'string') {
		return [value]
	}

	if (!Array.isArray(value)) {
		return []
	}

	return value.filter((item): item is string => typeof item === 'string')
}

function sanitizeAttachmentFileSegment(value: string): string {
	const sanitized = value.trim().replace(/[<>:"/\\|?*[\]]/g, '-')
	return sanitized.length > 0 ? sanitized : 'attachment'
}

function normalizeAttachmentExtension(extension: string): string {
	const normalized = extension.trim().replace(/^\./, '').toLowerCase()
	return normalized
}

export function applyAttachmentTokensToFrontmatter(
	frontmatter: Record<string, unknown>,
	newTokens: string[],
): void {
	const existing = resolvePositionAttachments(frontmatter)
	frontmatter.attachments = [...existing, ...newTokens]
	if (Object.prototype.hasOwnProperty.call(frontmatter, 'chart_screenshots')) {
		delete frontmatter.chart_screenshots
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('resolvePositionAttachments', () => {
		it('prefers the attachments array and falls back to legacy chart_screenshots', () => {
			expect(resolvePositionAttachments({
				attachments: ['[[foo.png|foo]]'],
				chart_screenshots: ['[[bar.png|bar]]'],
			})).toEqual(['[[foo.png|foo]]'])

			expect(resolvePositionAttachments({
				chart_screenshots: ['[[bar.png|bar]]'],
			})).toEqual(['[[bar.png|bar]]'])
		})
	})

	describe('parseAttachmentToken', () => {
		it('parses wikilinks and markdown image syntax', () => {
			expect(parseAttachmentToken('[[foo/bar.png|preview]]')).toEqual({
				kind: 'vault',
				linkpath: 'foo/bar.png',
				label: 'preview',
			})

			expect(parseAttachmentToken('![](https://example.com/image.png)')).toEqual({
				kind: 'external',
				url: 'https://example.com/image.png',
				label: null,
			})
		})
	})

	describe('position attachments', () => {
		it('builds attachment file names under the current month folder', () => {
			const timestamp = new Date(2026, 4, 15, 10, 20, 30).getTime()
			const fileName = buildPositionAttachmentFileName(buildAttachmentTimestamp(timestamp), '.PNG', 'logo_black_tight')
			expect(fileName).toBe('2026-05-15_10-20-30-000_logo_black_tight.png')
			expect(buildPositionAttachmentPath(fileName, timestamp)).toBe(`${LUCR_TRADE_ATTACHMENTS_DIR}/2026-05/2026-05-15_10-20-30-000_logo_black_tight.png`)
		})

		it('maps supported image mime types to file extensions', () => {
			expect(resolveImageExtensionFromMimeType('image/png')).toBe('png')
			expect(resolveImageExtensionFromMimeType('image/jpeg')).toBe('jpg')
			expect(resolveImageExtensionFromMimeType('application/json')).toBe(undefined)
			expect(isSupportedImageMimeType('image/webp')).toBe(true)
		})
	})

	describe('applyAttachmentTokensToFrontmatter', () => {
		it('preserves existing attachment order and appends new tokens', () => {
			const fm: Record<string, unknown> = { attachments: ['[[a.png|a]]', '[[b.png|b]]'] }
			applyAttachmentTokensToFrontmatter(fm, ['[[c.png|c]]'])
			expect(fm.attachments).toEqual(['[[a.png|a]]', '[[b.png|b]]', '[[c.png|c]]'])
		})

		it('deletes the legacy chart_screenshots field', () => {
			const fm: Record<string, unknown> = {
				chart_screenshots: ['[[old.png|old]]'],
			}
			applyAttachmentTokensToFrontmatter(fm, ['[[new.png|new]]'])
			expect(fm.attachments).toEqual(['[[old.png|old]]', '[[new.png|new]]'])
			expect(Object.prototype.hasOwnProperty.call(fm, 'chart_screenshots')).toBe(false)
		})

		it('appends to empty attachments when no existing field is present', () => {
			const fm: Record<string, unknown> = {}
			applyAttachmentTokensToFrontmatter(fm, ['[[x.png|x]]'])
			expect(fm.attachments).toEqual(['[[x.png|x]]'])
		})
	})
}
