/// <reference types="vitest/importMeta" />

import { findBuiltinCfdSymbol, findBuiltinFutureSymbol } from './constants'

export type PositionSymbolType = 'Crypto_Perp' | 'Crypto_Spot' | 'Future' | 'CFD'

export type PositionNotionalInput = {
	notional_asset?: unknown
	notional_amount?: unknown
	contract?: unknown
	lots?: unknown
	entry_price?: unknown
	notional_value?: unknown
}

type PositionFeeInput = {
	fee_value?: unknown
	notional_value?: unknown
	contract?: unknown
	lots?: unknown
}

export type PositionNotionalContext = {
	symbolType: PositionSymbolType | null
	contractUnit: number | null
}

type PositionNotionalSourceVisibility = {
	showCryptoAmount: boolean
}

export type PositionQuantityValueKind = 'number' | 'positive-integer' | 'bounded-lots'

type PositionQuantityFieldConfig = {
	field: 'contract' | 'lots'
	integerOnly: boolean
	labelKey: 'POSITION_DETAILS_CONTRACT' | 'POSITION_DETAILS_LOTS'
	max: number
	min: number
	step: number
	valueKind: PositionQuantityValueKind
} | null

export type SymbolContractUnitTableValue = {
	value: number | null
	editable: boolean
	source: 'fixed' | 'builtin' | 'custom'
}

type FeeValueSuffixKey =
	| 'FEE_VALUE_SUFFIX_PERCENT'
	| 'FEE_VALUE_SUFFIX_PER_CONTRACT'
	| 'FEE_VALUE_SUFFIX_PER_LOT'

type FeeValueInputConfig = {
	min: number
	max: number | null
	prefix: string
	suffixKey: FeeValueSuffixKey
}

const LOTS_MIN = 0.01
const LOTS_MAX = 20
const FEE_VALUE_MIN = 0.0001
const FEE_VALUE_CRYPTO_MAX = 100

type PositionFormulaMath = {
	normalizeAmount(this: void, value: number | null): number | null
	normalizeNumber(this: void, value: unknown): number | null
}

type PositionNotionalFormulaMath = PositionFormulaMath & {
	parseNotionalValue(this: void, value: unknown): number | null
	resolveEffectiveQuantity(this: void, position: Pick<PositionNotionalInput, 'entry_price' | 'notional_value'>): number | null
}

export abstract class BasePositionSymbol {
	abstract readonly type: PositionSymbolType
	abstract readonly notionalSourceVisibility: PositionNotionalSourceVisibility
	abstract readonly quantityFieldConfig: PositionQuantityFieldConfig
	abstract readonly contractUnitEditable: boolean
	abstract readonly feeValueInputConfig: FeeValueInputConfig

	normalizeTypeValue(value: string): PositionSymbolType | null {
		return value === this.type.toLocaleLowerCase() ? this.type : null
	}

	resolveContractUnit(_symbolName: string, _overrideValue?: unknown): number | null {
		return null
	}

	normalizeContractUnitOverride(_value: unknown): number | null {
		return null
	}

	resolveContractUnitTableValue(symbolName: string, overrideValue?: unknown): SymbolContractUnitTableValue {
		return {
			value: this.resolveContractUnit(symbolName, overrideValue),
			editable: this.contractUnitEditable,
			source: 'builtin',
		}
	}

	resolveChartSymbolName(_symbolName: string): string | null {
		return null
	}

	calculateNotionalValue(
		position: PositionNotionalInput,
		ctx: PositionNotionalContext,
		math: PositionFormulaMath,
	): number | null {
		const entryPrice = math.normalizeNumber(position.entry_price)
		const quantity = this.resolveNotionalQuantity(position, math)
		if (
			entryPrice === null
			|| entryPrice <= 0
			|| quantity === null
			|| ctx.contractUnit === null
			|| ctx.contractUnit <= 0
		) {
			return null
		}

		return math.normalizeAmount(quantity * entryPrice * ctx.contractUnit)
	}

	calculateFeeValue(
		position: PositionFeeInput,
		math: PositionFormulaMath,
	): number | null {
		const feeValue = math.normalizeNumber(position.fee_value)
		const quantity = this.resolveFeeQuantity(position, math)
		if (feeValue === null || quantity === null || !this.isValidFeeValue(feeValue)) {
			return null
		}

		return math.normalizeAmount(feeValue * quantity)
	}

	calculateNotionalAmount(
		_position: PositionNotionalInput,
		_ctx: Pick<PositionNotionalContext, 'symbolType'>,
		_math: PositionNotionalFormulaMath,
	): number | null {
		return null
	}

