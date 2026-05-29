/// <reference types="vitest/importMeta" />

import type { IconDescriptor } from './icon-descriptor'
import type { TagOption } from './tags'
import type { UiColorVar } from './ui'
import type { TranslationKey } from '../../lang/helpers'
import type { FeeModelFormValue } from '../symbol/fee-model'
import type { App } from 'obsidian'

interface FieldTypeMap {
	text: string
	url: string
	tags: string
	secret: string
	number: string
	fee_model: FeeModelFormValue
	datetime: string
	select: string
	combobox: string
	symbol_combobox: string
	criteria: CriteriaFormValue
	toggle: boolean
}

type CriteriaFormValueItem = {
	name: string
}

export type CriteriaFormSection = {
	criteriaName: string
	confluences: CriteriaFormValueItem[]
}

export type CriteriaFormValue = CriteriaFormSection[]

export type FieldType = keyof FieldTypeMap
export type FormFieldValue<T extends FieldType> = FieldTypeMap[T]

type FieldLayout = 'stack' | 'toggle-row'

export interface SelectOptionTone {
	text: UiColorVar
	background: UiColorVar
	border?: UiColorVar
}

export interface SelectOption {
	value: string
	label: string
	description?: string
	labelKey?: TranslationKey
	icon?: IconDescriptor
	tone?: SelectOptionTone
	criteria?: string | null
}

type FormCopyParams = Record<string, string | number | boolean>

export type FormCopyTemplate = string | {
	key: string
	values?: FormCopyParams
}

export type FormCopyContext = {
	app?: App
	previousValues?: Record<string, unknown>
}

type FieldOptionResolver<Values extends Record<string, unknown> = Record<string, unknown>> = (
	app: App,
	values: Values,
	context: FormCopyContext,
) => SelectOption[]

type FieldTagOptionResolver<Values extends Record<string, unknown> = Record<string, unknown>> = (
	app: App,
	values: Values,
	context: FormCopyContext,
) => TagOption[]

type FormCopyResolver<Values extends Record<string, unknown> = Record<string, unknown>> = (
	values: Values,
	context: FormCopyContext,
) => FormCopyTemplate

type AsyncFormCopyResolver<Values extends Record<string, unknown> = Record<string, unknown>> = (
	values: Values,
	context: FormCopyContext,
) => Promise<FormCopyTemplate | undefined>

type ControlledValueResolver<
	T extends FieldType = FieldType,
	Values extends Record<string, unknown> = Record<string, unknown>,
> = (
	values: Values,
	context: FormCopyContext,
	currentValue: FieldTypeMap[T],
) => FieldTypeMap[T]

type FieldValidationResolver<
	T extends FieldType = FieldType,
	Values extends Record<string, unknown> = Record<string, unknown>,
> = (
	value: FieldTypeMap[T],
	values: Values,
	context: FormCopyContext,
) => FormCopyTemplate | undefined

type FieldIconResolver<
	T extends FieldType = FieldType,
	Values extends Record<string, unknown> = Record<string, unknown>,
> = (
	value: FieldTypeMap[T],
	values: Values,
	context: FormCopyContext,
) => IconDescriptor | undefined

export interface FieldDescriptor<
	T extends FieldType = FieldType,
	Values extends Record<string, unknown> = Record<string, unknown>,
> {
	type: T
	label: string
	layout?: FieldLayout
	placeholder?: FormCopyTemplate | FormCopyResolver<Values>
	asyncPlaceholder?: AsyncFormCopyResolver<Values>
	description?: FormCopyTemplate | FormCopyResolver<Values>
	buttonLabel?: FormCopyTemplate | FormCopyResolver<Values>
	emptyStateLabel?: FormCopyTemplate | FormCopyResolver<Values>
	trueLabel?: FormCopyTemplate | FormCopyResolver<Values>
	falseLabel?: FormCopyTemplate | FormCopyResolver<Values>
	required?: boolean
	defaultValue?: FieldTypeMap[T]
	options?: SelectOption[]
	dynamicOptions?: FieldOptionResolver<Values>
	criteriaOptions?: SelectOption[]
	dynamicCriteriaOptions?: FieldOptionResolver<Values>
	tagOptions?: TagOption[]
	dynamicTagOptions?: FieldTagOptionResolver<Values>
	visible?: (values: Values) => boolean
	controlledValue?: ControlledValueResolver<T, Values>
	validate?: FieldValidationResolver<T, Values>
	valueIcon?: FieldIconResolver<T, Values>
}

