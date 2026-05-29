/// <reference types="vitest/importMeta" />

import { useRef, type RefObject } from 'react'

import { useObservedWidth } from '../primitives/use-observed-width'

import { PositionDetailsInfoRail } from './position-details-info-rail'
import {
	PositionDetailsMediaRail,
	type PositionDetailsOverviewDensity,
} from './position-details-media-rail'

import type { PositionAttachment } from './use-position-details-media'
import type { Position } from '../../domains'
import type { App, TFile } from 'obsidian'

const POSITION_DETAILS_WIDE_WIDTH = 1180
const POSITION_DETAILS_COMPACT_WIDTH = 860

type PositionDetailsOverviewProps = {
	app: App
	attachments: PositionAttachment[]
	chartIframeRef: RefObject<HTMLIFrameElement | null>
	currentImageIndex: number
	isChartAvailable: boolean
	isChartReady: boolean
	isDeletingAttachment: boolean
	isSavingAttachment: boolean
	onChooseUploadFiles: (files: FileList | File[] | null) => void
	onDeleteCurrentAttachment: () => void
	onNextImage: () => void
	onOpenAttachment: (index: number) => void
	onOpenAttachmentOcrImport: () => void
	onPositionUpdated: (position: Position) => void
	onPreviousImage: () => void
	position: Position
	positionFile: TFile | null
}

export function PositionDetailsOverview({
	app,
	attachments,
	chartIframeRef,
	currentImageIndex,
	isChartAvailable,
	isChartReady,
	isDeletingAttachment,
	isSavingAttachment,
	onChooseUploadFiles,
	onDeleteCurrentAttachment,
	onNextImage,
	onOpenAttachment,
	onOpenAttachmentOcrImport,
	onPositionUpdated,
	onPreviousImage,
	position,
	positionFile,
}: PositionDetailsOverviewProps) {
	const overviewRef = useRef<HTMLDivElement | null>(null)
	const width = useObservedWidth(overviewRef)
	const density = getPositionDetailsOverviewDensity(width)

	return (
		<div ref={overviewRef} data-lj-panel="position-details-overview" className="lj:flex lj:flex-col lj:gap-3">
			{density === 'narrow' ? (
				<>
					{isChartAvailable && (
						<PositionDetailsMediaRail
							attachments={attachments}
							chartIframeRef={chartIframeRef}
							currentImageIndex={currentImageIndex}
							density={density}
							isChartReady={isChartReady}
							isDeletingAttachment={isDeletingAttachment}
							isSavingAttachment={isSavingAttachment}
							onChooseUploadFiles={onChooseUploadFiles}
							onDeleteCurrentAttachment={onDeleteCurrentAttachment}
							onNextImage={onNextImage}
							onOpenAttachment={onOpenAttachment}
							onPreviousImage={onPreviousImage}
							section="chart"
						/>
					)}
					<PositionDetailsMediaRail
						attachments={attachments}
						chartIframeRef={chartIframeRef}
						currentImageIndex={currentImageIndex}
						density={density}
						isChartReady={isChartReady}
						isDeletingAttachment={isDeletingAttachment}
						isSavingAttachment={isSavingAttachment}
						onChooseUploadFiles={onChooseUploadFiles}
						onDeleteCurrentAttachment={onDeleteCurrentAttachment}
						onNextImage={onNextImage}
						onOpenAttachment={onOpenAttachment}
						onPreviousImage={onPreviousImage}
						section="attachments"
					/>
					<PositionDetailsInfoRail
						app={app}
						density={density}
						onOpenAttachmentOcrImport={onOpenAttachmentOcrImport}
						onPositionUpdated={onPositionUpdated}
						position={position}
						positionFile={positionFile}
						section="summary"
					/>
					<PositionDetailsInfoRail
						app={app}
						density={density}
						onOpenAttachmentOcrImport={onOpenAttachmentOcrImport}
						onPositionUpdated={onPositionUpdated}
						position={position}
						positionFile={positionFile}
						section="details"
					/>
				</>
			) : isChartAvailable ? (
				<div className={getPositionDetailsOverviewGridClassName(density)}>
					<PositionDetailsMediaRail
						attachments={attachments}
						chartIframeRef={chartIframeRef}
						currentImageIndex={currentImageIndex}
						density={density}
						isChartReady={isChartReady}
						isDeletingAttachment={isDeletingAttachment}
						isSavingAttachment={isSavingAttachment}
						onChooseUploadFiles={onChooseUploadFiles}
						onDeleteCurrentAttachment={onDeleteCurrentAttachment}
						onNextImage={onNextImage}
						onOpenAttachment={onOpenAttachment}
						onPreviousImage={onPreviousImage}
						section="chart"
					/>
					<PositionDetailsInfoRail
						app={app}
						density={density}
						onOpenAttachmentOcrImport={onOpenAttachmentOcrImport}
						onPositionUpdated={onPositionUpdated}
						position={position}
						positionFile={positionFile}
						section="summary"
					/>
					<PositionDetailsMediaRail
						attachments={attachments}
						chartIframeRef={chartIframeRef}
						currentImageIndex={currentImageIndex}
						density={density}
						isChartReady={isChartReady}
						isDeletingAttachment={isDeletingAttachment}
						isSavingAttachment={isSavingAttachment}
						onChooseUploadFiles={onChooseUploadFiles}
						onDeleteCurrentAttachment={onDeleteCurrentAttachment}
						onNextImage={onNextImage}
						onOpenAttachment={onOpenAttachment}
						onPreviousImage={onPreviousImage}
						section="attachments"
					/>
					<PositionDetailsInfoRail
						app={app}
						density={density}
						onOpenAttachmentOcrImport={onOpenAttachmentOcrImport}
						onPositionUpdated={onPositionUpdated}
						position={position}
						positionFile={positionFile}
						section="details"
					/>
				</div>
			) : (
				<div className={getPositionDetailsOverviewGridClassName(density)}>
					<PositionDetailsMediaRail
						attachments={attachments}
						chartIframeRef={chartIframeRef}
						currentImageIndex={currentImageIndex}
						density={density}
						isChartReady={isChartReady}
						isDeletingAttachment={isDeletingAttachment}
						isSavingAttachment={isSavingAttachment}
						onChooseUploadFiles={onChooseUploadFiles}
						onDeleteCurrentAttachment={onDeleteCurrentAttachment}
						onNextImage={onNextImage}
						onOpenAttachment={onOpenAttachment}
						onPreviousImage={onPreviousImage}
						section="attachments"
					/>
					<div className="lj:flex lj:flex-col lj:gap-3">
						<PositionDetailsInfoRail
							app={app}
							density={density}
							onOpenAttachmentOcrImport={onOpenAttachmentOcrImport}
							onPositionUpdated={onPositionUpdated}
							position={position}
							positionFile={positionFile}
							section="summary"
						/>
						<PositionDetailsInfoRail
							app={app}
							density={density}
							onOpenAttachmentOcrImport={onOpenAttachmentOcrImport}
							onPositionUpdated={onPositionUpdated}
							position={position}
							positionFile={positionFile}
							section="details"
						/>
					</div>
				</div>
			)}
		</div>
	)
}

