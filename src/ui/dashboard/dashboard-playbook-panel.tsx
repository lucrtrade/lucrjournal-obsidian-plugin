import { Notice, type App } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { t } from '../../lang/helpers'
import { getPersistedEntryDisplayName } from '../../utils'
import { DashboardEmptyState, DASHBOARD_EMPTY_STATE_ACTION_CLASS_NAME } from '../primitives/dashboard-empty-state'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import { DashboardBacklinkedFileDeleteModal } from './dashboard-backlinked-file-delete-modal'
import { deleteDashboardBacklinkedFile, listOrphanPrivateConfluenceEntriesForDeletedPlaybook } from './dashboard-entry-actions'
import { clampPercentage, formatCurrency, getPlaybookDisplayName } from './dashboard-playbook-shared'

import type { PlaybookEntryWithStats } from '../../domains'
import type { LinkActivationEvent } from '../../views/link-activation'

const PLAYBOOK_EMPTY_STATE_ICON = 'book-open'

type DashboardPlaybookPanelProps = {
	app: App
	dataRevision: number
	playbooks: PlaybookEntryWithStats[]
	onCreatePlaybook: () => void
	onSelectPlaybook: (filePath: string, event?: LinkActivationEvent) => void
	onSelectPlaybookPositions: (filePath: string, event?: LinkActivationEvent) => void
}

