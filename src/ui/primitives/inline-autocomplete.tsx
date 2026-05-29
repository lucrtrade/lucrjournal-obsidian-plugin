import { useState, useEffect, useId } from 'react'

import { rankAutocompleteStrings } from './autocomplete-match'

import type { KeyboardEvent } from 'react'

type InlineAutocompleteProps = {
	options: string[]
	value: string
	onChange: (value: string) => void
	onCommit?: (value: string) => void
	placeholder?: string
	className?: string
	normalizeValue?: (value: string) => string
}

export function InlineAutocomplete({
	options,
	value,
	onChange,
	onCommit,
	placeholder,
	className,
	normalizeValue = defaultNormalizeInlineAutocompleteValue,
}: InlineAutocompleteProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState(0)
	const [draft, setDraft] = useState(value)
	const uid = useId()
	const anchorName = `--lj-ac-${uid.replace(/:/g, '')}`

	useEffect(() => {
		setDraft(value)
	}, [value])

	const filtered = rankAutocompleteStrings(options, draft, normalizeValue)

	useEffect(() => {
		setActiveIndex(0)
	}, [draft])

	useEffect(() => {
		if (activeIndex < filtered.length) {
			return
		}

		setActiveIndex(0)
	}, [activeIndex, filtered.length])

	const select = (opt: string) => {
		setDraft(opt)
		onChange(opt)
		onCommit?.(opt)
		setIsOpen(false)
	}

	const commitDraft = () => {
		onChange(draft)
		onCommit?.(draft)
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!isOpen) {
			if (event.key === 'ArrowDown') {
				if (filtered.length === 0) {
					return
				}
				setIsOpen(true)
				event.preventDefault()
				return
			}

			if (event.key === 'Enter') {
				event.preventDefault()
				commitDraft()
			}
			return
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1))
				break
			case 'ArrowUp':
				event.preventDefault()
				setActiveIndex((prev) => Math.max(prev - 1, 0))
				break
			case 'Enter':
				event.preventDefault()
				if (filtered[activeIndex] !== undefined) {
					select(filtered[activeIndex])
				} else {
					commitDraft()
					setIsOpen(false)
				}
				break
			case 'Tab':
				if (filtered[activeIndex] === undefined) {
					return
				}
				event.preventDefault()
				select(filtered[activeIndex])
				break
			case 'Escape':
				event.preventDefault()
				setIsOpen(false)
				break
			default:
				break
		}
	}

	return (
		<>
			<input
				type="text"
				style={{ anchorName }}
				className={className ?? 'lj:w-full lj:min-w-0 lj:border-none lj:bg-transparent lj:font-inherit lj:text-inherit lj:outline-none lj:placeholder:text-lj-c-hint'}
				placeholder={placeholder}
				value={draft}
				onChange={(event) => {
					const nextValue = event.target.value
					setDraft(nextValue)
					onChange(nextValue)
					setIsOpen(true)
				}}
				onFocus={() => setIsOpen(true)}
				onBlur={() => {
					commitDraft()
					window.setTimeout(() => setIsOpen(false), 100)
				}}
				onKeyDown={handleKeyDown}
			/>

			{isOpen && filtered.length > 0 && (
				<div
					style={{
						position: 'fixed',
						positionAnchor: anchorName,
						top: 'calc(anchor(bottom) + 4px)',
						left: 'anchor(left)',
						minWidth: 'anchor-size(width)',
						maxWidth: '320px',
					}}
					className="lj:z-[9999] lj:max-h-[200px] lj:overflow-y-auto lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:py-1 lj:shadow-lg"
					onMouseDown={(event) => event.preventDefault()}
				>
					{filtered.map((opt, index) => (
						<div
							key={opt}
							onMouseDown={() => select(opt)}
							onMouseEnter={() => setActiveIndex(index)}
							className={`lj:cursor-pointer lj:px-3 lj:py-1.5 lj:text-sm lj:transition-colors ${
								index === activeIndex
									? 'lj:bg-lj-alpha-5 lj:text-lj-c-strong'
									: 'lj:text-lj-c-secondary hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong'
							}`}
						>
							{opt}
						</div>
					))}
				</div>
			)}
		</>
	)
}

function defaultNormalizeInlineAutocompleteValue(value: string): string {
	return value.trim()
}
