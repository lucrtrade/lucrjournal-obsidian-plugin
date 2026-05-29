import { t } from '../../lang/helpers'
import { ConfirmDeleteModal } from '../primitives/confirm-delete-modal'

import type { ConfirmDeleteModalItem } from '../primitives/confirm-delete-modal'
import type { TFile } from 'obsidian'

type SymbolDeleteModalProps = {
	isDeleting: boolean
	isOpen: boolean
	onClose: () => void
	onConfirm: () => void
	positionFiles: TFile[]
	symbolDisplayName: string
	symbolFile: TFile | null
}

export function SymbolDeleteModal({
	isDeleting,
	isOpen,
	onClose,
	onConfirm,
	positionFiles,
	symbolDisplayName,
	symbolFile,
}: SymbolDeleteModalProps) {
	const items: ConfirmDeleteModalItem[] = [
		{
			label: t('DASHBOARD_SETTINGS_SYMBOL_DELETE_MODAL_SYMBOL_FILE'),
			value: symbolFile?.path ?? symbolDisplayName,
		},
		{
			label: t('DASHBOARD_SETTINGS_SYMBOL_DELETE_MODAL_POSITIONS', { count: positionFiles.length }),
			values: positionFiles.map((file) => file.path),
			emptyLabel: t('DASHBOARD_SETTINGS_SYMBOL_DELETE_MODAL_NO_POSITIONS'),
		},
	]

	return (
		<ConfirmDeleteModal
			isOpen={isOpen}
			onClose={onClose}
			onConfirm={onConfirm}
			title={t('DASHBOARD_SETTINGS_SYMBOL_DELETE_MODAL_TITLE')}
			description={t('DASHBOARD_SETTINGS_SYMBOL_DELETE_MODAL_DESCRIPTION')}
			items={items}
			cancelLabel={t('DASHBOARD_SETTINGS_ACCOUNT_NAME_CANCEL')}
			confirmLabel={t('DASHBOARD_SETTINGS_SYMBOL_DELETE_CONFIRM')}
			isDeleting={isDeleting}
			isConfirmDisabled={symbolFile === null}
		/>
	)
}
