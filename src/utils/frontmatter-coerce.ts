import { moment } from 'obsidian'

import { setCurrentTimeZoneSetting } from '../settings/plugin-settings'

import { DatetimePattern } from './datetime-pattern'
import { getCurrentTimeZoneOffset } from './relative-time'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceTrimmedString(value: unknown): string | null {
	if (
		typeof value !== 'string'
		&& typeof value !== 'number'
		&& typeof value !== 'boolean'
		&& typeof value !== 'bigint'
	) {
		return null
	}

	const trimmed = String(value).trim()
	return trimmed.length === 0 ? null : trimmed
}

export function coerceNullableString(value: unknown): unknown {
	if (value == null) {
		return null
	}

	return coerceTrimmedString(value) ?? value
}

export function coerceStringArray(value: unknown): unknown {
	if (value == null) {
		return null
	}

	const values = Array.isArray(value) ? value : [value]
	const normalized = values.flatMap((item) => {
		const trimmed = coerceTrimmedString(item)
		return trimmed === null ? [] : [trimmed]
	})

	if (normalized.length > 0) {
		return normalized
	}

	return Array.isArray(value) ? null : value
}

export function coerceNumber(value: unknown): unknown {
	if (value == null) {
		return null
	}

	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : value
	}

	const trimmed = coerceTrimmedString(value)
	if (trimmed === null) {
		return null
	}

	const parsed = Number(trimmed)
	return Number.isFinite(parsed) ? parsed : value
}

export function coerceInteger(value: unknown): unknown {
	const normalized = coerceNumber(value)
	if (normalized == null || typeof normalized !== 'number') {
		return normalized
	}

	return Number.isInteger(normalized) ? normalized : value
}

