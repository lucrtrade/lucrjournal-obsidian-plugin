import { t } from '../../lang/helpers'
import { ConfirmDeleteModal } from '../primitives/confirm-delete-modal'

import type { PositionAttachment } from '../position-details/use-position-details-media'

const ATTACHMENT_DELETE_MODAL_Z_INDEX_CLASS_NAME = 'lj:z-[150]'

type AttachmentDeleteModalProps = {
	attachment: PositionAttachment | null
	isDeletingAttachment: boolean
	isOpen: boolean
	onClose: () => void
	onConfirm: () => void
}

export function AttachmentDeleteModal({
	attachment,
	isDeletingAttachment,
	isOpen,
	onClose,
	onConfirm,
}: AttachmentDeleteModalProps) {
	return (
		<ConfirmDeleteModal
			isOpen={isOpen}
			onClose={onClose}
			onConfirm={onConfirm}
			title={t('POSITION_DETAILS_ATTACHMENT_DELETE_MODAL_TITLE')}
			description={t('POSITION_DETAILS_ATTACHMENT_DELETE_MODAL_DESCRIPTION', {
				name: attachment?.label ?? t('POSITION_DETAILS_ATTACHMENTS'),
			})}
			items={
				attachment !== null
					? [{ label: t('POSITION_DETAILS_ATTACHMENT_DELETE_FILE'), value: attachment.path }]
					: []
			}
			cancelLabel={t('NEW_POSITION_CANCEL')}
			confirmLabel={t('POSITION_DETAILS_ATTACHMENT_DELETE_CONFIRM')}
			isConfirmDisabled={attachment === null || isDeletingAttachment}
			zIndexClassName={ATTACHMENT_DELETE_MODAL_Z_INDEX_CLASS_NAME}
		/>
	)
}
