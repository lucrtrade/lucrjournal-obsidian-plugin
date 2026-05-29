import { t } from '../../lang/helpers'
import { en } from '../../lang/locale/en'
import { FormRenderer, type FormRendererClassNames, useDomainForm } from '../form'
import { Modal } from '../primitives/modal'

import type { AnyFormDefinition, FormValues } from '../../domains/core/form'
import type { App } from 'obsidian'

type NewLinkedEntryModalProps = {
	app: App
	formDefinition: AnyFormDefinition
	buildInitialFormValues: unknown
	synchronizeFormValues: unknown
	createEntry: unknown
	submitLabel: string
	toSubmitErrorMessage?: (error: unknown) => string | null
	isOpen: boolean
	title: string
	onClose: () => void
	onSubmitSuccess?: () => void
	maxWidthClassName?: string
}

type FormRendererLocalizeParams = Record<string, string | number | boolean>

const MODAL_MAX_WIDTH_CLASS_NAME = 'lj:max-w-2xl'
const MODAL_CONTENT_CLASS_NAME = 'lj:px-6 lj:py-6'
const FIELD_LABEL_CLASS_NAME = 'lj:text-[10px] lj:font-semibold lj:uppercase lj:tracking-wider lj:text-lj-c-muted-vivid'
const INPUT_CLASS_NAME = 'lj:h-10 lj:w-full lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:text-lj-c-strong lj:placeholder:text-lj-c-hint-faint lj:focus:border-lj-ring-emphasis lj:focus:outline-none lj:focus:ring-2 lj:focus:ring-lj-ring-faint lj:transition-all'
const COMBOBOX_INPUT_CLASS_NAME = `${INPUT_CLASS_NAME} lj:pr-10`
const SELECT_TRIGGER_CLASS_NAME = 'lj:flex lj:h-10 lj:w-full lj:items-center lj:justify-between lj:gap-2 lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:transition-[border-color,box-shadow,color] lj:hover:border-lj-alpha-20 lj:focus:outline-none'
const SELECT_MENU_CLASS_NAME = 'lj:max-h-64 lj:overflow-y-auto lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:p-1 lj:shadow-xl'
const COMBOBOX_PANEL_CLASS_NAME = 'lj:max-h-64 lj:overflow-y-auto lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:p-1 lj:shadow-xl'
const COMBOBOX_OPTION_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:text-lj-c-secondary lj:transition-colors lj:hover:bg-lj-alpha-5'
const COMBOBOX_ACTIVE_OPTION_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:bg-lj-alpha-5-10 lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:text-lj-c-strong lj:transition-colors'

const FIELD_CLASS_NAMES: FormRendererClassNames = {
	input: INPUT_CLASS_NAME,
	selectTrigger: SELECT_TRIGGER_CLASS_NAME,
	selectMenu: SELECT_MENU_CLASS_NAME,
	selectOption: COMBOBOX_OPTION_CLASS_NAME,
	selectActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS_NAME,
	comboboxInput: COMBOBOX_INPUT_CLASS_NAME,
	comboboxPanel: COMBOBOX_PANEL_CLASS_NAME,
	comboboxOption: COMBOBOX_OPTION_CLASS_NAME,
	comboboxActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS_NAME,
	comboboxEmptyState: 'lj:text-[11px] lj:text-lj-c-hint-vivid',
	fieldWrapper: 'lj:flex lj:flex-col lj:gap-2',
	fieldLabel: FIELD_LABEL_CLASS_NAME,
	fieldDescription: 'lj:text-[12px] lj:text-lj-c-muted',
	fieldError: 'lj:text-[12px] lj:text-lj-c-danger',
}

export function NewLinkedEntryModal({
	app,
	formDefinition,
	buildInitialFormValues,
	synchronizeFormValues,
	createEntry,
	submitLabel,
	toSubmitErrorMessage,
	isOpen,
	title,
	onClose,
	onSubmitSuccess,
	maxWidthClassName,
}: NewLinkedEntryModalProps) {
	const localizeFormCopy = (key: string, params?: FormRendererLocalizeParams) => {
		if (key in en) {
			return t(key as keyof typeof en, params as never)
		}

		return key
	}
	const resolveInitialFormValues = buildInitialFormValues as (
		context?: { app?: App },
	) => FormValues<typeof formDefinition>
	const resolveSynchronizedFormValues = synchronizeFormValues as (
		values: Record<string, unknown>,
		context?: { app?: App; previousValues?: Record<string, unknown> },
	) => FormValues<typeof formDefinition>
	const submitCreateEntry = createEntry as (
		app: App,
		formValue: Record<string, unknown>,
	) => Promise<unknown>
	const resolveSubmitErrorMessage = (error: unknown) => (
		toSubmitErrorMessage?.(error)
		?? t('DASHBOARD_ENTRY_CREATE_FAILED')
	)

	const {
		values,
		entries,
		asyncPlaceholders,
		canSubmit,
		isSubmitting,
		submitErrorKey,
		updateField,
		handleSubmit,
	} = useDomainForm({
		app,
		isOpen,
		formDefinition,
		buildInitialFormValues: resolveInitialFormValues,
		synchronizeFormValues: (nextValues, context) =>
			resolveSynchronizedFormValues(nextValues as Record<string, unknown>, context),
		createEntry: async (runtimeApp, formValue) => {
			await submitCreateEntry(runtimeApp, formValue)
		},
		toSubmitErrorMessage: resolveSubmitErrorMessage,
		onSubmitSuccess: onSubmitSuccess ?? onClose,
	})

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={title}
			maxWidthClassName={maxWidthClassName ?? MODAL_MAX_WIDTH_CLASS_NAME}
			contentClassName={MODAL_CONTENT_CLASS_NAME}
			footer={
				<div className="lj:flex lj:items-center lj:justify-end lj:gap-3">
					<button
						type="button"
						onClick={onClose}
						disabled={isSubmitting}
						className="lj:rounded-lg lj:px-5 lj:py-2.5 lj:text-[13px] lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
					>
						{t('NEW_POSITION_CANCEL')}
					</button>
					<button
						type="button"
						onClick={() => {
							void handleSubmit() 
						}}
						disabled={!canSubmit}
						className="lj:rounded-lg lj:bg-lj-c-strong lj:px-7 lj:py-2.5 lj:text-[13px] lj:font-semibold lj:text-lj-c-inv lj:shadow-lg lj:shadow-lj-shadow-subtle lj:transition-all lj:hover:bg-lj-fill-contrast-soft lj:active:scale-[0.98] lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<span className="lj:inline-flex lj:items-center lj:gap-2">
							{isSubmitting && (
								<span className="lj:inline-block lj:size-3 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
							)}
							{submitLabel}
						</span>
					</button>
				</div>
			}
		>
			<form
				className="lj:flex lj:flex-col lj:gap-5 lj:h-full"
				onSubmit={(event) => {
					event.preventDefault()
					void handleSubmit()
				}}
			>
				<FormRenderer
					app={app}
					entries={entries}
					values={values}
					onChange={updateField}
					localize={localizeFormCopy}
					classNames={FIELD_CLASS_NAMES}
					asyncPlaceholders={asyncPlaceholders}
				/>

				{submitErrorKey !== null && (
					<div className="lj:-mt-2 lj:text-[12px] lj:text-lj-c-danger lj:shrink-0">
						{submitErrorKey}
					</div>
				)}
			</form>
		</Modal>
	)
}
