/// <reference types="vitest/importMeta" />

/*
 * Position persisted formulas only.
 *
 * This file is the single source of truth for writeback formulas that affect
 * persisted/frontmatter values.
 *
 * Persisted formula fields in `position` currently have 2 valid writeback
 * paths:
 *
 * 1. dependency-driven recompute
 *    when any dependency changes, runtime must recompute the persisted formula
 *    field and overwrite the old persisted value.
 *
 * 2. manual override
 *    when the user edits a persisted formula field directly, runtime may write
 *    that override value back as-is.
 *
 * Both paths are valid at the same time. A manual override is not sticky: a
 * later dependency change is allowed to recompute the same field again and
 * overwrite the manual value.
 *
 * Source resolution that is not itself pure formula logic, such as looking up
 * the latest fee model from linked symbol entries, stays in
 * `position.ts` orchestration. This file only defines the pure persisted math
 * once the effective inputs are already resolved.
 *
 * Dependency graph:
 * Read each line as `source patch -> written field`. When a written field also
 * appears as a source below, `changed` carries that cascade in the same save.
 *
 * patch.status(open), unless patch.closed_at exists -> closed_at
 * patch.exit_price(valid number) -> status
 * patch.notional_asset / patch.notional_amount / patch.contract / patch.lots / patch.entry_price / patch.symbol
 *   -> notional_value -> fee(only if derived fee > 0) -> profit
 *   -> notional_value -> profit, risk
 * patch.symbol / patch.notional_value / patch.contract / patch.lots
 *   -> fee(only if derived fee > 0) -> profit
 * patch.notional_value in native mode without patch.notional_amount -> notional_amount
 * patch.profit / patch.risk / patch.fee -> amount normalization only
 *
 * The dependency table below is the executable copy of this graph. Keep trigger
 * arrays there instead of hiding field lists inside individual `if` branches.
 *
 * The current persisted writeback formulas are:
 *
 * 1. `shouldResetClosedAtOnStatusOpen`
 *    `status === "open"` and patch does not explicitly provide `closed_at`
 *    -> persisted `closed_at = null`
 *
 * 2. `shouldClosePositionOnExitPrice`
 *    patch provides a valid `exit_price`
 *    -> persisted `status = "close"`
 *
 * 3. `calculatePositionProfit`
 *    `profit = (exit_price - entry_price) * direction * (notional_value / entry_price) - fee`
 *
 * 4. `calculatePositionRisk`
 *    `risk = (entry_price - stop_loss) * direction * (notional_value / entry_price)`
 *    non-positive / invalid risk -> persisted `risk = null`
 *
 * 5. `calculatePositionNotionalValue`
 *    symbol-type-specific derivation for persisted `notional_value`
 *
 * 6. shared formula helpers
 *    numeric normalization, amount rounding, and side direction parsing
 *
 * Runtime-only formulas such as planned/real R:R, and form-controlled logic,
 * intentionally stay outside this file.
 */
import { roundAmountValue, toNullableTrimmedValue } from '../../utils'
import { resolvePositionSymbolModel, type PositionNotionalContext, type PositionNotionalInput } from '../symbol/position-model'

export type { PositionNotionalContext }

type ApplyPositionBeforeSaveFormulasArgs = {
	previousRecord: Record<string, unknown>
	record: Record<string, unknown>
	patch: Record<string, unknown>
	symbolContext: PositionNotionalContext
	resolveDerivedFee(this: void, record: Record<string, unknown>): number | null
}

/*
 * First-order source fields only. Downstream formulas read `changed` so a
 * formula write behaves like a source touch without mutating the patch.
 */
// @story [[lucrjournal/position-formulas#^notional-writeback-triggers]] Defines every source patch that re-derives persisted notional value
// @story [[lucrjournal/position-formulas#^fee-writeback-triggers]] Defines every direct fee source patch
// @story [[lucrjournal/position-formulas#^profit-risk-writeback-triggers]] Defines the persisted profit and risk source fields
const POSITION_FORMULA_DEPENDENCIES = {
	notional_value: ['notional_asset', 'notional_amount', 'contract', 'lots', 'entry_price', 'symbol'],
	fee: ['symbol', 'notional_value', 'contract', 'lots'],
	profit: ['side', 'entry_price', 'exit_price', 'notional_value', 'fee'],
	risk: ['side', 'entry_price', 'stop_loss', 'notional_value'],
} as const