type FormDefinitionShape = Record<string, { type: FieldType }>

type FormValuesFromShape<F extends FormDefinitionShape> = {
	[K in keyof F]: FieldTypeMap[F[K]['type']]
}

export type FormDefinition<F extends FormDefinitionShape = FormDefinitionShape> = {
	[K in keyof F]: FieldDescriptor<F[K]['type'], FormValuesFromShape<F>>
}

type AnyFieldDescriptor = {
	[T in FieldType]: FieldDescriptor<T, never>
}[FieldType]

export type AnyFormDefinition = Record<string, AnyFieldDescriptor>

export type FormValues<F extends AnyFormDefinition> = {
	[K in keyof F]: FieldTypeMap[F[K]['type']]
}

export function defineForm<const F extends FormDefinitionShape>(
	definition: {
		[K in keyof F]: FieldDescriptor<F[K]['type'], FormValuesFromShape<F>>
	},
): FormDefinition<F> {
	return definition
}

export function controlFormValue<
	Values extends Record<string, unknown>,
	Key extends keyof Values,
	Value,
>(
	fieldName: Key,
	deriveValue: (
		value: Values[Key],
		values: Values,
		context: FormCopyContext,
		currentValue: Value,
	) => Value,
) {
	return (values: Values, context: FormCopyContext, currentValue: Value) =>
		deriveValue(values[fieldName], values, context, currentValue)
}

const zeroValues: { [T in FieldType]: FieldTypeMap[T] } = {
	text: '',
	url: '',
	tags: '',
	secret: '',
	number: '',
	fee_model: { value: '' },
	datetime: '',
	select: '',
	combobox: '',
	symbol_combobox: '',
	criteria: [],
	toggle: false,
}

export function buildInitialFormValues<F extends AnyFormDefinition>(definition: F): FormValues<F> {
	const result = {} as Record<string, unknown>
	for (const [key, descriptor] of Object.entries(definition)) {
		result[key] = descriptor.defaultValue ?? zeroValues[descriptor.type]
	}
	return result as FormValues<F>
}

export function synchronizeControlledFormValues<F extends AnyFormDefinition>(
	definition: F,
	values: FormValues<F>,
	context: FormCopyContext = {},
): FormValues<F> {
	const entries = Object.entries(definition) as Array<[keyof F, F[keyof F]]>
	let nextValues = values

	for (let passIndex = 0; passIndex <= entries.length; passIndex += 1) {
		let changedInPass = false
		let draftValues: FormValues<F> | null = null

		for (const [fieldName, field] of entries) {
			if (field.controlledValue === undefined) {
				continue
			}

			const resolvedValue = (field as unknown as FieldDescriptor<FieldType, FormValues<F>>).controlledValue?.(
				nextValues,
				context,
				nextValues[fieldName],
			)
			if (resolvedValue === undefined || Object.is(resolvedValue, nextValues[fieldName])) {
				continue
			}

			draftValues ??= { ...nextValues }
			draftValues[fieldName] = resolvedValue as FormValues<F>[typeof fieldName]
			changedInPass = true
		}

		if (!changedInPass) {
			return nextValues
		}

		if (draftValues === null) {
			return nextValues
		}

		nextValues = draftValues
	}

	throw new Error('Form controlled values did not stabilize')
}

export function isFormFieldVisible<Values extends Record<string, unknown>>(
	field: FieldDescriptor<FieldType, Values>,
	values: Values,
): boolean {
	return field.visible?.(values) ?? true
}

export function resolveFormFieldOptions<Values extends Record<string, unknown>>(
	field: FieldDescriptor<FieldType, Values>,
	values: Values,
	context: FormCopyContext = {},
): SelectOption[] {
	if (context.app !== undefined && field.dynamicOptions !== undefined) {
		return field.dynamicOptions(context.app, values, context)
	}

	return field.options ?? []
}

