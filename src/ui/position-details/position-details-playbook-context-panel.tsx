import { Notice, TFile, type App } from 'obsidian'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
	addPositionSectionEntry,
	addPlaybookContextEntry,
	ConfluenceDomain,
	listPlaybookEntriesWithStats,
	loadPlaybookCriteriaSections,
	POSITION_CONFLUENCE_SECTION,
	removePositionPlaybookFrontmatter,
	removeSectionEntryFromPosition,
	type CriteriaFormValue,
	type Playbook,
	type PositionContextLinkedEntry,
} from '../../domains'
import { t } from '../../lang/helpers'
import { formatSignedAmount, getPersistedEntryDisplayName, parseWikilinkHeading } from '../../utils'
import { clampPercentage, getPlaybookDisplayName } from '../dashboard/dashboard-playbook-shared'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import { PositionDetailsContextEntryDeleteModal } from './position-details-context-entry-delete-modal'
import { PositionDetailsContextEntryPickerModal } from './position-details-context-entry-picker-modal'

import type { DomainPersistedEntry } from '../../domains/core/type'

type PositionDetailsPlaybookContextPanelProps = {
	app: App
	positionFile: TFile | null
	items: PositionContextLinkedEntry<Playbook>[]
	availablePlaybookEntries: DomainPersistedEntry<Playbook>[]
}

const PLAYBOOK_SAVE_FAILED_KEY = 'POSITION_DETAILS_PLAYBOOK_CHECKLIST_SAVE_FAILED'
const PLAYBOOK_SECTION_EMPTY_KEY = 'POSITION_DETAILS_PLAYBOOK_SECTION_EMPTY'
const PLAYBOOK_CHECKLIST_EMPTY_KEY = 'POSITION_DETAILS_PLAYBOOK_CHECKLIST_EMPTY'
const PLAYBOOK_METRIC_NET_PNL_KEY = 'POSITION_DETAILS_NET_PNL'
const PLAYBOOK_METRIC_WIN_RATE_KEY = 'DASHBOARD_WIN_RATE'
const PLAYBOOK_METRIC_TRADES_KEY = 'DASHBOARD_PLAYBOOK_DETAILS_TRADES'