export type PositionFormulaInput = {
	side?: unknown
	notional_value?: unknown
	fee?: unknown
	entry_price?: unknown
	exit_price?: unknown
	target_price?: unknown
	stop_loss?: unknown
}

export function applyPositionBeforeSaveFormulas({
	previousRecord,
	record,
	patch,
	symbolContext,
	resolveDerivedFee,
}: ApplyPositionBeforeSaveFormulasArgs) {
	convertPositionNotionalAmountOnAssetToggle(previousRecord, record, patch, symbolContext)
	const changed = {
		notional_value: applyDerivedPositionNotionalValue(record, patch, symbolContext),
		fee: false,
	}

	if (hasPatchField(patch, 'notional_value') && hasPatchField(patch, 'notional_amount') === false) {
		syncPositionNotionalAmount(record, symbolContext)
	}

	changed.fee = applyDerivedPositionFee(
		record,
		patch,
		changed.notional_value,
		resolveDerivedFee,
	)

	if (shouldResetClosedAtOnStatusOpen(patch.status, hasPatchField(patch, 'closed_at'))) {
		record.closed_at = null
	}
	if (shouldClosePositionOnExitPrice(record.exit_price, hasPatchField(patch, 'exit_price'))) {
		record.status = 'close'
	}

	if (
		changed.fee
		|| changed.notional_value
		|| patchTouchesSourceField(patch, POSITION_FORMULA_DEPENDENCIES.profit)
	) {
		record.profit = calculatePositionProfit(record)
	}

	if (
		changed.notional_value
		|| patchTouchesSourceField(patch, POSITION_FORMULA_DEPENDENCIES.risk)
	) {
		record.risk = calculatePositionRisk(record)
	}

	prunePositionNotionalAmount(record)
	normalizePersistedPatchAmounts(record, patch)
}

function parsePositionNotionalValue(notionalValue: unknown): number | null {
	const numericNotionalValue = normalizePositionNumber(notionalValue)
	if (numericNotionalValue === null || numericNotionalValue <= 0) {
		return null
	}

	return numericNotionalValue
}

const positionNotionalFormulaMath = {
	normalizeAmount: normalizePositionAmount,
	normalizeNumber: normalizePositionNumber,
	parseNotionalValue: parsePositionNotionalValue,
	resolveEffectiveQuantity: resolvePositionEffectiveQuantity,
}

// @story [[lucrjournal/position-formulas#^derived-amount-precision]] Applies shared amount rounding only after a formula produces its result
export function normalizePositionAmount(value: number | null): number | null {
	return value === null ? null : roundAmountValue(value)
}

// @story [[lucrjournal/position-formulas#^formula-number-normalization]] Collapses supported primitive formula inputs to finite numbers
export function normalizePositionNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null
	}

	if (
		typeof value !== 'string'
		&& typeof value !== 'boolean'
		&& typeof value !== 'bigint'
	) {
		return null
	}

	const trimmedValue = toNullableTrimmedValue(String(value))
	if (trimmedValue === null) {
		return null
	}

	const parsedValue = Number(trimmedValue)
	return Number.isFinite(parsedValue) ? parsedValue : null
}

// @story [[lucrjournal/position-formulas#^formula-side-direction]] Maps canonical long and short sides to formula signs
export function resolvePositionFormulaDirection(side: unknown): 1 | -1 | null {
	if (typeof side !== 'string') {
		return null
	}

	switch (side.trim().toLocaleUpperCase()) {
		case 'LONG':
			return 1
		case 'SHORT':
			return -1
		default:
			return null
	}
}

// @story [[lucrjournal/position#^position-reopen-writeback]] Clears closed time only when reopening without an explicit timestamp patch
function shouldResetClosedAtOnStatusOpen(
	status: unknown,
	hasClosedAtInPatch: boolean,
): boolean {
	return status === 'open' && hasClosedAtInPatch === false
}

// @story [[lucrjournal/position#^position-exit-closes]] Closes on every explicitly patched finite exit price without creating closed time
function shouldClosePositionOnExitPrice(
	exitPrice: unknown,
	hasExitPriceInPatch: boolean,
): boolean {
	return hasExitPriceInPatch && normalizePositionNumber(exitPrice) !== null
}

