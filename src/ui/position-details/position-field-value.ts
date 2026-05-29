/// <reference types="vitest/importMeta" />

import type { PositionQuantityValueKind } from '../../domains/symbol/position-model'

export type PositionFieldValueKind = 'number' | 'string' | PositionQuantityValueKind

export type PositionFieldBounds = {
	max: number
	min: number
}

export function parsePositionFieldValue(
	raw: string,
	kind: PositionFieldValueKind,
	bounds?: PositionFieldBounds,
) {
	const trimmed = raw.trim()
	if (kind === 'string') {
		return trimmed === '' ? null : trimmed
	}

	const value = trimmed === '' ? null : Number(trimmed)
	if (value !== null && !Number.isFinite(value)) {
		return undefined
	}
	if (kind === 'number') {
		return value
	}
	if (kind === 'positive-integer') {
		const boundedValue = clampPositionFieldValue(value, bounds)
		return boundedValue === null || Number.isInteger(boundedValue) ? boundedValue : undefined
	}
	if (kind === 'bounded-lots') {
		return clampPositionFieldValue(value, bounds)
	}

	kind satisfies never
	throw new Error('Unknown position field value kind')
}

function clampPositionFieldValue(value: number | null, bounds: PositionFieldBounds | undefined) {
	if (value === null) {
		return null
	}
	if (bounds === undefined) {
		throw new Error('Missing position field bounds')
	}
	return Math.min(Math.max(value, bounds.min), bounds.max)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('parsePositionFieldValue', () => {
		it('clamps future contract input to configured bounds', () => {
			expect(parsePositionFieldValue('21', 'positive-integer', { min: 1, max: 20 })).toBe(20)
			expect(parsePositionFieldValue('0', 'positive-integer', { min: 1, max: 20 })).toBe(1)
		})

		it('keeps in-range future decimal contract invalid', () => {
			expect(parsePositionFieldValue('1.5', 'positive-integer', { min: 1, max: 20 })).toBeUndefined()
		})

		it('clamps cfd lots input to configured bounds', () => {
			expect(parsePositionFieldValue('20.01', 'bounded-lots', { min: 0.01, max: 20 })).toBe(20)
			expect(parsePositionFieldValue('0.009', 'bounded-lots', { min: 0.01, max: 20 })).toBe(0.01)
		})
	})
}
