import { normalizePath, type TFile } from 'obsidian'

// Replaces Obsidian-invalid ASCII file name characters with visually similar legal Unicode homoglyphs.
// @story [[lucrjournal/content#^entry-name-sanitization]] Defines the exact visible replacements for unsupported entry name characters.
const OBSIDIAN_FILE_NAME_HOMOGLYPHS: Record<string, string> = {
	':': '꞉',
	'/': '∕',
	'\\': '＼',
	'*': '＊',
	'?': '？',
	'"': '＂',
	'<': '＜',
	'>': '＞',
	'|': '｜',
	'#': '＃',
	'^': '＾',
	'[': '［',
	']': '］',
}

const OBSIDIAN_FILE_NAME_SPECIAL_CHARACTERS = /[:\\/*?"<>|#^[\]\n\r]/g

export function sanitizeObsidianFileName(value: string) {
	let sanitized = value
		.trim()
		.replace(
			OBSIDIAN_FILE_NAME_SPECIAL_CHARACTERS,
			(character) => OBSIDIAN_FILE_NAME_HOMOGLYPHS[character] ?? ' ',
		)
		.replace(/\s+/g, ' ')
		.trim()

	if (sanitized.startsWith('.')) {
		sanitized = '_' + sanitized
	}
	return sanitized
}

export function buildRenamedEntryPath(file: TFile, nextTitle: string): string | null {
	const sanitizedBaseName = sanitizeObsidianFileName(nextTitle)
	if (sanitizedBaseName === '') {
		return null
	}

	const parentPath = file.parent?.path
	return normalizePath(parentPath == null ? `${sanitizedBaseName}.md` : `${parentPath}/${sanitizedBaseName}.md`)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('sanitizeObsidianFileName', () => {
		// @story [[lucrjournal/content#^entry-name-sanitization]] Covers every unsupported ASCII filename character replacement.
		it('replaces unsupported Obsidian file name characters with homoglyphs', () => {
			expect(sanitizeObsidianFileName('ACC-a\\b/c:d*e?f"g<h>i|j#k^l[m]')).toBe('ACC-a＼b∕c꞉d＊e？f＂g＜h＞i｜j＃k＾l［m］')
		})

		// @story [[lucrjournal/content#^entry-name-sanitization]] Covers trimming and collapsing whitespace around replacements.
		it('still normalizes repeated whitespace around preserved separators', () => {
			expect(sanitizeObsidianFileName('  Alpha   Beta / Desk  ')).toBe('Alpha Beta ∕ Desk')
		})

		// @story [[lucrjournal/content#^entry-name-sanitization]] Covers the visible colon homoglyph.
		it('normalizes colons to modifier letter colons so Obsidian can persist the file name', () => {
			expect(sanitizeObsidianFileName('Trade: NY Open')).toBe('Trade꞉ NY Open')
		})

		// @story [[lucrjournal/content#^entry-name-sanitization]] Covers collapsing newlines into spaces.
		it('keeps converting newlines to collapsed spaces', () => {
			expect(sanitizeObsidianFileName('Alpha\n\nBeta\r\nGamma')).toBe('Alpha Beta Gamma')
		})
	})
}
