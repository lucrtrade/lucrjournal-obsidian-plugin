import { FilePathCard } from './file-path-card'
import { Modal } from './modal'

// ─── Internal footer helper (not exported) ───────────────────────────────────

type ModalDeleteFooterProps = {
	cancelLabel: string
	confirmLabel: string
	isDeleting: boolean
	isConfirmDisabled: boolean
	onCancel: () => void
	onConfirm: () => void
	'data-lj-control'?: string
}

function ModalDeleteFooter({
	cancelLabel,
	confirmLabel,
	isDeleting,
	isConfirmDisabled,
	onCancel,
	onConfirm,
	'data-lj-control': dataLjControl,
}: ModalDeleteFooterProps) {
	return (
		<div className="lj:flex lj:items-center lj:justify-end lj:gap-3">
			<button
				type="button"
				onClick={onCancel}
				disabled={isDeleting}
				className="lj:px-4 lj:py-3 lj:text-sm lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
			>
				{cancelLabel}
			</button>
			<button
				type="button"
				onClick={onConfirm}
				disabled={isDeleting || isConfirmDisabled}
				data-lj-control={dataLjControl}
				className="lj:rounded-lg lj:bg-lj-c-danger lj:px-5 lj:py-3 lj:text-sm lj:font-semibold lj:text-lj-c-inv lj:transition-colors lj:hover:bg-lj-c-danger-strong lj:disabled:cursor-not-allowed lj:disabled:bg-lj-c-disabled lj:disabled:text-lj-c-inv-disabled"
			>
				{confirmLabel}
			</button>
		</div>
	)
}

// ─── Public API ───────────────────────────────────────────────────────────────

const CONFIRM_DELETE_MODAL_MAX_WIDTH = 'lj:max-w-xl'
const CONFIRM_DELETE_MODAL_TITLE_CLASS = 'lj:text-sm lj:font-medium lj:tracking-wide lj:text-lj-c-strong'
const CONFIRM_DELETE_MODAL_HEADER_CLASS = 'lj:px-6 lj:py-4'
const CONFIRM_DELETE_MODAL_CONTENT_CLASS = 'lj:px-6 lj:py-6'
const CONFIRM_DELETE_MODAL_FOOTER_CLASS = 'lj:px-6 lj:py-4'

export type ConfirmDeleteModalItem =
	| { label: string; value: string; mono?: boolean }
	| { label: string; values: string[]; mono?: boolean; emptyLabel?: string }

function isConfirmDeleteModalMultiItem(item: ConfirmDeleteModalItem): item is Extract<ConfirmDeleteModalItem, { values: string[] }> {
	return Array.isArray((item as { values?: unknown }).values)
}

type ConfirmDeleteModalProps = {
	isOpen: boolean
	title: string
	description: string
	items: ConfirmDeleteModalItem[]
	cancelLabel: string
	confirmLabel: string
	onClose: () => void
	onConfirm: () => void
	isDeleting?: boolean
	isConfirmDisabled?: boolean
	zIndexClassName?: string
	maxWidthClassName?: string
	'data-lj-control'?: string
}

export function ConfirmDeleteModal({
	isOpen,
	title,
	description,
	items,
	cancelLabel,
	confirmLabel,
	onClose,
	onConfirm,
	isDeleting = false,
	isConfirmDisabled = false,
	zIndexClassName,
	maxWidthClassName,
	'data-lj-control': dataLjControl,
}: ConfirmDeleteModalProps) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={() => {
				if (!isDeleting) {
					onClose()
				}
			}}
			title={title}
			zIndexClassName={zIndexClassName}
			maxWidthClassName={maxWidthClassName ?? CONFIRM_DELETE_MODAL_MAX_WIDTH}
			titleClassName={CONFIRM_DELETE_MODAL_TITLE_CLASS}
			headerClassName={CONFIRM_DELETE_MODAL_HEADER_CLASS}
			contentClassName={CONFIRM_DELETE_MODAL_CONTENT_CLASS}
			footerClassName={CONFIRM_DELETE_MODAL_FOOTER_CLASS}
			footer={
				<ModalDeleteFooter
					cancelLabel={cancelLabel}
					confirmLabel={confirmLabel}
					isDeleting={isDeleting}
					isConfirmDisabled={isConfirmDisabled}
					onCancel={onClose}
					onConfirm={onConfirm}
					data-lj-control={dataLjControl}
				/>
			}
		>
			<div className="lj:flex lj:flex-col lj:gap-4">
				<p className="lj:text-sm lj:leading-6 lj:text-lj-c-secondary">
					{description}
				</p>
				{items.length > 0 && (
					<div className="lj:flex lj:flex-col lj:gap-3">
						{items.map((item) =>
							isConfirmDeleteModalMultiItem(item) ? (
								<FilePathCard
									key={item.label}
									label={item.label}
									values={item.values}
									mono={item.mono}
									emptyLabel={item.emptyLabel}
								/>
							) : (
								<FilePathCard
									key={item.label}
									label={item.label}
									value={item.value}
									mono={item.mono}
								/>
							),
						)}
					</div>
				)}
			</div>
		</Modal>
	)
}
