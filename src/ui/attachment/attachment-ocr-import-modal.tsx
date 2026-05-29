import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { t } from '../../lang/helpers'
import { ObsidianIcon } from '../primitives/obsidian-icon'

type AttachmentOcrImportModalProps = {
	isImporting: boolean
	isOpen: boolean
	onClose: () => void
	onImportFiles: (files: FileList | File[] | null, source: 'modal-drop' | 'modal-upload') => Promise<boolean>
	onImportPasteEvent: (event: ClipboardEvent) => Promise<boolean>
}

const OCR_IMPORT_BUTTON_ICON = 'upload'
const OCR_IMPORT_DROPZONE_ICON = 'image'

export function AttachmentOcrImportModal({
	isImporting,
	isOpen,
	onClose,
	onImportFiles,
	onImportPasteEvent,
}: AttachmentOcrImportModalProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const dropzoneRef = useRef<HTMLDivElement | null>(null)
	const dragDepthRef = useRef(0)
	const [isDropTargetActive, setIsDropTargetActive] = useState(false)

	const handleImportFiles = useCallback(async (
		files: FileList | File[] | null,
		source: 'modal-drop' | 'modal-upload',
	) => {
		const didImport = await onImportFiles(files, source)
		if (didImport) {
			onClose()
		}
	}, [onClose, onImportFiles])

	const handlePasteEvent = useCallback(async (event: ClipboardEvent) => {
		if (isImporting) {
			return
		}

		const didImport = await onImportPasteEvent(event)
		if (didImport) {
			onClose()
		}
	}, [isImporting, onClose, onImportPasteEvent])

	useEffect(() => {
		if (!isOpen) {
			dragDepthRef.current = 0
			setIsDropTargetActive(false)
			return
		}

		dropzoneRef.current?.focus()

		const handlePaste = (event: ClipboardEvent) => {
			void handlePasteEvent(event)
		}

		activeWindow.addEventListener('paste', handlePaste, true)
		return () => {
			activeWindow.removeEventListener('paste', handlePaste, true)
		}
	}, [handlePasteEvent, isOpen])

	const handleOpenFileBrowser = () => {
		if (isImporting) {
			return
		}
		fileInputRef.current?.click()
	}

	const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
		void handleImportFiles(event.currentTarget.files, 'modal-upload')
		event.currentTarget.value = ''
	}

	const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer) || isImporting) {
			return
		}

		event.preventDefault()
		dragDepthRef.current += 1
		setIsDropTargetActive(true)
	}

	const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer) || isImporting) {
			return
		}

		event.preventDefault()
		event.dataTransfer.dropEffect = 'copy'
		if (!isDropTargetActive) {
			setIsDropTargetActive(true)
		}
	}

	const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer) || isImporting) {
			return
		}

		event.preventDefault()
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
		if (dragDepthRef.current === 0) {
			setIsDropTargetActive(false)
		}
	}

	const handleDrop = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer) || isImporting) {
			return
		}

		event.preventDefault()
		dragDepthRef.current = 0
		setIsDropTargetActive(false)
		void handleImportFiles(event.dataTransfer.files, 'modal-drop')
	}

	if (!isOpen) {
		return null
	}

	return (
		<div className="lj:fixed lj:inset-0 lj:z-[140] lj:flex lj:items-center lj:justify-center lj:p-4 lj:sm:p-6">
			<div
				className="lj:absolute lj:inset-0 lj:bg-lj-overlay-backdrop lj:backdrop-blur-sm"
				onClick={onClose}
			/>
			<div className="lj:relative lj:w-full lj:max-w-md lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:shadow-xl">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					tabIndex={-1}
					onChange={handleFileSelection}
					className="lj:hidden"
				/>
				<div
					ref={dropzoneRef}
					tabIndex={0}
					onClick={handleOpenFileBrowser}
					onDragEnter={handleDragEnter}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					data-lj-panel="attachment-ocr-import"
					data-lj-control="attachment-ocr-import-dropzone"
					className={`lj:relative lj:flex lj:min-h-[220px] lj:flex-col lj:items-center lj:justify-center lj:gap-4 lj:bg-lj-surf lj:px-6 lj:py-8 lj:text-center lj:outline-none lj:transition-colors ${isImporting ? 'lj:cursor-progress' : 'lj:cursor-pointer'} ${isDropTargetActive ? 'lj:bg-lj-alpha-5' : ''}`}
				>
					<div className="lj:flex lj:size-12 lj:items-center lj:justify-center lj:rounded-full lj:bg-lj-alpha-5 lj:text-lj-c-strong">
						{isImporting
							? <span className="lj:inline-block lj:size-5 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
							: <ObsidianIcon name={OCR_IMPORT_DROPZONE_ICON} className="lj:size-5" />}
					</div>
					<div className="lj:max-w-sm lj:text-[14px] lj:leading-6 lj:text-lj-c-strong">
						{t('POSITION_DETAILS_ATTACHMENT_OCR_IMPORT_MODAL_DESCRIPTION')}
					</div>
					<div className="lj:text-[12px] lj:text-lj-c-muted">
						{t('POSITION_DETAILS_ATTACHMENT_OCR_IMPORT_MODAL_METHOD_PASTE')}
						{' / '}
						{t('POSITION_DETAILS_ATTACHMENT_OCR_IMPORT_MODAL_METHOD_UPLOAD')}
						{' / '}
						{t('POSITION_DETAILS_ATTACHMENT_OCR_IMPORT_MODAL_METHOD_DROP')}
					</div>

					{isDropTargetActive && (
						<div className="lj:pointer-events-none lj:absolute lj:inset-0 lj:flex lj:items-center lj:justify-center lj:bg-lj-overlay-backdrop/70 lj:p-6">
							<div className="lj:flex lj:min-w-0 lj:flex-col lj:items-center lj:gap-2 lj:rounded-lg lj:border lj:border-lj-alpha-15 lj:bg-lj-surf-popover lj:px-5 lj:py-4 lj:text-center lj:shadow-xl">
								<ObsidianIcon name={OCR_IMPORT_DROPZONE_ICON} className="lj:size-5 lj:text-lj-c-accent" />
								<div className="lj:text-sm lj:font-medium lj:text-lj-c-strong">
									{t('POSITION_DETAILS_ATTACHMENT_OCR_IMPORT_MODAL_DROP_TITLE')}
								</div>
								<div className="lj:text-xs lj:text-lj-c-muted">
									{t('POSITION_DETAILS_ATTACHMENT_OCR_IMPORT_MODAL_DROP_DESCRIPTION')}
								</div>
							</div>
						</div>
					)}
				</div>
				<div className="lj:flex lj:items-center lj:justify-end lj:gap-3 lj:border-t lj:border-lj-alpha-5 lj:bg-lj-surf-inset lj:px-6 lj:py-4">
					<button
						type="button"
						onClick={onClose}
						disabled={isImporting}
						className="lj:rounded-lg lj:px-4 lj:py-2 lj:text-[13px] lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						{t('NEW_POSITION_CANCEL')}
					</button>
					<button
						type="button"
						onClick={handleOpenFileBrowser}
						disabled={isImporting}
						data-lj-control="attachment-ocr-import-file-picker"
						className="lj:inline-flex lj:items-center lj:gap-2 lj:rounded-lg lj:bg-lj-c-strong lj:px-4 lj:py-2 lj:text-[13px] lj:font-semibold lj:text-lj-c-inv lj:transition-all lj:hover:bg-lj-fill-contrast-soft lj:active:scale-[0.98] lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<ObsidianIcon name={OCR_IMPORT_BUTTON_ICON} className="lj:size-3.5" />
						{t('POSITION_DETAILS_ATTACHMENT_OCR_IMPORT_MODAL_UPLOAD_ACTION')}
					</button>
				</div>
			</div>
		</div>
	)
}

function hasTransferFiles(dataTransfer: DataTransfer | null) {
	if (dataTransfer === null) {
		return false
	}

	return Array.from(dataTransfer.types).includes('Files')
}