export function resolveFormFieldCriteriaOptions<Values extends Record<string, unknown>>(
	field: FieldDescriptor<FieldType, Values>,
	values: Values,
	context: FormCopyContext = {},
): SelectOption[] {
	if (context.app !== undefined && field.dynamicCriteriaOptions !== undefined) {
		return field.dynamicCriteriaOptions(context.app, values, context)
	}

	return field.criteriaOptions ?? []
}

export function resolveFormFieldTagOptions<Values extends Record<string, unknown>>(
	field: FieldDescriptor<FieldType, Values>,
	values: Values,
	context: FormCopyContext = {},
): TagOption[] {
	if (context.app !== undefined && field.dynamicTagOptions !== undefined) {
		return field.dynamicTagOptions(context.app, values, context)
	}

	return field.tagOptions ?? []
}

export function localizeSelectOptionLabel(
	option: SelectOption,
	localize: (key: string, params?: FormCopyParams) => string,
): string {
	return option.labelKey === undefined ? option.label : localize(option.labelKey)
}

function resolveFormCopyTemplate<Values extends Record<string, unknown>>(
	value: FormCopyTemplate | FormCopyResolver<Values> | undefined,
	values: Values,
	context: FormCopyContext = {},
): { key: string; values?: FormCopyParams } | null {
	if (value === undefined) {
		return null
	}

	const resolved = typeof value === 'function' ? value(values, context) : value
	return typeof resolved === 'string' ? { key: resolved } : resolved
}

export function localizeFormCopyTemplate<Values extends Record<string, unknown>>(
	value: FormCopyTemplate | FormCopyResolver<Values> | undefined,
	values: Values,
	localize: (key: string, params?: FormCopyParams) => string,
	context: FormCopyContext = {},
): string | undefined {
	const resolved = resolveFormCopyTemplate(value, values, context)
	return resolved === null ? undefined : localize(resolved.key, resolved.values)
}

export function localizeToggleFieldStateLabel<Values extends Record<string, unknown>>(
	field: Pick<FieldDescriptor<'toggle', Values>, 'trueLabel' | 'falseLabel'>,
	value: boolean,
	values: Values,
	localize: (key: string, params?: FormCopyParams) => string,
	context: FormCopyContext = {},
): string | undefined {
	return localizeFormCopyTemplate(
		value ? field.trueLabel : field.falseLabel,
		values,
		localize,
		context,
	)
}

export function resolveFormFieldValidationTemplate<
	T extends FieldType,
	Values extends Record<string, unknown>,
>(
	field: FieldDescriptor<T, Values>,
	value: FieldTypeMap[T],
	values: Values,
	context: FormCopyContext = {},
): FormCopyTemplate | undefined {
	return field.validate?.(value, values, context)
}

export function localizeFormFieldValidationMessage<
	T extends FieldType,
	Values extends Record<string, unknown>,
>(
	field: FieldDescriptor<T, Values>,
	value: FieldTypeMap[T],
	values: Values,
	localize: (key: string, params?: FormCopyParams) => string,
	context: FormCopyContext = {},
): string | undefined {
	return localizeFormCopyTemplate(
		resolveFormFieldValidationTemplate(field, value, values, context),
		values,
		localize,
		context,
	)
}

export function resolveFormFieldValueIcon<
	T extends FieldType,
	Values extends Record<string, unknown>,
