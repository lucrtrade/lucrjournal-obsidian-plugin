import { Notice, TFile, type App } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { AccountDomain } from '../../../domains'
import { t } from '../../../lang/helpers'
import { ObsidianIcon } from '../../primitives/obsidian-icon'

export function EditableAccountNameCell({
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
		const nextValue = draft.trim()
		if (nextValue === value.trim()) {
			setIsEditing(false)
			return
		}

		const accountEntry = AccountDomain.totalEntries(app)
			.find((entry) => entry.file instanceof TFile && entry.file.path === file.path)
		if (accountEntry === undefined) {
			new Notice(t('DASHBOARD_SETTINGS_ACCOUNT_UPDATE_FAILED'))
			setIsEditing(false)
			return
		}

		try {
			await AccountDomain.updateAccountSettings(app, accountEntry, {
				name: nextValue,
			})
			setIsEditing(false)
		} catch (error) {
			const errorMessageKey = AccountDomain.toCreateEntryErrorMessageKey(error)
			new Notice(errorMessageKey == null ? t('DASHBOARD_SETTINGS_ACCOUNT_UPDATE_FAILED') : t(errorMessageKey))
			setIsEditing(false)
		}
	}

	return isEditing ? (
		<div className="lj:px-1" onClick={(event) => event.stopPropagation()}>
			<input
				ref={inputRef}
				type="text"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					void save()
				}}
				onKeyDown={(event) => {
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
				className="lj:w-full lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2 lj:py-1 lj:text-xs lj:text-lj-c-strong lj:outline-none lj:shadow-sm"
			/>
		</div>
	) : (
		<div className="lj:group lj:relative lj:w-full lj:px-1">
			<div className="lj:min-w-0 lj:pr-7 lj:text-lj-c-strong-soft lj:transition-colors group-hover:lj:text-lj-c-strong">
				<span className="lj:block lj:min-w-0 lj:truncate">{value.trim() === '' ? '-' : value}</span>
			</div>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					setIsEditing(true)
				}}
				title={t('DASHBOARD_SETTINGS_ACCOUNT_NAME_LABEL')}
				aria-label={t('DASHBOARD_SETTINGS_ACCOUNT_NAME_LABEL')}
				className="lj:absolute lj:right-0 lj:top-1/2 lj:inline-flex lj:-translate-y-1/2 lj:items-center lj:justify-center lj:rounded-md lj:border lj:border-transparent lj:p-1 lj:text-lj-c-hint lj:opacity-0 lj:transition-all lj:group-hover:opacity-100 lj:focus-visible:opacity-100 hover:lj:border-lj-alpha-10 hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong"
			>
				<ObsidianIcon name="pencil" className="lj:size-3.5" />
			</button>
		</div>
	)
}
