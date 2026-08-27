import { TFile, type App } from 'obsidian'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'

import { hasPersistedEntryBasenameConflict } from '../../domains/core/entry-writer'
import { t } from '../../lang/helpers'
import { getCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import { buildIsoDatetimeInTimeZone, getFileBasename, getPersistedEntryCreated, getPersistedEntryDisplayName, sanitizeObsidianFileName } from '../../utils'
import { ObsidianIcon } from '../primitives/obsidian-icon'
import { PickerModalShell } from '../primitives/picker-modal-shell'

type EntryWithName = {
	file: {
		path: string
		basename?: string
		stat?: {
			ctime: number
		}
	}
	fm: unknown
}

type PositionDetailsContextEntryPickerModalProps = {
	app: App
	isOpen: boolean
	isSaving: boolean
	label: string
	category: string
	placeholder: string
	entries: EntryWithName[]
	linkedEntryPaths: string[]
	onClose: () => void
	onSave: (entryOptionValue: string) => Promise<void>
	onCreateRequest?: (inputValue: string) => void
}

const PICKER_BODY_CLASS_NAME = 'lj:p-2'
const LINKED_ENTRY_PICKER_PANEL_ID = 'linked-entry-picker'

export function PositionDetailsContextEntryPickerModal({
	app,
	isOpen,
	isSaving,
	label,
	category,
	placeholder,
	entries,
	linkedEntryPaths,
	onClose,
	onSave,
	onCreateRequest,
}: PositionDetailsContextEntryPickerModalProps) {
	const [query, setQuery] = useState('')
	const [selectedValue, setSelectedValue] = useState('')
	const inputRef = useRef<HTMLInputElement>(null)
	const trimmedQuery = query.trim()
	const linkedEntryPathSet = useMemo(() => new Set(linkedEntryPaths), [linkedEntryPaths.join('|')])
	const selectableEntries = useMemo(
		() => entries.filter((entry) => !linkedEntryPathSet.has(entry.file.path)),
		[entries, linkedEntryPathSet],
	)
	const linkedEntries = useMemo(
		() => entries.filter((entry) => linkedEntryPathSet.has(entry.file.path)),
		[entries, linkedEntryPathSet],
	)
	const filteredEntries = useMemo(() => {
		const normalizedQuery = trimmedQuery.toLowerCase()
		if (normalizedQuery === '') {
			return selectableEntries
		}

		return selectableEntries.filter((entry) => {
			const title = getPersistedEntryDisplayName(entry).toLowerCase()
			const path = entry.file.path.toLowerCase()
			const tags = getEntryTags(app, entry).join(' ').toLowerCase()
			return title.includes(normalizedQuery) || path.includes(normalizedQuery) || tags.includes(normalizedQuery)
		})
	}, [app, selectableEntries, trimmedQuery])
	const selectedEntry = selectableEntries.find((entry) => getFileBasename(entry.file) === selectedValue) ?? null
	const createValidationMessage = resolveCreateValidationMessage(app, {
		entries,
		linkedEntries,
		inputValue: trimmedQuery,
	})
	const canCreate = trimmedQuery.length > 0 && selectedEntry === null && createValidationMessage === null
	const primaryAction = resolvePickerPrimaryAction({
		canCreate,
		hasSelectableEntryMatch: selectedEntry !== null,
		hasCreateRequest: onCreateRequest !== undefined,
		isSaving,
		selectedValue,
	})

	useEffect(() => {
		if (!isOpen) {
			return
		}

		setQuery('')
		setSelectedValue('')
		const timer = window.setTimeout(() => inputRef.current?.focus(), 10)
		return () => window.clearTimeout(timer)
	}, [isOpen, label])

	useEffect(() => {
		if (selectedValue.trim() !== '') {
			return
		}

		const firstEntry = filteredEntries[0]
		if (firstEntry === undefined) {
			return
		}

		setSelectedValue(getFileBasename(firstEntry.file))
	}, [filteredEntries, selectedValue])

	if (!isOpen) {
		return null
	}

	const footerLabel = primaryAction.mode === 'create'
		? t('POSITION_DETAILS_CONTEXT_PICKER_CREATE', { category })
		: t('POSITION_DETAILS_CONTEXT_ADD_CATEGORY', { category })
	let createHelperMessage = t('SELECT_CREATE_EMPTY_HINT')
	if (trimmedQuery.length > 0) {
		createHelperMessage = createValidationMessage ?? t('SELECT_CREATE_READY', { action: footerLabel, query: trimmedQuery })
	}

	return (
		<PickerModalShell
			isOpen={isOpen}
			onClose={onClose}
			label={label}
			dataLjPanel={LINKED_ENTRY_PICKER_PANEL_ID}
			header={(
				<div className="lj:flex lj:items-center lj:gap-3 lj:border-b lj:border-lj-alpha-10 lj:px-4 lj:py-4">
					<ObsidianIcon name="search" className="lj:size-4 lj:shrink-0 lj:text-lj-c-hint-vivid" />
					<div className="lj:min-w-0 lj:flex-1">
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(event) => {
								const nextQuery = event.target.value
								setQuery(nextQuery)
								setSelectedValue(nextQuery.trim())
							}}
							onKeyDown={(event) => {
								void handleSearchInputKeyDown(event, {
									canCreate,
									filteredEntries,
									hasSelectableEntryMatch: selectedEntry !== null,
									hasCreateRequest: onCreateRequest !== undefined,
									isSaving,
									onClose,
									onCreateRequest,
									onSave,
									selectedValue,
									setSelectedValue,
									trimmedQuery,
								})
							}}
							placeholder={placeholder}
							className="lj:w-full lj:appearance-none lj:border-0 lj:bg-transparent lj:p-0 lj:text-sm lj:text-lj-c-strong lj:outline-none lj:ring-0 lj:shadow-none lj:placeholder:text-lj-c-hint-vivid"
						/>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="lj:rounded-md lj:p-1 lj:text-lj-c-hint-vivid lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
						aria-label={t('SELECT_DISMISS')}
					>
						<ObsidianIcon name="x" className="lj:size-4" />
					</button>
				</div>
			)}
			bodyClassName={PICKER_BODY_CLASS_NAME}
			footer={(
				<div className="lj:border-t lj:border-lj-alpha-10 lj:bg-lj-surf-inset lj:px-3 lj:py-3">
					<button
						type="button"
						disabled={!primaryAction.canAct}
						onClick={() => {
							if (primaryAction.mode === 'create' && onCreateRequest !== undefined) {
								onCreateRequest(trimmedQuery)
								return
							}
							const nextValue = canCreate ? trimmedQuery : selectedValue.trim()
							if (nextValue === '') {
								return
							}
							void onSave(nextValue)
						}}
						className="lj:flex lj:w-full lj:items-center lj:justify-center lj:gap-2 lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:px-6 lj:py-2 lj:text-sm lj:font-medium lj:text-lj-c-strong lj:shadow-sm lj:transition-colors lj:hover:bg-lj-alpha-3 lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						{isSaving ? (
							<span className="lj:inline-block lj:size-3.5 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
						) : (
							<ObsidianIcon name="plus" className="lj:size-4" />
						)}
						<span>{footerLabel}</span>
					</button>
				</div>
			)}
		>
			{filteredEntries.length > 0 ? (
				<div className="lj:flex lj:flex-col lj:gap-2">
					{filteredEntries.map((entry) => {
						const basename = getFileBasename(entry.file)
						const selected = basename === selectedValue
						const title = getPersistedEntryDisplayName(entry)
						const metadata = getEntryMetadata(app, entry)

						return (
							<div
								key={entry.file.path}
								role="button"
								tabIndex={0}
								aria-selected={selected}
								onClick={() => {
									setSelectedValue(basename)
									void onSave(basename)
								}}
								onKeyDown={(event) => {
									void handleRowKeyDown(event, basename, onSave, setSelectedValue)
								}}
								className={`lj:group lj:flex lj:w-full lj:flex-col lj:items-start lj:gap-2 lj:rounded-lg lj:px-3 lj:py-3.5 lj:text-left lj:transition-colors ${
									selected
										? 'lj:bg-lj-alpha-10'
										: 'lj:hover:bg-lj-alpha-5'
								}`}
								data-lj-active={selected ? 'true' : 'false'}
							>
								<div className={`lj:block lj:w-full lj:text-sm lj:font-medium lj:leading-[1.35] lj:transition-colors ${
									selected
										? 'lj:text-lj-c-accent'
										: 'lj:text-lj-c-strong group-hover:lj:text-lj-c-accent'
								}`}>
									{title}
								</div>
								<div className="lj:flex lj:min-h-[18px] lj:flex-wrap lj:items-center lj:gap-2 lj:leading-4">
									{metadata.datetime !== null && (
										<span className="lj:font-mono lj:text-[10px] lj:leading-4 lj:text-lj-c-hint-vivid">
											{metadata.datetime}
										</span>
									)}
									<div className="lj:flex lj:flex-wrap lj:items-center lj:gap-1">
										{metadata.tags.map((tag) => (
											<span
												key={tag}
												className="lj:rounded lj:bg-lj-alpha-5 lj:px-1.5 lj:py-0.5 lj:text-[9px] lj:leading-4 lj:text-lj-c-secondary"
											>
												#{tag}
											</span>
										))}
									</div>
								</div>
							</div>
						)
					})}
				</div>
			) : (
				<div className="lj:p-8 lj:text-center">
					<h3 className={`lj:text-sm lj:font-medium ${
						createValidationMessage === null
							? 'lj:text-lj-c-muted'
							: 'lj:text-lj-c-danger'
					}`}>
						{createHelperMessage}
					</h3>
				</div>
			)}
		</PickerModalShell>
	)
}

