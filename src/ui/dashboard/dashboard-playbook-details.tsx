import { Notice, type App } from 'obsidian'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
	isPublicConfluence,
	listPlaybookConfluenceEntries,
	loadPlaybookCriteriaSections,
	resolvePlaybookCriteriaSectionOptions,
	savePlaybookCriteriaSections,
	type CriteriaFormValue,
} from '../../domains'
import { syncRenamedDocumentTitle } from '../../domains/core/entry-writer'
import { t } from '../../lang/helpers'
import { en } from '../../lang/locale/en'
import { buildRenamedEntryPath, formatSignedAmount, getPersistedEntryDisplayName, sanitizeObsidianFileName } from '../../utils'
import { openMarkdownFile } from '../../views/link-activation'
import { CriteriaFormFieldRenderer } from '../form/types/criteria-form-field'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import { clampPercentage, getPlaybookDisplayName } from './dashboard-playbook-shared'

import type { PlaybookEntryWithStats } from '../../domains'
import type { TFile } from 'obsidian'
import type { KeyboardEvent, MouseEvent } from 'react'

type DashboardPlaybookDetailsProps = {
	app: App
	playbook: PlaybookEntryWithStats
	onBack?: () => void
	onPlaybookPathChange: (filePath: string) => void
	onSelectPlaybookPositions?: (filePath: string, event?: MouseEvent<HTMLButtonElement>) => void
}

const PLAYBOOK_CONFLUENCES_LABEL_KEY = 'DASHBOARD_PLAYBOOK_DETAILS_CONFLUENCES'

