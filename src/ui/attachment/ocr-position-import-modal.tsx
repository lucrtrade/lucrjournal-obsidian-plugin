import { Notice, TFile, normalizePath, type App } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import {
	buildPositionAttachmentOcrDraft,
	buildPositionAttachmentOcrFieldPatch,
	detectPositionAttachmentOcr,
	getPositionAttachmentOcrFields,
} from '../../attachments/ocr'
import {
	buildAttachmentMonthFolder,
	buildAttachmentTimestamp,
	buildPositionAttachmentFileName,
	buildPositionAttachmentPath,
	buildAttachmentToken,
	isSupportedImageMimeType,
	resolveImageExtensionFromMimeType,
} from '../../attachments/position-attachments'
import { LUCR_TRADE_ATTACHMENTS_DIR, LUCR_TRADE_ROOT_DIR } from '../../constant'
import {
	AccountDomain,
	derivePositionAccountWikilink,
	PositionDomain,
	refineSymbolName,
	resolveSymbolName,
	SymbolDomain,
	type Position,
} from '../../domains'
import { getCurrentLocale, t } from '../../lang/helpers'
import { createLogger } from '../../logger'
import { FormRenderer, type FormRendererClassNames, useDomainForm } from '../form'
import { Modal } from '../primitives/modal'

import { AttachmentOcrImportModal } from './attachment-ocr-import-modal'

import type { PositionAttachmentOcrDraft, PositionAttachmentOcrResult } from '../../attachments/ocr'
import type { PositionAttachmentOcrProgress } from '../../attachments/ocr-runtime'
import type { FormValues } from '../../domains/core/form'
import type { en } from '../../lang/locale/en'

export type OcrPositionImportModalProps = {
	accountName?: string | null
	app: App
	existingPosition?: Position
	positionFile?: TFile | null
	onPositionUpdated?: (updated: Position) => void
	hidden?: boolean
	initialPendingManual?: OcrPositionImportPendingManual
	onClose: () => void
	onCreated?: (positionId: string) => Promise<void>
	onFailed?: () => void
	onIncomplete?: (pending: OcrPositionImportPendingManual) => void
	onProgress?: (message: string) => void
	initialImage?: OcrImageFile
}

export type OcrImageFile = {
	buffer: ArrayBuffer
	extension: string
	originalName: string
}

type PendingManualPosition = {
	image: OcrImageFile
	imageDataUrl: string
	result: PositionAttachmentOcrResult
	initialValues: Partial<FormValues<typeof PositionDomain.formDefinition>>
}

export type OcrPositionImportPendingManual = PendingManualPosition

const logger = createLogger('ocr-position-import')

const OCR_REVIEW_FIELDS = getPositionAttachmentOcrFields()

const FIELD_LABEL_CLASS = 'lj:text-[10px] lj:font-semibold lj:uppercase lj:tracking-wider lj:text-lj-c-muted-vivid'
const INPUT_CLASS = 'lj:h-9 lj:w-full lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:text-lj-c-strong lj:placeholder:text-lj-c-hint-faint lj:focus:outline-none lj:focus:ring-2 lj:focus:ring-lj-ring-faint lj:focus:border-lj-ring-emphasis lj:transition-all'
const COMBOBOX_PANEL_CLASS = 'lj:max-h-56 lj:overflow-y-auto lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:p-1 lj:shadow-xl'
const COMBOBOX_OPTION_CLASS = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:px-3 lj:py-2 lj:text-left lj:text-[13px] lj:text-lj-c-secondary lj:transition-colors lj:hover:bg-lj-alpha-5'
const COMBOBOX_ACTIVE_OPTION_CLASS = 'lj:flex lj:w-full lj:items-center lj:gap-2.5 lj:rounded-md lj:bg-lj-alpha-5-10 lj:px-3 lj:py-2 lj:text-left lj:text-[13px] lj:text-lj-c-strong lj:transition-colors'