async function handleSearchInputKeyDown(
	event: KeyboardEvent<HTMLInputElement>,
	{
		canCreate,
		filteredEntries,
		hasSelectableEntryMatch,
		hasCreateRequest,
		isSaving,
		onClose,
		onCreateRequest,
		onSave,
		selectedValue,
		setSelectedValue,
		trimmedQuery,
	}: {
		canCreate: boolean
		filteredEntries: EntryWithName[]
		hasSelectableEntryMatch: boolean
		hasCreateRequest: boolean
		isSaving: boolean
		onClose: () => void
		onCreateRequest: ((inputValue: string) => void) | undefined
		onSave: (entryOptionValue: string) => Promise<void>
		selectedValue: string
		setSelectedValue: (value: string) => void
		trimmedQuery: string
	},
) {
	if (event.key === 'Escape') {
		event.preventDefault()
		onClose()
		return
	}

	if (event.key === 'ArrowDown') {
		event.preventDefault()
		selectAdjacentEntry(filteredEntries, selectedValue, 1, setSelectedValue)
		return
	}

	if (event.key === 'ArrowUp') {
		event.preventDefault()
		selectAdjacentEntry(filteredEntries, selectedValue, -1, setSelectedValue)
		return
	}

	if (event.key === 'Enter') {
		const primaryAction = resolvePickerPrimaryAction({
			canCreate,
			hasSelectableEntryMatch,
			hasCreateRequest,
			isSaving,
			selectedValue,
		})
		if (!primaryAction.canAct) {
			return
		}

		event.preventDefault()
		if (primaryAction.mode === 'create' && onCreateRequest !== undefined) {
			onCreateRequest(trimmedQuery)
			return
		}
		const nextValue = canCreate ? trimmedQuery : selectedValue.trim()
		if (nextValue.trim() === '') {
			return
		}
		await onSave(nextValue)
	}
}

