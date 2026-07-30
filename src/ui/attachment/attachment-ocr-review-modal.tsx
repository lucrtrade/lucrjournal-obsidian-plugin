import { useEffect, useState } from 'react'

import {
	buildPositionAttachmentOcrDraft,
	getPositionAttachmentOcrFields,
	type PositionAttachmentOcrDraft,
	type PositionAttachmentOcrResult,
} from '../../attachments/ocr'
import { t } from '../../lang/helpers'
import { Modal } from '../primitives/modal'

type AttachmentOcrReviewModalProps = {
	isApplying: boolean
	isOpen: boolean
	result: PositionAttachmentOcrResult | null
	onClose: () => void
	onSubmit: (draft: PositionAttachmentOcrDraft) => void
}

// @story [[lucrjournal/ocr#^manual-ocr-review]] Renders the editable draft from the canonical OCR field list
const OCR_REVIEW_FIELDS = getPositionAttachmentOcrFields()
const MODAL_MAX_WIDTH_CLASS_NAME = 'lj:max-w-6xl'
const MODAL_CONTENT_CLASS_NAME = 'lj:p-0'

export function AttachmentOcrReviewModal({
	isApplying,
	isOpen,
	result,
	onClose,
	onSubmit,
}: AttachmentOcrReviewModalProps) {
	const [draft, setDraft] = useState<PositionAttachmentOcrDraft>(() =>
		buildPositionAttachmentOcrDraft(result ?? {}),
	)
	const [isFullscreenPreview, setIsFullscreenPreview] = useState(false)

	useEffect(() => {
		setDraft(buildPositionAttachmentOcrDraft(result ?? {}))
		setIsFullscreenPreview(false)
	}, [result])

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('POSITION_DETAILS_ATTACHMENT_OCR_MODAL_TITLE')}
			maxWidthClassName={MODAL_MAX_WIDTH_CLASS_NAME}
			contentClassName={MODAL_CONTENT_CLASS_NAME}
			footer={
				<div className="lj:flex lj:items-center lj:justify-end lj:gap-3 lj:px-6 lj:py-4">
					<button
						type="button"
						onClick={onClose}
						disabled={isApplying}
						className="lj:rounded-lg lj:px-5 lj:py-2.5 lj:text-[13px] lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						{t('NEW_POSITION_CANCEL')}
					</button>
					<button
						type="submit"
						form="lj-attachment-ocr-review-form"
						disabled={isApplying}
						className="lj:rounded-lg lj:bg-lj-c-strong lj:px-6 lj:py-2.5 lj:text-[13px] lj:font-semibold lj:text-lj-c-inv lj:shadow-lg lj:shadow-lj-shadow-subtle lj:transition-all lj:hover:bg-lj-fill-contrast-soft lj:active:scale-[0.98] lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<span className="lj:inline-flex lj:items-center lj:gap-2">
							{isApplying && (
								<span className="lj:inline-block lj:size-3 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
							)}
							{t('POSITION_DETAILS_ATTACHMENT_OCR_APPLY')}
						</span>
					</button>
				</div>
			}
		>
			<div className="lj:relative lj:flex lj:h-[calc(90vh-180px)] lj:flex-col lj:overflow-hidden sm:lj:flex-row">
				<div className="lj:group lj:relative lj:flex lj:min-h-0 lj:flex-1 lj:items-center lj:justify-center lj:bg-lj-alpha-2 lj:p-4">
					{result?.image_url ? (
						<>
							<img
								src={result.image_url}
								alt={t('POSITION_DETAILS_ATTACHMENT_OCR_IMAGE_ALT')}
								className="lj:max-h-full lj:max-w-full lj:cursor-zoom-in lj:object-contain lj:rounded-md lj:shadow-md lj:transition-transform lj:active:scale-[0.99]"
								onClick={() => setIsFullscreenPreview(true)}
							/>
							<div className="lj:pointer-events-none lj:absolute lj:bottom-4 lj:right-4 lj:rounded-md lj:bg-lj-overlay-surface lj:px-2 lj:py-1 lj:text-[10px] lj:text-lj-overlay-text-strong lj:opacity-0 lj:backdrop-blur-sm lj:transition-opacity group-hover:lj:opacity-100">
								{t('POSITION_DETAILS_ATTACHMENT_OPEN_PREVIEW')}
							</div>
						</>
					) : (
						<div className="lj:text-[13px] lj:text-lj-c-hint-faint">
							{t('POSITION_DETAILS_ATTACHMENT_OCR_NO_IMAGE')}
						</div>
					)}
				</div>

				<form
					id="lj-attachment-ocr-review-form"
					className="lj:flex lj:w-full lj:flex-col lj:justify-center lj:border-t lj:border-lj-alpha-5 lj:bg-lj-surf-inset lj:p-6 sm:lj:w-[320px] sm:lj:border-l sm:lj:border-t-0"
					onSubmit={(event) => {
						event.preventDefault()
						// @story [[lucrjournal/ocr#^manual-ocr-review]] Requires explicit review submission before applying the draft
						onSubmit(draft)
					}}
				>
					<div className="lj:flex lj:flex-col lj:gap-5">
						{OCR_REVIEW_FIELDS.map((field) => (
							<label key={field.key} className="lj:flex lj:flex-col lj:gap-2">
								<span className="lj:text-[10px] lj:font-semibold lj:uppercase lj:tracking-wider lj:text-lj-c-muted-vivid">
									{t(field.labelKey)}
								</span>
								<input
									type={field.inputType}
									inputMode={field.inputMode}
									value={draft[field.key]}
									onChange={(event) => {
										const nextValue = event.currentTarget.value
										setDraft((previous) => ({
											...previous,
											[field.key]: nextValue,
										}))
									}}
									className="lj:h-10 lj:w-full lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:text-lj-c-strong lj:placeholder:text-lj-c-hint-faint lj:focus:outline-none lj:focus:ring-2 lj:focus:ring-lj-ring-faint lj:focus:border-lj-ring-emphasis lj:transition-all"
								/>
							</label>
						))}
					</div>
				</form>

				{isFullscreenPreview && result?.image_url && (
					<div
						className="lj:absolute lj:inset-0 lj:z-[101] lj:flex lj:cursor-zoom-out lj:items-center lj:justify-center lj:bg-lj-lightbox-backdrop lj:backdrop-blur-xl"
						onClick={() => setIsFullscreenPreview(false)}
					>
						<img
							src={result.image_url}
							alt={t('POSITION_DETAILS_ATTACHMENT_OCR_IMAGE_ALT')}
							className="lj:h-auto lj:max-h-full lj:w-auto lj:max-w-full lj:object-contain"
						/>
					</div>
				)}
			</div>
		</Modal>
	)
}