export function DashboardPlaybookDetails({
	app,
	playbook,
	onBack,
	onPlaybookPathChange,
	onSelectPlaybookPositions,
}: DashboardPlaybookDetailsProps) {
	const [criteria, setCriteria] = useState<CriteriaFormValue>([])
	const [criteriaOptionsRevision, setCriteriaOptionsRevision] = useState(0)
	const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
	const title = getPlaybookDisplayName(getPersistedEntryDisplayName(playbook.entry))
	const description = playbook.entry.fm.description?.trim() ?? ''
	const confluenceOptions = useMemo(
		() => listPlaybookConfluenceEntries(app).flatMap((entry) => {
			const basename = entry.file.basename
			return basename === undefined ? [] : [{
				value: basename,
				label: basename,
				description: isPublicConfluence(entry.fm) ? 'DASHBOARD_PLAYBOOK_CONFLUENCE_SCOPE_PUBLIC' : undefined,
				icon: isPublicConfluence(entry.fm) ? { kind: 'lucide' as const, value: 'globe' } : undefined,
			}]
		}),
		[app, criteriaOptionsRevision],
	)
	const sectionOptions = useMemo(
		() => resolvePlaybookCriteriaSectionOptions(app, criteria).map((option) => ({
			value: option.value,
			label: option.label ?? option.value,
		})),
		[app, criteria, criteriaOptionsRevision],
	)
	const localizeFormCopy = (key: string, params?: Record<string, string | number | boolean>) => {
		if (key in en) {
			return t(key as keyof typeof en, params as never)
		}

		return key
	}

	useEffect(() => {
		let isCancelled = false

		const run = async () => {
			const nextCriteria = await loadPlaybookCriteriaSections(app, playbook.entry.file)
			if (!isCancelled) {
				setCriteria(nextCriteria)
			}
		}

		void run()

		return () => {
			isCancelled = true
		}
	}, [app, playbook.entry.file])

	const handleCriteriaSectionsChange = (nextValue: CriteriaFormValue) => {
		const previousValue = criteria
		setCriteria(nextValue)
		saveQueueRef.current = saveQueueRef.current
			.catch(() => undefined)
			.then(async () => {
				try {
					await savePlaybookCriteriaSections(app, playbook.entry.file, nextValue, previousValue)
					setCriteriaOptionsRevision((current) => current + 1)
				} catch (error) {
					if (error instanceof Error && error.message === 'PLAYBOOK_DUPLICATE_CRITERIA_ERROR') {
						new Notice(t('DASHBOARD_PLAYBOOK_CRITERIA_DUPLICATE'))
						return
					}
					if (error instanceof Error && error.message === 'PLAYBOOK_DUPLICATE_CONFLUENCE_ERROR') {
						new Notice(t('DASHBOARD_PLAYBOOK_CONFLUENCES_DUPLICATE'))
						return
					}
					new Notice(t('DASHBOARD_PLAYBOOK_DETAILS_SAVE_FAILED'))
				}
			})
	}

	const criteriaCount = countPlaybookCriteriaSections(criteria)

	return (
		<main className="lj:mx-auto lj:w-full lj:max-w-7xl lj:px-4 lj:sm:px-8 lj:pt-6 lj:sm:pt-8 lj:pb-[calc(env(safe-area-inset-bottom)+10.5rem)] lj:sm:pb-24">
			<div
				className="lj:flex lj:flex-col lj:gap-10 lj:sm:gap-14"
				data-lj-panel="playbook-details"
			>
				<div className="lj:flex lj:flex-col lj:gap-8">
					<div className="lj:flex lj:flex-wrap lj:items-center lj:justify-between lj:gap-4">
						<div className="lj:flex lj:flex-col lj:gap-4">
							{onBack === undefined ? null : (
								<div
									role="button"
									tabIndex={0}
									className="lj:inline-flex lj:w-fit lj:items-center lj:gap-2 lj:text-sm lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:text-lj-c-strong lj:focus-visible:outline-none lj:focus-visible:ring-2 lj:focus-visible:ring-lj-alpha-15 lj:rounded-md"
									onClick={onBack}
									onKeyDown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault()
											onBack()
										}
									}}
									data-lj-control="dashboard-playbook-back"
								>
									<ObsidianIcon className="lj:size-4" name="chevron-left" />
									{t('DASHBOARD_PLAYBOOK_BACK')}
								</div>
							)}
							<EditablePlaybookTitle
								app={app}
								file={playbook.entry.file}
								value={title}
								onPathChange={onPlaybookPathChange}
							/>
							<EditablePlaybookDescription
								app={app}
								file={playbook.entry.file}
								value={description}
							/>
						</div>

						<button
							type="button"
							className="lj:inline-flex lj:items-center lj:gap-2 lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:px-4 lj:py-2.5 lj:text-sm lj:font-medium lj:text-lj-c-strong lj:transition-[border-color,transform] lj:hover:border-lj-alpha-15 lj:hover:-translate-y-px"
							onClick={() => {
								void openPlaybookFile(app, playbook.entry.file)
							}}
							data-lj-control="dashboard-playbook-open-file"
						>
							<ObsidianIcon className="lj:size-4" name="square-arrow-out-up-right" />
							{t('DASHBOARD_PLAYBOOK_OPEN_FILE')}
						</button>
					</div>

					<section className="lj:grid lj:grid-cols-1 lj:sm:grid-cols-2 lj:xl:grid-cols-5 lj:overflow-hidden lj:rounded-[1.75rem] lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-card-muted">
						<MetricCard label={t('POSITION_DETAILS_NET_PNL')} value={formatSignedCurrency(playbook.stats.netProfit)} isMuted={playbook.stats.netProfit < 0} />
						<MetricCard
							label={t('DASHBOARD_PLAYBOOK_DETAILS_TRADES')}
							value={String(playbook.stats.trades)}
							onClick={onSelectPlaybookPositions === undefined ? undefined : (event) => onSelectPlaybookPositions(playbook.entry.file.path, event)}
						/>
						<MetricCard label={t('DASHBOARD_WIN_RATE')} value={`${Math.round(clampPercentage(playbook.stats.winRate))}%`} />
						<MetricCard label={t('DASHBOARD_PLAYBOOK_DETAILS_LARGEST_PROFIT')} value={formatOptionalCurrency(playbook.stats.largestProfit)} />
						<MetricCard label={t('DASHBOARD_PLAYBOOK_DETAILS_LARGEST_LOSS')} value={formatOptionalCurrency(playbook.stats.largestLoss)} isMuted />
					</section>
				</div>

				<section className="lj:flex lj:flex-col lj:gap-6" data-lj-panel="playbook-details-criteria">
					<div className="lj:flex lj:items-center lj:justify-between lj:gap-4">
						<h2 className="lj:text-2xl lj:font-light lj:tracking-tight lj:text-lj-c-strong">
							{t('DASHBOARD_PLAYBOOK_DETAILS_CONFLUENCES')}
						</h2>
						<span className="lj:text-xs lj:font-medium lj:tracking-[0.24em] lj:text-lj-c-muted lj:uppercase">
							{t('DASHBOARD_PLAYBOOK_DETAILS_CRITERIA_COUNT', { count: criteriaCount })}
						</span>
					</div>

					<CriteriaFormFieldRenderer
						field={{
							type: 'criteria',
							label: PLAYBOOK_CONFLUENCES_LABEL_KEY,
						}}
						value={criteria}
						values={{ criteria }}
						onChange={handleCriteriaSectionsChange}
						options={confluenceOptions}
						criteriaOptions={sectionOptions}
						tagOptions={[]}
						localize={localizeFormCopy}
					/>
				</section>
			</div>
		</main>
	)
}

