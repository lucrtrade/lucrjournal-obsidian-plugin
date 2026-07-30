import { roundAmountValue, toNullableNumberValue } from '../../utils'
import { coerceFrontmatterField, coerceNumber } from '../../utils/frontmatter-coerce'

import { normalizePositionSymbolTypeValue, resolvePositionSymbolModel, type PositionSymbolType } from './position-model'

export type FeeModelValue = {
	fee_value: number | null
}

export type FeeModelFormValue = {
	value: string
}

export function emptyFeeModel(): FeeModelValue {
	return {
		fee_value: null,
	}
}

export function resolveFeeModel(record: Partial<FeeModelValue>): FeeModelValue {
	return {
		fee_value: typeof record.fee_value === 'number' ? record.fee_value : null,
	}
}

// @story [[lucrjournal/symbol#^crypto-fee-model]] Validates crypto percentage fee bounds before persistence
// @story [[lucrjournal/symbol#^future-fee-model]] Validates future per-contract fee bounds before persistence
// @story [[lucrjournal/symbol#^cfd-fee-model]] Validates CFD per-lot fee bounds before persistence
export function validateFeeModel(record: Partial<FeeModelValue> & { type?: unknown }) {
	const feeValue = typeof record.fee_value === 'number' ? record.fee_value : null

	if (feeValue != null && !resolvePositionSymbolModel(resolveFeeSymbolType(record.type)).isValidFeeValue(feeValue)) {
		throw new Error('FEE_VALUE_INVALID_ERROR')
	}
}

export function deriveAbsoluteFee(
	record: { type?: unknown; fee_value?: unknown; notional_value?: unknown; contract?: unknown; lots?: unknown },
): number | null {
	return resolvePositionSymbolModel(resolveFeeSymbolType(record.type))
		.calculateFeeValue(record, feeFormulaMath)
}

export function coerceFeeModelFields(record: Record<string, unknown>) {
	coerceFrontmatterField(record, 'fee_value', coerceNumber)
	if (record.fee_value === undefined) {
		record.fee_value = null
	}
}

export function buildFeeModelFormValue(record: Partial<FeeModelValue>): FeeModelFormValue {
	const feeModel = resolveFeeModel(record)
	return {
		value: feeModel.fee_value == null ? '' : formatFeeValueInputValue(feeModel.fee_value),
	}
}

export function formatFeeValueDisplay(feeValue: number): string {
	return formatFeeValueInputValue(feeValue)
}

export function resolveFeeValueInputConfig(symbolType: unknown) {
	return resolvePositionSymbolModel(resolveFeeSymbolType(symbolType)).feeValueInputConfig
}

function formatFeeValueInputValue(feeValue: number): string {
	return Number.isInteger(feeValue)
		? String(feeValue)
		: String(feeValue).replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '')
}

export function parseFeeValueInputValue(value: string): number | null {
	return toNullableNumberValue(value)
}

const feeFormulaMath = {
	normalizeAmount(value: number | null): number | null {
		return value === null ? null : roundAmountValue(value)
	},
	normalizeNumber: normalizeFeeNumber,
}

function resolveFeeSymbolType(value: unknown): PositionSymbolType | null {
	return typeof value === 'string'
		? normalizePositionSymbolTypeValue(value.trim().toLocaleLowerCase())
		: null
}

function normalizeFeeNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null
	}
	if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'bigint') {
		return null
	}
	const parsedValue = Number(String(value).trim())
	return Number.isFinite(parsedValue) ? parsedValue : null
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('fee value model', () => {
		// @story [[lucrjournal/symbol#^crypto-fee-model]] Covers percentage-based crypto fee derivation
		it('derives crypto fee_value as a percent of notional_value', () => {
			expect(deriveAbsoluteFee({
				type: 'Crypto_Perp',
				fee_value: 30,
				notional_value: 1000,
			})).toBe(300)
			expect(deriveAbsoluteFee({
				type: 'Crypto_Spot',
				fee_value: 30,
				notional_value: 1000,
			})).toBe(300)
		})

		// @story [[lucrjournal/symbol#^future-fee-model]] Covers per-contract future fee derivation
		it('derives future fee_value per contract', () => {
			expect(deriveAbsoluteFee({
				type: 'Future',
				fee_value: 2.5,
				contract: 3,
			})).toBe(7.5)
		})

		// @story [[lucrjournal/symbol#^cfd-fee-model]] Covers per-lot CFD fee derivation
		it('derives cfd fee_value per lot', () => {
			expect(deriveAbsoluteFee({
				type: 'CFD',
				fee_value: 4,
				lots: 0.25,
			})).toBe(1)
		})

		it('derives null symbol type fee_value as crypto percent fallback', () => {
			expect(deriveAbsoluteFee({
				type: null,
				fee_value: 80,
				notional_value: 10,
			})).toBe(8)
		})

		// @story [[lucrjournal/symbol#^crypto-fee-model]] Covers rejected crypto fee boundaries
		// @story [[lucrjournal/symbol#^future-fee-model]] Covers rejected future fee boundaries
		// @story [[lucrjournal/symbol#^cfd-fee-model]] Covers rejected CFD fee boundaries
		it('rejects invalid fee_value by symbol type', () => {
			for (const record of [
				{ type: 'Crypto_Perp', fee_value: 0 },
				{ type: 'Crypto_Spot', fee_value: 100 },
				{ type: 'Future', fee_value: 0.00009 },
				{ type: 'Future', fee_value: Number.POSITIVE_INFINITY },
				{ type: 'CFD', fee_value: 0 },
			]) {
				expect(() => validateFeeModel(record)).toThrow('FEE_VALUE_INVALID_ERROR')
			}
		})
	})
}
