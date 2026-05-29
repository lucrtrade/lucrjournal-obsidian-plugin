/// <reference types="vitest/importMeta" />

import { getCurrentLocale, setCurrentLocaleSetting } from '../lang/helpers'

const AMOUNT_MAX_FRACTION_DIGITS = 8
const AMOUNT_ROUNDING_FACTOR = 10 ** AMOUNT_MAX_FRACTION_DIGITS
const SUB_PRECISION_AMOUNT_THRESHOLD = 1 / AMOUNT_ROUNDING_FACTOR

function getCurrentIntlLocale(): 'zh-CN' | 'en-US' {
	return getCurrentLocale() === 'zh' ? 'zh-CN' : 'en-US'
}

function getNumberFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
	return new Intl.NumberFormat(getCurrentIntlLocale(), options)
}

function trimTrailingZeros(value: string): string {
	return value.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '')
}

function normalizeSignedZero(value: number): number {
	return Object.is(value, -0) ? 0 : value
}

export function roundAmountValue(value: number): number {
	if (!Number.isFinite(value)) {
		return value
	}

	const absoluteValue = Math.abs(value)
	if (absoluteValue < SUB_PRECISION_AMOUNT_THRESHOLD) {
		return 0
	}

	const roundedAbsoluteValue = Math.round((absoluteValue + Number.EPSILON) * AMOUNT_ROUNDING_FACTOR) / AMOUNT_ROUNDING_FACTOR
	return normalizeSignedZero(value < 0 ? -roundedAbsoluteValue : roundedAbsoluteValue)
}

export function formatAmount(value: number): string {
	const roundedValue = roundAmountValue(value)
	const absoluteValue = Math.abs(roundedValue)

	if (absoluteValue >= 1 || absoluteValue === 0) {
		return getNumberFormatter({
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(roundedValue)
	}

	return getNumberFormatter({
		minimumFractionDigits: 2,
		maximumFractionDigits: AMOUNT_MAX_FRACTION_DIGITS,
	}).format(roundedValue)
}

export function formatSignedAmount(value: number): string {
	const roundedValue = roundAmountValue(value)
	const absoluteText = formatAmount(Math.abs(roundedValue))

	if (roundedValue > 0) {
		return `+$${absoluteText}`
	}

	if (roundedValue < 0) {
		return `-$${absoluteText}`
	}

	return `$${formatAmount(0)}`
}

export function formatCompactAmount(value: number): string {
	const roundedValue = roundAmountValue(value)
	const absoluteValue = Math.abs(roundedValue)

	if (absoluteValue >= 1000) {
		const compactValue = roundAmountValue(absoluteValue / 1000)
		const fractionDigits = absoluteValue >= 10000 ? 0 : 1
		return `${trimTrailingZeros(getNumberFormatter({
			minimumFractionDigits: 0,
			maximumFractionDigits: fractionDigits,
		}).format(compactValue))}k`
	}

	if (absoluteValue >= 100) {
		return getNumberFormatter({
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}).format(Math.round(absoluteValue))
	}

	return trimTrailingZeros(formatAmount(absoluteValue))
}

export function formatPercentage(value: number): string {
	return `${Math.round(value)}%`
}

export function formatRatio(value: number): string {
	return getNumberFormatter({
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value)
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it } = import.meta.vitest

	afterEach(() => {
		setCurrentLocaleSetting('system')
	})

	describe('roundAmountValue', () => {
		it('rounds floating point artifacts for regular amounts', () => {
			expect(roundAmountValue(37.26399999999999)).toBe(37.264)
			expect(roundAmountValue(-37.26399999999999)).toBe(-37.264)
		})

		it('keeps significant tiny amounts up to eight decimals', () => {
			expect(roundAmountValue(0.000012333333333)).toBe(0.00001233)
			expect(roundAmountValue(-0.000012333333333)).toBe(-0.00001233)
			expect(roundAmountValue(0.00000001)).toBe(0.00000001)
		})

		it('drops values below the supported precision threshold to zero', () => {
			expect(roundAmountValue(0.000000009)).toBe(0)
			expect(roundAmountValue(-0.000000009)).toBe(0)
		})

		it('normalizes negative zero to zero', () => {
			expect(Object.is(roundAmountValue(-0), -0)).toBe(false)
			expect(roundAmountValue(-0)).toBe(0)
		})
	})

	describe('formatAmount', () => {
		it('formats regular amounts with fixed two decimals', () => {
			setCurrentLocaleSetting('en')
			expect(formatAmount(37.26399999999999)).toBe('37.26')
			expect(formatAmount(-37.26399999999999)).toBe('-37.26')
			expect(formatAmount(1)).toBe('1.00')
			expect(formatAmount(1.2)).toBe('1.20')
			expect(formatAmount(9999999.99999999)).toBe('10,000,000.00')
			expect(formatAmount(0)).toBe('0.00')
		})

		it('formats tiny amounts with dynamic precision up to eight decimals', () => {
			setCurrentLocaleSetting('en')
			expect(formatAmount(0.5)).toBe('0.50')
			expect(formatAmount(0.1234)).toBe('0.1234')
			expect(formatAmount(0.0099999999)).toBe('0.01')
			expect(formatAmount(0.000012333333333)).toBe('0.00001233')
			expect(formatAmount(-0.000012333333333)).toBe('-0.00001233')
			expect(formatAmount(0.00000001)).toBe('0.00000001')
			expect(formatAmount(0.000000009)).toBe('0.00')
		})

		it('uses the active locale for grouping and decimal output', () => {
			setCurrentLocaleSetting('en')
			expect(formatAmount(1234.5)).toBe('1,234.50')

			setCurrentLocaleSetting('zh')
			expect(formatAmount(1234.5)).toBe('1,234.50')
		})
	})

	describe('formatSignedAmount', () => {
		it('formats signed amount strings with a dollar prefix', () => {
			setCurrentLocaleSetting('en')
			expect(formatSignedAmount(12.5)).toBe('+$12.50')
			expect(formatSignedAmount(-12.5)).toBe('-$12.50')
			expect(formatSignedAmount(0)).toBe('$0.00')
		})
	})

	describe('formatCompactAmount', () => {
		it('formats compact amount strings for calendar-style summaries', () => {
			setCurrentLocaleSetting('en')
			expect(formatCompactAmount(12500)).toBe('13k')
			expect(formatCompactAmount(1500)).toBe('1.5k')
			expect(formatCompactAmount(120)).toBe('120')
			expect(formatCompactAmount(12.3)).toBe('12.3')
			expect(formatCompactAmount(0.5)).toBe('0.5')
			expect(formatCompactAmount(0.000012333333333)).toBe('0.00001233')
		})
	})

	describe('formatPercentage', () => {
		it('formats percentages as rounded integers', () => {
			expect(formatPercentage(49.6)).toBe('50%')
		})
	})

	describe('formatRatio', () => {
		it('formats ratios with two decimals', () => {
			setCurrentLocaleSetting('en')
			expect(formatRatio(1.234)).toBe('1.23')
			expect(formatRatio(-1.234)).toBe('-1.23')
		})
	})
}