export function DashboardPlaybookPanel({
	app,
	dataRevision,
	playbooks,
	onCreatePlaybook,
	onSelectPlaybook,
	onSelectPlaybookPositions,
}: DashboardPlaybookPanelProps) {
	const orderedPlaybooks = [...playbooks].sort(comparePlaybooks)
	const hasPlaybooks = orderedPlaybooks.length > 0
	const [deletingPlaybook, setDeletingPlaybook] = useState<PlaybookEntryWithStats | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [orphanPrivateConfluencesCount, setOrphanPrivateConfluencesCount] = useState(0)

	useEffect(() => {
		setDeletingPlaybook((current) => {
			if (current === null) {
				return null
			}

			return playbooks.find((playbook) => playbook.entry.file.path === current.entry.file.path) ?? null
		})
	}, [dataRevision, playbooks])

	useEffect(() => {
		if (deletingPlaybook === null) {
			setOrphanPrivateConfluencesCount(0)
			return
		}

		let cancelled = false
		void listOrphanPrivateConfluenceEntriesForDeletedPlaybook(app, deletingPlaybook.entry.file)
			.then((entries) => {
				if (!cancelled) {
					setOrphanPrivateConfluencesCount(entries.length)
				}
			})

		return () => {
			cancelled = true
		}
	}, [app, dataRevision, deletingPlaybook?.entry.file.path])

	const handleDelete = async () => {
		if (deletingPlaybook === null) {
			return
		}

		setIsSaving(true)
		try {
			await deleteDashboardBacklinkedFile({
				app,
				displayName: getPlaybookDisplayName(getPersistedEntryDisplayName(deletingPlaybook.entry)),
				file: deletingPlaybook.entry.file,
				linkpath: deletingPlaybook.entry.file.basename,
			})
			setDeletingPlaybook(null)
		} catch {
			new Notice(t('DASHBOARD_BACKLINKED_FILE_DELETE_FAILED'))
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<>
			<section
				className="lj:flex lj:flex-1 lj:flex-col lj:gap-6 lj:w-full"
				data-lj-panel="playbook"
			>
				{hasPlaybooks ? (
					<div className="lj:flex lj:flex-col lj:gap-4 lj:sm:flex-row lj:sm:items-center lj:sm:justify-between">
						<h2 className="lj:text-2xl lj:font-light lj:tracking-tight lj:text-lj-c-strong">
							{t('DASHBOARD_PLAYBOOK_TITLE')}
						</h2>

						<div className="lj:flex lj:flex-wrap lj:items-center lj:justify-start lj:sm:justify-end lj:gap-3">
							<button
								className={DASHBOARD_EMPTY_STATE_ACTION_CLASS_NAME}
								onClick={onCreatePlaybook}
								data-lj-control="create-playbook"
							>
								<ObsidianIcon className="lj:size-4" name="plus" />
								{t('DASHBOARD_PLAYBOOK_CREATE')}
							</button>
						</div>
					</div>
				) : null}

				{hasPlaybooks ? (
					<div className="lj:grid lj:grid-cols-1 lj:md:grid-cols-2 lj:xl:grid-cols-3 lj:gap-6">
						{orderedPlaybooks.map((playbook) => (
							<article
								key={playbook.entry.file.path}
								role="button"
								tabIndex={0}
								className="lj-dashboard-playbook-card-shadow lj:group lj:flex lj:min-h-[15rem] lj:flex-col lj:justify-between lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:p-6 lj:md:p-8 lj:transition-all lj:duration-300 lj:hover:-translate-y-1 lj:hover:shadow-xl lj:focus-visible:outline-none lj:focus-visible:ring-2 lj:focus-visible:ring-lj-alpha-15"
								onClick={(event) => onSelectPlaybook(playbook.entry.file.path, event)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault()
										onSelectPlaybook(playbook.entry.file.path)
									}
								}}
								data-lj-control="dashboard-playbook-open"
							>
								<div className="lj:flex lj:items-start lj:justify-between lj:gap-4">
									<div className="lj:flex lj:min-w-0 lj:flex-1 lj:flex-col lj:gap-1.5">
										<h3 className="lj:text-xl lj:font-medium lj:tracking-tight lj:text-lj-c-strong lj:transition-colors lj:duration-300 lj:group-hover:text-lj-c-interactive">
											{getPlaybookDisplayName(getPersistedEntryDisplayName(playbook.entry))}
										</h3>
										<div className="lj:flex lj:items-center lj:gap-2">
											<button
												type="button"
												className="lj:inline-flex lj:appearance-none lj:items-center lj:justify-center lj:rounded-md lj:border-0 lj:bg-lj-surf-card-muted lj:px-2.5 lj:py-1 lj:text-xs lj:font-medium lj:text-lj-c-tertiary lj:shadow-none lj:transition-colors lj:hover:bg-lj-alpha-10 lj:hover:text-lj-c-strong"
												onClick={(event) => {
													event.stopPropagation()
													onSelectPlaybookPositions(playbook.entry.file.path, event)
												}}
											>
												{t('DASHBOARD_TRADES_COUNT', { count: playbook.stats.trades })}
											</button>
										</div>
									</div>
									<PlaybookCardMenu onDelete={() => setDeletingPlaybook(playbook)} />
								</div>

								<div className="lj:mt-6 lj:border-t lj:border-lj-alpha-5 lj:pt-5">
									<div className="lj:flex lj:items-center lj:gap-6">
										<PlaybookWinRate winRate={playbook.stats.winRate} />
										<div className="lj:h-20 lj:w-px lj:bg-lj-alpha-10" />
										<div className="lj:flex lj:flex-col lj:justify-center lj:gap-2">
											<span className="lj:text-[11px] lj:font-medium lj:tracking-[0.32em] lj:text-lj-c-muted lj:uppercase">
												{t('POSITION_DETAILS_NET_PNL')}
											</span>
											<PlaybookNetProfit netProfit={playbook.stats.netProfit} />
										</div>
									</div>
								</div>
							</article>
						))}
					</div>
				) : (
					<DashboardEmptyState
						icon={PLAYBOOK_EMPTY_STATE_ICON}
						title={t('DASHBOARD_PLAYBOOK_EMPTY_TITLE')}
						description={t('DASHBOARD_PLAYBOOK_EMPTY_DESCRIPTION')}
						actionLabel={t('DASHBOARD_PLAYBOOK_CREATE')}
						onAction={onCreatePlaybook}
					/>
				)}
			</section>
			<DashboardBacklinkedFileDeleteModal
				filePath={deletingPlaybook?.entry.file.path ?? null}
				isDeleting={isSaving}
				isOpen={deletingPlaybook !== null}
				itemName={deletingPlaybook === null ? null : getPlaybookDisplayName(getPersistedEntryDisplayName(deletingPlaybook.entry))}
				itemTypeLabel={t('DASHBOARD_PLAYBOOK_TYPE_LABEL')}
				linkedPositionsCount={deletingPlaybook?.linkedPositionEntries.length ?? 0}
				linkpath={deletingPlaybook?.entry.file.basename ?? null}
				orphanPrivateConfluencesCount={orphanPrivateConfluencesCount}
				onClose={() => {
					if (!isSaving) {
						setDeletingPlaybook(null)
					}
				}}
				onConfirm={() => {
					void handleDelete()
				}}
			/>
		</>
	)
}