function resolvePickerPrimaryAction({
	canCreate,
	hasSelectableEntryMatch,
	hasCreateRequest,
	isSaving,
	selectedValue,
}: {
	canCreate: boolean
	hasSelectableEntryMatch: boolean
	hasCreateRequest: boolean
	isSaving: boolean
	selectedValue: string
}) {
	if (isSaving) {
		return { canAct: false, mode: hasCreateRequest ? 'create' : 'save' } as const
	}

	if (hasCreateRequest) {
		if (hasSelectableEntryMatch) {
			return { canAct: true, mode: 'save' } as const
		}

		return { canAct: canCreate, mode: 'create' } as const
	}

	if (selectedValue.trim() !== '' || canCreate) {
		return { canAct: true, mode: 'save' } as const
	}

	return { canAct: false, mode: 'save' } as const
}

async function handleRowKeyDown(
	event: KeyboardEvent<HTMLDivElement>,
	value: string,
	onSave: (entryOptionValue: string) => Promise<void>,
	setSelectedValue: (value: string) => void,
) {
	if (event.key !== 'Enter' && event.key !== ' ') {
		return
	}

	event.preventDefault()
	setSelectedValue(value)
	await onSave(value)
}

function selectAdjacentEntry(
	entries: EntryWithName[],
	selectedValue: string,
	direction: -1 | 1,
	setSelectedValue: (value: string) => void,
) {
	if (entries.length === 0) {
		return
	}

	const currentIndex = entries.findIndex((entry) => getFileBasename(entry.file) === selectedValue)
	if (currentIndex === -1) {
		setSelectedValue(getFileBasename(entries[0]!.file))
		return
	}

	const nextIndex = Math.min(Math.max(currentIndex + direction, 0), entries.length - 1)
	setSelectedValue(getFileBasename(entries[nextIndex]!.file))
}

