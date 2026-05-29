import { useRef, useState, type ChangeEvent, type DragEvent, type RefObject } from 'react'

import { t } from '../../lang/helpers'
import { ChartView } from '../chart/chart-view'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import type { PositionAttachment } from './use-position-details-media'

export type PositionDetailsOverviewDensity = 'wide' | 'compact' | 'narrow'

type PositionDetailsMediaRailProps = {
	attachments: PositionAttachment[]
	chartIframeRef: RefObject<HTMLIFrameElement | null>
	currentImageIndex: number
	density: PositionDetailsOverviewDensity
	isChartReady: boolean
	isDeletingAttachment: boolean
	isSavingAttachment: boolean
	onChooseUploadFiles: (files: FileList | File[] | null) => void
	onDeleteCurrentAttachment: () => void
	onNextImage: () => void
	onOpenAttachment: (index: number) => void
	onPreviousImage: () => void
	section?: 'full' | 'chart' | 'attachments'
}

export function PositionDetailsMediaRail({
	attachments,
	chartIframeRef,
	currentImageIndex,
	density,
	isChartReady,
	isDeletingAttachment,
	isSavingAttachment,
	onChooseUploadFiles,
	onDeleteCurrentAttachment,
	onNextImage,
	onOpenAttachment,
	onPreviousImage,
	section = 'full',
}: PositionDetailsMediaRailProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const dragDepthRef = useRef(0)
	const [isDropTargetActive, setIsDropTargetActive] = useState(false)
	const chartHeightClassName = section === 'chart' && density !== 'narrow'
		? 'lj:min-h-[320px] lj:flex-1'
		: density === 'wide'
			? 'lj:h-[460px]'
			: density === 'compact'
				? 'lj:h-[400px]'
				: 'lj:h-[320px]'
	const currentAttachment = attachments[currentImageIndex] ?? null
	const shouldStretch = shouldStretchAttachmentRail({ density, section })
	const attachmentFrameHeightClassName = shouldStretch
		? 'lj:min-h-0 lj:flex-1'
		: density === 'wide'
			? attachments.length > 0 ? 'lj:h-[260px]' : 'lj:h-[136px]'
			: 'lj:h-[220px]'
	const uploadLabel = t('POSITION_DETAILS_ADD_IMAGE')
	const rootClassName = section === 'attachments'
		? shouldStretch
			? 'lj:relative lj:w-full'
			: 'lj:flex lj:w-full lj:self-start lj:flex-col lj:gap-3'
		: 'lj:flex lj:flex-col lj:gap-3'
	const cardClassName = shouldStretch
		? 'lj:absolute lj:inset-0 lj:flex lj:flex-col lj:overflow-hidden lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:shadow-sm'
		: 'lj:flex lj:flex-col lj:overflow-hidden lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:shadow-sm'

	const handleOpenFileBrowser = () => {
		fileInputRef.current?.click()
	}

	const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
		onChooseUploadFiles(event.currentTarget.files)
		event.currentTarget.value = ''
	}

	const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer)) {
			return
		}

		event.preventDefault()
		dragDepthRef.current += 1
		setIsDropTargetActive(true)
	}

	const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer)) {
			return
		}

		event.preventDefault()
		event.dataTransfer.dropEffect = 'copy'
		if (!isDropTargetActive) {
			setIsDropTargetActive(true)
		}
	}

	const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer)) {
			return
		}

		event.preventDefault()
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
		if (dragDepthRef.current === 0) {
			setIsDropTargetActive(false)
		}
	}

	const handleDrop = (event: DragEvent<HTMLDivElement>) => {
		if (!hasTransferFiles(event.dataTransfer)) {
			return
		}

		event.preventDefault()
		dragDepthRef.current = 0
		setIsDropTargetActive(false)
		onChooseUploadFiles(event.dataTransfer.files)
	}

	return (
		<div data-lj-panel="position-details-media" className={rootClassName}>
			{section !== 'attachments' && (
				<ChartView iframeRef={chartIframeRef} heightClassName={chartHeightClassName} isReady={isChartReady} />
			)}

			{section !== 'chart' && (
				<div className={cardClassName}>
					<div className={`lj:flex lj:items-center lj:justify-between lj:border-b lj:border-lj-alpha-5 lj:shrink-0 ${density === 'narrow' ? 'lj:px-3 lj:py-2.5' : 'lj:px-4 lj:py-3'}`}>
						<div className="lj:flex lj:items-center lj:gap-2 lj:text-xs lj:font-medium lj:text-lj-c-strong">
							<ObsidianIcon name="image" className="lj:size-3.5" />
							{t('POSITION_DETAILS_ATTACHMENTS')}
						</div>
						<div className="lj:flex lj:items-center lj:gap-3">
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								multiple
								tabIndex={-1}
								onChange={handleFileSelection}
								className="lj:hidden"
							/>
							<button
								type="button"
								onClick={handleOpenFileBrowser}
								disabled={isSavingAttachment}
								data-lj-control="attachment-upload-file-picker"
								className="lj:flex lj:items-center lj:gap-1.5 lj:text-[10px] lj:uppercase lj:tracking-[0.16em] lj:text-lj-c-muted lj:hover:text-lj-c-strong lj:transition-colors lj:disabled:opacity-50"
							>
								<ObsidianIcon name="plus" className="lj:size-3.5" />
								{uploadLabel}
							</button>
							{currentAttachment !== null && (
								<>
									<div className="lj:h-4 lj:w-px lj:bg-lj-alpha-10" />
									<button
										type="button"
										onClick={onDeleteCurrentAttachment}
										disabled={isDeletingAttachment}
										title={t('POSITION_DETAILS_ATTACHMENT_DELETE_ACTION')}
										aria-label={t('POSITION_DETAILS_ATTACHMENT_DELETE_ACTION')}
										data-lj-control="attachment-delete"
										className="lj:flex lj:h-7 lj:w-7 lj:items-center lj:justify-center lj:rounded-none lj:text-lj-c-danger lj:transition-[background-color,color,opacity] lj:hover:bg-lj-surf-danger-soft lj:hover:text-lj-c-danger-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-40"
									>
										<ObsidianIcon name="trash-2" className="lj:size-3.5" />
									</button>
								</>
							)}
						</div>
					</div>
					<div
						onDragEnter={handleDragEnter}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						className={`lj:group lj:relative lj:w-full lj:overflow-hidden lj:bg-lj-surf-canvas ${attachmentFrameHeightClassName}`}
					>
						{currentAttachment !== null ? (
							<>
								<button
									type="button"
									onClick={() => onOpenAttachment(currentImageIndex)}
									title={t('POSITION_DETAILS_ATTACHMENT_OPEN_PREVIEW')}
									aria-label={t('POSITION_DETAILS_ATTACHMENT_OPEN_PREVIEW')}
									data-lj-control="open-attachment-preview"
									className={`lj:relative lj:block lj:h-full lj:w-full lj:bg-lj-surf-canvas-alt focus-visible:lj:outline-none ${density === 'narrow' ? 'lj:p-3' : 'lj:p-5'}`}
								>
									<img
										src={currentAttachment.src}
										alt=""
										aria-hidden="true"
										className="lj:absolute lj:inset-0 lj:h-full lj:w-full lj:scale-110 lj:object-cover lj:opacity-20 lj:blur-2xl"
									/>
									<div className="lj-position-details-media-vignette lj:absolute lj:inset-0" />
									<div className="lj:relative lj:flex lj:h-full lj:w-full lj:items-center lj:justify-center">
										<img
											src={currentAttachment.src}
											alt={currentAttachment.label || t('POSITION_DETAILS_ATTACHMENT_ALT', { index: currentImageIndex + 1 })}
											className="lj-position-details-media-image-shadow lj:max-h-full lj:max-w-full lj:object-contain"
										/>
									</div>
								</button>
								{attachments.length > 1 && (
									<div className="lj-position-details-media-carousel lj:pointer-events-none lj:absolute lj:bottom-0 lj:left-0 lj:right-0 lj:flex lj:justify-center lj:px-3 lj:pb-3">
										<div className="lj-position-details-media-carousel-pill lj:pointer-events-auto lj:flex lj:items-center lj:gap-2.5 lj:text-sm">
											<button
												type="button"
												onClick={onPreviousImage}
												title={t('POSITION_DETAILS_ATTACHMENT_PREVIOUS')}
												aria-label={t('POSITION_DETAILS_ATTACHMENT_PREVIOUS')}
												className="lj:flex lj:h-7 lj:w-7 lj:appearance-none lj:items-center lj:justify-center lj:rounded-full lj:border-0 lj:bg-transparent lj:shadow-none lj:transition-[background-color,color] focus-visible:lj:outline-none"
											>
												<ObsidianIcon name="chevron-left" className="lj:size-4" />
											</button>
											<span className="lj-position-details-media-carousel-counter lj:min-w-[2.9rem] lj:text-center lj:text-[11px] lj:font-mono">
												{t('POSITION_DETAILS_ATTACHMENT_COUNTER', {
													current: currentImageIndex + 1,
													total: attachments.length,
												})}
											</span>
											<button
												type="button"
												onClick={onNextImage}
												title={t('POSITION_DETAILS_ATTACHMENT_NEXT')}
												aria-label={t('POSITION_DETAILS_ATTACHMENT_NEXT')}
												className="lj:flex lj:h-7 lj:w-7 lj:appearance-none lj:items-center lj:justify-center lj:rounded-full lj:border-0 lj:bg-transparent lj:shadow-none lj:transition-[background-color,color] focus-visible:lj:outline-none"
											>
												<ObsidianIcon name="chevron-right" className="lj:size-4" />
											</button>
										</div>
									</div>
								)}
							</>
						) : (
							<div className="lj:flex lj:h-full lj:w-full lj:items-center lj:justify-center lj:px-6 lj:py-8 lj:text-lj-c-muted">
								<div className="lj:flex lj:min-w-0 lj:items-center lj:gap-3">
									<div className="lj:flex lj:size-10 lj:shrink-0 lj:items-center lj:justify-center lj:rounded-full lj:bg-lj-alpha-5">
										<ObsidianIcon name="image" className="lj:size-4 lj:opacity-60" />
									</div>
									<div className="lj:min-w-0">
										<div className="lj:text-xs lj:text-lj-c-strong">{t('POSITION_DETAILS_NO_ATTACHMENTS')}</div>
										<div className="lj:text-[11px] lj:text-lj-c-muted">
											{uploadLabel}
										</div>
									</div>
								</div>
							</div>
						)}
						{isDropTargetActive && (
							<div className="lj:pointer-events-none lj:absolute lj:inset-0 lj:z-10 lj:flex lj:items-center lj:justify-center lj:bg-lj-alpha-20 lj:p-4">
								<div className="lj:flex lj:min-w-0 lj:flex-col lj:items-center lj:gap-2 lj:rounded-xl lj:border lj:border-lj-alpha-15 lj:bg-lj-surf-popover lj:px-5 lj:py-4 lj:text-center lj:shadow-xl">
									<ObsidianIcon name="image" className="lj:size-5 lj:text-lj-c-accent" />
									<div className="lj:text-sm lj:font-medium lj:text-lj-c-strong">
										{t('POSITION_DETAILS_ATTACHMENT_DROP_TITLE')}
									</div>
									<div className="lj:text-xs lj:text-lj-c-muted">
										{t('POSITION_DETAILS_ATTACHMENT_DROP_DESCRIPTION')}
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

function shouldStretchAttachmentRail({
	density,
	section,
}: {
	density: PositionDetailsOverviewDensity
	section: PositionDetailsMediaRailProps['section']
}) {
	return section === 'attachments' && density !== 'narrow'
}

function hasTransferFiles(dataTransfer: DataTransfer) {
	return Array.from(dataTransfer.types).includes('Files')
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('shouldStretchAttachmentRail', () => {
		it('stretches the attachment rail on desktop rows so it can align with the sidebar bottom edge', () => {
			expect(shouldStretchAttachmentRail({
				density: 'wide',
				section: 'attachments',
			})).toBe(true)
		})

		it('stretches on compact desktop too', () => {
			expect(shouldStretchAttachmentRail({
				density: 'compact',
				section: 'attachments',
			})).toBe(true)
		})

		it('does not stretch on narrow panes where the rails are stacked', () => {
			expect(shouldStretchAttachmentRail({
				density: 'narrow',
				section: 'attachments',
			})).toBe(false)
		})
	})
}