export function PositionDetailsPlaybookContextPanel({
	app,
	positionFile,
	items,
	availablePlaybookEntries,
}: PositionDetailsPlaybookContextPanelProps) {
	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [pendingDeleteItem, setPendingDeleteItem] = useState<PositionContextLinkedEntry<Playbook> | null>(null)
	const linkedPlaybookPaths = items.map((item) => item.file.path)

	const handleSave = async (playbookOptionValue: string) => {
		if (positionFile === null) {
			return
		}

		setIsSaving(true)
		try {
			const result = await addPlaybookContextEntry({
				app,
				playbookOptionValue,
				positionFile,
				availablePlaybookEntries,
			})
			const displayName = result.playbookFile.basename
			if (result.appendResult === 'exists') {
				new Notice(t('POSITION_DETAILS_CONTEXT_LINK_EXISTS', { name: displayName }))
			} else {
				new Notice(t('POSITION_DETAILS_CONTEXT_APPEND_SUCCESS', { name: displayName }))
			}
			setIsPickerOpen(false)
		} finally {
			setIsSaving(false)
		}
	}

	const handleRemove = (item: PositionContextLinkedEntry<Playbook>) => {
		setPendingDeleteItem(item)
	}

	const confirmRemove = async () => {
		if (positionFile === null) {
			return
		}
		if (pendingDeleteItem === null) {
			return
		}

		setIsSaving(true)
		try {
			const removed = await removePositionPlaybookFrontmatter({
				app,
				positionFile,
			})
			const displayName = getPersistedEntryDisplayName(pendingDeleteItem.entry)
			if (removed) {
				new Notice(t('POSITION_DETAILS_CONTEXT_REMOVE_SUCCESS', { name: displayName }))
			} else {
				new Notice(t('POSITION_DETAILS_CONTEXT_REMOVE_MISSING', { name: displayName }))
			}
		} finally {
			setPendingDeleteItem(null)
			setIsSaving(false)
		}
	}

	if (items.length === 0) {
		return (
			<>
				<div className="lj:flex-1 lj:flex lj:flex-col lj:items-center lj:justify-center lj:p-4 lj:sm:p-8 lj:h-full lj:min-h-[300px]">
					<div className="lj:flex lj:flex-col lj:items-center lj:justify-center lj:w-full lj:max-w-md lj:p-8 lj:sm:p-10 lj:border-2 lj:border-dashed lj:border-lj-b-gray lj:rounded-2xl lj:bg-lj-surf-panel-subtle">
						<div className="lj:size-16 lj:mb-6 lj:rounded-full lj:bg-lj-surf-fill-dim lj:flex lj:items-center lj:justify-center">
							<ObsidianIcon name="book-open" className="lj:size-8 lj:text-lj-c-hint" />
						</div>
						<h3 className="lj:text-lg lj:font-medium lj:text-lj-c-strong lj:mb-2">{t('POSITION_DETAILS_PLAYBOOK_CONTEXT_EMPTY_TITLE')}</h3>
						<p className="lj:text-sm lj:text-lj-c-muted lj:text-center lj:max-w-xs lj:leading-relaxed">
							{t('POSITION_DETAILS_PLAYBOOK_CONTEXT_EMPTY_DESCRIPTION')}
						</p>
						<button
							type="button"
							disabled={positionFile === null || isSaving}
							onClick={() => setIsPickerOpen(true)}
							className="lj:mt-8 lj:inline-flex lj:items-center lj:gap-2 lj:rounded-full lj:bg-lj-c-strong lj:px-12 lj:py-5 lj:text-base lj:font-semibold lj:text-lj-c-inv lj:transition-opacity lj:hover:opacity-90 lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
						>
							<ObsidianIcon name="plus" className="lj:size-5" />
							{t('POSITION_DETAILS_PLAYBOOK_ADD_LINK')}
						</button>
					</div>
				</div>
				<PositionDetailsContextEntryPickerModal
					app={app}
					isOpen={isPickerOpen}
					isSaving={isSaving}
					label={t('POSITION_DETAILS_PLAYBOOK_PICKER_TITLE')}
					category={t('TAB_PLAYBOOK')}
					placeholder={t('POSITION_DETAILS_PLAYBOOK_PICKER_PLACEHOLDER')}
					entries={availablePlaybookEntries}
					linkedEntryPaths={linkedPlaybookPaths}
					onClose={() => setIsPickerOpen(false)}
					onSave={handleSave}
				/>
			</>
		)
	}

	return (
		<>
			<div className="lj:flex lj:flex-col lj:gap-4">
				{items.map((item) => (
					<PlaybookChecklistCard
						key={item.id}
						app={app}
						positionFile={positionFile}
						item={item}
						isSaving={isSaving}
						onRemove={handleRemove}
					/>
				))}
			</div>
			<PositionDetailsContextEntryDeleteModal
				isOpen={pendingDeleteItem !== null}
				isDeleting={isSaving}
				contextHeading={pendingDeleteItem === null ? null : `playbook: [[${pendingDeleteItem.linkpath}]]`}
				linkedFilePath={pendingDeleteItem?.file.path ?? null}
				onClose={() => {
					if (!isSaving) {
						setPendingDeleteItem(null)
					}
				}}
				onConfirm={() => {
					void confirmRemove()
				}}
			/>
		</>
	)
}

