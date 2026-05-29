import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

interface EditableFrontmatterNumberCellProps {
	value: number | null | undefined
	formatDisplay: (value: number | null) => { text: string; valueClassName: string }
	onSave: (value: number | null) => Promise<void>
}

export function EditableFrontmatterNumberCell({
	value,
	formatDisplay,
	onSave,
}: EditableFrontmatterNumberCellProps): ReactNode {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(() => value == null ? '' : String(value))
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!isEditing) {
			return undefined
		}

		setDraft(value == null ? '' : String(value))
		const timer = window.setTimeout(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		}, 0)
		return () => window.clearTimeout(timer)
	}, [isEditing, value])

	const handleSave = async (nextDraft: string) => {
		const trimmed = nextDraft.trim()
		const previousValue = value == null ? '' : String(value)
		if (trimmed === previousValue) {
			return
		}

		if (trimmed === '') {
			await onSave(null)
			return
		}

		const parsedValue = Number(trimmed)
		if (!Number.isFinite(parsedValue)) {
			return
		}

		await onSave(parsedValue)
	}

	const handleBlur = () => {
		if (!isEditing) {
			return
		}

		setIsEditing(false)
		void handleSave(draft)
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		switch (event.key) {
			case 'Enter':
				event.preventDefault()
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
			<div className="lj:px-1" onClick={(event) => event.stopPropagation()}>
				<input
					ref={inputRef}
					type="text"
					className="lj:w-full lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2 lj:py-1 lj:text-xs lj:font-mono lj:text-lj-c-strong lj:shadow-sm lj:outline-none"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
				/>
			</div>
		)
	}

	const { text, valueClassName } = formatDisplay(value ?? null)
	return (
		<div className="lj:px-1">
			<div
				className={`lj:inline-flex lj:items-center lj:truncate lj:rounded-lg lj:border lj:border-transparent lj:px-2 lj:py-1 lj:transition-all lj:cursor-text lj:hover:border-lj-alpha-10 ${valueClassName}`}
				onClick={(event) => {
					event.stopPropagation()
					setIsEditing(true)
				}}
			>
				{text}
			</div>
		</div>
	)
}
