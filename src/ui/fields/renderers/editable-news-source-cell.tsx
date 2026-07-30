import { Notice, type App } from 'obsidian'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { extractFrontmatterBlock, fetchNewsBodyFromSource, isDefuddleFetchError, stripMarkdownFrontmatter } from '../../../domains/news'
import { normalizeHomepageUrl } from '../../../icon/homepage-favicon'
import { t } from '../../../lang/helpers'
import { NewsSourcePreview } from '../../dashboard/news-source-preview'
import { Modal } from '../../primitives/modal'
import { ObsidianIcon } from '../../primitives/obsidian-icon'

import type { TFile } from 'obsidian'

const IMPORT_MODAL_MAX_WIDTH = 'lj:max-w-sm'
const IMPORT_MODAL_HEADER_CLASS = 'lj:px-6 lj:py-4'
const IMPORT_MODAL_CONTENT_CLASS = 'lj:px-6 lj:py-5'
const IMPORT_MODAL_FOOTER_CLASS = 'lj:px-6 lj:py-4'

type PendingImport = { url: string; hasExistingBody: boolean }

export function EditableNewsSourceCell({
	app,
	file,
	value,
}: {
	app: App
	file: TFile
	value: string | null
}): ReactNode {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(value ?? '')
	const inputRef = useRef<HTMLInputElement>(null)

	const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
	const [isImporting, setIsImporting] = useState(false)

	useEffect(() => {
		if (!isEditing) {
			return
		}

		setDraft(value ?? '')
		const timer = window.setTimeout(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		}, 0)
		return () => window.clearTimeout(timer)
	}, [isEditing, value])

	// @story [[lucrjournal/fields#^news-source-writeback]] Normalizes source frontmatter before offering body import
	const save = async () => {
		const trimmed = draft.trim()
		const normalized = trimmed === '' ? null : normalizeHomepageUrl(trimmed)
		const previousValue = value?.trim() ?? ''
		const nextValue = normalized ?? ''

		if (trimmed !== '' && normalized === null) {
			new Notice(t('DASHBOARD_ENTRY_FIELD_SOURCE_INVALID'))
			window.setTimeout(() => {
				inputRef.current?.focus()
				inputRef.current?.select()
			}, 0)
			return false
		}

		if (nextValue === previousValue) {
			setIsEditing(false)
			return true
		}

		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter.source = normalized
			})
			setIsEditing(false)
			if (normalized !== null) {
				const raw = await app.vault.read(file)
				const bodyOnly = stripMarkdownFrontmatter(raw).trim()
				setPendingImport({ url: normalized, hasExistingBody: bodyOnly.length > 0 })
			}
			return true
		} catch {
			new Notice(t('DASHBOARD_META_ANALYSIS_UPDATE_FAILED'))
			window.setTimeout(() => {
				inputRef.current?.focus()
				inputRef.current?.select()
			}, 0)
			return false
		}
	}

	const handleImport = async () => {
		if (pendingImport === null) {
			return 
		}
		setIsImporting(true)
		try {
			const newBody = await fetchNewsBodyFromSource(pendingImport.url)
			await app.vault.process(file, (content) => extractFrontmatterBlock(content) + newBody)
			setPendingImport(null)
		} catch (error) {
			if (!isDefuddleFetchError(error)) {
				new Notice(t('DASHBOARD_ENTRY_SOURCE_IMPORT_FAILED'))
			}
			// modal stays open — user can retry or cancel
		} finally {
			setIsImporting(false)
		}
	}

	return (
		<>
			{isEditing ? (
				<div className="lj:px-1" onClick={(event) => event.stopPropagation()}>
					<input
						ref={inputRef}
						type="url"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={() => {
							void save()
						}}
						onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
							if (event.key === 'Escape') {
								event.preventDefault()
								setDraft(value ?? '')
								setIsEditing(false)
							}
							if (event.key === 'Enter') {
								event.preventDefault()
								void save()
							}
						}}
						placeholder={t('DASHBOARD_ENTRY_FIELD_SOURCE_PLACEHOLDER')}
						className="lj:h-7 lj:w-full lj:rounded-md lj:border-0 lj:bg-lj-alpha-5 lj:px-2 lj:text-xs lj:text-lj-c-strong lj:outline-none lj:ring-0 lj:shadow-none lj:focus:border-0 lj:focus:ring-0 lj:focus-visible:border-0 lj:focus-visible:ring-0"
					/>
				</div>
			) : (
				<div className="lj:group lj:relative lj:w-full">
					<div
						className="lj:min-w-0 lj:w-full lj:rounded-md lj:border lj:border-transparent lj:px-0 lj:py-0 lj:pr-6 lj:transition-all hover:lj:border-lj-alpha-10"
						onClick={(event) => {
							if ((event.target as HTMLElement).closest('a') !== null) {
								return
							}
							event.stopPropagation()
							setIsEditing(true)
						}}
					>
						<NewsSourcePreview url={value} framed={false} compact />
					</div>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation()
							setIsEditing(true)
						}}
						title={t('DASHBOARD_ENTRY_FIELD_SOURCE_LABEL')}
						className="lj:absolute lj:right-1 lj:top-1/2 lj:inline-flex lj:-translate-y-1/2 lj:items-center lj:justify-center lj:rounded-md lj:border lj:border-transparent lj:p-1 lj:text-lj-c-hint lj:opacity-0 lj:transition-all lj:group-hover:opacity-100 lj:focus-visible:opacity-100 hover:lj:border-lj-alpha-10 hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong"
					>
						<ObsidianIcon name="pencil" className="lj:size-3.5" />
					</button>
				</div>
			)}

			<Modal
				isOpen={pendingImport !== null}
				onClose={() => {
					if (!isImporting) {
						setPendingImport(null)
					}
				}}
				title={t('DASHBOARD_ENTRY_SOURCE_IMPORT_TITLE')}
				maxWidthClassName={IMPORT_MODAL_MAX_WIDTH}
				headerClassName={IMPORT_MODAL_HEADER_CLASS}
				contentClassName={IMPORT_MODAL_CONTENT_CLASS}
				footerClassName={IMPORT_MODAL_FOOTER_CLASS}
				footer={
					<div className="lj:flex lj:items-center lj:justify-end lj:gap-3">
						<button
							type="button"
							onClick={() => {
								if (!isImporting) {
									setPendingImport(null)
								}
							}}
							disabled={isImporting}
							className="lj:px-4 lj:py-3 lj:text-sm lj:font-medium lj:text-lj-c-muted lj:transition-colors lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
						>
							{t('DASHBOARD_ENTRY_SOURCE_IMPORT_CANCEL')}
						</button>
						<button
							type="button"
							onClick={() => {
								void handleImport() 
							}}
							disabled={isImporting}
							className="lj:rounded-lg lj:bg-lj-c-strong lj:px-5 lj:py-3 lj:text-sm lj:font-semibold lj:text-lj-c-inv lj:transition-colors lj:hover:bg-lj-fill-contrast-soft lj:disabled:cursor-not-allowed lj:disabled:bg-lj-c-disabled lj:disabled:text-lj-c-inv-disabled"
						>
							{t(isImporting ? 'DASHBOARD_ENTRY_SOURCE_IMPORT_IMPORTING' : 'DASHBOARD_ENTRY_SOURCE_IMPORT_CONFIRM')}
						</button>
					</div>
				}
			>
				<div className="lj:flex lj:flex-col lj:gap-3">
					<p className="lj:text-sm lj:leading-6 lj:text-lj-c-secondary">
						{t('DASHBOARD_ENTRY_SOURCE_IMPORT_DESCRIPTION')}
					</p>
					{pendingImport?.hasExistingBody === true && (
						<p className="lj:text-sm lj:leading-6 lj:text-lj-c-warning">
							{t('DASHBOARD_ENTRY_SOURCE_IMPORT_OVERWRITE_WARNING')}
						</p>
					)}
				</div>
			</Modal>
		</>
	)
}