const POSITION_FIELD_CLASS_NAMES: FormRendererClassNames = {
	fieldWrapper: 'lj:flex lj:flex-col lj:gap-1.5',
	fieldLabel: FIELD_LABEL_CLASS,
	selectTrigger: `${INPUT_CLASS} lj:flex lj:items-center lj:justify-between lj:gap-2`,
	selectMenu: COMBOBOX_PANEL_CLASS,
	selectOption: COMBOBOX_OPTION_CLASS,
	selectActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS,
	comboboxInput: INPUT_CLASS,
	comboboxPanel: COMBOBOX_PANEL_CLASS,
	comboboxOption: COMBOBOX_OPTION_CLASS,
	comboboxActiveOption: COMBOBOX_ACTIVE_OPTION_CLASS,
	comboboxEmptyState: 'lj:text-[11px] lj:text-lj-c-hint-vivid',
	fieldError: 'lj:-mt-0.5 lj:text-[11px] lj:text-lj-c-danger',
}

const OCR_POSITION_CREATE_MODAL_MAX_WIDTH = 'lj:max-w-5xl'
const OCR_POSITION_CREATE_MODAL_CONTENT_CLASS_NAME = 'lj:p-0'
const OCR_POSITION_CREATE_DATA_PANEL = 'ocr-position-create'

// @story [[lucrjournal/ocr#^ocr-position-command]] Creates a position only after the account symbol and side boundaries resolve
export function OcrPositionImportModal({
	accountName = null,
	app,
	existingPosition,
	positionFile,
	onPositionUpdated,
	hidden = false,
	initialImage,
	initialPendingManual,
	onClose,
	onCreated,
	onFailed,
	onIncomplete,
	onProgress,
}: OcrPositionImportModalProps) {
	const [isImporting, setIsImporting] = useState(false)
	const [pendingManualPosition, setPendingManualPosition] = useState<PendingManualPosition | null>(initialPendingManual ?? null)
	const [progress, setProgress] = useState<string | null>(null)
	const didStartInitialImport = useRef(false)

	const importImage = async (image: OcrImageFile | null): Promise<boolean> => {
		if (image === null) {
			new Notice(t('POSITION_DETAILS_ATTACHMENT_PASTE_EMPTY'))
			return false
		}
		const effectiveAccountName = (existingPosition ? resolveExistingPositionAccountName(app, existingPosition) : accountName) ?? null
		if (effectiveAccountName === null || effectiveAccountName === undefined) {
			new Notice(t('OCR_POSITION_ACCOUNT_REQUIRED'))
			return false
		}

		setIsImporting(true)
		const preparing = t('POSITION_DETAILS_ATTACHMENT_OCR_PREPARING')
		setProgress(preparing)
		onProgress?.(preparing)
		try {
			const result = await detectPositionAttachmentOcr(image.buffer, {
				onProgress: (nextProgress) => {
					const message = buildOcrProgressMessage(nextProgress)
					setProgress(message)
					onProgress?.(message)
				},
			})
			const recognizing = t('POSITION_DETAILS_ATTACHMENT_OCR_RECOGNIZING')
			setProgress(recognizing)
			onProgress?.(recognizing)

			// Build data: URL here so preview works regardless of blob: CSP
			const imageDataUrl = await bufferToDataUrl(image.buffer, image.extension)
			result.image_url = imageDataUrl

			const symbol = resolveOcrPositionSymbol(app, effectiveAccountName, result.symbol, result.is_perp === true)

			// Append mode: always open review form modal so user can review/edit and apply
			if (existingPosition !== undefined) {
				const initialValues = buildInitialPositionFormValuesFromOcr(app, effectiveAccountName, result, symbol, existingPosition)
				const pending = { image, imageDataUrl, result, initialValues }
				setPendingManualPosition(pending)
				return false
			}

			// Create mode:
			if (symbol === null || result.side === undefined) {
				const initialValues = buildInitialPositionFormValuesFromOcr(app, effectiveAccountName, result, symbol)
				const pending = { image, imageDataUrl, result, initialValues }
				setPendingManualPosition(pending)
				onIncomplete?.(pending)
				new Notice(t('OCR_POSITION_FIELDS_REQUIRED', { fields: [
					...(symbol === null ? [t('POSITION_SYMBOL')] : []),
					...(result.side === undefined ? [t('POSITION_SIDE')] : []),
				].join(getCurrentLocale() === 'zh' ? '、' : ', ') }))
				return false
			}

			await createAndPersistOcrPosition(app, effectiveAccountName, symbol, result.side, image, result, onCreated)
			return true
		} catch (error: unknown) {
			logger.warn('failed to create position from OCR image', { error })
			onFailed?.()
			new Notice(t('OCR_POSITION_CREATE_FAILED'))
			return false
		} finally {
			setIsImporting(false)
			setProgress(null)
		}
	}

	useEffect(() => {
		if (initialImage === undefined || didStartInitialImport.current) {
			return
		}
		didStartInitialImport.current = true
		void importImage(initialImage).then((didImport) => {
			if (didImport) {
				onClose()
			}
		})
	}, [importImage, initialImage, onClose])

	if (hidden) {
		return null
	}

	if (pendingManualPosition === null) {
		return (
			<AttachmentOcrImportModal
				description={t('OCR_POSITION_IMPORT_DESCRIPTION')}
				isImporting={isImporting}
				isOpen={true}
				onClose={onClose}
				onImportFiles={async (files) => await importImage(await readFirstImageFile(files))}
				onImportPasteEvent={async (event) => {
					event.preventDefault()
					event.stopPropagation()
					return await importImage(await readFirstImageFile(event.clipboardData?.files ?? null))
				}}
				progress={progress}
			/>
		)
	}

	return (
		<OcrPositionCreateModal
			app={app}
			existingPosition={existingPosition}
			positionFile={positionFile}
			pending={pendingManualPosition}
			onClose={onClose}
			onCreated={async (positionId) => {
				await onCreated?.(positionId)
				onClose()
			}}
			onPositionUpdated={onPositionUpdated}
		/>
	)
}

