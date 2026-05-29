import { AccountDomain } from '../../domains'
import { t } from '../../lang/helpers'
import { FormRenderer, type FormRendererClassNames, useDomainForm } from '../form'
import { Modal } from '../primitives/modal'

import type { FormValues } from '../../domains/core/form'
import type { en } from '../../lang/locale/en'
import type { App } from 'obsidian'

type NewAccountModalProps = {
	app: App
	isOpen: boolean
	onClose: () => void
}

type _AccountFormState = FormValues<typeof AccountDomain.formDefinition>
type FormRendererLocalizeParams = Record<string, string | number | boolean>

const MODAL_MAX_WIDTH_CLASS_NAME = 'lj:max-w-md'
const MODAL_CONTENT_CLASS_NAME = 'lj:px-6 lj:py-6'
const MODAL_ZERO_CONTENT_CLASS_NAME = 'lj:p-0'
const FIELD_LABEL_CLASS_NAME = 'lj:text-[10px] lj:font-semibold lj:uppercase lj:tracking-wider lj:text-lj-c-muted-vivid'
const INPUT_CLASS_NAME = 'lj:h-10 lj:w-full lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:text-lj-c-strong lj:placeholder:text-lj-c-hint-faint lj:focus:outline-none lj:focus:ring-2 lj:focus:ring-lj-ring-faint lj:focus:border-lj-ring-emphasis lj:transition-all'
const SECRET_BUTTON_CLASS_NAME = 'lj:flex lj:h-10 lj:w-full lj:items-center lj:justify-center lj:gap-2 lj:rounded-lg lj:bg-lj-c-strong lj:px-4 lj:text-[13px] lj:font-semibold lj:text-lj-c-inv lj:transition-all lj:hover:bg-lj-fill-contrast-soft'
const COMBOBOX_INPUT_CLASS_NAME = `${INPUT_CLASS_NAME} lj:pr-10`
const SELECT_TRIGGER_CLASS_NAME = 'lj:flex lj:h-10 lj:w-full lj:items-center lj:justify-between lj:gap-2 lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:transition-[border-color,box-shadow,color] lj:hover:border-lj-alpha-20 lj:focus:outline-none'
const SELECT_MENU_CLASS_NAME = 'lj:max-h-64 lj:overflow-y-auto lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:p-1 lj:shadow-xl'
const COMBOBOX_PANEL_CLASS_NAME = 'lj:max-h-64 lj:overflow-y-auto lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:p-1 lj:shadow-xl'
const COMBOBOX_OPTION_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:text-lj-c-secondary lj:transition-colors lj:hover:bg-lj-alpha-5'
const COMBOBOX_ACTIVE_OPTION_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:bg-lj-alpha-5-10 lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:text-lj-c-strong lj:transition-colors'
const TOGGLE_ROW_CLASS_NAME = 'lj:flex lj:items-center lj:justify-between lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:px-4 lj:py-3'

const FIELD_CLASS_NAMES: FormRendererClassNames = {
	input: INPUT_CLASS_NAME,
	selectTrigger: SELECT_TRIGGER_CLASS_NAME,
	selectMenu: SELECT_MENU_CLASS_NAME,
	selectOption: COMBOBOX_OPTION_CLASS_NAME,
	selectActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS_NAME,
	secretButton: SECRET_BUTTON_CLASS_NAME,
	comboboxInput: COMBOBOX_INPUT_CLASS_NAME,
	comboboxPanel: COMBOBOX_PANEL_CLASS_NAME,
	comboboxOption: COMBOBOX_OPTION_CLASS_NAME,
	comboboxActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS_NAME,
	comboboxEmptyState: 'lj:text-[11px] lj:text-lj-c-hint-vivid',
	fieldWrapper: 'lj:flex lj:flex-col lj:gap-2',
	fieldLabel: FIELD_LABEL_CLASS_NAME,
	toggleButton: (value) => `lj:relative lj:inline-flex lj:h-[22px] lj:w-[40px] lj:flex-shrink-0 lj:cursor-pointer lj:rounded-full lj:border-0 lj:p-[2px] lj:shadow-none lj:transition-colors lj:focus:outline-none ${value ? 'lj:bg-lj-c-strong' : 'lj:bg-lj-fill-toggle'}`,
	toggleThumb: (value) => `lj:pointer-events-none lj:absolute lj:top-[2px] lj:block lj:size-[18px] lj:rounded-full lj:bg-lj-surf-elevated lj:shadow-sm lj:ring-0 lj:transition-[left,transform] lj:duration-200 ${value ? 'lj:left-[20px]' : 'lj:left-[2px]'}`,
	toggleRow: TOGGLE_ROW_CLASS_NAME,
	toggleCopyGroup: 'lj:flex lj:flex-col lj:gap-0.5',
	toggleTitle: 'lj:text-[13px] lj:font-semibold lj:text-lj-c-strong',
	toggleDescription: 'lj:text-[12px] lj:text-lj-c-muted',
}

