import { t } from '../../lang/helpers'
import { ConfirmDeleteModal } from '../primitives/confirm-delete-modal'

import type { TFile } from 'obsidian'

type PositionDetailsDeleteModalProps = {
	isOpen: boolean
	positionFile: TFile | null
	onClose: () => void
	onConfirm: () => void
}

export function PositionDetailsDeleteModal({
	isOpen,
	positionFile,
	onClose,
	onConfirm,
}: PositionDetailsDeleteModalProps) {
	return (
		<ConfirmDeleteModal
			isOpen={isOpen}
			onClose={onClose}
			onConfirm={onConfirm}
			title={t('POSITION_DETAILS_DELETE_MODAL_TITLE')}
			description={t('POSITION_DETAILS_DELETE_MODAL_DESCRIPTION', {
				name: positionFile?.basename ?? t('POSITION_DETAILS_DELETE_CURRENT_FILE'),
			})}
			items={
				positionFile !== null
					? [{ label: t('POSITION_DETAILS_DELETE_CURRENT_FILE'), value: positionFile.path }]
					: []
			}
			cancelLabel={t('NEW_POSITION_CANCEL')}
			confirmLabel={t('POSITION_DETAILS_DELETE_CONFIRM')}
			isConfirmDisabled={positionFile === null}
		/>
	)
}