// @story [[lucrjournal/position-formulas#^position-profit-formula]] Computes persisted directional price profit and subtracts one absolute fee
export function calculatePositionProfit(position: PositionFormulaInput): number | null {
	const quantity = resolvePositionEffectiveQuantity(position)
	const direction = resolvePositionFormulaDirection(position.side)
	const entryPrice = normalizePositionNumber(position.entry_price)
	const exitPrice = normalizePositionNumber(position.exit_price)
	if (quantity === null || direction === null || entryPrice === null || exitPrice === null) {
		return null
	}

	const fee = normalizePositionNumber(position.fee) ?? 0
	return normalizePositionAmount((exitPrice - entryPrice) * direction * quantity - fee)
}

// @story [[lucrjournal/position-formulas#^position-risk-formula]] Accepts only positive directional stop-loss exposure
export function calculatePositionRisk(position: PositionFormulaInput): number | null {
	const quantity = resolvePositionEffectiveQuantity(position)
	const direction = resolvePositionFormulaDirection(position.side)
	const entryPrice = normalizePositionNumber(position.entry_price)
	const stopLoss = normalizePositionNumber(position.stop_loss)
	if (quantity === null || direction === null || entryPrice === null || stopLoss === null) {
		return null
	}

	const risk = (entryPrice - stopLoss) * direction * quantity
	return risk > 0 ? normalizePositionAmount(risk) : null
}

// @story [[lucrjournal/position-formulas#^effective-position-quantity]] Derives quantity only from positive notional value and entry price
export function resolvePositionEffectiveQuantity(
	position: Pick<PositionFormulaInput, 'entry_price' | 'notional_value'>,
): number | null {
	const notionalValue = parsePositionNotionalValue(position.notional_value)
	const entryPrice = normalizePositionNumber(position.entry_price)
	if (notionalValue === null || entryPrice === null || entryPrice <= 0) {
		return null
	}

	return notionalValue / entryPrice
}

// @story [[lucrjournal/position-formulas#^position-notional-formula]] Delegates notional inputs to the resolved symbol model
function calculatePositionNotionalValue(
	position: PositionNotionalInput,
	ctx: PositionNotionalContext,
): number | null {
	return resolvePositionSymbolModel(ctx.symbolType)
		.calculateNotionalValue(position, ctx, positionNotionalFormulaMath)
}

function calculatePositionNotionalAmount(
	position: Pick<PositionFormulaInput, 'entry_price' | 'notional_value'> & { notional_asset?: unknown },
	ctx: Pick<PositionNotionalContext, 'symbolType'>,
): number | null {
	return resolvePositionSymbolModel(ctx.symbolType)
		.calculateNotionalAmount(position, ctx, positionNotionalFormulaMath)
}

// @story [[lucrjournal/position-formulas#^native-notional-conversion]] Converts the prior USD notional when native mode is selected
function convertPositionNotionalAmountOnAssetToggle(
	previousRecord: Record<string, unknown>,
	record: Record<string, unknown>,
	patch: Record<string, unknown>,
	symbolContext: PositionNotionalContext,
) {
	if (hasPatchField(patch, 'notional_asset') === false || hasPatchField(patch, 'notional_amount')) {
		return
	}

	const nextNotionalAmount = resolvePositionSymbolModel(symbolContext.symbolType)
		.convertNotionalAmountOnAssetToggle(
			previousRecord,
			record,
			symbolContext,
			positionNotionalFormulaMath,
		)
	if (nextNotionalAmount !== undefined) {
		record.notional_amount = nextNotionalAmount
	}
}

function applyDerivedPositionNotionalValue(
	record: Record<string, unknown>,
	patch: Record<string, unknown>,
	symbolContext: PositionNotionalContext,
) {
	if (!patchTouchesSourceField(patch, POSITION_FORMULA_DEPENDENCIES.notional_value)) {
		return false
	}

	const nextNotionalValue = calculatePositionNotionalValue(record, symbolContext)
	if (nextNotionalValue === null || nextNotionalValue === record.notional_value) {
		return false
	}

	record.notional_value = nextNotionalValue
	return true
}

// @story [[lucrjournal/position-formulas#^position-derived-fee]] Preserves persisted fee unless the latest symbol model derives a positive value
// @story [[lucrjournal/position-formulas#^fee-writeback-triggers]] Propagates only an actual positive fee change
function applyDerivedPositionFee(
	record: Record<string, unknown>,
	patch: Record<string, unknown>,
	notionalValueChangedByFormula: boolean,
	resolveDerivedFee: (record: Record<string, unknown>) => number | null,
) {
	if (!notionalValueChangedByFormula && !patchTouchesSourceField(patch, POSITION_FORMULA_DEPENDENCIES.fee)) {
		return false
	}

	const previousFee = normalizePositionNumber(record.fee)
	const nextFee = resolveDerivedFee(record)
	if (nextFee === null || nextFee <= 0) {
		return false
	}

	record.fee = nextFee
	return !Object.is(previousFee, nextFee)
}