>(
	field: FieldDescriptor<T, Values>,
	value: FieldTypeMap[T],
	values: Values,
	context: FormCopyContext = {},
): IconDescriptor | undefined {
	return field.valueIcon?.(value, values, context)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	describe('initialFormValues', () => {
		it('returns zero-values for text and number fields', () => {
			const def = {
				title: { type: 'text', label: 'Title' },
				token: { type: 'secret', label: 'Token' },
				amount: { type: 'number', label: 'Amount' },
				fee: { type: 'fee_model', label: 'Fee' },
			} as const satisfies FormDefinition

			const values = buildInitialFormValues(def)
			expect(values).toEqual({
				title: '',
				token: '',
				amount: '',
				fee: { value: '' },
			})
		})

		it('uses defaultValue when provided', () => {
			const def = {
				name: { type: 'text', label: 'Name', defaultValue: 'untitled' },
				size: { type: 'number', label: 'Size', defaultValue: '100' },
			} as const satisfies FormDefinition

			const values = buildInitialFormValues(def)
			expect(values).toEqual({ name: 'untitled', size: '100' })
		})

		it('defaults toggle to false', () => {
			const def = {
				enabled: { type: 'toggle', label: 'Enabled' },
			} as const satisfies FormDefinition

			const values = buildInitialFormValues(def)
			expect(values).toEqual({ enabled: false })
		})

		it('respects toggle defaultValue override', () => {
			const def = {
				enabled: { type: 'toggle', label: 'Enabled', defaultValue: true },
			} as const satisfies FormDefinition

			const values = buildInitialFormValues(def)
			expect(values).toEqual({ enabled: true })
		})
	})

	describe('form copy template', () => {
		it('normalizes static string keys', () => {
			expect(resolveFormCopyTemplate('FIELD_PLACEHOLDER', {})).toEqual({ key: 'FIELD_PLACEHOLDER' })
		})

		it('resolves dynamic templates from current form values', () => {
			const resolved = resolveFormCopyTemplate(
				(values) => values.platform === 'Binance'
					? { key: 'NEW_ACCOUNT_NAME_PLACEHOLDER_WITH_PLATFORM', values: { suggestion: 'Binance 1' } }
					: 'NEW_ACCOUNT_NAME_PLACEHOLDER',
				{ platform: 'Binance' },
			)

			expect(resolved).toEqual({
				key: 'NEW_ACCOUNT_NAME_PLACEHOLDER_WITH_PLATFORM',
				values: { suggestion: 'Binance 1' },
			})
		})
	})

	describe('form field visibility and options', () => {
		it('prefers dynamic options when app context is available', () => {
			const options = resolveFormFieldOptions({
				type: 'combobox',
				label: 'Platform',
				options: [{ value: 'Static', label: 'Static' }],
				dynamicOptions: () => [{ value: 'Dynamic', label: 'Dynamic' }],
			}, {}, { app: {} as App })

			expect(options).toEqual([{ value: 'Dynamic', label: 'Dynamic' }])
		})

		it('falls back to static options without app context', () => {
			const options = resolveFormFieldOptions({
				type: 'select',
				label: 'Source',
				options: [{ value: 'local', label: 'Local' }],
				dynamicOptions: () => [{ value: 'remote', label: 'Remote' }],
			}, {})

			expect(options).toEqual([{ value: 'local', label: 'Local' }])
		})

		it('hides fields based on current form values', () => {
			const definition = {
				enabled: { type: 'toggle', label: 'Enabled', defaultValue: false },
				token: { type: 'secret', label: 'Token', visible: (values) => values.enabled === true },
			} as const satisfies FormDefinition
			const values = buildInitialFormValues(definition)

			expect(isFormFieldVisible(definition.token, values)).toBe(false)
			expect(isFormFieldVisible(definition.token, { ...values, enabled: true })).toBe(true)
		})

		it('localizes toggle state labels from field descriptor', () => {
			const label = localizeToggleFieldStateLabel(
				{
					trueLabel: 'FIELD_ENABLED',
					falseLabel: 'FIELD_DISABLED',
				},
				true,
				{},
				(key) => key,
			)

			expect(label).toBe('FIELD_ENABLED')
		})

		it('synchronizes controlled values based on upstream fields', () => {
			type DemoFormValues = {
				platform: string
				enabled: boolean
				token: string
			}

			type DemoFormShape = {
				platform: { type: 'text' }
				enabled: { type: 'toggle' }
				token: { type: 'secret' }
			}

			const definition = defineForm<DemoFormShape>({
				platform: { type: 'text', label: 'Platform' },
				enabled: {
					type: 'toggle',
					label: 'Enabled',
					defaultValue: false,
					controlledValue: controlFormValue<DemoFormValues, 'platform', boolean>('platform', (platform, _values, _context, currentValue) =>
						platform === 'Binance' ? currentValue : false),
				},
				token: {
					type: 'secret',
					label: 'Token',
					controlledValue: controlFormValue<DemoFormValues, 'enabled', string>('enabled', (enabled, _values, _context, currentValue) =>
						enabled ? currentValue : ''),
				},
			} as const)

			expect(synchronizeControlledFormValues(definition, {
				platform: 'Bybit',
				enabled: true,
				token: 'secret',
			})).toEqual({
				platform: 'Bybit',
				enabled: false,
				token: '',
			})
		})
	})
}
