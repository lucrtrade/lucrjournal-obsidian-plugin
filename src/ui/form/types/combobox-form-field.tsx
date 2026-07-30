/// <reference types="vitest/importMeta" />

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { IconView } from '../../primitives/icon-view'
import { ObsidianIcon } from '../../primitives/obsidian-icon'

import type { FormTypeRenderer } from './index'

// anchor-name / position-anchor are not yet in csstype — extend locally
type AnchorCSSProperties = CSSProperties & {
	anchorName?: string
	positionAnchor?: string
}

export const ComboboxFormFieldRenderer: FormTypeRenderer<'combobox'> = ({
	options,
	value,
	onChange,
	valueIcon,
	placeholder,
	noResultsLabel,
	classNames,
}) => {
	const [isOpen, setIsOpen] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [query, setQuery] = useState('')
	const [activeIndex, setActiveIndex] = useState(0)
	const containerRef = useRef<HTMLDivElement>(null)
	const uid = useId()
	const anchorName = `--lj-cb-${uid.replace(/:/g, '')}`
	const trimmedValue = value.trim()
	const selectedOption = options.find((option) => option.value === trimmedValue) ?? null
	const displayValue = isEditing && query !== '' ? query : value
	const normalizedQuery = query.trim().toLowerCase()
	// @story [[lucrjournal/form#^combobox-freeform-draft]] Filters generic options by normalized label substring
	const filteredOptions = normalizedQuery === ''
		? options
		: options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
	const helperSearch = query.trim() === '' ? value : query
	const helperSearchNormalized = helperSearch.trim().toLowerCase()
	const helperMatchCount = helperSearchNormalized === ''
		? options.length
		: options.filter((option) => option.label.toLowerCase().includes(helperSearchNormalized)).length
	const leadingIcon = selectedOption?.icon ?? valueIcon
	const hasLeadingIcon = leadingIcon !== undefined
	const displayState = resolveComboboxDisplayState(
		isOpen,
		helperSearch,
		filteredOptions.length,
		helperMatchCount,
		selectedOption !== null,
		noResultsLabel,
	)

	useEffect(() => {
		setActiveIndex(0)
	}, [query, value])

	useEffect(() => {
		if (!isEditing || query === '') {
			return
		}

		setQuery(value)
	}, [isEditing, query, value])

	useEffect(() => {
		if (!isEditing) {
			setQuery('')
		}
	}, [isEditing, value])

	useEffect(() => {
		if (!isOpen) {
			return
		}

		const handleClick = (event: MouseEvent) => {
			if (containerRef.current?.contains(event.target as Node)) {
				return
			}

			// @story [[lucrjournal/form#^combobox-close-keeps-draft]] Closes on outside click without reverting the emitted form value
			setIsOpen(false)
			setIsEditing(false)
		}

		activeDocument.addEventListener('click', handleClick)
		return () => activeDocument.removeEventListener('click', handleClick)
	}, [isOpen])

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// @story [[lucrjournal/form#^combobox-open-key]] Opens a closed combobox before any option can be committed
		if (!isOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
			setIsOpen(true)
			setIsEditing(true)
			return
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				setActiveIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev))
				break
			case 'ArrowUp':
				event.preventDefault()
				setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0))
				break
			case 'Enter':
				if (isOpen && filteredOptions[activeIndex] !== undefined) {
					// @story [[lucrjournal/form#^combobox-option-commit]] Commits the active option and clears local editing state
					event.preventDefault()
					onChange(filteredOptions[activeIndex].value)
					setIsOpen(false)
					setIsEditing(false)
					setQuery('')
				}
				break
			case 'Escape':
				if (isOpen) {
					// @story [[lucrjournal/form#^combobox-close-keeps-draft]] Closes without restoring the value already emitted while typing
					event.preventDefault()
					setIsOpen(false)
					setIsEditing(false)
					setQuery('')
				}
				break
			default:
				break
		}
	}

	const panelStyle: AnchorCSSProperties = {
		position: 'fixed',
		positionAnchor: anchorName,
		top: 'calc(anchor(bottom) + 8px)',
		left: 'anchor(left)',
		width: 'anchor-size(width)',
		zIndex: 9999,
	}

	return (
		<div
			className="lj:relative"
			ref={containerRef}
			style={{ anchorName }}
		>
			<div className="lj:relative">
				{leadingIcon !== undefined && (
					<div className="lj:pointer-events-none lj:absolute lj:left-3 lj:top-1/2 lj:-translate-y-1/2">
						<IconView icon={leadingIcon} />
					</div>
				)}
				<input
					type="text"
					value={displayValue}
					onChange={(event) => {
						// @story [[lucrjournal/form#^combobox-freeform-draft]] Emits raw input while filtering labels with its normalized query
						const nextQuery = event.target.value
						setQuery(nextQuery)
						setIsEditing(true)
						onChange(nextQuery)
						setIsOpen(true)
					}}
					onFocus={() => {
						setIsOpen(true)
						setIsEditing(true)
					}}
					onBlur={() => {
						// @story [[lucrjournal/form#^combobox-close-keeps-draft]] Clears local editing state without reverting the emitted form value
						window.setTimeout(() => {
							if (containerRef.current?.contains(activeDocument.activeElement)) {
								return
							}

							setIsOpen(false)
							setIsEditing(false)
							setQuery('')
						}, 100)
					}}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					className={`${classNames?.comboboxInput ?? classNames?.input ?? ''} ${hasLeadingIcon ? 'lj:pl-10' : ''}`.trim()}
					role="combobox"
					aria-expanded={isOpen}
					aria-autocomplete="list"
				/>
				<div className="lj:pointer-events-none lj:absolute lj:right-3 lj:top-1/2 lj:-translate-y-1/2">
					<ObsidianIcon
						name="chevron-down"
						className={`lj:size-4 lj:text-lj-c-hint-vivid lj:transition-transform ${isOpen ? 'lj:rotate-180' : ''}`}
					/>
				</div>
			</div>

			{displayState.showPanel && (
				<div style={panelStyle} className={classNames?.comboboxPanel}>
					{filteredOptions.map((option, index) => {
						const selected = option.value === value
						const active = index === activeIndex

						return (
							<button
								key={option.value}
								type="button"
								onMouseEnter={() => setActiveIndex(index)}
								onClick={() => {
									// @story [[lucrjournal/form#^combobox-option-commit]] Commits clicked options and clears local editing state
									onChange(option.value)
									setIsOpen(false)
									setIsEditing(false)
									setQuery('')
								}}
								className={active || selected ? classNames?.comboboxActiveOption : classNames?.comboboxOption}
							>
								{option.icon !== undefined && <IconView icon={option.icon} />}
								<span className="lj:min-w-0 lj:flex-1 lj:truncate">{option.label}</span>
							</button>
						)
					})}
				</div>
			)}

			{displayState.showInlineHelper && (
				<div className="lj:mt-1 lj:text-right">
					<span className={classNames?.comboboxEmptyState ?? 'lj:text-[11px] lj:text-lj-c-hint-vivid'}>
						{noResultsLabel}
					</span>
				</div>
			)}
		</div>
	)
}