type NewAccountFormProps = {
	app: App
	isOpen: boolean
	onClose: () => void
	onSuccess?: () => void
	showCancel?: boolean
}

export function NewAccountForm({ app, isOpen, onClose, onSuccess, showCancel = true }: NewAccountFormProps) {
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
		formDefinition: AccountDomain.formDefinition,
		buildInitialFormValues: (context) => AccountDomain.buildInitialFormValues(context),
		synchronizeFormValues: (nextValues, context) =>
			AccountDomain.synchronizeFormValues(nextValues, context),
		createEntry: (runtimeApp, formValue) => AccountDomain.createEntry(runtimeApp, formValue),
		canSubmitFormValue: (formValue) => AccountDomain.canSubmitFormValue(formValue),
		toSubmitErrorMessage: (error) => {
			const errorMessageKey = AccountDomain.toCreateEntryErrorMessageKey(error)
			return errorMessageKey === null ? null : t(errorMessageKey)
		},
		onSubmitSuccess: () => {
			onSuccess?.()
			onClose()
		},
	})

	return (
		<div className="lj:flex lj:flex-col lj:h-full">
			<div className={`lj:flex-1 lj:overflow-y-auto ${MODAL_CONTENT_CLASS_NAME}`}>
				<form
					className="lj:flex lj:flex-col lj:gap-5"
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
					/>

					{submitErrorKey !== null && (
						<div className="lj:-mt-2 lj:text-[12px] lj:text-lj-c-danger">
							{submitErrorKey}
						</div>
					)}
				</form>
			</div>

			<div className="lj:shrink-0 lj:border-t lj:border-lj-alpha-5 lj:bg-lj-surf-inset lj:px-8 lj:py-5">
				<div className="lj:flex lj:items-center lj:justify-end lj:gap-3">
					{showCancel && (
						<button
							onClick={onClose}
							disabled={isSubmitting}
							className="lj:rounded-lg lj:px-5 lj:py-2.5 lj:text-[13px] lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
						>
							{t('NEW_POSITION_CANCEL')}
						</button>
					)}
					<button
						onClick={() => void handleSubmit()}
						disabled={!canSubmit}
						className="lj:rounded-lg lj:bg-lj-c-strong lj:px-7 lj:py-2.5 lj:text-[13px] lj:font-semibold lj:text-lj-c-inv lj:shadow-lg lj:shadow-lj-shadow-subtle lj:transition-all lj:hover:bg-lj-fill-contrast-soft lj:active:scale-[0.98] lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<span className="lj:inline-flex lj:items-center lj:gap-2">
							{isSubmitting && (
								<span className="lj:inline-block lj:size-3 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
							)}
							{t('NEW_ACCOUNT_SAVE')}
						</span>
					</button>
				</div>
			</div>
		</div>
	)
}

export function NewAccountModal({ app, isOpen, onClose }: NewAccountModalProps) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('NEW_ACCOUNT_TITLE')}
			maxWidthClassName={MODAL_MAX_WIDTH_CLASS_NAME}
			contentClassName={MODAL_ZERO_CONTENT_CLASS_NAME}
			footer={null}
		>
			<NewAccountForm
				app={app}
				isOpen={isOpen}
				onClose={onClose}
			/>
		</Modal>
	)
}