function countPlaybookCriteriaSections(criteria: CriteriaFormValue): number {
	return criteria.length
}

function EditablePlaybookTitle({
	app,
	file,
	value,
	onPathChange,
}: {
	app: App
	file: TFile
	value: string
	onPathChange: (filePath: string) => void
}) {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(value)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const isCommittingRef = useRef(false)

	useEffect(() => {
		if (!isEditing) {
			return
		}

		setDraft(value)
		const timer = window.setTimeout(() => {
			focusTextInputAtEnd(inputRef.current)
		}, 0)
		return () => window.clearTimeout(timer)
	}, [isEditing, value])

	const commit = () => {
		if (isCommittingRef.current) {
			return Promise.resolve()
		}

		isCommittingRef.current = true
		return savePlaybookTitle({
			app,
			file,
			currentValue: value,
			nextValue: draft,
			onPathChange,
		}).finally(() => {
			isCommittingRef.current = false
			setIsEditing(false)
		})
	}

	if (isEditing) {
		return (
			<textarea
				ref={inputRef}
				value={draft}
				rows={1}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					void commit()
				}}
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						event.preventDefault()
						setDraft(value)
						setIsEditing(false)
						return
					}

					if (event.key === 'Enter') {
						event.preventDefault()
						void commit()
					}
				}}
				className="lj:min-w-[12rem] lj:max-w-full lj:resize-none lj:overflow-hidden lj:border-0 lj:border-b lj:border-lj-alpha-10 lj:bg-transparent lj:px-0 lj:py-0 lj:text-4xl lj:sm:text-5xl lj:font-light lj:leading-[0.92] lj:tracking-tight lj:text-lj-c-strong lj:whitespace-nowrap lj:outline-none lj:ring-0 lj:shadow-none focus:lj:border-lj-alpha-15"
				style={{ width: `${Math.max(draft.length + 1, 8)}ch` }}
			/>
		)
	}

	return (
		<div className="lj:group/edit lj:relative lj:max-w-4xl">
			<button
				type="button"
				onClick={() => setIsEditing(true)}
				title={t('DASHBOARD_ENTRY_FIELD_NAME_LABEL')}
				aria-label={t('DASHBOARD_ENTRY_FIELD_NAME_LABEL')}
				className="lj:block lj:w-full lj:rounded-md lj:px-0 lj:py-0 lj:pr-8 lj:text-left lj:transition-colors lj:hover:text-lj-c-strong"
			>
				<span className="lj:block lj:text-4xl lj:sm:text-5xl lj:font-light lj:leading-[0.92] lj:tracking-tight lj:text-lj-c-strong">
					{value}
				</span>
			</button>
			<span className="lj:pointer-events-none lj:absolute lj:right-0 lj:top-1/2 lj:-translate-y-1/2 lj:text-lj-c-hint-faint lj:opacity-0 lj:transition-opacity lj:group-hover/edit:opacity-100">
				<ObsidianIcon name="pencil" className="lj:size-4" />
			</span>
		</div>
	)
}