type OcrPositionCreateModalProps = {
	app: App
	existingPosition?: Position
	positionFile?: TFile | null
	pending: PendingManualPosition
	onClose: () => void
	onCreated?: (positionId: string) => Promise<void>
	onPositionUpdated?: (updated: Position) => void
}

function getOcrFieldPlaceholder(fieldKey: string, existingPosition?: Position): string {
	if (!existingPosition) {
		return ''
	}
	switch (fieldKey) {
		case 'notional_value': {
			const val = existingPosition.notional_amount ?? existingPosition.notional_value
			return val != null ? String(val) : ''
		}
		case 'entry_price':
			return existingPosition.entry_price != null ? String(existingPosition.entry_price) : ''
		case 'exit_price':
			return existingPosition.exit_price != null ? String(existingPosition.exit_price) : ''
		case 'stop_loss':
			return existingPosition.stop_loss != null ? String(existingPosition.stop_loss) : ''
		case 'target_price':
			return existingPosition.target_price != null ? String(existingPosition.target_price) : ''
		default:
			return ''
	}
}

async function buildExistingPositionOcrPatch(
	app: App,
	existingPosition: Position,
	values: FormValues<typeof PositionDomain.formDefinition>,
	draft: PositionAttachmentOcrDraft,
): Promise<Record<string, unknown>> {
	const patch: Record<string, unknown> = {}
	const currentSymbolName = resolveSymbolName(app, existingPosition.symbol)
	const accountName = resolveExistingPositionAccountName(app, existingPosition)

	if (values.symbol && values.symbol !== currentSymbolName && accountName) {
		const symbolResult = await SymbolDomain.ensureEntry(app, {
			account: accountName,
			name: values.symbol,
		})
		patch.symbol = symbolResult.wikilink
	}

	if (draft.entry_price.trim() !== '') {
		const parsed = Number.parseFloat(draft.entry_price.trim())
		if (!Number.isNaN(parsed)) {
			patch.entry_price = parsed
		}
	}
	if (draft.exit_price.trim() !== '') {
		const parsed = Number.parseFloat(draft.exit_price.trim())
		if (!Number.isNaN(parsed)) {
			patch.exit_price = parsed
		}
	}
	if (draft.stop_loss.trim() !== '') {
		const parsed = Number.parseFloat(draft.stop_loss.trim())
		if (!Number.isNaN(parsed)) {
			patch.stop_loss = parsed
		}
	}
	if (draft.target_price.trim() !== '') {
		const parsed = Number.parseFloat(draft.target_price.trim())
		if (!Number.isNaN(parsed)) {
			patch.target_price = parsed
		}
	}
	if (draft.notional_value.trim() !== '') {
		const parsed = Number.parseFloat(draft.notional_value.trim())
		if (!Number.isNaN(parsed)) {
			if (existingPosition.notional_asset === 'native') {
				patch.notional_amount = parsed
			} else {
				patch.notional_value = parsed
			}
		}
	}
	return patch
}

