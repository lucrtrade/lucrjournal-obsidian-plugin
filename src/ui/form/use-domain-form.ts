import { useEffect, useMemo, useRef, useState } from 'react'

import { typedFormEntries, type TypedFormEntry } from '../../domains'
import {
	type AnyFormDefinition,
	type FormCopyTemplate,
	type FieldDescriptor,
	type FieldType,
	type FormCopyContext,
	type FormValues,
	isFormFieldVisible,
	resolveFormFieldValidationTemplate,
} from '../../domains/core/form'
import { createLogger } from '../../logger'
import { sanitizeObsidianFileName } from '../../utils'

import type { App } from 'obsidian'

const logger = createLogger('domain-form')

type UseDomainFormParams<TDefinition extends AnyFormDefinition, TResult = unknown> = {
	app: App
	isOpen: boolean
	formDefinition: TDefinition
	buildInitialFormValues: (context?: FormCopyContext) => FormValues<TDefinition>
	synchronizeFormValues: (
		values: FormValues<TDefinition>,
		context?: FormCopyContext,
	) => FormValues<TDefinition>
	createEntry: (app: App, formValue: FormValues<TDefinition>) => Promise<TResult>
	canSubmitFormValue?: (formValue: FormValues<TDefinition>) => boolean
	toSubmitErrorMessage?: (error: unknown) => string | null
	onSubmitSuccess?: (result: TResult) => void | Promise<void>
}

type UseDomainFormResult<TDefinition extends AnyFormDefinition> = {
	values: FormValues<TDefinition>
	entries: TypedFormEntry<TDefinition>[]
	asyncPlaceholders: Partial<Record<keyof TDefinition, FormCopyTemplate | undefined>>
	canSubmit: boolean
	isSubmitting: boolean
	submitErrorKey: string | null
	setSubmitErrorKey: (value: string | null) => void
	updateField: <TKey extends keyof TDefinition>(fieldName: TKey, value: FormValues<TDefinition>[TKey]) => void
	handleSubmit: () => Promise<void>
}

export function useDomainForm<TDefinition extends AnyFormDefinition, TResult = unknown>({
	app,
	isOpen,
	formDefinition,
	buildInitialFormValues,
	synchronizeFormValues,
	createEntry,
	canSubmitFormValue,
	toSubmitErrorMessage,
	onSubmitSuccess,
}: UseDomainFormParams<TDefinition, TResult>): UseDomainFormResult<TDefinition> {
	const buildInitialFormValuesRef = useRef(buildInitialFormValues)
	const synchronizeFormValuesRef = useRef(synchronizeFormValues)
	const createEntryRef = useRef(createEntry)
	const canSubmitFormValueRef = useRef(canSubmitFormValue)
	const toSubmitErrorMessageRef = useRef(toSubmitErrorMessage)
	const onSubmitSuccessRef = useRef(onSubmitSuccess)

	buildInitialFormValuesRef.current = buildInitialFormValues
	synchronizeFormValuesRef.current = synchronizeFormValues
	createEntryRef.current = createEntry
	canSubmitFormValueRef.current = canSubmitFormValue
	toSubmitErrorMessageRef.current = toSubmitErrorMessage
	onSubmitSuccessRef.current = onSubmitSuccess

	const buildState = () => buildInitialFormValuesRef.current({ app })
	const synchronizeState = (
		values: FormValues<TDefinition>,
		previousValues?: FormValues<TDefinition>,
	) => synchronizeFormValuesRef.current(values, { app, previousValues })

	const [formState, setFormState] = useState<FormValues<TDefinition>>(buildState)
	const [submitErrorKey, setSubmitErrorKey] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [asyncPlaceholders, setAsyncPlaceholders] = useState<Partial<Record<keyof TDefinition, FormCopyTemplate | undefined>>>({})
	const asyncPlaceholderSeqRef = useRef(0)

	useEffect(() => {
		if (!isOpen) {
			return
		}

		setFormState(buildState())
		setSubmitErrorKey(null)
		setIsSubmitting(false)
		setAsyncPlaceholders({})
	}, [app, isOpen])

	const values = synchronizeState(formState)
	const entries = useMemo(() => typedFormEntries(formDefinition), [formDefinition])
	const hasValidationErrors = entries.some(([fieldName, field]) => {
		const typedField = field as unknown as FieldDescriptor<FieldType, FormValues<TDefinition>>
		if (!isFormFieldVisible(typedField, values)) {
			return false
		}

		return resolveFormFieldValidationTemplate(
			typedField,
			values[fieldName] as never,
			values,
			{ app },
		) !== undefined
	})
	const canSubmit = !isSubmitting && !hasValidationErrors && (canSubmitFormValueRef.current?.(values) ?? true)

	useEffect(() => {
		if (!isOpen) {
			return
		}

		const seq = asyncPlaceholderSeqRef.current + 1
		asyncPlaceholderSeqRef.current = seq

		const run = async () => {
			const nextEntries = await Promise.all(entries.map(async ([fieldName, field]) => {
				const typedField = field as unknown as FieldDescriptor<FieldType, FormValues<TDefinition>>
				if (app === undefined || typedField.asyncPlaceholder === undefined || !isFormFieldVisible(typedField, values)) {
					return [fieldName, undefined] as const
				}

				const resolved = await typedField.asyncPlaceholder(values, { app })
				return [fieldName, resolved] as const
			}))

			if (asyncPlaceholderSeqRef.current !== seq) {
				return
			}

			const nextPlaceholders = Object.fromEntries(nextEntries) as Partial<Record<keyof TDefinition, FormCopyTemplate | undefined>>
			setAsyncPlaceholders((previousPlaceholders) =>
				areAsyncPlaceholdersEqual(previousPlaceholders, nextPlaceholders)
					? previousPlaceholders
					: nextPlaceholders,
			)
		}

		void run()
	}, [app, entries, isOpen, values])

	const updateField = <TKey extends keyof TDefinition>(
		fieldName: TKey,
		value: FormValues<TDefinition>[TKey],
	) => {
		setSubmitErrorKey(null)
		setFormState((prev) => {
			const nextValues = {
				...prev,
				[fieldName]: value,
			} as FormValues<TDefinition>
			return synchronizeState(nextValues, prev)
		})
	}

	const handleSubmit = async () => {
		if (!canSubmit || isSubmitting) {
			return
		}

		const submitValues = applyAsyncPlaceholderDefaults(values, entries, asyncPlaceholders)
		setIsSubmitting(true)

		try {
			const result = await createEntryRef.current(app, submitValues)
			setSubmitErrorKey(null)
			await onSubmitSuccessRef.current?.(result)
		} catch (error) {
			const nextErrorKey = toSubmitErrorMessageRef.current?.(error) ?? null
			if (nextErrorKey !== null) {
				setSubmitErrorKey(nextErrorKey)
				return
			}
			logger.error('unhandled submit error', { error })
			throw error
		} finally {
			setIsSubmitting(false)
		}
	}

	return {
		values,
		entries,
		asyncPlaceholders,
		canSubmit,
		isSubmitting,
		submitErrorKey,
		setSubmitErrorKey,
		updateField,
		handleSubmit,
	}
}