function PlaybookChecklistCard({
	app,
	positionFile,
	item,
	isSaving,
	onRemove,
}: {
	app: App
	positionFile: TFile | null
	item: PositionContextLinkedEntry<Playbook>
	isSaving: boolean
	onRemove: (item: PositionContextLinkedEntry<Playbook>) => void
}) {
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [sections, setSections] = useState<CriteriaFormValue>([])
	const [checkedConfluenceNames, setCheckedConfluenceNames] = useState<string[]>([])
	const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
	const playbookStats = useMemo(
		() => listPlaybookEntriesWithStats(app).find((entry) => entry.entry.file.path === item.file.path)?.stats ?? {
			trades: 0,
			winRate: 0,
			netProfit: 0,
			largestProfit: null,
			largestLoss: null,
		},
		[app, item.file.path],
	)

	useEffect(() => {
		let isCancelled = false

		const run = async () => {
			const nextSections = await loadPlaybookCriteriaSections(app, item.file)
			if (!isCancelled) {
				setSections(nextSections)
				setCheckedConfluenceNames(parseLinkedConfluenceNames(item.contextBody))
			}
		}

		void run()

		return () => {
			isCancelled = true
		}
	}, [app, item.contextBody, item.file])

	const toggleConfluence = (confluenceName: string) => {
		if (positionFile === null) {
			return
		}

		const nextCheckedNames = checkedConfluenceNames.includes(confluenceName)
			? checkedConfluenceNames.filter((name) => name !== confluenceName)
			: [...checkedConfluenceNames, confluenceName]

		setCheckedConfluenceNames(nextCheckedNames)
		saveQueueRef.current = saveQueueRef.current
			.catch(() => undefined)
			.then(async () => {
				try {
					if (checkedConfluenceNames.includes(confluenceName)) {
						await removeSectionEntryFromPosition({
							app,
							linkpath: confluenceName,
							positionFile,
							sectionStart: -1,
							sectionTitle: POSITION_CONFLUENCE_SECTION,
						})
						return
					}

					const existingConfluenceEntry = ConfluenceDomain.totalEntries(app).find((entry) => entry.file.basename === confluenceName)
					await addPositionSectionEntry({
						app,
						availableEntries: existingConfluenceEntry === undefined ? ConfluenceDomain.totalEntries(app) : [existingConfluenceEntry],
						createEntry: async (name) => {
							const result = await ConfluenceDomain.createEntry(app, { name, description: '' }, { confluencePublic: false })
							const entryFile = app.vault.getAbstractFileByPath(result.file.path)
							if (!(entryFile instanceof TFile)) {
								throw new Error('Confluence entry file must be a TFile')
							}
							return { file: entryFile, fm: result.entry }
						},
						entryOptionValue: confluenceName,
						positionFile,
						sectionTitle: POSITION_CONFLUENCE_SECTION,
					})
				} catch {
					new Notice(t(PLAYBOOK_SAVE_FAILED_KEY))
				}
			})
	}

	const playbookTitle = getPlaybookDisplayName(getPersistedEntryDisplayName(item.entry))
	const checkedSet = new Set(checkedConfluenceNames)
	const totalConfluences = sections.reduce((total, section) => total + section.confluences.length, 0)

	return (
		<article className="lj:px-4 lj:py-6 lj:sm:px-6 lj:sm:py-8">
			<div className="lj:flex lj:flex-wrap lj:items-start lj:justify-between lj:gap-4">
				<button
					type="button"
					onClick={() => {
						void openFile(app, item.file)
					}}
					className="lj:inline-flex lj:min-w-0 lj:items-center lj:gap-3 lj:text-left lj:text-lj-c-strong"
				>
					<ObsidianIcon name="book-open" className="lj:size-5 lj:shrink-0 lj:text-lj-c-hint-vivid" />
					<span className="lj:min-w-0 lj:truncate lj:text-2xl lj:sm:text-3xl lj:font-light lj:tracking-tight">
						{playbookTitle}
					</span>
				</button>

				<div className="lj:relative lj:shrink-0">
					<button
						type="button"
						onClick={() => setIsMenuOpen((current) => !current)}
						className="lj:inline-flex lj:size-10 lj:items-center lj:justify-center lj:rounded-lg lj:text-lj-c-hint lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
					>
						<ObsidianIcon name="more-vertical" className="lj:size-4" />
					</button>

					{isMenuOpen && (
						<>
							<div className="lj:fixed lj:inset-0 lj:z-30" onClick={() => setIsMenuOpen(false)} />
							<div className="lj:absolute lj:right-0 lj:top-full lj:z-40 lj:mt-2 lj:min-w-[11rem] lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:py-2 lj:shadow-xl">
								<button
									type="button"
									disabled={isSaving}
									onClick={() => {
										setIsMenuOpen(false)
										onRemove(item)
									}}
									className="lj:flex lj:w-full lj:items-center lj:gap-3 lj:px-4 lj:py-3 lj:text-left lj:text-sm lj:text-lj-c-danger lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-danger-strong lj:disabled:opacity-50"
								>
									<ObsidianIcon name="trash-2" className="lj:size-4 lj:shrink-0" />
									<span>{t('POSITION_DETAILS_CONTEXT_REMOVE_LINK')}</span>
								</button>
							</div>
						</>
					)}
				</div>
			</div>

			<div className="lj:mt-6 lj:grid lj:grid-cols-1 lj:gap-4 lj:border-y lj:border-lj-alpha-8 lj:py-5 lj:sm:grid-cols-3 lj:sm:gap-0">
				<MetricBlock label={t(PLAYBOOK_METRIC_NET_PNL_KEY)} value={formatSignedCurrency(playbookStats.netProfit)} />
				<MetricBlock label={t(PLAYBOOK_METRIC_WIN_RATE_KEY)} value={`${Math.round(clampPercentage(playbookStats.winRate))}%`} className="lj:sm:border-l lj:sm:border-lj-alpha-8 lj:sm:pl-6 lj:lg:pl-8" />
				<MetricBlock label={t(PLAYBOOK_METRIC_TRADES_KEY)} value={String(playbookStats.trades)} className="lj:sm:border-l lj:sm:border-lj-alpha-8 lj:sm:pl-6 lj:lg:pl-8" />
			</div>

			{sections.length === 0 ? (
				<div className="lj:py-10 lj:text-sm lj:text-lj-c-muted">
					{t(PLAYBOOK_CHECKLIST_EMPTY_KEY)}
				</div>
			) : (
				<div className="lj:mt-6 lj:grid lj:grid-cols-1 lj:gap-8 lj:xl:grid-cols-3">
					{sections.map((section, sectionIndex) => (
						<section key={`playbook-section:${sectionIndex}:${section.criteriaName}`} className="lj:min-w-0">
							<div className="lj:pb-4 lj:border-b lj:border-lj-alpha-8">
								<h3 className="lj:text-xs lj:font-medium lj:uppercase lj:tracking-[0.32em] lj:text-lj-c-muted">
									{section.criteriaName.trim() === '' ? t(PLAYBOOK_SECTION_EMPTY_KEY) : section.criteriaName}
								</h3>
							</div>

							<div className="lj:mt-6 lj:flex lj:flex-col lj:gap-5 lj:items-start">
								{section.confluences.map((confluence) => {
									const isChecked = checkedSet.has(confluence.name)
									return (
										<button
											key={`playbook-confluence:${section.criteriaName}:${confluence.name}`}
											type="button"
											onClick={() => toggleConfluence(confluence.name)}
											disabled={positionFile === null}
											className="lj:flex lj:w-full lj:items-start lj:justify-start lj:gap-5 lj:text-left lj:transition-opacity lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
										>
											<span className={`lj:mt-1 lj:flex lj:size-6 lj:shrink-0 lj:items-center lj:justify-center lj:rounded-full lj:border lj:transition-colors ${
												isChecked
													? 'lj:border-lj-c-strong lj:bg-lj-c-strong lj:text-lj-c-inv'
													: 'lj:border-lj-alpha-15 lj:bg-transparent lj:text-transparent'
											}`}>
												<ObsidianIcon name="check" className="lj:size-3.5" />
											</span>
											<span className={`lj:min-w-0 lj:max-w-full lj:text-[1.05rem] lj:leading-[1.65] lj:sm:text-[1.1rem] ${
												isChecked ? 'lj:text-lj-c-strong' : 'lj:text-lj-c-muted'
											}`}>
												{getPlaybookDisplayName(confluence.name)}
											</span>
										</button>
									)
								})}
							</div>
						</section>
					))}
				</div>
			)}

			<div className="lj:mt-5 lj:text-xs lj:text-lj-c-hint-vivid">
				{t('DASHBOARD_PLAYBOOK_DETAILS_CRITERIA_COUNT', { count: totalConfluences })}
			</div>
		</article>
	)
}

function MetricBlock({
	label,
	value,
	className = '',
}: {
	label: string
	value: string
	className?: string
}) {
	return (
		<div className={`lj:flex lj:flex-col lj:gap-2 ${className}`}>
			<span className="lj:text-[11px] lj:font-medium lj:uppercase lj:tracking-[0.32em] lj:text-lj-c-muted">
				{label}
			</span>
			<span className="lj:text-3xl lj:font-light lj:tracking-tight lj:text-lj-c-strong">
				{value}
			</span>
		</div>
	)
}

function formatSignedCurrency(value: number) {
	return formatSignedAmount(value)
}

async function openFile(app: App, file: TFile) {
	const leaf = app.workspace.getLeaf('tab')
	await leaf.openFile(file)
}

function parseLinkedConfluenceNames(sectionBody: string) {
	return [...new Set(
		sectionBody
			.split('\n')
			.flatMap((line) => {
				const match = parseWikilinkHeading(line.replace(/^##\s+/, ''))
				return match === null ? [] : [match.linkpath]
			}),
	)]
}