async function appendOcrAttachmentToExistingPosition(
	app: App,
	positionFile: TFile,
	image: OcrImageFile,
	patch: Record<string, unknown>,
): Promise<Position> {
	const timestamp = Date.now()
	await ensureAttachmentDirectory(app, timestamp)
	const fileName = buildPositionAttachmentFileName(
		buildAttachmentTimestamp(timestamp),
		image.extension,
		image.originalName,
	)
	const attachmentPath = normalizePath(buildPositionAttachmentPath(fileName, timestamp))
	let attachmentFile: TFile | null = null
	try {
		attachmentFile = await app.vault.createBinary(attachmentPath, image.buffer)
		const token = buildAttachmentToken(attachmentPath, fileName)
		return await PositionDomain.updateFieldsAndAppendAttachments(app, positionFile, patch, [token])
	} catch (error: unknown) {
		if (attachmentFile !== null) {
			await app.fileManager.trashFile(attachmentFile)
		}
		throw error
	}
}

function OcrPositionCreateModal({
	app,
	existingPosition,
	positionFile,
	pending,
	onClose,
	onCreated,
	onPositionUpdated,
}: OcrPositionCreateModalProps) {
	const [draft, setDraft] = useState<PositionAttachmentOcrDraft>(() => buildPositionAttachmentOcrDraft(pending.result))
	const localizeFormCopy = (key: string, params?: Record<string, string | number | boolean>) =>
		t(key as keyof typeof en, params as never)
	const [isAppending, setIsAppending] = useState(false)

	const isAppendMode = existingPosition !== undefined

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
		isOpen: true,
		formDefinition: PositionDomain.formDefinition,
		buildInitialFormValues: () => ({
			...PositionDomain.buildCreateFormValues(app, pending.initialValues.account ?? (existingPosition ? resolveExistingPositionAccountName(app, existingPosition) : undefined)),
			...pending.initialValues,
		}),
		synchronizeFormValues: (nextValues, context) => PositionDomain.synchronizeFormValues(nextValues, context),
		createEntry: async (runtimeApp, formValue) => {
			if (existingPosition) {
				return { isAppend: true as const, formValue }
			}
			return await PositionDomain.createEntry(runtimeApp, formValue)
		},
		canSubmitFormValue: (formValue) => PositionDomain.canSubmitFormValue(formValue),
		toSubmitErrorMessage: (error) => {
			const key = PositionDomain.toCreateEntryErrorMessageKey(error)
			return key === null ? null : t(key)
		},
		onSubmitSuccess: async (entry) => {
			if (existingPosition && positionFile) {
				setIsAppending(true)
				try {
					const patch = await buildExistingPositionOcrPatch(app, existingPosition, values, draft)
					const updated = await appendOcrAttachmentToExistingPosition(
						app,
						positionFile,
						pending.image,
						patch,
					)
					onPositionUpdated?.(updated)
					new Notice(t('POSITION_DETAILS_ATTACHMENT_OCR_APPLY_SUCCESS'))
					onClose()
				} catch (error: unknown) {
					logger.warn('failed to apply OCR to existing position', { error })
					new Notice(t(error instanceof Error && error.message === 'POSITION_RISK_DIRECTION_ERROR'
						? 'POSITION_DETAILS_RISK_DIRECTION_INVALID'
						: 'POSITION_DETAILS_ATTACHMENT_OCR_APPLY_FAILED'))
				} finally {
					setIsAppending(false)
				}
				return
			}

			// Create mode:
			setIsAppending(true)
			try {
				const createdEntry = entry as unknown as { file: TFile; entry: { id: string | number } }
				await appendOcrAttachment(app, createdEntry.file.path, pending.image, pending.result, draft)
				new Notice(t('OCR_POSITION_CREATE_SUCCESS'))
				await onCreated?.(String(createdEntry.entry.id))
			} catch (error: unknown) {
				logger.warn('failed to append OCR attachment after create', { error })
				new Notice(t('OCR_POSITION_CREATE_SUCCESS'))
				const createdEntry = entry as unknown as { entry: { id: string | number } }
				await onCreated?.(String(createdEntry.entry.id))
			} finally {
				setIsAppending(false)
			}
		},
	})

	const riskError = validateOcrRiskPrices(values.side, draft, existingPosition)
	const isBusy = isSubmitting || isAppending

	return (
		<Modal
			isOpen={true}
			onClose={onClose}
			title={t('POSITION_DETAILS_ATTACHMENT_OCR_MODAL_TITLE')}
			maxWidthClassName={OCR_POSITION_CREATE_MODAL_MAX_WIDTH}
			contentClassName={OCR_POSITION_CREATE_MODAL_CONTENT_CLASS_NAME}
			dataLjPanel={OCR_POSITION_CREATE_DATA_PANEL}
			footer={
				<div className="lj:flex lj:items-center lj:justify-end lj:gap-3 lj:px-6 lj:py-4">
					<button
						type="button"
						onClick={onClose}
						disabled={isBusy}
						className="lj:rounded-lg lj:px-5 lj:py-2.5 lj:text-[13px] lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						{t('NEW_POSITION_CANCEL')}
					</button>
					<button
						type="submit"
						form="lj-ocr-position-create-form"
						disabled={!canSubmit || riskError !== null || isBusy}
						className="lj:rounded-lg lj:bg-lj-c-strong lj:px-6 lj:py-2.5 lj:text-[13px] lj:font-semibold lj:text-lj-c-inv lj:shadow-lg lj:shadow-lj-shadow-subtle lj:transition-all lj:hover:bg-lj-fill-contrast-soft lj:active:scale-[0.98] lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<span className="lj:inline-flex lj:items-center lj:gap-2">
							{isBusy && (
								<span className="lj:inline-block lj:size-3 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
							)}
							{isAppendMode
								? t('POSITION_DETAILS_ATTACHMENT_OCR_APPLY')
								: t('OCR_POSITION_CREATE_MANUALLY')}
						</span>
					</button>
				</div>
			}
		>
			<div className="lj:relative lj:flex lj:h-[calc(90vh-180px)] lj:flex-col lj:overflow-hidden sm:lj:flex-row">
				{/* Screenshot preview */}
				<div className="lj:relative lj:flex lj:min-h-0 lj:flex-1 lj:items-center lj:justify-center lj:bg-lj-alpha-2 lj:p-4">
					{pending.imageDataUrl ? (
						<img
							src={pending.imageDataUrl}
							alt={t('POSITION_DETAILS_ATTACHMENT_OCR_IMAGE_ALT')}
							className="lj:max-h-full lj:max-w-full lj:object-contain lj:rounded-md lj:shadow-md"
						/>
					) : (
						<div className="lj:text-[13px] lj:text-lj-c-hint-faint">
							{t('POSITION_DETAILS_ATTACHMENT_OCR_NO_IMAGE')}
						</div>
					)}
				</div>

				{/* Form panel */}
				<form
					id="lj-ocr-position-create-form"
					className="lj:flex lj:w-full lj:flex-col lj:gap-4 lj:overflow-y-auto lj:border-t lj:border-lj-alpha-5 lj:bg-lj-surf-inset lj:p-5 sm:lj:w-[300px] sm:lj:border-l sm:lj:border-t-0"
					onSubmit={(event) => {
						event.preventDefault()
						if (riskError !== null) {
							return
						}
						void handleSubmit()
					}}
				>
					{/* Account & Side fields (read-only in append mode) */}
					{isAppendMode && (
						<>
							<div className="lj:flex lj:flex-col lj:gap-1.5">
								<span className={FIELD_LABEL_CLASS}>{t('POSITION_ACCOUNT')}</span>
								<input
									type="text"
									value={values.account ?? ''}
									disabled
									readOnly
									className={`${INPUT_CLASS} lj:opacity-60 lj:cursor-not-allowed`}
								/>
							</div>
							<div className="lj:flex lj:flex-col lj:gap-1.5">
								<span className={FIELD_LABEL_CLASS}>{t('POSITION_SIDE')}</span>
								<input
									type="text"
									value={values.side ?? ''}
									disabled
									readOnly
									className={`${INPUT_CLASS} lj:opacity-60 lj:cursor-not-allowed`}
								/>
							</div>
						</>
					)}

					{/* Position required fields via FormRenderer */}
					<FormRenderer
						app={app}
						entries={isAppendMode ? entries.filter(([fieldName]) => fieldName === 'symbol') : entries}
						values={values}
						onChange={updateField}
						localize={localizeFormCopy}
						classNames={POSITION_FIELD_CLASS_NAMES}
					/>

					{submitErrorKey !== null && (
						<div className="lj:-mt-1 lj:text-[11px] lj:text-lj-c-danger">{submitErrorKey}</div>
					)}

					{/* OCR extra fields divider */}
					<div className="lj:border-t lj:border-lj-alpha-5" />

					{/* OCR editable fields */}
					{OCR_REVIEW_FIELDS.map((field) => (
						<label key={field.key} className="lj:flex lj:flex-col lj:gap-1.5">
							<span className={FIELD_LABEL_CLASS}>
								{t(field.labelKey)}
							</span>
							<input
								type={field.inputType}
								inputMode={field.inputMode}
								value={draft[field.key]}
								placeholder={getOcrFieldPlaceholder(field.key, existingPosition)}
								onChange={(event) => {
									const nextValue = event.currentTarget.value
									setDraft((prev) => ({ ...prev, [field.key]: nextValue }))
								}}
								className={INPUT_CLASS}
							/>
						</label>
					))}

					{riskError !== null && (
						<div className="lj:text-[12px] lj:font-medium lj:text-lj-c-danger">{riskError}</div>
					)}
				</form>
			</div>
		</Modal>
	)
}

