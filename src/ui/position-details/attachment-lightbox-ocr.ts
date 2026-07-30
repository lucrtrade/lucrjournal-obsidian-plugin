import type { PositionAttachment } from './use-position-details-media'

type RunAttachmentLightboxOcrParams = {
	attachment: PositionAttachment
	importAttachmentOcrFromAttachment: (attachment: PositionAttachment) => Promise<boolean>
	openReview: () => void
}

type CloseAttachmentLightboxOcrReviewParams = {
	dismissAttachmentOcr: () => void
	restoreLightbox?: () => void
}

// @story [[lucrjournal/ocr#^vault-attachment-ocr]] Opens review only after attachment recognition succeeds
export async function runAttachmentLightboxOcr({
	attachment,
	importAttachmentOcrFromAttachment,
	openReview,
}: RunAttachmentLightboxOcrParams) {
	const didImport = await importAttachmentOcrFromAttachment(attachment)
	if (didImport) {
		openReview()
	}
	return didImport
}

// @story [[lucrjournal/ocr#^vault-attachment-ocr]] Restores the source lightbox after review dismissal
export function closeAttachmentLightboxOcrReview({
	dismissAttachmentOcr,
	restoreLightbox,
}: CloseAttachmentLightboxOcrReviewParams) {
	dismissAttachmentOcr()
	restoreLightbox?.()
}
