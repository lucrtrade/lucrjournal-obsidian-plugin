import { TFile, type App } from 'obsidian'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { PositionDomain } from '../../../domains'

import type { DomainPersistedEntry } from '../../../domains/core/type'
import type { Position } from '../../../domains/position'

interface EditablePositionNumberCellProps {
	app: App
	row: DomainPersistedEntry<Position>
	fieldKey: 'profit' | 'notional_value' | 'risk'
	value: number | string | null | undefined
	formatDisplay: (value: number | null) => { text: string; valueClassName: string }
}

export function EditablePositionNumberCell({
	app,
	row,
	fieldKey,
	value,
	formatDisplay,
}: EditablePositionNumberCellProps): ReactNode {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(() => value == null ? '' : String(value))
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (isEditing) {
			setDraft(value == null ? '' : String(value))
			const timer = window.setTimeout(() => {
				if (inputRef.current) {
					inputRef.current.focus()
					inputRef.current.select()
				}
			}, 0)
			return () => window.clearTimeout(timer)
		}
		return undefined
	}, [isEditing, value])

	const handleSave = async (newValue: string) => {
		const trimmed = newValue.trim()
		const oldValueStr = value == null ? '' : String(value)
		if (trimmed === oldValueStr) {
			return
		}

		const numericValue = trimmed === '' ? null : parseFloat(trimmed)

		// eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- Explicit type assertion needed for isNaN check
		if (trimmed !== '' && isNaN(numericValue as number)) {
			return
		}
		if (!(row.file instanceof TFile)) {
			return
		}

		await PositionDomain.updateFields(app, row.file, {
			[fieldKey]: numericValue,
		})
	}

	// @story [[lucrjournal/fields#^position-cell-writeback]] Commits finite numeric or null position patches through the domain writer
	// @story [[lucrjournal/fields#^writeback-failure-state]] Leaves edit mode before awaiting position number writeback
	const handleBlur = () => {
		if (isEditing) {
			setIsEditing(false)
			void handleSave(draft)
		}
	}

	const handleKeyDown = (e: KeyboardEvent) => {
		switch (e.key) {
			case 'Enter':
				e.preventDefault()
				handleBlur()
				break
			case 'Escape':
				setIsEditing(false)
				setDraft(value == null ? '' : String(value))
				break
			default:
				break
		}
	}

	if (isEditing) {
		return (
			<div className="lj:px-1" onClick={(e) => e.stopPropagation()}>
				<input
					ref={inputRef}
					type="text"
					className="lj:w-full lj:bg-lj-alpha-5 lj:border lj:border-lj-alpha-10 lj:rounded-md lj:outline-none lj:px-2 lj:py-1 lj:text-xs lj:font-mono lj:text-lj-c-strong lj:shadow-sm"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
				/>
			</div>
		)
	}

	const numValue = value == null ? null : (typeof value === 'string' ? parseFloat(value) : value)
	// eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- Explicit type assertion needed for isNaN check
	const { text, valueClassName } = formatDisplay(isNaN(numValue as number) ? null : numValue)

	return (
		<div className="lj:px-1">
			<div
				className={`lj:inline-flex lj:items-center lj:py-1 lj:px-2 lj:truncate lj:cursor-text lj:border lj:border-transparent lj:hover:border-lj-alpha-10 lj:rounded-lg lj:transition-all ${valueClassName}`}
				onClick={(e) => {
					e.stopPropagation()
					setIsEditing(true)
				}}
			>
				{text}
			</div>
		</div>
	)
}