function validateOcrRiskPrices(
	side: string | undefined,
	draft: PositionAttachmentOcrDraft,
	existingPosition?: Position,
): string | null {
	const entryStr = draft.entry_price.trim() || (existingPosition?.entry_price != null ? String(existingPosition.entry_price) : '')
	const stopStr = draft.stop_loss.trim() || (existingPosition?.stop_loss != null ? String(existingPosition.stop_loss) : '')
	const targetStr = draft.target_price.trim() || (existingPosition?.target_price != null ? String(existingPosition.target_price) : '')

	const entry = Number.parseFloat(entryStr)
	const stop = Number.parseFloat(stopStr)
	const target = Number.parseFloat(targetStr)

	const hasEntry = !Number.isNaN(entry)
	const hasStop = !Number.isNaN(stop)
	const hasTarget = !Number.isNaN(target)

	if (side === 'LONG') {
		return validateLongRiskPrices(hasEntry, entry, hasStop, stop, hasTarget, target)
	}
	if (side === 'SHORT') {
		return validateShortRiskPrices(hasEntry, entry, hasStop, stop, hasTarget, target)
	}
	return null
}

function validateLongRiskPrices(
	hasEntry: boolean,
	entry: number,
	hasStop: boolean,
	stop: number,
	hasTarget: boolean,
	target: number,
): string | null {
	if (hasEntry && hasStop && stop >= entry) {
		return t('POSITION_DETAILS_RISK_DIRECTION_INVALID')
	}
	if (hasEntry && hasTarget && target <= entry) {
		return t('POSITION_DETAILS_RISK_DIRECTION_INVALID')
	}
	if (hasStop && hasTarget && target <= stop) {
		return t('POSITION_DETAILS_RISK_DIRECTION_INVALID')
	}
	return null
}

