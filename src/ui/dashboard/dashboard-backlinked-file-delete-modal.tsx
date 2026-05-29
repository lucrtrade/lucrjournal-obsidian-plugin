import { t } from '../../lang/helpers'
import { ConfirmDeleteModal } from '../primitives/confirm-delete-modal'

const DELETE_MODAL_WIDTH_CLASS_NAME = 'lj:max-w-lg'

type DashboardBacklinkedFileDeleteModalProps = {
	filePath: string | null
	isDeleting: boolean
	isOpen: boolean
	itemName: string | null
	itemTypeLabel: string
	linkedPositionsCount: number
	linkpath: string | null
	orphanPrivateConfluencesCount?: number
	onClose: () => void
	onConfirm: () => void
}

export function DashboardBacklinkedFileDeleteModal({
	filePath,
	isDeleting,
	isOpen,
	itemName,
	itemTypeLabel,
	linkedPositionsCount,
	linkpath,
	orphanPrivateConfluencesCount,
	onClose,
	onConfirm,
}: DashboardBacklinkedFileDeleteModalProps) {
	const shouldShowPrivateConfluenceCleanup = (orphanPrivateConfluencesCount ?? 0) > 0
	const description = shouldShowPrivateConfluenceCleanup
		? t('DASHBOARD_BACKLINKED_FILE_DELETE_MODAL_DESCRIPTION_WITH_PRIVATE_CONFLUENCES', {
			count: linkedPositionsCount,
			heading: linkpath === null ? '## [[...]]' : `## [[${linkpath}]]`,
			name: itemName ?? '-',
			privateCount: orphanPrivateConfluencesCount ?? 0,
			type: itemTypeLabel,
		})
		: t('DASHBOARD_BACKLINKED_FILE_DELETE_MODAL_DESCRIPTION', {
			count: linkedPositionsCount,
			heading: linkpath === null ? '## [[...]]' : `## [[${linkpath}]]`,
			name: itemName ?? '-',
			type: itemTypeLabel,
		})
	const items = [
		{ label: t('DASHBOARD_BACKLINKED_FILE_DELETE_FILE'), value: filePath ?? '-' },
		{
			label: t('DASHBOARD_BACKLINKED_FILE_DELETE_LINKED_POSITIONS'),
			value: String(linkedPositionsCount),
			mono: false,
		},
	]
	if (shouldShowPrivateConfluenceCleanup) {
		items.push({
			label: t('DASHBOARD_BACKLINKED_FILE_DELETE_PRIVATE_CONFLUENCES'),
			value: String(orphanPrivateConfluencesCount ?? 0),
			mono: false,
		})
	}

	return (
		<ConfirmDeleteModal
			isOpen={isOpen}
			onClose={onClose}
			onConfirm={onConfirm}
			title={t('DASHBOARD_BACKLINKED_FILE_DELETE_MODAL_TITLE', { type: itemTypeLabel })}
			description={description}
			items={items}
			cancelLabel={t('NEW_POSITION_CANCEL')}
			confirmLabel={t('DASHBOARD_BACKLINKED_FILE_DELETE_CONFIRM')}
			isDeleting={isDeleting}
			maxWidthClassName={DELETE_MODAL_WIDTH_CLASS_NAME}
			data-lj-control="dashboard-backlinked-file-delete-confirm"
		/>
	)
}