function comparePlaybooks(left: PlaybookEntryWithStats, right: PlaybookEntryWithStats) {
	const tradesDelta = right.stats.trades - left.stats.trades
	if (tradesDelta !== 0) {
		return tradesDelta
	}

	const netProfitDelta = right.stats.netProfit - left.stats.netProfit
	if (netProfitDelta !== 0) {
		return netProfitDelta
	}

	return getPlaybookDisplayName(getPersistedEntryDisplayName(left.entry)).localeCompare(getPlaybookDisplayName(getPersistedEntryDisplayName(right.entry)))
}
function PlaybookWinRate({ winRate }: { winRate: number }) {
	const normalizedWinRate = clampPercentage(winRate)
	const circleRadius = 42
	const circleCircumference = 2 * Math.PI * circleRadius

	return (
		<div className="lj:flex lj:items-center lj:justify-center">
			<div className="lj:relative lj:flex lj:size-24 lj:items-center lj:justify-center">
				<svg className="lj:size-full lj:-rotate-90" viewBox="0 0 100 100">
					<circle
						cx="50"
						cy="50"
						r={circleRadius}
						fill="none"
						strokeWidth="4"
						className="lj:stroke-lj-alpha-5"
					/>
					<circle
						cx="50"
						cy="50"
						r={circleRadius}
						fill="none"
						strokeWidth="4"
						strokeLinecap="round"
						className="lj:stroke-lj-c-strong"
						style={{
							strokeDasharray: circleCircumference,
							strokeDashoffset: circleCircumference * (1 - normalizedWinRate / 100),
						}}
					/>
				</svg>
				<div className="lj:absolute lj:inset-0 lj:flex lj:flex-col lj:items-center lj:justify-center">
					<span className="lj:text-lg lj:font-light lj:tracking-tight lj:text-lj-c-strong">
						{Math.round(normalizedWinRate)}
						<span className="lj:text-xs lj:text-lj-c-muted">%</span>
					</span>
					<span className="lj:text-[9px] lj:font-medium lj:tracking-[0.2em] lj:text-lj-c-muted lj:uppercase">
						{t('DASHBOARD_WIN_RATE')}
					</span>
				</div>
			</div>
		</div>
	)
}

function PlaybookNetProfit({ netProfit }: { netProfit: number }) {
	const isNegative = netProfit < 0
	const amountClassName = isNegative
		? 'lj:text-lj-c-muted'
		: 'lj:text-lj-c-strong'
	const prefix = isNegative ? '-$' : '$'

	return (
		<div className="lj:flex lj:items-baseline lj:gap-1">
			<span className="lj:text-lg lj:font-medium lj:text-lj-c-hint">
				{prefix}
			</span>
			<span className={`lj:text-3xl lj:font-light lj:tracking-tight ${amountClassName}`}>
				{formatCurrency(Math.abs(netProfit))}
			</span>
		</div>
	)
}

function PlaybookCardMenu({ onDelete }: { onDelete: () => void }) {
	const [isOpen, setIsOpen] = useState(false)
	const menuRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isOpen) {
			return 
		}
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setIsOpen(false)
			}
		}
		activeDocument.addEventListener('mousedown', handleClickOutside)
		return () => activeDocument.removeEventListener('mousedown', handleClickOutside)
	}, [isOpen])

	return (
		<div
			ref={menuRef}
			className="lj:relative lj:opacity-0 lj:group-hover:opacity-100 lj:transition-opacity"
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				onClick={() => setIsOpen((v) => !v)}
				data-lj-control="dashboard-playbook-menu"
				className="lj:inline-flex lj:items-center lj:justify-center lj:size-8 lj:rounded-full lj:text-lj-c-muted lj:transition-[background-color,color] lj:hover:bg-lj-surf-card-muted lj:hover:text-lj-c-strong"
			>
				<ObsidianIcon name="ellipsis-vertical" className="lj:size-4" />
			</button>
			{isOpen && (
				<div className="lj:absolute lj:right-0 lj:top-full lj:mt-1 lj:z-10 lj:min-w-[8rem] lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:py-1 lj:shadow-lg">
					<button
						type="button"
						onClick={() => {
							setIsOpen(false)
							onDelete()
						}}
						data-lj-control="dashboard-playbook-delete"
						className="lj:flex lj:w-full lj:items-center lj:gap-2 lj:rounded-none lj:px-3 lj:py-2 lj:text-sm lj:text-lj-c-danger lj:transition-[background-color,color] lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-danger-strong"
					>
						<ObsidianIcon name="trash-2" className="lj:size-3.5" />
						{t('DASHBOARD_MANAGED_ENTRY_DELETE')}
					</button>
				</div>
			)}
		</div>
	)
}