function validateShortRiskPrices(
	hasEntry: boolean,
	entry: number,
	hasStop: boolean,
	stop: number,
	hasTarget: boolean,
	target: number,
): string | null {
	if (hasEntry && hasStop && stop <= entry) {
		return t('POSITION_DETAILS_RISK_DIRECTION_INVALID')
	}
	if (hasEntry && hasTarget && target >= entry) {
		return t('POSITION_DETAILS_RISK_DIRECTION_INVALID')
	}
	if (hasStop && hasTarget && target >= stop) {
		return t('POSITION_DETAILS_RISK_DIRECTION_INVALID')
	}
	return null
}

function buildInitialPositionFormValuesFromOcr(
	app: App,
	accountName: string,
	result: PositionAttachmentOcrResult,
	symbol: string | null,
	existingPosition?: Position,
): Partial<FormValues<typeof PositionDomain.formDefinition>> {
	const resolvedSymbol = symbol ?? (existingPosition ? (resolveSymbolName(app, existingPosition.symbol) ?? undefined) : undefined)
	const resolvedSide = (result.side ?? existingPosition?.side) ?? undefined

	return {
		account: accountName,
		...(resolvedSymbol !== undefined ? { symbol: resolvedSymbol } : {}),
		...(resolvedSide !== undefined ? { side: resolvedSide } : {}),
		...(result.notional_amount !== undefined
			? { notional_asset: 'native', notional_amount: result.notional_amount }
			: (result.notional_value !== undefined ? { notional_value: result.notional_value } : {})),
		...(result.entry_price !== undefined ? { entry_price: result.entry_price } : {}),
		...(result.stop_loss !== undefined ? { stop_loss: result.stop_loss } : {}),
		...(result.target_price !== undefined ? { target_price: result.target_price } : {}),
		...(result.exit_price !== undefined ? { exit_price: result.exit_price } : {}),
	}
}

