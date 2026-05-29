import { t } from '../../lang/helpers'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import { ImageLightbox } from './image-lightbox'

type AttachmentLightboxProps = {
	attachment: {
		kind: 'external' | 'vault'
		label: string
		src: string
	} | null
	currentIndex: number
	isOpen: boolean
	onClose: () => void
	onNext: () => void
	onPrevious: () => void
	onRunOcr?: () => void
	isRunningOcr?: boolean
	total: number
}

export function AttachmentLightbox({
	attachment,
	currentIndex,
	isOpen,
	onClose,
	onNext,
	onPrevious,
	onRunOcr,
	isRunningOcr = false,
	total,
}: AttachmentLightboxProps) {
	if (!isOpen || attachment === null) {
		return null
	}

	return (
		<ImageLightbox
			alt={attachment.label || t('POSITION_DETAILS_ATTACHMENT_ALT', { index: currentIndex + 1 })}
			isOpen={isOpen}
			onClose={onClose}
			onNext={total > 1 ? onNext : undefined}
			onPrevious={total > 1 ? onPrevious : undefined}
			src={attachment.src}
			topRightAction={attachment.kind === 'vault' && onRunOcr !== undefined ? (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation()
						onRunOcr()
					}}
					disabled={isRunningOcr}
					title={t('POSITION_DETAILS_ATTACHMENT_LIGHTBOX_OCR')}
					aria-label={t('POSITION_DETAILS_ATTACHMENT_LIGHTBOX_OCR')}
					data-lj-control="attachment-lightbox-ocr"
					className="lj:inline-flex lj:h-9 lj:items-center lj:gap-2 lj:bg-lj-surf-elevated lj:px-3 lj:text-[11px] lj:font-medium lj:uppercase lj:tracking-[0.14em] lj:text-lj-c-strong lj:shadow-lg lj:transition-[background-color,color,opacity] lj:hover:bg-lj-surf-hover lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
				>
					<ObsidianIcon name="scan-text" className="lj:size-3.5" />
					{t('POSITION_DETAILS_ATTACHMENT_LIGHTBOX_OCR')}
				</button>
			) : undefined}
		/>
	)
}
