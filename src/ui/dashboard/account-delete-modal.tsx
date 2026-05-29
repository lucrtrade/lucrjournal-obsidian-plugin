import { t } from '../../lang/helpers'
import { ConfirmDeleteModal } from '../primitives/confirm-delete-modal'

import type { ConfirmDeleteModalItem } from '../primitives/confirm-delete-modal'
import type { TFile } from 'obsidian'

type AccountDeleteModalProps = {
	accountDisplayName: string
	accountFile: TFile | null
	isDeleting: boolean
	isOpen: boolean
	platformFile: TFile | null
	symbolFiles: TFile[]
	positionFiles: TFile[]
	onClose: () => void
	onConfirm: () => void
}

export function AccountDeleteModal({
	accountDisplayName,
	accountFile,
	isDeleting,
	isOpen,
	platformFile,
	symbolFiles,
	positionFiles,
	onClose,
	onConfirm,
}: AccountDeleteModalProps) {
	const items: ConfirmDeleteModalItem[] = [
		{
			label: t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_ACCOUNT_FILE'),
			value: accountFile?.path ?? accountDisplayName,
		},
		...(platformFile !== null
			? [{ label: t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_PLATFORM_FILE'), value: platformFile.path }]
			: []),
		{
			label: t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_SYMBOLS', { count: symbolFiles.length }),
			values: symbolFiles.map((f) => f.path),
			emptyLabel: t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_NO_SYMBOLS'),
		},
		{
			label: t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_POSITIONS', { count: positionFiles.length }),
			values: positionFiles.map((f) => f.path),
			emptyLabel: t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_NO_POSITIONS'),
		},
	]

	return (
		<ConfirmDeleteModal
			isOpen={isOpen}
			onClose={onClose}
			onConfirm={onConfirm}
			title={t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_TITLE')}
			description={t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_MODAL_DESCRIPTION')}
			items={items}
			cancelLabel={t('DASHBOARD_SETTINGS_ACCOUNT_NAME_CANCEL')}
			confirmLabel={t('DASHBOARD_SETTINGS_ACCOUNT_DELETE_CONFIRM')}
			isDeleting={isDeleting}
			isConfirmDisabled={accountFile === null}
		/>
	)
}