async function createAndPersistOcrPosition(
	app: App,
	accountName: string,
	symbol: string,
	side: string,
	image: OcrImageFile,
	result: PositionAttachmentOcrResult,
	onCreated?: (positionId: string) => Promise<void>,
): Promise<void> {
	const values = PositionDomain.buildCreateFormValues(app, accountName)
	values.symbol = symbol
	values.side = side
	const created = await PositionDomain.createEntry(app, values)
	try {
		await appendOcrAttachment(app, created.file.path, image, result)
	} catch (error: unknown) {
		const posFile = app.vault.getAbstractFileByPath(created.file.path)
		if (posFile instanceof TFile) {
			await app.fileManager.trashFile(posFile)
		}
		throw error
	}

	await onCreated?.(String(created.entry.id)).catch((error: unknown) => {
		logger.warn('failed to open OCR-created position', { error })
	})
	new Notice(t('OCR_POSITION_CREATE_SUCCESS'))
}

function buildOcrProgressMessage(progress: PositionAttachmentOcrProgress): string {
	if (progress.kind === 'initializing') {
		return t('POSITION_DETAILS_ATTACHMENT_OCR_INITIALIZING')
	}

	const assets = {
		detection_model: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_DETECTION_MODEL',
		dictionary: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_DICTIONARY',
		onnx_runtime_binary: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_ONNX_RUNTIME_BINARY',
		recognition_model: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_RECOGNITION_MODEL',
	} as const
	const messageKey = progress.status === 'downloading'
		? 'POSITION_DETAILS_ATTACHMENT_OCR_PROGRESS_DOWNLOADING'
		: 'POSITION_DETAILS_ATTACHMENT_OCR_PROGRESS_CACHED'

	return t(messageKey, {
		asset: t(assets[progress.asset]),
		current: progress.step,
		total: progress.total,
	})
}