function EditablePlaybookDescription({
	app,
	file,
	value,
}: {
	app: App
	file: TFile
	value: string
}) {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(value)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const isCommittingRef = useRef(false)

	useEffect(() => {
		if (!isEditing) {
			return
		}

		setDraft(value)
		const timer = window.setTimeout(() => {
			focusTextInputAtEnd(textareaRef.current)
		}, 0)
		return () => window.clearTimeout(timer)
	}, [isEditing, value])

	const save = async () => {
		if (isCommittingRef.current) {
			return
		}

		isCommittingRef.current = true
		const nextValue = draft.trim()
		if (nextValue === value.trim()) {
			isCommittingRef.current = false
			setIsEditing(false)
			return
		}

		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter.description = nextValue === '' ? null : nextValue
			})
			setIsEditing(false)
		} catch {
			new Notice(t('DASHBOARD_PLAYBOOK_UPDATE_FAILED'))
		} finally {
			isCommittingRef.current = false
		}
	}

	if (isEditing) {
		return (
			<div className="lj:max-w-3xl">
				<textarea
					ref={textareaRef}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => {
						void save()
					}}
					onKeyDown={(event) => {
						handleDescriptionEditorKeyDown(event, () => {
							setDraft(value)
							setIsEditing(false)
						}, () => {
							void save()
						})
					}}
					rows={3}
					placeholder={t('DASHBOARD_PLAYBOOK_DESCRIPTION_EMPTY')}
					className="lj:w-full lj:resize-none lj:border-0 lj:border-b lj:border-lj-alpha-10 lj:bg-transparent lj:px-0 lj:py-0 lj:text-sm lj:leading-7 lj:text-lj-c-strong lj:outline-none lj:shadow-none focus:lj:border-lj-alpha-15"
				/>
			</div>
		)
	}

	const isEmpty = value.trim() === ''
	return (
		<div className="lj:group/edit lj:relative lj:max-w-3xl">
			<button
				type="button"
				onClick={() => setIsEditing(true)}
				title={t('DASHBOARD_ENTRY_COLUMN_DESCRIPTION')}
				aria-label={t('DASHBOARD_ENTRY_COLUMN_DESCRIPTION')}
				className={`lj:block lj:w-full lj:rounded-md lj:px-0 lj:py-0 lj:pr-8 lj:text-left lj:transition-colors ${isEmpty ? 'lj:text-lj-c-hint hover:lj:text-lj-c-muted' : 'lj:text-lj-c-muted hover:lj:text-lj-c-strong'}`}
			>
				<span className={`lj:block lj:text-sm lj:leading-7 ${isEmpty ? 'lj:italic' : ''}`}>
					{isEmpty ? t('DASHBOARD_PLAYBOOK_DESCRIPTION_EMPTY') : value}
				</span>
			</button>
			<span className="lj:pointer-events-none lj:absolute lj:right-0 lj:top-1 lj:text-lj-c-hint-faint lj:opacity-0 lj:transition-opacity lj:group-hover/edit:opacity-100">
				<ObsidianIcon name="pencil" className="lj:size-3.5" />
			</span>
		</div>
	)
}

async function savePlaybookTitle({
	app,
	file,
	currentValue,
	nextValue,
	onPathChange,
}: {
	app: App
	file: TFile
	currentValue: string
	nextValue: string
	onPathChange: (filePath: string) => void
}) {
	const normalizedNextValue = sanitizeObsidianFileName(nextValue)
	const normalizedCurrentValue = sanitizeObsidianFileName(currentValue)
	if (normalizedNextValue === '' || normalizedNextValue === normalizedCurrentValue) {
		return
	}

	const nextPath = buildRenamedEntryPath(file, normalizedNextValue)
	if (nextPath === null) {
		return
	}

	try {
		await app.fileManager.renameFile(file, nextPath)
		await syncRenamedDocumentTitle(app, file, normalizedNextValue)
		onPathChange(nextPath)
	} catch {
		new Notice(t('DASHBOARD_PLAYBOOK_UPDATE_FAILED'))
	}
}