// @story [[lucrjournal/position-formulas#^native-notional-conversion]] Backfills native amount after a direct notional value edit
function syncPositionNotionalAmount(
	record: Record<string, unknown>,
	symbolContext: PositionNotionalContext,
) {
	const nextNotionalAmount = calculatePositionNotionalAmount(record, symbolContext)
	if (nextNotionalAmount !== record.notional_amount) {
		record.notional_amount = nextNotionalAmount
	}
}

// @story [[lucrjournal/position-formulas#^native-notional-conversion]] Removes native amount outside native mode
function prunePositionNotionalAmount(record: Record<string, unknown>) {
	if (record.notional_asset !== 'native') {
		delete record.notional_amount
	}
}

// @story [[lucrjournal/position-formulas#^manual-derived-overrides]] Normalizes direct amount overrides after formula cascades finish
function normalizePersistedPatchAmounts(
	record: Record<string, unknown>,
	patch: Record<string, unknown>,
) {
	for (const field of ['profit', 'risk', 'fee'] as const) {
		if (hasPatchField(patch, field)) {
			record[field] = normalizePositionAmount(normalizePositionNumber(record[field]))
		}
	}
}

function patchTouchesSourceField(
	patch: Record<string, unknown>,
	fields: readonly string[],
) {
	return fields.some((field) => hasPatchField(patch, field))
}