export function resolveOcrPositionSymbol(app: App, accountName: string, ocrSymbol: string | undefined, isPerp: boolean): string | null {
	if (ocrSymbol !== undefined) {
		return refineSymbolName(isPerp && !/\.p$/i.test(ocrSymbol) ? `${ocrSymbol}.P` : ocrSymbol)
	}

	const account = AccountDomain.findByDisplayName(app, accountName)
	if (!(account?.file instanceof TFile)) {
		return null
	}
	const symbols = SymbolDomain.listForAccount(app, `[[${account.file.basename}]]`)
	return symbols.length === 1 ? symbols[0]!.fm.name : null
}

export function resolveExistingPositionAccountName(app: App, position: Position): string | null {
	const wikilink = derivePositionAccountWikilink(app, position)
	if (wikilink === null) {
		return null
	}
	const account = AccountDomain.findByWikilink(app, wikilink)
	return account ? AccountDomain.toDisplayName(account.fm) : wikilink.replace(/^\[\[(ACC-)?|\]\]$/g, '')
}

async function readFirstImageFile(files: FileList | File[] | null): Promise<OcrImageFile | null> {
	const file = Array.from(files ?? []).find((candidate) =>
		isSupportedImageMimeType(candidate.type) || /\.(gif|jpe?g|png|svg|webp)$/i.test(candidate.name),
	)
	if (file === undefined) {
		return null
	}

	return {
		buffer: await file.arrayBuffer(),
		extension: resolveImageExtensionFromMimeType(file.type) ?? file.name.split('.').pop()?.toLowerCase() ?? 'png',
		originalName: file.name.replace(/\.[a-z0-9]+$/i, '') || 'image',
	}
}

async function bufferToDataUrl(buffer: ArrayBuffer, extension: string): Promise<string> {
	return await new Promise<string>((resolve, reject) => {
		const blob = new Blob([buffer], { type: `image/${extension}` })
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

async function ensureAttachmentDirectory(app: App, timestamp: number): Promise<void> {
	for (const path of [LUCR_TRADE_ROOT_DIR, LUCR_TRADE_ATTACHMENTS_DIR, buildAttachmentMonthFolder(timestamp)]) {
		if (app.vault.getAbstractFileByPath(path) === null) {
			await app.vault.createFolder(path)
		}
	}
}

async function appendOcrAttachment(
	app: App,
	positionPath: string,
	image: OcrImageFile,
	result: PositionAttachmentOcrResult,
	draft?: PositionAttachmentOcrDraft,
): Promise<void> {
	const positionFile = app.vault.getAbstractFileByPath(positionPath)
	if (!(positionFile instanceof TFile)) {
		throw new Error('OCR position did not create a file')
	}
	const timestamp = Date.now()
	await ensureAttachmentDirectory(app, timestamp)
	const fileName = buildPositionAttachmentFileName(
		buildAttachmentTimestamp(timestamp),
		image.extension,
		image.originalName,
	)
	const attachmentPath = normalizePath(buildPositionAttachmentPath(fileName, timestamp))
	let attachmentFile: TFile | null = null
	try {
		attachmentFile = await app.vault.createBinary(attachmentPath, image.buffer)
		const effectiveDraft = draft ?? buildPositionAttachmentOcrDraft(result)
		const patch = {
			...buildPositionAttachmentOcrFieldPatch(result, effectiveDraft, { notionalAsset: 'native' }),
			...(result.notional_amount !== undefined || effectiveDraft.notional_value.trim() !== ''
				? { notional_asset: 'native' as const }
				: {}),
		}
		await PositionDomain.updateFieldsAndAppendAttachments(app, positionFile, patch, [buildAttachmentToken(attachmentPath, fileName)])
	} catch (error: unknown) {
		if (attachmentFile !== null) {
			await app.fileManager.trashFile(attachmentFile)
		}
		throw error
	}
}