// @story [[lucrjournal/form#^combobox-empty-helper]] Keeps no-match copy visible without rendering an empty option panel
function resolveComboboxDisplayState(
	isOpen: boolean,
	helperSearch: string,
	panelOptionCount: number,
	helperMatchCount: number,
	hasSelectedOption: boolean,
	noResultsLabel?: string,
) {
	return {
		showPanel: isOpen && panelOptionCount > 0,
		showInlineHelper: helperSearch.trim().length > 0
			&& helperMatchCount === 0
			&& !hasSelectedOption
			&& noResultsLabel !== undefined,
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('resolveComboboxDisplayState', () => {
		// @story [[lucrjournal/form#^combobox-empty-helper]] Covers the open no-match helper state
		it('shows inline helper instead of an empty panel when there are no matches', () => {
			expect(resolveComboboxDisplayState(true, 'NNNN', 0, 0, false, 'No matching account')).toEqual({
				showPanel: false,
				showInlineHelper: true,
			})
		})

		// @story [[lucrjournal/form#^combobox-empty-helper]] Covers helper persistence after the panel closes
		it('keeps inline helper visible after the combobox closes', () => {
			expect(resolveComboboxDisplayState(false, 'NNNN', 0, 0, false, 'No matching account')).toEqual({
				showPanel: false,
				showInlineHelper: true,
			})
		})

		it('keeps the option panel for real matches', () => {
			expect(resolveComboboxDisplayState(true, 'N', 1, 1, false, 'No matching account')).toEqual({
				showPanel: true,
				showInlineHelper: false,
			})
		})
	})
}
