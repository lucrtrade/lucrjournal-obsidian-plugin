import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { rankAutocompleteOptions } from './autocomplete-match'
import { ObsidianIcon } from './obsidian-icon'

interface TokenOption {
	value: string
	label?: string
}

export function TokenInput({
	value,
	onChange,
	suggestions = [],
	placeholder,
	autoFocus = false,
	onEscape,
	normalizeValue,
	normalizeOptions,
	maxTokens,
	compact = false,
	borderless = false,
	onQueryChange,
	onInvalidQueryChange,
	invalidMessage,
}: {
	value: string[]
	onChange: (value: string[]) => void
	suggestions?: readonly TokenOption[]
	placeholder?: string
	autoFocus?: boolean
	onEscape?: () => void
	normalizeValue: (value: string) => string
	normalizeOptions: (options: readonly TokenOption[]) => TokenOption[]
	maxTokens?: number
	compact?: boolean
	borderless?: boolean
	onQueryChange?: (query: string) => void
	onInvalidQueryChange?: (isInvalid: boolean) => void
	invalidMessage?: string
}): ReactNode {
	const [query, setQuery] = useState('')
	const [isOpen, setIsOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listboxId = useRef(`lj-token-input-${Math.random().toString(36).slice(2)}`)
	const normalizedTokens = useMemo(
		() => dedupeNormalizedValues(value, normalizeValue, maxTokens),
		[value, normalizeValue, maxTokens],
	)
	const normalizedTokenKeys = useMemo(
		() => new Set(normalizedTokens.map((token) => normalizeValue(token).toLowerCase())),
		[normalizedTokens, normalizeValue],
	)
	const normalizedSuggestions = useMemo(() => normalizeOptions(suggestions), [suggestions, normalizeOptions])
	const visibleSuggestions = useMemo(() => {
		return rankAutocompleteOptions(
			normalizedSuggestions.filter((option) => !normalizedTokenKeys.has(normalizeValue(option.value).toLowerCase())),
			query,
			normalizeValue,
		).slice(0, 8)
	}, [normalizedSuggestions, normalizedTokenKeys, normalizeValue, query])
	const hasInvalidQuery = query.trim() !== '' && normalizeValue(query) === ''

	useEffect(() => {
		if (!autoFocus) {
			return
		}

		const timer = window.setTimeout(() => {
			inputRef.current?.focus()
		}, 0)
		return () => window.clearTimeout(timer)
	}, [autoFocus])

	useEffect(() => {
		setActiveIndex(0)
	}, [query])

	useEffect(() => {
		if (activeIndex < visibleSuggestions.length) {
			return
		}

		setActiveIndex(0)
	}, [activeIndex, visibleSuggestions.length])

	useEffect(() => {
		onInvalidQueryChange?.(hasInvalidQuery)
	}, [hasInvalidQuery, onInvalidQueryChange])

	const updateQuery = (nextQuery: string) => {
		setQuery(nextQuery)
		onQueryChange?.(nextQuery)
	}

	const appendToken = (rawValue: string) => {
		const normalizedToken = normalizeValue(rawValue)
		if (normalizedToken === '') {
			return false
		}

		if (maxTokens === 1) {
			onChange([normalizedToken])
			updateQuery('')
			return true
		}

		if (normalizedTokenKeys.has(normalizedToken.toLowerCase())) {
			updateQuery('')
			return true
		}

		onChange(dedupeNormalizedValues([...normalizedTokens, normalizedToken], normalizeValue, maxTokens))
		updateQuery('')
		return true
	}

	const removeToken = (tokenToRemove: string) => {
		onChange(normalizedTokens.filter((token) => token !== tokenToRemove))
	}

	return (
		<div className="lj:relative">
			<div
				className={[
					'lj:flex lj:items-center lj:gap-1.5 lj:rounded-md',
					borderless ? 'lj:border-0 lj:bg-lj-alpha-5' : 'lj:border lj:bg-lj-alpha-5',
					hasInvalidQuery ? 'lj:border-lj-c-danger' : 'lj:border-lj-alpha-10',
					compact && !borderless ? 'lj:shadow-sm' : undefined,
					compact
						? 'lj-scrollbar-hidden lj:h-7 lj:flex-nowrap lj:overflow-x-auto lj:px-2 lj:py-1'
						: 'lj:min-h-10 lj:flex-wrap lj:px-2.5 lj:py-2',
				].join(' ')}
				onClick={() => {
					setIsOpen(true)
					inputRef.current?.focus()
				}}
			>
				{normalizedTokens.map((token) => (
					<span key={token} className={[
						'lj:inline-flex lj:max-w-full lj:items-center lj:gap-1 lj:rounded-full lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:text-[11px] lj:text-lj-c-secondary',
						compact ? 'lj:shrink-0 lj:px-1.5 lj:py-0.5' : 'lj:px-2 lj:py-1',
					].join(' ')}>
						<span className="lj:truncate">{token}</span>
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation()
								removeToken(token)
							}}
							className="lj:inline-flex lj:size-3.5 lj:items-center lj:justify-center lj:rounded-full lj:text-lj-c-hint lj:transition-colors hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong"
						>
							<ObsidianIcon name="x" className="lj:size-3" />
						</button>
					</span>
				))}
				<input
					ref={inputRef}
					type="text"
					value={query}
					role="combobox"
					aria-expanded={isOpen && visibleSuggestions.length > 0}
					aria-controls={listboxId.current}
					aria-activedescendant={isOpen && visibleSuggestions[activeIndex] !== undefined ? `${listboxId.current}-${activeIndex}` : undefined}
					onChange={(event) => {
						updateQuery(event.target.value)
						setIsOpen(true)
					}}
					onFocus={() => setIsOpen(true)}
					onBlur={() => {
						window.setTimeout(() => {
							setIsOpen(false)
						}, 100)
					}}
					onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
						if (event.key === 'Escape') {
							if (isOpen && visibleSuggestions.length > 0) {
								event.preventDefault()
								setIsOpen(false)
								return
							}

							event.preventDefault()
							onEscape?.()
							return
						}

						if (event.key === 'Backspace' && query === '' && normalizedTokens.length > 0) {
							event.preventDefault()
							const previousToken = normalizedTokens[normalizedTokens.length - 1]!
							removeToken(previousToken)
							updateQuery(previousToken)
							setIsOpen(true)
							return
						}

						if (event.key === 'ArrowDown') {
							if (visibleSuggestions.length === 0) {
								return
							}
							event.preventDefault()
							setIsOpen(true)
							setActiveIndex((currentIndex) => Math.min(currentIndex + 1, visibleSuggestions.length - 1))
							return
						}

						if (event.key === 'ArrowUp') {
							if (visibleSuggestions.length === 0) {
								return
							}
							event.preventDefault()
							setIsOpen(true)
							setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0))
							return
						}

						if (event.key === ',' || event.key === 'Enter') {
							if (query.trim() === '') {
								return
							}
							event.preventDefault()
							const nextValue = isOpen && visibleSuggestions[activeIndex] !== undefined
								? visibleSuggestions[activeIndex].value
								: query
							const didAppend = appendToken(nextValue)
							if (didAppend) {
								setIsOpen(false)
							}
							return
						}

						if (event.key === 'Tab') {
							if (!isOpen || visibleSuggestions[activeIndex] === undefined) {
								return
							}
							event.preventDefault()
							const didAppend = appendToken(visibleSuggestions[activeIndex].value)
							if (didAppend) {
								setIsOpen(false)
							}
						}
					}}
					placeholder={normalizedTokens.length === 0 ? placeholder : undefined}
					className={[
						'lj:flex-1 lj:border-0 lj:bg-transparent lj:px-0 lj:py-0 lj:text-[13px] lj:text-lj-c-strong lj:outline-none lj:ring-0 lj:shadow-none lj:focus:border-0 lj:focus:ring-0 lj:focus-visible:border-0 lj:focus-visible:ring-0 lj:placeholder:text-lj-c-hint-faint',
						compact ? 'lj:min-w-20' : 'lj:min-w-24',
					].join(' ')}
				/>
			</div>
			{hasInvalidQuery && invalidMessage !== undefined ? (
				<div className="lj:mt-1 lj:px-1 lj:text-[11px] lj:text-lj-c-danger">
					{invalidMessage}
				</div>
			) : null}
			{isOpen && visibleSuggestions.length > 0 && (
				<div
					id={listboxId.current}
					role="listbox"
					className="lj:absolute lj:left-0 lj:right-0 lj:top-full lj:z-40 lj:mt-1 lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:p-1 lj:shadow-xl"
				>
					{visibleSuggestions.map((suggestion, index) => (
						<button
							key={suggestion.value}
							id={`${listboxId.current}-${index}`}
							role="option"
							aria-selected={index === activeIndex}
							type="button"
							onMouseDown={(event) => {
								event.preventDefault()
								event.stopPropagation()
								const didAppend = appendToken(suggestion.value)
								if (didAppend) {
									setIsOpen(false)
								}
							}}
							onMouseEnter={() => setActiveIndex(index)}
							className={[
								'lj:flex lj:w-full lj:items-center lj:justify-between lj:rounded-lg lj:px-2.5 lj:py-2 lj:text-left lj:text-xs lj:transition-colors',
								index === activeIndex
									? 'lj:bg-lj-alpha-5 lj:text-lj-c-strong'
									: 'lj:text-lj-c-secondary hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong',
							].join(' ')}
						>
							<span className="lj:truncate">{suggestion.label ?? suggestion.value}</span>
							<ObsidianIcon name="corner-down-left" className="lj:size-3 lj:shrink-0 lj:text-lj-c-hint" />
						</button>
					))}
				</div>
			)}
		</div>
	)
}

function dedupeNormalizedValues(
	values: string[],
	normalizeValue: (value: string) => string,
	maxTokens?: number,
): string[] {
	const dedupedValues: string[] = []
	const seen = new Set<string>()

	for (const value of values) {
		const normalizedValue = normalizeValue(value)
		if (normalizedValue === '') {
			continue
		}

		const dedupeKey = normalizedValue.toLowerCase()
		if (seen.has(dedupeKey)) {
			continue
		}

		seen.add(dedupeKey)
		dedupedValues.push(normalizedValue)
	}

	return maxTokens == null ? dedupedValues : dedupedValues.slice(-maxTokens)
}