function extractWikilinkBody(value: string): string | null {
	const rawBody = value.startsWith('[[') && value.endsWith(']]')
		? value.slice(2, -2).trim()
		: value

	const body = rawBody.split(/[|#^]/, 1)[0]?.trim() ?? ''
	return body.length === 0 ? null : body
}

export function coerceWikilink(value: unknown): unknown {
	if (value == null) {
		return null
	}

	const trimmed = coerceTrimmedString(value)
	if (trimmed === null) {
		return null
	}

	const body = extractWikilinkBody(trimmed)
	return body === null ? value : `[[${body}]]`
}

export function coerceUppercaseString(value: unknown): unknown {
	if (value == null) {
		return null
	}

	const trimmed = coerceTrimmedString(value)
	return trimmed === null ? null : trimmed.toLocaleUpperCase()
}

export function coerceLowercaseString(value: unknown): unknown {
	const trimmed = coerceTrimmedString(value)
	return trimmed === null ? value : trimmed.toLocaleLowerCase()
}

// Formats a person may type by hand or another tool may write, on top of strict ISO-8601.
const LOOSE_DATETIME_FORMATS = [
	moment.ISO_8601,
	'YYYY-MM-DD HH:mm:ss Z',
	'YYYY-MM-DD HH:mm Z',
	'YYYY-MM-DD HH:mm:ss',
	'YYYY-MM-DD HH:mm',
	'YYYY-MM-DD',
	'YYYY/MM/DD HH:mm:ss',
	'YYYY/MM/DD HH:mm',
	'YYYY/MM/DD',
	'YYYY.MM.DD HH:mm:ss',
	'YYYY.MM.DD HH:mm',
	'YYYY.MM.DD',
	'YYYYMMDDTHHmmss',
	'YYYYMMDD',
]
const EXPLICIT_ZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i

// @story [[lucrjournal/domain-model#^domain-datetime-repair]] Parses a wide range of datetime inputs into the persisted shape or clamps them to null
export function coerceDatetime(value: unknown): unknown {
	if (value instanceof Date) {
		// Obsidian's YAML parser reads an offset-less timestamp as UTC, so the Date's UTC wall
		// clock is what the user typed; re-normalize it as an offset-less string.
		return Number.isNaN(value.getTime()) ? null : coerceDatetime(value.toISOString().slice(0, 19))
	}

	if (typeof value !== 'string') {
		return null
	}

	const trimmed = value.trim()
	if (trimmed === '') {
		return null
	}

	const parsed = moment.parseZone(trimmed, LOOSE_DATETIME_FORMATS, true)
	if (!parsed.isValid()) {
		return null
	}

	if (EXPLICIT_ZONE_SUFFIX.test(trimmed)) {
		const formatted = parsed.format('YYYY-MM-DDTHH:mm:ssZ')
		return DatetimePattern.test(formatted) ? formatted : null
	}

	// An offset-less input keeps the typed date and time and takes the offset the configured
	// zone had at that instant, so an off-season edit does not pick up the current DST offset.
	const wallClock = parsed.format('YYYY-MM-DDTHH:mm:ss')
	const candidate = `${wallClock}${getCurrentTimeZoneOffset(new Date(`${wallClock}Z`))}`
	return DatetimePattern.test(candidate) ? candidate : null
}

// @story [[lucrjournal/domain-model#^enum-field-null-coercion]] Clamps unrecognized enumerated values to null so one field never drops the record
export function coerceEnum<const TAllowed extends readonly (string | number)[]>(
	value: unknown,
	allowed: TAllowed,
): TAllowed[number] | null {
	const trimmed = coerceTrimmedString(value)
	if (trimmed === null) {
		return null
	}

	const normalized = trimmed.toLocaleLowerCase()
	return allowed.find((candidate) => String(candidate).toLocaleLowerCase() === normalized) ?? null
}

export function normalizeLucrTypeName(value: unknown): string | null {
	const trimmed = coerceTrimmedString(value)
	if (trimmed === null) {
		return null
	}

	return trimmed.toLocaleLowerCase().replace(/[\s-]+/g, '_')
}

export function coerceLiteral(value: unknown, literal: string): unknown {
	const normalized = normalizeLucrTypeName(value)
	return normalized === literal ? literal : value
}

export type CoercibleFrontmatter<TRecord extends Record<string, unknown>> = Partial<TRecord> & Record<string, unknown>

export function coerceFrontmatterField<
	TRecord extends Record<string, unknown>,
	const TKey extends Extract<keyof TRecord, string>,
>(
	record: CoercibleFrontmatter<TRecord>,
	key: TKey,
	coerce: (value: unknown) => unknown,
) {
	if (!(key in record)) {
		return
	}

	record[key] = coerce(record[key]) as TRecord[TKey]
}

export function cloneFrontmatterRecord<TRecord extends Record<string, unknown> = Record<string, unknown>>(
	input: unknown,
): CoercibleFrontmatter<TRecord> | null {
	return isRecord(input) ? { ...input } as CoercibleFrontmatter<TRecord> : null
}

if (import.meta.vitest) {
	const { afterEach, beforeEach, describe, expect, it } = import.meta.vitest
	const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

	describe('normalizeLucrTypeName', () => {
		it('normalizes common frontmatter variants', () => {
			expect(normalizeLucrTypeName(' Market Analysis ')).toBe('market_analysis')
		})
	})

	describe('coerceDatetime', () => {
		beforeEach(() => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
		})

		afterEach(() => {
			setCurrentTimeZoneSetting(defaultTimeZone)
		})

		it('returns null for null, undefined, empty, or unparseable values', () => {
			expect(coerceDatetime(null)).toBeNull()
			expect(coerceDatetime(undefined)).toBeNull()
			expect(coerceDatetime('')).toBeNull()
			expect(coerceDatetime('   ')).toBeNull()
			expect(coerceDatetime('invalid-date')).toBeNull()
			expect(coerceDatetime('2026-13-45T10:00:00+08:00')).toBeNull()
			expect(coerceDatetime(2026)).toBeNull()
			expect(coerceDatetime(1_735_689_600_000)).toBeNull()
		})

		it('keeps a datetime that already carries an offset, dropping sub-second precision', () => {
			expect(coerceDatetime('2026-03-20T16:31:00+08:00')).toBe('2026-03-20T16:31:00+08:00')
			expect(coerceDatetime('2026-05-21T02:26:16.626+08:00')).toBe('2026-05-21T02:26:16+08:00')
			expect(coerceDatetime('2026-03-20T16:31:00Z')).toBe('2026-03-20T16:31:00+00:00')
			expect(coerceDatetime('2026-08-26 20:00:01 +08:00')).toBe('2026-08-26T20:00:01+08:00')
			expect(coerceDatetime('2026-08-26T20:00:01+0800')).toBe('2026-08-26T20:00:01+08:00')
		})

		it('attaches the configured zone offset to an offset-less wall clock', () => {
			expect(coerceDatetime('2026-05-20T06:26:17')).toBe('2026-05-20T06:26:17+08:00')
			expect(coerceDatetime('2026-08-26 20:00:01')).toBe('2026-08-26T20:00:01+08:00')
			expect(coerceDatetime('2026-08-26T20:00')).toBe('2026-08-26T20:00:00+08:00')
			expect(coerceDatetime('2026-08-26 20:00')).toBe('2026-08-26T20:00:00+08:00')
			expect(coerceDatetime('2026-08-26')).toBe('2026-08-26T00:00:00+08:00')
			expect(coerceDatetime('2026/05/20 06:26')).toBe('2026-05-20T06:26:00+08:00')
			expect(coerceDatetime('2026.05.20 06:26:17')).toBe('2026-05-20T06:26:17+08:00')
		})

		it('takes the offset the configured zone had at the typed instant, not now', () => {
			setCurrentTimeZoneSetting('America/New_York')
			expect(coerceDatetime('2026-01-15T10:00:00')).toBe('2026-01-15T10:00:00-05:00')
			expect(coerceDatetime('2026-07-15T10:00:00')).toBe('2026-07-15T10:00:00-04:00')
		})

		it('reads a Date object as an offset-less UTC wall clock', () => {
			expect(coerceDatetime(new Date('2026-05-20T06:26:17Z'))).toBe('2026-05-20T06:26:17+08:00')
			expect(coerceDatetime(new Date('nope'))).toBeNull()
		})
	})

	describe('coerceEnum', () => {
		it('matches case-insensitively and keeps the canonical member', () => {
			expect(coerceEnum('long', ['LONG', 'SHORT'] as const)).toBe('LONG')
			expect(coerceEnum(' High ', ['high', 'medium', 'low'] as const)).toBe('high')
			expect(coerceEnum('4', [1, 2, 3, 4, 5] as const)).toBe(4)
			expect(coerceEnum(4, [1, 2, 3, 4, 5] as const)).toBe(4)
		})

		it('clamps unrecognized, empty, or non-primitive values to null', () => {
			expect(coerceEnum('sideways', ['LONG', 'SHORT'] as const)).toBeNull()
			expect(coerceEnum(6, [1, 2, 3, 4, 5] as const)).toBeNull()
			expect(coerceEnum(null, ['a'] as const)).toBeNull()
			expect(coerceEnum('  ', ['a'] as const)).toBeNull()
			expect(coerceEnum(['a'], ['a'] as const)).toBeNull()
		})
	})
}