function handleDescriptionEditorKeyDown(
	event: KeyboardEvent<HTMLTextAreaElement>,
	onCancel: () => void,
	onSave: () => void,
) {
	if (event.key === 'Escape') {
		event.preventDefault()
		onCancel()
		return
	}

	if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
		event.preventDefault()
		onSave()
	}
}

function focusTextInputAtEnd(element: HTMLTextAreaElement | HTMLInputElement | null) {
	if (element === null) {
		return
	}

	element.focus()
	const end = element.value.length
	element.setSelectionRange(end, end)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('countPlaybookCriteriaSections', () => {
		it('counts criteria sections instead of confluence rows', () => {
			expect(countPlaybookCriteriaSections([
				{
					criteriaName: 'Entry Criteria',
					confluences: [{ name: 'confluence-1' }, { name: 'confluence-2' }],
				},
				{
					criteriaName: 'Exit Criteria',
					confluences: [{ name: 'confluence-3' }],
				},
			])).toBe(2)
		})
	})

	describe('handleDescriptionEditorKeyDown', () => {
		it('cancels on Escape', () => {
			let cancelled = false
			let saved = false
			handleDescriptionEditorKeyDown(
				{
					key: 'Escape',
					preventDefault() {
						cancelled = true
					},
				} as KeyboardEvent<HTMLTextAreaElement>,
				() => {
					cancelled = true
				},
				() => {
					saved = true
				},
			)

			expect(cancelled).toBe(true)
			expect(saved).toBe(false)
		})

		it('saves on mod-enter', () => {
			let prevented = false
			let saved = false
			handleDescriptionEditorKeyDown(
				{
					key: 'Enter',
					metaKey: true,
					ctrlKey: false,
					preventDefault() {
						prevented = true
					},
				} as KeyboardEvent<HTMLTextAreaElement>,
				() => undefined,
				() => {
					saved = true
				},
			)

			expect(prevented).toBe(true)
			expect(saved).toBe(true)
		})
	})
}

function MetricCard({
	label,
	value,
	isMuted = false,
	onClick,
}: {
	label: string
	value: string
	isMuted?: boolean
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
	const valueClassName = `lj:text-3xl lj:sm:text-[2.35rem] lj:font-light lj:tracking-tight ${isMuted ? 'lj:text-lj-c-muted' : 'lj:text-lj-c-strong'}`
	return (
		<div className="lj:flex lj:min-h-[8.75rem] lj:flex-col lj:justify-center lj:gap-3 lj:border-b lj:border-lj-alpha-10 lj:px-5 lj:py-6 lj:sm:px-6 lj:xl:border-b-0 lj:xl:border-r last:lj:border-r-0 last:lj:border-b-0">
			<span className="lj:text-[11px] lj:font-medium lj:tracking-[0.32em] lj:text-lj-c-muted lj:uppercase">
				{label}
			</span>
			{onClick === undefined ? (
				<span className={valueClassName}>
					{value}
				</span>
			) : (
				<button
					type="button"
					onClick={onClick}
					className={`lj:w-fit lj:appearance-none lj:rounded-md lj:border-0 lj:bg-transparent lj:px-0 lj:py-0 lj:text-left lj:shadow-none lj:transition-colors lj:hover:text-lj-c-interactive ${valueClassName}`}
				>
					{value}
				</button>
			)}
		</div>
	)
}

function formatSignedCurrency(value: number) {
	return formatSignedAmount(value)
}

function formatOptionalCurrency(value: number | null) {
	if (value === null) {
		return '—'
	}

	return formatSignedAmount(value)
}

async function openPlaybookFile(app: App, file: TFile) {
	await openMarkdownFile(app, file, null, { sourceMode: true })
}
