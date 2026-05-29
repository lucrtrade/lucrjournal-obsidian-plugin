/// <reference types="vitest/importMeta" />

import { Notice, type App, type TFile } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { PositionDomain, type Position } from '../domains'
import { t } from '../lang/helpers'

import { AttachmentDeleteModal } from './attachment/attachment-delete-modal'
import { AttachmentLightbox } from './attachment/attachment-lightbox'
import { AttachmentOcrImportModal } from './attachment/attachment-ocr-import-modal'
import { AttachmentOcrReviewModal } from './attachment/attachment-ocr-review-modal'
import { closeAttachmentLightboxOcrReview, runAttachmentLightboxOcr } from './position-details/attachment-lightbox-ocr'
import {
	PositionDetailsBottomPanel,
	type PositionDetailsBottomTabId,
	buildBottomTabs,
	resolveVisibleBottomTab,
} from './position-details/position-details-bottom-panel'
import { PositionDetailsDeleteModal } from './position-details/position-details-delete-modal'
import { PositionDetailsHeader } from './position-details/position-details-header'
import { PositionDetailsOverview } from './position-details/position-details-overview'
import { usePositionDetailsContextModel } from './position-details/use-position-details-context-model'
import { usePositionDetailsMedia } from './position-details/use-position-details-media'

type PositionDetailsProps = {
	app: App
	positionFile: TFile | null
	position: Position
	onBack?: () => void
}

