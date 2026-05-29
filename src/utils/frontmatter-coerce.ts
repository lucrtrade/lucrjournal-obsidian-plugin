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

export function coerceDatetime(value: unknown): unknown {
	if (value == null) {
		return null
	}

	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			return value
		}

		return value.toISOString().replace(/\.\d{3}Z$/, 'Z')
	}

	const trimmed = coerceTrimmedString(value)
	if (trimmed === null) {
		return null
	}

	return trimmed
		.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
		.replace(/\.\d{3}(Z|[+-]\d{2}:\d{2})$/, '$1')
		.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/, '$1:00$2')
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
	const { describe, expect, it } = import.meta.vitest

	describe('normalizeLucrTypeName', () => {
		it('normalizes common frontmatter variants', () => {
			expect(normalizeLucrTypeName(' Market Analysis ')).toBe('market_analysis')
		})
	})
}
