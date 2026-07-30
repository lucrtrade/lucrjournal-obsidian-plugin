/// <reference types="vitest/importMeta" />

// @story [[lucrjournal/form#^nullable-trimmed-value]] Normalizes blank and nonblank string form values at the payload boundary
export function toNullableTrimmedValue(value: string): string | null {
	const normalizedValue = value.trim()
	return normalizedValue.length === 0 ? null : normalizedValue
}

// @story [[lucrjournal/form#^nullable-number-value]] Parses normalized numeric form values and rejects NaN
export function toNullableNumberValue(value: string): number | null {
	const normalizedValue = toNullableTrimmedValue(value)
	if (normalizedValue === null) {
		return null
	}

	const parsedValue = Number(normalizedValue)
	if (Number.isNaN(parsedValue)) {
		throw new Error(`Expected numeric form value, received ${value}`)
	}

	return parsedValue
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('toNullableTrimmedValue', () => {
		it('returns null for blank input after trim', () => {
			expect(toNullableTrimmedValue('')).toBeNull()
			expect(toNullableTrimmedValue('   ')).toBeNull()
		})

		it('returns the trimmed value for non-empty input', () => {
			expect(toNullableTrimmedValue(' BTC/USDT ')).toBe('BTC/USDT')
		})
	})

	describe('toNullableNumberValue', () => {
		it('returns null for blank input', () => {
			expect(toNullableNumberValue('')).toBeNull()
		})

		it('parses numeric strings', () => {
			expect(toNullableNumberValue('12.5')).toBe(12.5)
		})
	})
}