export function PositionDetails({
	app,
	positionFile,
	position,
	onBack,
}: PositionDetailsProps) {
	const [livePosition, setLivePosition] = useState(position)
	const [activeBottomTab, setActiveBottomTab] = useState<PositionDetailsBottomTabId>('notes')
	const [pendingBottomTab, setPendingBottomTab] = useState<PositionDetailsBottomTabId | null>(null)
	const [currentImageIndex, setCurrentImageIndex] = useState(0)
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
	const [isAttachmentOcrImportModalOpen, setIsAttachmentOcrImportModalOpen] = useState(false)
	const previousAttachmentCountRef = useRef(0)
	const {
		newsGroup,
		keyLevelGroup,
		confluenceGroup,
		marketAnalysisGroup,
		playbookGroup,
	} = usePositionDetailsContextModel({
		app,
		positionFile,
	})
	const {
		applyPendingAttachmentOcr,
		attachments,
		chartIframeRef,
		deleteAttachment,
		dismissPendingAttachmentOcr,
		isApplyingAttachmentOcr,
		isChartAvailable,
		isChartReady,
		isDeletingAttachment,
		isImportingAttachmentOcr,
		isSavingAttachment,
		importAttachmentOcrFromAttachment,
		importAttachmentOcrFromFiles,
		importAttachmentOcrFromPasteEvent,
		prepareAttachmentOcr,
		pendingAttachmentOcrResult,
		saveSelectedAttachments,
	} = usePositionDetailsMedia({
		app,
		onPositionUpdated: (updated) => setLivePosition((current) => applyLivePositionUpdate(current, updated)),
		position: livePosition,
		positionFile,
	})
	const [isAttachmentLightboxOpen, setIsAttachmentLightboxOpen] = useState(false)
	const [attachmentLightboxOcrReturnIndex, setAttachmentLightboxOcrReturnIndex] = useState<number | null>(null)
	const [attachmentPendingDelete, setAttachmentPendingDelete] = useState<(typeof attachments)[number] | null>(null)

	useEffect(() => {
		setLivePosition(position)
	}, [position])

	useEffect(() => {
		if (attachments.length === 0) {
			setCurrentImageIndex(0)
			previousAttachmentCountRef.current = 0
			return
		}

		if (attachments.length > previousAttachmentCountRef.current) {
			setCurrentImageIndex(attachments.length - 1)
		} else if (currentImageIndex > attachments.length - 1) {
			setCurrentImageIndex(attachments.length - 1)
		}

		previousAttachmentCountRef.current = attachments.length
	}, [attachments.length, currentImageIndex])

	useEffect(() => {
		setActiveBottomTab('notes')
		setPendingBottomTab(null)
		setAttachmentPendingDelete(null)
		setAttachmentLightboxOcrReturnIndex(null)
		setIsAttachmentOcrImportModalOpen(false)
		setIsAttachmentLightboxOpen(false)
	}, [positionFile?.path])

	useEffect(() => {
		const visibleTabs = buildBottomTabs({
			newsGroup,
			keyLevelGroup,
			confluenceGroup,
			marketAnalysisGroup,
		})
		if (pendingBottomTab !== null) {
			const isPendingTabVisible = pendingBottomTab === 'playbook' || visibleTabs.some((tab) => tab.id === pendingBottomTab)
			if (isPendingTabVisible) {
				if (activeBottomTab !== pendingBottomTab) {
					setActiveBottomTab(pendingBottomTab)
				}
				setPendingBottomTab(null)
			}
			return
		}
		const nextTab = resolveVisibleBottomTab(activeBottomTab, visibleTabs)
		if (nextTab !== activeBottomTab) {
			setActiveBottomTab(nextTab)
		}
	}, [
		activeBottomTab,
		pendingBottomTab,
		newsGroup,
		keyLevelGroup,
		confluenceGroup,
		marketAnalysisGroup,
	])

	useEffect(() => {
		if (attachments.length > 0) {
			return
		}

		setAttachmentPendingDelete(null)
		setAttachmentLightboxOcrReturnIndex(null)
		setIsAttachmentLightboxOpen(false)
	}, [attachments.length])

	const handleConfirmDeletePosition = async () => {
		if (positionFile === null) {
			return
		}

		setIsDeleteModalOpen(false)
		await app.fileManager.trashFile(positionFile)
		new Notice(t('POSITION_DETAILS_DELETE_SUCCESS'))
		onBack?.()
	}

	const handleConfirmDeleteAttachment = async () => {
		if (attachmentPendingDelete === null) {
			return
		}

		const didDelete = await deleteAttachment(attachmentPendingDelete)
		if (!didDelete) {
			return
		}

		setAttachmentPendingDelete(null)
	}

	const safeCurrentImageIndex = attachments.length === 0
		? 0
		: Math.min(currentImageIndex, attachments.length - 1)
	const currentAttachment = attachments[safeCurrentImageIndex] ?? null

	function restoreAttachmentLightboxAfterOcrReview() {
		if (attachmentLightboxOcrReturnIndex === null) {
			return
		}

		setAttachmentLightboxOcrReturnIndex(null)
		if (attachments.length === 0) {
			return
		}

		setCurrentImageIndex(Math.min(attachmentLightboxOcrReturnIndex, attachments.length - 1))
		setIsAttachmentLightboxOpen(true)
	}

	function closePendingAttachmentOcrReview() {
		closeAttachmentLightboxOcrReview({
			dismissAttachmentOcr: dismissPendingAttachmentOcr,
			restoreLightbox: attachmentLightboxOcrReturnIndex === null ? undefined : restoreAttachmentLightboxAfterOcrReview,
		})
	}

	return (
		<div data-lj-panel="position-details" className="lj:relative lj:max-w-7xl lj:mx-auto lj:w-full lj:px-4 lj:sm:px-8 lj:pt-8 lj:pb-32">
			<PositionDetailsHeader
				app={app}
				positionFile={positionFile}
				position={livePosition}
				onBack={onBack}
				onDeletePosition={() => setIsDeleteModalOpen(true)}
			/>
			<PositionDetailsOverview
				app={app}
				attachments={attachments}
				chartIframeRef={chartIframeRef}
				currentImageIndex={safeCurrentImageIndex}
				isChartAvailable={isChartAvailable}
				isChartReady={isChartReady}
				isDeletingAttachment={isDeletingAttachment}
				isSavingAttachment={isSavingAttachment}
				onChooseUploadFiles={(files) => {
					void saveSelectedAttachments(files)
				}}
				onDeleteCurrentAttachment={() => {
					if (currentAttachment === null) {
						return
					}

					setAttachmentPendingDelete(currentAttachment)
				}}
				onNextImage={() => setCurrentImageIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : 0))}
				onOpenAttachment={(index) => {
					setCurrentImageIndex(index)
					setIsAttachmentLightboxOpen(true)
				}}
				onOpenAttachmentOcrImport={() => {
					setIsAttachmentOcrImportModalOpen(true)
					void prepareAttachmentOcr()
				}}
				onPositionUpdated={(updated) => setLivePosition((current) => applyLivePositionUpdate(current, updated))}
				onPreviousImage={() => setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : attachments.length - 1))}
				position={livePosition}
				positionFile={positionFile}
			/>
			<PositionDetailsBottomPanel
				app={app}
				positionFile={positionFile}
				activeTab={activeBottomTab}
				newsGroup={newsGroup}
				keyLevelGroup={keyLevelGroup}
				confluenceGroup={confluenceGroup}
				marketAnalysisGroup={marketAnalysisGroup}
				playbookGroup={playbookGroup}
				onSelectTab={(tab) => {
					setPendingBottomTab(null)
					setActiveBottomTab(tab)
				}}
				onRevealTab={(tab) => {
					setPendingBottomTab(tab)
					setActiveBottomTab(tab)
				}}
			/>
			<PositionDetailsDeleteModal
				isOpen={isDeleteModalOpen}
				positionFile={positionFile}
				onClose={() => setIsDeleteModalOpen(false)}
				onConfirm={() => {
					void handleConfirmDeletePosition()
				}}
			/>
			<AttachmentLightbox
				attachment={currentAttachment}
				currentIndex={safeCurrentImageIndex}
				isOpen={isAttachmentLightboxOpen}
				isRunningOcr={isImportingAttachmentOcr}
				onClose={() => {
					setAttachmentPendingDelete(null)
					setIsAttachmentLightboxOpen(false)
				}}
				onNext={() => setCurrentImageIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : 0))}
				onPrevious={() => setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : attachments.length - 1))}
				onRunOcr={currentAttachment?.kind === 'vault' ? () => {
					void runAttachmentLightboxOcr({
						attachment: currentAttachment,
						importAttachmentOcrFromAttachment,
						openReview: () => {
							setAttachmentLightboxOcrReturnIndex(safeCurrentImageIndex)
							setIsAttachmentLightboxOpen(false)
						},
					})
				} : undefined}
				total={attachments.length}
			/>
			<AttachmentDeleteModal
				attachment={attachmentPendingDelete}
				isDeletingAttachment={isDeletingAttachment}
				isOpen={attachmentPendingDelete !== null}
				onClose={() => setAttachmentPendingDelete(null)}
				onConfirm={() => {
					void handleConfirmDeleteAttachment()
				}}
			/>
			<AttachmentOcrImportModal
				isImporting={isImportingAttachmentOcr}
				isOpen={isAttachmentOcrImportModalOpen}
				onClose={() => setIsAttachmentOcrImportModalOpen(false)}
				onImportFiles={async (files, source) => await importAttachmentOcrFromFiles(files, source)}
				onImportPasteEvent={async (event) => await importAttachmentOcrFromPasteEvent(event)}
			/>
			<AttachmentOcrReviewModal
				isApplying={isApplyingAttachmentOcr}
				isOpen={pendingAttachmentOcrResult !== null}
				result={pendingAttachmentOcrResult}
				onClose={closePendingAttachmentOcrReview}
				onSubmit={(draft) => {
					void applyPendingAttachmentOcr(draft).then((didApply) => {
						if (didApply) {
							restoreAttachmentLightboxAfterOcrReview()
						}
					})
				}}
			/>
		</div>
	)
}

function applyLivePositionUpdate(_current: Position, updated: Position): Position {
	return updated
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('applyLivePositionUpdate', () => {
		it('immediately switches derived metrics to the latest updated position', () => {
			const current = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				target_price: 130,
				notional_value: 1,
				risk: 5,
			} as Position
			const updated = {
				...current,
				exit_price: 110,
				stop_loss: 96,
				target_price: 120,
				risk: 4,
			} as Position

			const next = applyLivePositionUpdate(current, updated)

			expect(next.risk).toBe(4)
			expect(next.target_price).toBe(120)
			expect(PositionDomain.calculatePlannedRr(current)).toBe(6)
			expect(PositionDomain.calculatePlannedRr(next)).toBe(5)
			expect(PositionDomain.calculateRealRr(current)).toBe(4)
			expect(PositionDomain.calculateRealRr(next)).toBe(2.5)
		})
	})
}