function getEntryMetadata(app: App, entry: EntryWithName) {
	return {
		datetime: formatEntryDatetime(entry),
		tags: getEntryTags(app, entry),
	}
}

function formatEntryDatetime(entry: EntryWithName) {
	const persistedCreated = getPersistedEntryCreated(entry.fm)
	if (persistedCreated !== null) {
		return persistedCreated.slice(0, 16).replace('T', '  ')
	}

	const ctime = entry.file.stat?.ctime
	if (typeof ctime !== 'number') {
		return null
	}

	const isoDatetime = buildIsoDatetimeInTimeZone(new Date(ctime), getCurrentTimeZoneSetting())
	return isoDatetime.slice(0, 16).replace('T', '  ')
}

function getEntryTags(app: App, entry: EntryWithName) {
	if (!(entry.file instanceof TFile)) {
		return []
	}

	const cache = app.metadataCache.getFileCache(entry.file)
	if (cache === null) {
		return []
	}

	const frontmatterTags: unknown = cache.frontmatter?.tags
	if (Array.isArray(frontmatterTags)) {
		return frontmatterTags.map((tag) => String(tag).replace(/^#/, ''))
	}

	const inlineTags = cache.tags
	if (Array.isArray(inlineTags)) {
		return inlineTags.map((tagCache) => tagCache.tag.replace(/^#/, ''))
	}

	return []
}

function resolveCreateValidationMessage(
	app: App,
	{
		entries,
		linkedEntries,
		inputValue,
	}: {
		entries: EntryWithName[]
		linkedEntries: EntryWithName[]
		inputValue: string
	},
) {
	if (inputValue.length === 0) {
		return null
	}

	const sanitizedValue = sanitizeObsidianFileName(inputValue)
	if (sanitizedValue.length === 0) {
		return t('DASHBOARD_ENTRY_FIELD_NAME_REQUIRED')
	}

	const normalizedValue = sanitizedValue.toLocaleLowerCase()
	const linkedEntry = linkedEntries.find((entry) => getFileBasename(entry.file).trim().toLocaleLowerCase() === normalizedValue)
	if (linkedEntry !== undefined) {
		return t('POSITION_DETAILS_CONTEXT_LINK_EXISTS', { name: getPersistedEntryDisplayName(linkedEntry) })
	}

	const existingEntry = entries.find((entry) => getFileBasename(entry.file).trim().toLocaleLowerCase() === normalizedValue)
	if (existingEntry !== undefined) {
		return t('DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE')
	}

	if (hasPersistedEntryBasenameConflict(app, '', sanitizedValue)) {
		return t('DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE')
	}

	return null
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('resolvePickerPrimaryAction', () => {
		it('keeps save mode for an existing selection under the create modal flow', () => {
			expect(resolvePickerPrimaryAction({
				canCreate: false,
				hasSelectableEntryMatch: true,
				hasCreateRequest: true,
				isSaving: false,
				selectedValue: 'existing-entry',
			})).toEqual({
				canAct: true,
				mode: 'save',
			})
		})

		it('falls back to create mode for a new free-text value', () => {
			expect(resolvePickerPrimaryAction({
				canCreate: true,
				hasSelectableEntryMatch: false,
				hasCreateRequest: true,
				isSaving: false,
				selectedValue: 'new-entry',
			})).toEqual({
				canAct: true,
				mode: 'create',
			})
		})

		it('preserves save mode when no create modal flow is provided', () => {
			expect(resolvePickerPrimaryAction({
				canCreate: false,
				hasSelectableEntryMatch: false,
				hasCreateRequest: false,
				isSaving: false,
				selectedValue: 'existing-entry',
			})).toEqual({
				canAct: true,
				mode: 'save',
			})
		})

		it('disables the footer when neither save nor create is possible', () => {
			expect(resolvePickerPrimaryAction({
				canCreate: false,
				hasSelectableEntryMatch: false,
				hasCreateRequest: true,
				isSaving: false,
				selectedValue: '',
			})).toEqual({
				canAct: false,
				mode: 'create',
			})
		})
	})
}