function applyAsyncPlaceholderDefaults<TDefinition extends AnyFormDefinition>(
	values: FormValues<TDefinition>,
	entries: TypedFormEntry<TDefinition>[],
	asyncPlaceholders: Partial<Record<keyof TDefinition, FormCopyTemplate | undefined>>,
): FormValues<TDefinition> {
	let nextValues: FormValues<TDefinition> | null = null

	for (const [fieldName] of entries) {
		const currentValue = values[fieldName]
		const placeholderValue = asyncPlaceholders[fieldName]
		if (typeof currentValue !== 'string' || currentValue.trim() !== '' || typeof placeholderValue !== 'string') {
			continue
		}

		const normalizedPlaceholder = placeholderValue.trim()
		if (normalizedPlaceholder === '') {
			continue
		}
		const fallbackValue = fieldName === 'name'
			? sanitizeObsidianFileName(normalizedPlaceholder).trim()
			: normalizedPlaceholder
		if (fallbackValue === '') {
			continue
		}

		nextValues ??= { ...values }
		nextValues[fieldName] = fallbackValue as FormValues<TDefinition>[typeof fieldName]
	}

	return nextValues ?? values
}

function areAsyncPlaceholdersEqual(
	left: Partial<Record<PropertyKey, FormCopyTemplate | undefined>>,
	right: Partial<Record<PropertyKey, FormCopyTemplate | undefined>>,
): boolean {
	const leftEntries = Object.entries(left)
	const rightEntries = Object.entries(right)
	if (leftEntries.length !== rightEntries.length) {
		return false
	}

	return leftEntries.every(([key, value]) => {
		const nextValue = right[key]
		if (value === nextValue) {
			return true
		}

		if (
			isFormCopyTemplateParams(value)
			&& isFormCopyTemplateParams(nextValue)
		) {
			return value.key === nextValue.key
				&& JSON.stringify(value.values ?? {}) === JSON.stringify(nextValue.values ?? {})
		}

		return false
	})
}

function isFormCopyTemplateParams(value: FormCopyTemplate | undefined): value is Exclude<FormCopyTemplate, string> {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as { key?: unknown }).key === 'string'
}
