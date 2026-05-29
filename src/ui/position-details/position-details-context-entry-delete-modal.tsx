import { t } from '../../lang/helpers'
import { ConfirmDeleteModal } from '../primitives/confirm-delete-modal'

import type { ConfirmDeleteModalItem } from '../primitives/confirm-delete-modal'

const CONTEXT_ENTRY_DELETE_MODAL_MAX_WIDTH_CLASS_NAME = 'lj:max-w-[720px]'

type PositionDetailsContextEntryDeleteModalProps = {
	contextHeading: string | null
	isDeleting: boolean
	isOpen: boolean
	linkedFilePath: string | null
	onClose: () => void
	onConfirm: () => void
}

export function PositionDetailsContextEntryDeleteModal({
	contextHeading,
	isDeleting,
	isOpen,
	linkedFilePath,
	onClose,
	onConfirm,
}: PositionDetailsContextEntryDeleteModalProps) {
	const items: ConfirmDeleteModalItem[] = [
		...(contextHeading !== null
			? [{ label: t('POSITION_DETAILS_CONTEXT_DELETE_BLOCK'), value: contextHeading }]
			: []),
		...(linkedFilePath !== null
			? [{ label: t('POSITION_DETAILS_CONTEXT_DELETE_LINKED_FILE'), value: linkedFilePath }]
			: []),
	]

	return (
		<ConfirmDeleteModal
			isOpen={isOpen}
			onClose={onClose}
			onConfirm={onConfirm}
			title={t('POSITION_DETAILS_CONTEXT_DELETE_MODAL_TITLE')}
			description={t('POSITION_DETAILS_CONTEXT_DELETE_MODAL_DESCRIPTION', {
				heading: contextHeading ?? '## [[...]]',
			})}
			items={items}
			cancelLabel={t('NEW_POSITION_CANCEL')}
			confirmLabel={t('POSITION_DETAILS_CONTEXT_DELETE_CONFIRM')}
			isDeleting={isDeleting}
			isConfirmDisabled={contextHeading === null}
			maxWidthClassName={CONTEXT_ENTRY_DELETE_MODAL_MAX_WIDTH_CLASS_NAME}
		/>
	)
}