	convertNotionalAmountOnAssetToggle(
		_previousRecord: PositionNotionalInput,
		_record: PositionNotionalInput,
		_ctx: PositionNotionalContext,
		_math: PositionNotionalFormulaMath,
	): number | undefined {
		return undefined
	}

	isValidFeeValue(feeValue: number): boolean {
		return Number.isFinite(feeValue) && feeValue >= FEE_VALUE_MIN
	}

	protected resolveNotionalQuantity(
		_position: PositionNotionalInput,
		_math: PositionFormulaMath,
	): number | null {
		return null
	}

	protected resolveFeeQuantity(
		_position: PositionFeeInput,
		_math: PositionFormulaMath,
	): number | null {
		return null
	}
}

class CryptoPositionSymbolModel extends BasePositionSymbol {
	constructor(
		readonly type: 'Crypto_Perp' | 'Crypto_Spot',
	) {
		super()
	}

	readonly notionalSourceVisibility = {
		showCryptoAmount: true,
	}
	readonly quantityFieldConfig = null
	readonly contractUnitEditable = false
	readonly feeValueInputConfig = {
		min: 0,
		max: FEE_VALUE_CRYPTO_MAX,
		prefix: '',
		suffixKey: 'FEE_VALUE_SUFFIX_PERCENT',
	} as const

	override resolveContractUnit(_symbolName: string): number | null {
		return 1
	}

	override resolveContractUnitTableValue(symbolName: string, overrideValue?: unknown): SymbolContractUnitTableValue {
		return {
			...super.resolveContractUnitTableValue(symbolName, overrideValue),
			source: 'fixed',
		}
	}

	override resolveChartSymbolName(symbolName: string): string | null {
		return symbolName
	}

	override calculateNotionalValue(
		position: PositionNotionalInput,
		_ctx: PositionNotionalContext,
		math: PositionFormulaMath,
	): number | null {
		if (position.notional_asset !== 'native') {
			return null
		}

		const amount = math.normalizeNumber(position.notional_amount)
		const entryPrice = math.normalizeNumber(position.entry_price)
		return amount === null || amount <= 0 || entryPrice === null || entryPrice <= 0
			? null
			: math.normalizeAmount(amount * entryPrice)
	}

	override calculateNotionalAmount(
		position: PositionNotionalInput,
		_ctx: Pick<PositionNotionalContext, 'symbolType'>,
		math: PositionNotionalFormulaMath,
	): number | null {
		if (position.notional_asset !== 'native') {
			return null
		}

		const quantity = math.resolveEffectiveQuantity(position)
		return quantity === null || quantity <= 0 ? null : math.normalizeAmount(quantity)
	}

	override convertNotionalAmountOnAssetToggle(
		previousRecord: PositionNotionalInput,
		record: PositionNotionalInput,
		_ctx: PositionNotionalContext,
		math: PositionNotionalFormulaMath,
	): number | undefined {
		const previousAsset = previousRecord.notional_asset === 'native' ? 'native' : 'usd'
		const nextAsset = record.notional_asset === 'native' ? 'native' : 'usd'
		if (previousAsset === nextAsset || nextAsset !== 'native') {
			return undefined
		}

		const previousUsdNotional = math.parseNotionalValue(previousRecord.notional_value)
		const entryPrice = math.normalizeNumber(record.entry_price)
		if (previousUsdNotional === null || entryPrice === null || entryPrice <= 0) {
			return undefined
		}
		return math.normalizeAmount(previousUsdNotional / entryPrice) ?? undefined
	}

	override isValidFeeValue(feeValue: number): boolean {
		return Number.isFinite(feeValue) && feeValue > 0 && feeValue < FEE_VALUE_CRYPTO_MAX
	}

	protected override resolveFeeQuantity(
		position: PositionFeeInput,
		math: PositionFormulaMath,
	): number | null {
		const notionalValue = math.normalizeNumber(position.notional_value)
		return notionalValue === null || notionalValue <= 0 ? null : notionalValue / 100
	}
}

class FuturePositionSymbolModel extends BasePositionSymbol {
	readonly type = 'Future'
	readonly notionalSourceVisibility = {
		showCryptoAmount: false,
	}
	readonly quantityFieldConfig = {
		field: 'contract',
		integerOnly: true,
		labelKey: 'POSITION_DETAILS_CONTRACT',
		max: LOTS_MAX,
		min: 1,
		step: 1,
		valueKind: 'positive-integer',
	} as const
	readonly contractUnitEditable = false
	readonly feeValueInputConfig = {
		min: FEE_VALUE_MIN,
		max: null,
		prefix: '$',
		suffixKey: 'FEE_VALUE_SUFFIX_PER_CONTRACT',
	} as const

