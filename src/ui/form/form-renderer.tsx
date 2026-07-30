import {
	type AnyFormDefinition,
	type FieldDescriptor,
	type FieldType,
	type FormCopyTemplate,
	isFormFieldVisible,
	localizeFormFieldValidationMessage,
	localizeFormCopyTemplate,
	localizeToggleFieldStateLabel,
	type FormValues,
} from '../../domains/core/form'

import { renderFormField, type FormFieldClassNames } from './types'

import type { TypedFormEntry } from '../../domains'
import type { App } from 'obsidian'

export type FormRendererClassNames = FormFieldClassNames & {
	fieldWrapper?: string
	fieldLabel?: string
	fieldDescription?: string
	fieldError?: string
	toggleRow?: string
	toggleCopyGroup?: string
	toggleTitle?: string
	toggleDescription?: string
}

type FormRendererProps<TDefinition extends AnyFormDefinition> = {
	app?: App
	entries: TypedFormEntry<TDefinition>[]
	values: FormValues<TDefinition>
	onChange: <TKey extends keyof TDefinition>(fieldName: TKey, value: FormValues<TDefinition>[TKey]) => void
	localize: (key: string, params?: Record<string, string | number | boolean>) => string
	classNames?: FormRendererClassNames
	asyncPlaceholders?: Partial<Record<keyof TDefinition, FormCopyTemplate | undefined>>
}

export function FormRenderer<TDefinition extends AnyFormDefinition>({
	app,
	entries,
	values,
	onChange,
	localize,
	classNames,
	asyncPlaceholders,
}: FormRendererProps<TDefinition>) {
	return (
		<>
			{entries
				// @story [[lucrjournal/form#^visible-field-validation]] Renders only fields visible under the submitted synchronized values
				.filter(([, field]) => isFormFieldVisible(field as unknown as FieldDescriptor<FieldType, FormValues<TDefinition>>, values))
				.map(([fieldName, field]) => {
					const typedField = field as unknown as FieldDescriptor<FieldType, FormValues<TDefinition>>
					const description = localizeFormCopyTemplate(
						typedField.description,
						values,
						localize,
						{ app },
					)
					const errorMessage = localizeFormFieldValidationMessage(
						typedField,
						values[fieldName] as never,
						values,
						localize,
						{ app },
					)
					const toggleStateLabel = typedField.type !== 'toggle'
						? undefined
						: localizeToggleFieldStateLabel(typedField, values[fieldName] as boolean, values, localize, { app })

					if (typedField.type === 'toggle' && typedField.layout === 'toggle-row') {
						return (
							<div key={String(fieldName)} className={classNames?.toggleRow}>
								<div className={classNames?.toggleCopyGroup}>
									<span className={classNames?.toggleTitle}>
										{localize(field.label)}
									</span>
									{(description ?? toggleStateLabel) !== undefined && (
										<span className={classNames?.toggleDescription}>
											{description ?? toggleStateLabel}
										</span>
									)}
								</div>
								{renderFormField({
									app,
									field: typedField,
									value: values[fieldName],
									values,
									onChange: (value) => onChange(fieldName, value as FormValues<TDefinition>[typeof fieldName]),
									localize,
									classNames,
									placeholderOverride: asyncPlaceholders?.[fieldName],
								})}
							</div>
						)
					}

					return (
						<div key={String(fieldName)} className={classNames?.fieldWrapper}>
							<label className={classNames?.fieldLabel}>
								{localize(field.label)}
							</label>
							{renderFormField({
								app,
								field: typedField,
								value: values[fieldName],
								values,
								onChange: (value) => onChange(fieldName, value as FormValues<TDefinition>[typeof fieldName]),
								localize,
								classNames,
								placeholderOverride: asyncPlaceholders?.[fieldName],
							})}
							{description !== undefined && (
								<div className={classNames?.fieldDescription}>
									{description}
								</div>
							)}
							{errorMessage !== undefined && (
								<div className={classNames?.fieldError}>
									{errorMessage}
								</div>
							)}
						</div>
					)
				})}
		</>
	)
}