function hasPatchField(
	patch: Record<string, unknown>,
	field: string,
) {
	return Object.prototype.hasOwnProperty.call(patch, field)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('applyPositionBeforeSaveFormulas fee writeback', () => {
		// @story [[lucrjournal/position-formulas#^position-derived-fee]] Covers preservation when the current symbol fee model is absent
		it('keeps existing fee when derived fee resolves null', () => {
			const record = {
				entry_price: 100,
				exit_price: 110,
				fee: 1,
				notional_value: 1000,
				profit: 99,
				side: 'LONG',
			}

			applyPositionBeforeSaveFormulas({
				previousRecord: { ...record },
				record,
				patch: { notional_value: 1000 },
				symbolContext: { symbolType: 'Crypto_Perp', contractUnit: null },
				resolveDerivedFee: () => null,
			})

			expect(record.fee).toBe(1)
			expect(record.profit).toBe(99)
		})

		it('keeps existing fee when derived fee resolves zero', () => {
			const record = {
				entry_price: 100,
				exit_price: 110,
				fee: 1,
				notional_value: 1000,
				profit: null as number | null,
				side: 'LONG',
			}

			applyPositionBeforeSaveFormulas({
				previousRecord: { ...record },
				record,
				patch: { notional_value: 1000 },
				symbolContext: { symbolType: 'Crypto_Perp', contractUnit: null },
				resolveDerivedFee: () => 0,
			})

			expect(record.fee).toBe(1)
			expect(record.profit).toBe(99)
		})

		// @story [[lucrjournal/position-formulas#^manual-derived-overrides]] Covers direct fee clear and zero overrides
		it('allows manual fee clear and zero', () => {
			for (const fee of [null, 0]) {
				const record = {
					entry_price: 100,
					exit_price: 110,
					fee,
					notional_value: 1000,
					profit: null as number | null,
					side: 'LONG',
				}

				applyPositionBeforeSaveFormulas({
					previousRecord: { ...record, fee: 1 },
					record,
					patch: { fee },
					symbolContext: { symbolType: 'Crypto_Perp', contractUnit: null },
					resolveDerivedFee: () => null,
				})

				expect(record.fee).toBe(fee)
				expect(record.profit).toBe(100)
			}
		})
	})

	describe('calculatePositionNotionalValue', () => {
		// @story [[lucrjournal/position-formulas#^position-notional-formula]] Covers the crypto USD null result
		it('does not derive crypto/usd notional_value from notional_amount', () => {
			const legacyUsd = { notional_asset: 'usd', notional_amount: 300, entry_price: 100 }

			expect(calculatePositionNotionalValue(
				legacyUsd,
				{ symbolType: 'Crypto_Perp', contractUnit: null },
			)).toBeNull()
		})

		// @story [[lucrjournal/position-formulas#^position-notional-formula]] Covers crypto native amount and entry price inputs
		it('derives crypto/native notional_value from notional_amount and entry_price', () => {
			const legacyNative = { notional_asset: 'native', notional_amount: 0.5, entry_price: 100 }

			expect(calculatePositionNotionalValue(
				legacyNative,
				{ symbolType: 'Crypto_Spot', contractUnit: null },
			)).toBe(50)
		})

		// @story [[lucrjournal/position-formulas#^position-notional-formula]] Covers future contract price and contract unit inputs
		it('future multiplies integer contract, entry_price, and contractUnit', () => {
			expect(calculatePositionNotionalValue(
				{ contract: 2, entry_price: 4500 },
				{ symbolType: 'Future', contractUnit: 50 },
			)).toBe(450000)
		})

		it('future without contractUnit returns null', () => {
			expect(calculatePositionNotionalValue(
				{ contract: 2, entry_price: 4500 },
				{ symbolType: 'Future', contractUnit: null },
			)).toBeNull()
		})

		it('future rejects decimal contract and contract over 20', () => {
			expect(calculatePositionNotionalValue(
				{ contract: 1.5, entry_price: 4500 },
				{ symbolType: 'Future', contractUnit: 50 },
			)).toBeNull()
			expect(calculatePositionNotionalValue(
				{ contract: 21, entry_price: 4500 },
				{ symbolType: 'Future', contractUnit: 50 },
			)).toBeNull()
		})

		it('future ignores lots', () => {
			expect(calculatePositionNotionalValue(
				{ lots: 2, entry_price: 4500 },
				{ symbolType: 'Future', contractUnit: 50 },
			)).toBeNull()
		})

		// @story [[lucrjournal/position-formulas#^position-notional-formula]] Covers CFD lots price and contract unit inputs
		it('cfd multiplies lots, entry_price, and contractUnit', () => {
			expect(calculatePositionNotionalValue(
				{ lots: 0.1, entry_price: 1.08 },
				{ symbolType: 'CFD', contractUnit: 100000 },
			)).toBeCloseTo(10800, 6)
		})

		it('cfd without contractUnit returns null', () => {
			expect(calculatePositionNotionalValue(
				{ lots: 0.1, entry_price: 1.08 },
				{ symbolType: 'CFD', contractUnit: null },
			)).toBeNull()
		})

		it('cfd rejects lots outside 0.01 to 20', () => {
			expect(calculatePositionNotionalValue(
				{ lots: 0.009, entry_price: 1.08 },
				{ symbolType: 'CFD', contractUnit: 100000 },
			)).toBeNull()
			expect(calculatePositionNotionalValue(
				{ lots: 20.01, entry_price: 1.08 },
				{ symbolType: 'CFD', contractUnit: 100000 },
			)).toBeNull()
		})

		it('null symbolType derives native notional_value like crypto fallback', () => {
			const legacyNative = { notional_asset: 'native', notional_amount: 0.5, entry_price: 100 }

			expect(calculatePositionNotionalValue(
				legacyNative,
				{ symbolType: null, contractUnit: null },
			)).toBe(50)
		})

		it('non-positive entry_price returns null', () => {
			const legacyNative = { notional_asset: 'native', notional_amount: 0.5, entry_price: 0 }

			expect(calculatePositionNotionalValue(
				legacyNative,
				{ symbolType: 'Crypto_Perp', contractUnit: null },
			)).toBeNull()
		})

		it('coerces numeric strings on future inputs', () => {
			expect(calculatePositionNotionalValue(
				{ contract: '2', entry_price: '100' },
				{ symbolType: 'Future', contractUnit: 50 },
			)).toBe(10000)
		})
	})

	describe('resolvePositionEffectiveQuantity', () => {
		// @story [[lucrjournal/position-formulas#^effective-position-quantity]] Covers positive notional divided by entry price
		it('divides notional_value by entry_price', () => {
			expect(resolvePositionEffectiveQuantity({
				notional_value: 450000,
				entry_price: 4500,
			})).toBe(100)
		})

		// @story [[lucrjournal/position-formulas#^effective-position-quantity]] Covers a non-positive entry price
		it('returns null when entry_price is missing or non-positive', () => {
			expect(resolvePositionEffectiveQuantity({
				notional_value: 1000,
				entry_price: 0,
			})).toBeNull()
		})
	})
}