	override resolveContractUnit(symbolName: string): number | null {
		return findBuiltinFutureSymbol(symbolName)?.contract_unit ?? null
	}

	protected override resolveNotionalQuantity(
		position: PositionNotionalInput,
		math: PositionFormulaMath,
	): number | null {
		const contract = math.normalizeNumber(position.contract)
		if (
			contract === null
			|| !Number.isInteger(contract)
			|| contract < this.quantityFieldConfig.min
			|| contract > this.quantityFieldConfig.max
		) {
			return null
		}
		return contract
	}

	protected override resolveFeeQuantity(
		position: PositionFeeInput,
		math: PositionFormulaMath,
	): number | null {
		return this.resolveNotionalQuantity(position, math)
	}
}

class CfdPositionSymbolModel extends BasePositionSymbol {
	readonly type = 'CFD'
	readonly notionalSourceVisibility = {
		showCryptoAmount: false,
	}
	readonly quantityFieldConfig = {
		field: 'lots',
		integerOnly: false,
		labelKey: 'POSITION_DETAILS_LOTS',
		max: LOTS_MAX,
		min: LOTS_MIN,
		step: LOTS_MIN,
		valueKind: 'bounded-lots',
	} as const
	readonly contractUnitEditable = true
	readonly feeValueInputConfig = {
		min: FEE_VALUE_MIN,
		max: null,
		prefix: '$',
		suffixKey: 'FEE_VALUE_SUFFIX_PER_LOT',
	} as const

	override resolveContractUnit(symbolName: string, overrideValue?: unknown): number | null {
		return this.normalizeContractUnitOverride(overrideValue)
			?? findBuiltinCfdSymbol(symbolName)?.contract_unit
			?? null
	}

	override normalizeContractUnitOverride(value: unknown): number | null {
		if (value == null || value === '') {
			return null
		}

		const numericValue = Number(value)
		const roundedValue = Math.round(numericValue)
		return Number.isFinite(numericValue) && roundedValue > 0 ? roundedValue : null
	}

	override resolveContractUnitTableValue(symbolName: string, overrideValue?: unknown): SymbolContractUnitTableValue {
		const normalizedOverrideValue = this.normalizeContractUnitOverride(overrideValue)
		return {
			value: this.resolveContractUnit(symbolName, normalizedOverrideValue),
			editable: this.contractUnitEditable,
			source: normalizedOverrideValue === null ? 'builtin' : 'custom',
		}
	}

	protected override resolveNotionalQuantity(
		position: PositionNotionalInput,
		math: PositionFormulaMath,
	): number | null {
		const lots = math.normalizeNumber(position.lots)
		if (
			lots === null
			|| lots < this.quantityFieldConfig.min
			|| lots > this.quantityFieldConfig.max
		) {
			return null
		}
		return lots
	}

	protected override resolveFeeQuantity(
		position: PositionFeeInput,
		math: PositionFormulaMath,
	): number | null {
		return this.resolveNotionalQuantity(position, math)
	}
}

const CryptoPerpPositionSymbol = new CryptoPositionSymbolModel('Crypto_Perp')
const CryptoSpotPositionSymbol = new CryptoPositionSymbolModel('Crypto_Spot')
const FuturePositionSymbol = new FuturePositionSymbolModel()
const CfdPositionSymbol = new CfdPositionSymbolModel()
const POSITION_SYMBOL_MODELS = [
	CryptoPerpPositionSymbol,
	CryptoSpotPositionSymbol,
	FuturePositionSymbol,
	CfdPositionSymbol,
] as const
const POSITION_SYMBOL_MODELS_BY_TYPE = new Map<PositionSymbolType, BasePositionSymbol>(
	POSITION_SYMBOL_MODELS.map((model) => [model.type, model]),
)

export function resolvePositionSymbolModel(symbolType: PositionSymbolType | null | undefined): BasePositionSymbol {
	return POSITION_SYMBOL_MODELS_BY_TYPE.get(symbolType ?? 'Crypto_Perp') ?? CryptoPerpPositionSymbol
}

export function normalizePositionSymbolTypeValue(value: string): PositionSymbolType | null {
	return POSITION_SYMBOL_MODELS
		.map((model) => model.normalizeTypeValue(value))
		.find((symbolType) => symbolType !== null) ?? null
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('CryptoPositionSymbolModel', () => {
		it('derives normalized type value from the canonical type', () => {
			const model = new CryptoPositionSymbolModel('Crypto_Perp')

			expect(model.normalizeTypeValue('crypto_perp')).toBe('Crypto_Perp')
		})
	})
}
