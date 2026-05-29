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

export function closeAttachmentLightboxOcrReview({
	dismissAttachmentOcr,
	restoreLightbox,
}: CloseAttachmentLightboxOcrReviewParams) {
	dismissAttachmentOcr()
	restoreLightbox?.()
}
