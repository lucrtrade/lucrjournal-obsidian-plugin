import {
	type FormCopyTemplate,
	localizeFormCopyTemplate,
	localizeSelectOptionLabel,
	resolveFormFieldCriteriaOptions,
	resolveFormFieldOptions,
	resolveFormFieldTagOptions,
	resolveFormFieldValueIcon,
	type FieldDescriptor,
	type FieldType,
	type FormFieldValue,
} from '../../../domains/core/form'

import { ComboboxFormFieldRenderer } from './combobox-form-field'
import { CriteriaFormFieldRenderer } from './criteria-form-field'
import { DatetimeFormFieldRenderer } from './datetime-form-field'
import { FeeModelFormFieldRenderer } from './fee-model-form-field'
import { NumberFormFieldRenderer } from './number-form-field'
import { SecretFormFieldRenderer } from './secret-form-field'
import { SelectFormFieldRenderer } from './select-form-field'
import { SymbolComboboxFormFieldRenderer } from './symbol-combobox-form-field'
import { TagsFormFieldRenderer } from './tags-form-field'
import { TextFormFieldRenderer } from './text-form-field'
import { ToggleFormFieldRenderer } from './toggle-form-field'
import { UrlFormFieldRenderer } from './url-form-field'

import type { SelectOption } from '../../../domains/core/form'
import type { TagOption } from '../../../domains/core/tags'
import type { App } from 'obsidian'
import type { ComponentType } from 'react'

export type FormFieldClassNames = {
	input?: string
	selectTrigger?: string
	selectMenu?: string
	selectOption?: string
	selectActiveOption?: string
	secretButton?: string
	secretHost?: string
	comboboxInput?: string
	comboboxPanel?: string
	comboboxOption?: string
	comboboxActiveOption?: string
	comboboxEmptyState?: string
	toggleButton?: string | ((value: boolean) => string)
	toggleThumb?: string | ((value: boolean) => string)
}

type SharedFormTypeRendererProps<
	T extends FieldType,
	Values extends Record<string, unknown> = Record<string, unknown>,
> = {
	app?: App
	field: FieldDescriptor<T, Values>
	value: FormFieldValue<T>
	values: Values
	onChange: (value: FormFieldValue<T>) => void
	classNames?: FormFieldClassNames
	placeholder?: string
	buttonLabel?: string
	noResultsLabel?: string
	options: SelectOption[]
	criteriaOptions: SelectOption[]
	tagOptions: TagOption[]
	valueIcon?: SelectOption['icon']
	ariaLabel?: string
	localize: (key: string, params?: Record<string, string | number | boolean>) => string
}

export type FormTypeRenderer<T extends FieldType> = ComponentType<SharedFormTypeRendererProps<T>>

type FormTypeRendererRegistry = {
	[K in FieldType]: FormTypeRenderer<K>
}

const formTypeRenderers = {
	text: TextFormFieldRenderer,
	url: UrlFormFieldRenderer,
	tags: TagsFormFieldRenderer,
	secret: SecretFormFieldRenderer,
	number: NumberFormFieldRenderer,
	fee_model: FeeModelFormFieldRenderer,
	datetime: DatetimeFormFieldRenderer,
	select: SelectFormFieldRenderer,
	combobox: ComboboxFormFieldRenderer,
	symbol_combobox: SymbolComboboxFormFieldRenderer,
	criteria: CriteriaFormFieldRenderer,
	toggle: ToggleFormFieldRenderer,
} satisfies FormTypeRendererRegistry

export function renderFormField<
	T extends FieldType,
	Values extends Record<string, unknown>,
>({
	app,
	field,
	value,
	values,
	onChange,
	localize,
	classNames,
	placeholderOverride,
}: {
	app?: App
	field: FieldDescriptor<T, Values>
	value: FormFieldValue<T>
	values: Values
	onChange: (value: FormFieldValue<T>) => void
	localize: (key: string, params?: Record<string, string | number | boolean>) => string
	classNames?: FormFieldClassNames
	placeholderOverride?: FormCopyTemplate
}) {
	const renderer = formTypeRenderers[field.type]
	const Renderer = renderer as unknown as ComponentType<SharedFormTypeRendererProps<T, Values>>
	const genericField = field as unknown as FieldDescriptor<FieldType, Values>
	const localizedOptions = resolveFormFieldOptions(genericField, values, { app })
		.map((option) => ({
			...option,
			label: localizeSelectOptionLabel(option, localize),
		}))
	const localizedCriteriaOptions = resolveFormFieldCriteriaOptions(genericField, values, { app })
		.map((option) => ({
			...option,
			label: localizeSelectOptionLabel(option, localize),
		}))
	const tagOptions = resolveFormFieldTagOptions(genericField, values, { app })

	return (
		<Renderer
			app={app}
			field={field}
			value={value}
			values={values}
			onChange={onChange}
			classNames={classNames}
			placeholder={placeholderOverride === undefined
				? localizeFormCopyTemplate(field.placeholder, values, localize, { app })
				: localizeFormCopyTemplate(placeholderOverride, values, localize, { app })}
			buttonLabel={localizeFormCopyTemplate(field.buttonLabel, values, localize, { app })}
			noResultsLabel={localizeFormCopyTemplate(field.emptyStateLabel, values, localize, { app })}
			options={localizedOptions}
			criteriaOptions={localizedCriteriaOptions}
			tagOptions={tagOptions}
			valueIcon={resolveFormFieldValueIcon(genericField, value as never, values, { app })}
			ariaLabel={localize(field.label)}
			localize={localize}
		/>
	)
}
