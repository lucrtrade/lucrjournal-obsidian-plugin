import { PositionDomain, type PositionTemplateSummary } from '../../domains'
import { t } from '../../lang/helpers'
import { FormRenderer, type FormRendererClassNames, useDomainForm } from '../form'
import { Modal } from '../primitives/modal'

import type { FormValues } from '../../domains/core/form'
import type { en } from '../../lang/locale/en'
import type { App } from 'obsidian'

type NewPositionModalProps = {
	app: App
	isOpen: boolean
	preferredAccount?: string
	selectedTemplate: PositionTemplateSummary | null
	onClose: () => void
	onCreated: (entry: Awaited<ReturnType<typeof PositionDomain.createEntry>>) => void
}

type _PositionFormState = FormValues<typeof PositionDomain.formDefinition>
type FormRendererLocalizeParams = Record<string, string | number | boolean>

const MODAL_MAX_WIDTH_CLASS_NAME = 'lj:max-w-md'
const MODAL_CONTENT_CLASS_NAME = 'lj:px-6 lj:py-6'
const FIELD_LABEL_CLASS_NAME = 'lj:text-[10px] lj:font-semibold lj:uppercase lj:tracking-wider lj:text-lj-c-muted-vivid'
const INPUT_CLASS_NAME = 'lj:h-10 lj:w-full lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:text-lj-c-strong lj:placeholder:text-lj-c-hint-faint lj:focus:outline-none lj:focus:ring-2 lj:focus:ring-lj-ring-faint lj:focus:border-lj-ring-emphasis lj:transition-all'
const COMBOBOX_INPUT_CLASS_NAME = `${INPUT_CLASS_NAME} lj:pr-10`
const COMBOBOX_PANEL_CLASS_NAME = 'lj:max-h-64 lj:overflow-y-auto lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:p-1 lj:shadow-xl'
const COMBOBOX_OPTION_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:text-lj-c-secondary lj:transition-colors lj:hover:bg-lj-alpha-5'
const COMBOBOX_ACTIVE_OPTION_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:bg-lj-alpha-5-10 lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:text-lj-c-strong lj:transition-colors'
const NEW_POSITION_MODAL_PANEL_ID = 'new-position-modal'

const FIELD_CLASS_NAMES: FormRendererClassNames = {
	fieldWrapper: 'lj:flex lj:flex-col lj:gap-2',
	fieldLabel: FIELD_LABEL_CLASS_NAME,
	selectTrigger: `${INPUT_CLASS_NAME} lj:flex lj:items-center lj:justify-between lj:gap-2`,
	selectMenu: COMBOBOX_PANEL_CLASS_NAME,
	selectOption: COMBOBOX_OPTION_CLASS_NAME,
	selectActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS_NAME,
	comboboxInput: COMBOBOX_INPUT_CLASS_NAME,
	comboboxPanel: COMBOBOX_PANEL_CLASS_NAME,
	comboboxOption: COMBOBOX_OPTION_CLASS_NAME,
	comboboxActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS_NAME,
	comboboxEmptyState: 'lj:text-[11px] lj:text-lj-c-hint-vivid',
	fieldError: 'lj:-mt-1 lj:text-[12px] lj:text-lj-c-danger',
}

export function NewPositionModal({
	app,
	isOpen,
	preferredAccount,
	selectedTemplate,
	onClose,
	onCreated,
}: NewPositionModalProps) {
	const localizeFormCopy = (key: string, params?: FormRendererLocalizeParams) =>
		t(key as keyof typeof en, params as never)

	const {
		values,
		entries,
		canSubmit,
		isSubmitting,
		submitErrorKey,
		updateField,
		handleSubmit,
	} = useDomainForm({
		app,
		isOpen,
		formDefinition: PositionDomain.formDefinition,
		buildInitialFormValues: () => PositionDomain.buildCreateFormValues(app, preferredAccount),
		synchronizeFormValues: (nextValues, context) =>
			PositionDomain.synchronizeFormValues(nextValues, context),
		createEntry: (runtimeApp, formValue) => PositionDomain.createEntry(
			runtimeApp,
			formValue,
			selectedTemplate === null
				? undefined
				: {
					templateFilePath: selectedTemplate.filePath,
					templateName: selectedTemplate.name ?? undefined,
				},
		),
		canSubmitFormValue: (formValue) => PositionDomain.canSubmitFormValue(formValue),
		toSubmitErrorMessage: (error) => {
			const errorMessageKey = PositionDomain.toCreateEntryErrorMessageKey(error)
			return errorMessageKey === null ? null : t(errorMessageKey)
		},
		onSubmitSuccess: (entry) => {
			onCreated(entry)
			onClose()
		},
	})

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('NEW_POSITION_TITLE')}
			maxWidthClassName={MODAL_MAX_WIDTH_CLASS_NAME}
			contentClassName={MODAL_CONTENT_CLASS_NAME}
			dataLjPanel={NEW_POSITION_MODAL_PANEL_ID}
			footer={
				<div className="lj:flex lj:items-center lj:justify-end lj:gap-3">
					<button
						onClick={onClose}
						disabled={isSubmitting}
						className="lj:rounded-lg lj:px-5 lj:py-2.5 lj:text-[13px] lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
					>
						{t('NEW_POSITION_CANCEL')}
					</button>
					<button
						onClick={() => void handleSubmit()}
						disabled={!canSubmit}
						className="lj:rounded-lg lj:bg-lj-c-strong lj:px-7 lj:py-2.5 lj:text-[13px] lj:font-semibold lj:text-lj-c-inv lj:shadow-lg lj:shadow-lj-shadow-subtle lj:transition-all lj:hover:bg-lj-fill-contrast-soft lj:active:scale-[0.98] lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<span className="lj:inline-flex lj:items-center lj:gap-2">
							{isSubmitting && (
								<span className="lj:inline-block lj:size-3 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
							)}
							{t('NEW_POSITION_SAVE')}
						</span>
					</button>
				</div>
			}
		>
			<form
				className="lj:flex lj:flex-col lj:gap-5"
				onSubmit={(event) => {
					event.preventDefault()
					void handleSubmit()
				}}
			>
				{selectedTemplate !== null && (
					<div className="lj:flex lj:flex-col lj:gap-2">
						<label className={FIELD_LABEL_CLASS_NAME}>
							{t('NEW_POSITION_TEMPLATE_SELECTED_LABEL')}
						</label>
						<div className="lj:inline-flex lj:w-fit lj:max-w-full lj:items-center lj:gap-2 lj:rounded-full lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-raised lj:px-3 lj:py-1.5 lj:text-[12px] lj:text-lj-c-secondary">
							<span className="lj:max-w-[20rem] lj:truncate">
								{selectedTemplate.name ?? t('DASHBOARD_NEW_POSITION_TEMPLATE_UNTITLED')}
							</span>
						</div>
					</div>
				)}
				<FormRenderer
					app={app}
					entries={entries}
					values={values}
					onChange={updateField}
					localize={localizeFormCopy}
					classNames={FIELD_CLASS_NAMES}
				/>

				{submitErrorKey !== null && (
					<div className="lj:-mt-2 lj:text-[12px] lj:text-lj-c-danger">
						{submitErrorKey}
					</div>
				)}
			</form>
		</Modal>
	)
}