function getPositionDetailsOverviewDensity(width: number): PositionDetailsOverviewDensity {
	if (width > 0 && width < POSITION_DETAILS_COMPACT_WIDTH) {
		return 'narrow'
	}

	if (width > 0 && width < POSITION_DETAILS_WIDE_WIDTH) {
		return 'compact'
	}

	return 'wide'
}

function getPositionDetailsOverviewGridClassName(density: Exclude<PositionDetailsOverviewDensity, 'narrow'>) {
	return density === 'compact'
		? 'lj:grid lj:items-stretch lj:gap-3 lj:grid-cols-[minmax(0,1.45fr)_minmax(15.5rem,0.78fr)]'
		: 'lj:grid lj:items-stretch lj:gap-4 lj:grid-cols-[minmax(0,1.7fr)_minmax(16.5rem,0.8fr)]'
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('getPositionDetailsOverviewDensity', () => {
		it('uses wide on roomy panes', () => {
			expect(getPositionDetailsOverviewDensity(1280)).toBe('wide')
		})

		it('downgrades to compact before the rails become cramped', () => {
			expect(getPositionDetailsOverviewDensity(980)).toBe('compact')
		})

		it('stacks into a single column on narrow panes', () => {
			expect(getPositionDetailsOverviewDensity(720)).toBe('narrow')
		})
	})

	describe('getPositionDetailsOverviewGridClassName', () => {
		it('narrows the compact info rail to free more width for media', () => {
			expect(getPositionDetailsOverviewGridClassName('compact')).toBe(
				'lj:grid lj:items-stretch lj:gap-3 lj:grid-cols-[minmax(0,1.45fr)_minmax(15.5rem,0.78fr)]',
			)
		})

		it('narrows the wide info rail to keep the sidebar visually lighter', () => {
			expect(getPositionDetailsOverviewGridClassName('wide')).toBe(
				'lj:grid lj:items-stretch lj:gap-4 lj:grid-cols-[minmax(0,1.7fr)_minmax(16.5rem,0.8fr)]',
			)
		})
	})
}
