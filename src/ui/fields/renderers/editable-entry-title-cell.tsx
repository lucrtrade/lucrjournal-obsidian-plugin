import { Notice, type App } from 'obsidian'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { syncRenamedDocumentTitle } from '../../../domains/core/entry-writer'
import { t } from '../../../lang/helpers'
import { buildRenamedEntryPath, sanitizeObsidianFileName } from '../../../utils'
import { IconView } from '../../primitives/icon-view'
import { ObsidianIcon } from '../../primitives/obsidian-icon'

import type { IconDescriptor } from '../../../domains'
import type { TFile } from 'obsidian'

export function EditableEntryTitleCell({
	app,
	file,
	icon,
	value,
}: {
	app: App
	file: TFile
	icon?: IconDescriptor
	value: string
}): ReactNode {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(value)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!isEditing) {
			return 
		}
		setDraft(value)
		const timer = window.setTimeout(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		}, 0)
		return () => window.clearTimeout(timer)
	}, [isEditing, value])

	const save = async () => {
		const nextValue = sanitizeObsidianFileName(draft)
		const currentValue = sanitizeObsidianFileName(value)
		if (nextValue === currentValue || nextValue === '') {
			setIsEditing(false)
			return
		}

		const nextPath = buildRenamedEntryPath(file, nextValue)
		if (nextPath === null) {
			setIsEditing(false)
			return
		}

		try {
			await app.fileManager.renameFile(file, nextPath)
			await syncRenamedDocumentTitle(app, file, nextValue)
		} catch {
			new Notice(t('DASHBOARD_META_ANALYSIS_UPDATE_FAILED'))
		}
		setIsEditing(false)
	}

	return isEditing ? (
		<div className="lj:px-1" onClick={(event) => event.stopPropagation()}>
			<div className="lj:flex lj:h-7 lj:items-center lj:gap-2 lj:rounded-md lj:border-0 lj:bg-lj-alpha-5 lj:px-2">
				{icon == null ? null : <IconView icon={icon} className="lj:size-3.5" />}
				<input
					ref={inputRef}
					type="text"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => {
						void save()
					}}
					onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
						if (event.key === 'Escape') {
							event.preventDefault()
							setDraft(value)
							setIsEditing(false)
						}
						if (event.key === 'Enter') {
							event.preventDefault()
							void save()
						}
					}}
					className="lj:min-w-0 lj:flex-1 lj:border-0 lj:bg-transparent lj:px-0 lj:py-0 lj:text-xs lj:text-lj-c-strong lj:outline-none lj:ring-0 lj:shadow-none lj:focus:border-0 lj:focus:ring-0 lj:focus-visible:border-0 lj:focus-visible:ring-0"
				/>
			</div>
		</div>
	) : (
		<div className="lj:group lj:relative lj:w-full lj:px-1">
			<div className="lj:flex lj:min-w-0 lj:items-center lj:gap-2 lj:pr-7 lj:text-lj-c-strong-soft lj:transition-colors group-hover:lj:text-lj-c-strong">
				{icon == null ? null : <IconView icon={icon} className="lj:size-3.5" />}
				<span className="lj:min-w-0 lj:flex-1 lj:truncate">{value.trim() === '' ? '-' : value}</span>
			</div>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					setIsEditing(true)
				}}
				title={t('DASHBOARD_ENTRY_COLUMN_TITLE')}
				aria-label={t('DASHBOARD_ENTRY_COLUMN_TITLE')}
				className="lj:absolute lj:right-0 lj:top-1/2 lj:inline-flex lj:-translate-y-1/2 lj:items-center lj:justify-center lj:rounded-md lj:border lj:border-transparent lj:p-1 lj:text-lj-c-hint lj:opacity-0 lj:transition-all lj:group-hover:opacity-100 lj:focus-visible:opacity-100 hover:lj:border-lj-alpha-10 hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong"
			>
				<ObsidianIcon name="pencil" className="lj:size-3.5" />
			</button>
		</div>
	)
}
