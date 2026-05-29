/// <reference types="vitest/importMeta" />

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { resolveSymbolInfo } from '../../../domains/symbol/catalog'
import { resolveCurrentTradingViewRequester } from '../../../domains/symbol/metadata'
import { findBuiltinSymbolSuggestions, findSymbolSuggestions, type SymbolSuggestion } from '../../../domains/symbol/suggestions'
import { EnumBadge } from '../../fields/renderers/enum-badge'
import { IconView } from '../../primitives/icon-view'
import { ObsidianIcon } from '../../primitives/obsidian-icon'
import { SymbolIcon } from '../../primitives/symbol-icon'

import type { FormTypeRenderer } from './index'
import type { PositionSymbolType } from '../../../domains'
import type { SelectOption } from '../../../domains/core/form'

type AnchorCSSProperties = CSSProperties & {
	anchorName?: string
	positionAnchor?: string
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

type SuggestionRow = {
	value: string
	label: string
	logo: string | null
	typeOption?: SelectOption
	source: 'journal' | 'available'
}

type SuggestionSection = {
	key: 'journal' | 'available'
	headerKey: 'POSITION_SYMBOL_SECTION_JOURNAL' | 'POSITION_SYMBOL_SECTION_AVAILABLE'
	rows: SuggestionRow[]
}

type JournalSymbolOption = SelectOption & {
	symbolType?: PositionSymbolType | null
}

export const SymbolComboboxFormFieldRenderer: FormTypeRenderer<'symbol_combobox'> = ({
	value,
	field,
	options,
	onChange,
	placeholder,
	localize,
	classNames,
	valueIcon,
	noResultsLabel,
}) => {
	const [query, setQuery] = useState('')
	const [isOpen, setIsOpen] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [activeIndex, setActiveIndex] = useState(0)
	const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([])
	const containerRef = useRef<HTMLDivElement>(null)
	const debounceRef = useRef<number | null>(null)
	const seqRef = useRef(0)
	const uid = useId()
	const anchorName = `--lj-symbol-cb-${uid.replace(/:/g, '')}`
	const displayValue = resolveSymbolComboboxDisplayValue(isEditing, query, value)
	const typeOptions = field.options ?? []
	const sections = buildSuggestionSections(displayValue, options, suggestions, localize, typeOptions)
	const rows = sections.flatMap((section) => section.rows)
	const activeRow = rows[activeIndex]
	const selectedOption = options.find((option) => option.value === value) ?? null
	const leadingIcon = resolveSymbolComboboxLeadingIcon(displayValue, options, suggestions, valueIcon)
	const selectedTypeOption = resolveSymbolComboboxTypeOption(displayValue, options, suggestions, typeOptions)
	const displayState = resolveSymbolComboboxDisplayState(
		isOpen,
		query || value,
		rows.length,
		selectedOption !== null,
		noResultsLabel,
	)

	useEffect(() => () => {
		if (debounceRef.current !== null) {
			window.clearTimeout(debounceRef.current)
		}
	}, [])

	useEffect(() => {
		setActiveIndex(0)
	}, [query, value, suggestions])

	useEffect(() => {
		if (!isOpen) {
			return
		}

		const handleClick = (event: MouseEvent) => {
			if (containerRef.current?.contains(event.target as Node)) {
				return
			}

			setIsOpen(false)
			setIsEditing(false)
			setQuery('')
		}

		activeDocument.addEventListener('click', handleClick)
		return () => activeDocument.removeEventListener('click', handleClick)
	}, [isOpen])

	const triggerSearch = (input: string) => {
		if (debounceRef.current !== null) {
			window.clearTimeout(debounceRef.current)
		}

		debounceRef.current = window.setTimeout(() => {
			void runSearch(input)
		}, DEBOUNCE_MS)
	}

	const runSearch = async (input: string) => {
		const trimmedInput = input.trim()
		if (trimmedInput.length < MIN_QUERY_LENGTH) {
			setSuggestions([])
			return
		}

		const seq = seqRef.current + 1
		seqRef.current = seq
		const journalSymbols = new Set(options.map((option) => option.value.toUpperCase()))
		setSuggestions(findBuiltinSymbolSuggestions(trimmedInput, journalSymbols))
		const nextSuggestions = await findSymbolSuggestions(trimmedInput, resolveCurrentTradingViewRequester(), journalSymbols)
		if (seqRef.current === seq) {
			setSuggestions(nextSuggestions)
		}
	}

	const chooseRow = (row: SuggestionRow) => {
		onChange(row.value)
		setIsOpen(false)
		setIsEditing(false)
		setQuery('')
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!isOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
			setIsOpen(true)
			setIsEditing(true)
			setQuery(displayValue)
			triggerSearch(displayValue)
			return
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				setActiveIndex((prev) => Math.min(prev + 1, Math.max(rows.length - 1, 0)))
				break
			case 'ArrowUp':
				event.preventDefault()
				setActiveIndex((prev) => Math.max(prev - 1, 0))
				break
			case 'Enter':
				if (isOpen && activeRow !== undefined) {
					event.preventDefault()
					chooseRow(activeRow)
				}
				break
			case 'Escape':
				if (isOpen) {
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
		<div className="lj:relative" ref={containerRef} style={{ anchorName }}>
			<div className="lj:relative">
				<div className="lj:pointer-events-none lj:absolute lj:left-3 lj:top-1/2 lj:-translate-y-1/2">
					{leadingIcon === undefined
						? <SymbolIcon logo={null} className="lj:size-4" />
						: <IconView icon={leadingIcon} className="lj:size-4" />}
				</div>
				<input
					type="text"
					value={displayValue}
					onChange={(event) => {
						const nextQuery = event.target.value
						setQuery(nextQuery)
						setIsEditing(true)
						onChange(nextQuery)
						setIsOpen(true)
						triggerSearch(nextQuery)
					}}
					onFocus={() => {
						setIsOpen(true)
						setIsEditing(true)
						setQuery(displayValue)
						triggerSearch(displayValue)
					}}
					onBlur={() => {
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
					className={`${classNames?.comboboxInput ?? classNames?.input ?? ''} lj:pl-10`.trim()}
					style={selectedTypeOption === undefined ? undefined : { paddingRight: '9rem' }}
					role="combobox"
					aria-expanded={isOpen}
					aria-autocomplete="list"
				/>
				{selectedTypeOption !== undefined && (
					<div className="lj:pointer-events-none lj:absolute lj:right-10 lj:top-1/2 lj:-translate-y-1/2">
						<EnumBadge option={selectedTypeOption} variant="side" />
					</div>
				)}
				<div className="lj:pointer-events-none lj:absolute lj:right-3 lj:top-1/2 lj:-translate-y-1/2">
					<ObsidianIcon
						name="chevron-down"
						className={`lj:size-4 lj:text-lj-c-hint-vivid lj:transition-transform ${isOpen ? 'lj:rotate-180' : ''}`}
					/>
				</div>
			</div>

			{displayState.showPanel && (
				<div style={panelStyle} className={classNames?.comboboxPanel}>
					{sections.map((section) => (
						<div key={section.key} className="lj:py-1">
							<div className="lj:px-3 lj:py-1 lj:text-[10px] lj:font-bold lj:uppercase lj:tracking-[0.18em] lj:text-lj-c-hint-vivid">
								{localize(section.headerKey)}
							</div>
							{section.rows.map((row) => {
								const rowIndex = rows.indexOf(row)
								const active = rowIndex === activeIndex
								return (
									<div
										key={`${section.key}-${row.value}`}
										role="button"
										tabIndex={-1}
										onMouseEnter={() => setActiveIndex(rowIndex)}
										onMouseDown={(event) => event.preventDefault()}
										onClick={() => chooseRow(row)}
										className={active ? classNames?.comboboxActiveOption : classNames?.comboboxOption}
									>
										<SymbolIcon logo={row.logo} className="lj:size-4" />
										<span className="lj:min-w-0 lj:flex-1 lj:truncate">{row.label}</span>
										{row.typeOption !== undefined && (
											<span className="lj:shrink-0">
												<EnumBadge option={row.typeOption} variant="side" />
											</span>
										)}
										<ObsidianIcon
											name={row.source === 'journal' ? 'check' : 'plus'}
											className="lj:size-3.5 lj:text-lj-c-hint-vivid lj:opacity-0 lj:group-hover:opacity-100"
										/>
									</div>
								)
							})}
						</div>
					))}
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

function buildSuggestionSections(
	currentInput: string,
	journalOptions: JournalSymbolOption[],
	tvSuggestions: SymbolSuggestion[],
	_localize: (key: string) => string,
	typeOptions: SelectOption[] = [],
): SuggestionSection[] {
	const input = currentInput.trim().toUpperCase()
	const journalNames = new Set(journalOptions.map((option) => option.value.toUpperCase()))
	const journalRows = journalOptions
		.filter((option) => input === '' || option.value.toUpperCase().includes(input) || option.label.toUpperCase().includes(input))
		.map((option) => buildJournalRow(option, typeOptions))
	const availableRows = tvSuggestions
		.filter((suggestion) => !journalNames.has(suggestion.symbol.toUpperCase()))
		.filter((suggestion) => input === '' || suggestion.symbol.toUpperCase().includes(input))
		.map((suggestion) => buildAvailableRow(suggestion, typeOptions))

	return [
		{ key: 'journal' as const, headerKey: 'POSITION_SYMBOL_SECTION_JOURNAL' as const, rows: journalRows },
		{ key: 'available' as const, headerKey: 'POSITION_SYMBOL_SECTION_AVAILABLE' as const, rows: availableRows },
	].filter((section) => section.rows.length > 0)
}

function buildJournalRow(
	option: JournalSymbolOption,
	typeOptions: SelectOption[],
): SuggestionRow {
	const type = option.symbolType ?? null
	return {
		value: option.value,
		label: option.label,
		logo: option.icon?.kind === 'url' ? option.icon.value : null,
		typeOption: resolveSymbolTypeOption(type, typeOptions),
		source: 'journal',
	}
}

function buildAvailableRow(
	suggestion: SymbolSuggestion,
	typeOptions: SelectOption[],
): SuggestionRow {
	const type = suggestion.type
	return {
		value: suggestion.symbol,
		label: suggestion.symbol,
		logo: suggestion.logo,
		typeOption: resolveSymbolTypeOption(type, typeOptions),
		source: 'available',
	}
}

function resolveSymbolTypeOption(type: PositionSymbolType | null, typeOptions: SelectOption[]): SelectOption | undefined {
	return type === null ? undefined : typeOptions.find((option) => option.value === type)
}

function resolveSymbolComboboxLeadingIcon(
	value: string,
	journalOptions: SelectOption[],
	tvSuggestions: SymbolSuggestion[],
	valueIcon: SelectOption['icon'],
): SelectOption['icon'] {
	const normalizedValue = value.trim().toUpperCase()
	const symbolInfo = resolveSymbolInfo(value)
	const normalizedCanonicalValue = symbolInfo.name.toUpperCase()
	const journalIcon = journalOptions.find((option) =>
		option.value.toUpperCase() === normalizedValue
		|| option.value.toUpperCase() === normalizedCanonicalValue,
	)?.icon
	if (journalIcon !== undefined) {
		return journalIcon
	}

	const tvLogo = tvSuggestions.find((suggestion) =>
		suggestion.symbol.toUpperCase() === normalizedValue
		|| suggestion.symbol.toUpperCase() === normalizedCanonicalValue,
	)?.logo ?? null
	if (tvLogo !== null) {
		return { kind: 'url', value: tvLogo }
	}

	if (symbolInfo.logo !== null) {
		return { kind: 'url', value: symbolInfo.logo }
	}

	return valueIcon
}

function resolveSymbolComboboxTypeOption(
	value: string,
	journalOptions: JournalSymbolOption[],
	tvSuggestions: SymbolSuggestion[],
	typeOptions: SelectOption[],
): SelectOption | undefined {
	const normalizedValue = value.trim().toUpperCase()
	if (normalizedValue === '') {
		return undefined
	}

	const symbolInfo = resolveSymbolInfo(value)
	const normalizedCanonicalValue = symbolInfo.name.toUpperCase()
	const journalType = journalOptions.find((option) =>
		option.value.toUpperCase() === normalizedValue
		|| option.value.toUpperCase() === normalizedCanonicalValue,
	)?.symbolType ?? null
	if (journalType !== null) {
		return resolveSymbolTypeOption(journalType, typeOptions)
	}

	const suggestionType = tvSuggestions.find((suggestion) =>
		suggestion.symbol.toUpperCase() === normalizedValue
		|| suggestion.symbol.toUpperCase() === normalizedCanonicalValue,
	)?.type ?? null
	return resolveSymbolTypeOption(suggestionType ?? symbolInfo.type, typeOptions)
}

function resolveSymbolComboboxDisplayValue(isEditing: boolean, query: string, value: string) {
	return isEditing ? query : value
}

function resolveSymbolComboboxDisplayState(
	isOpen: boolean,
	helperSearch: string,
	rowCount: number,
	hasSelectedOption: boolean,
	noResultsLabel?: string,
) {
	return {
		showPanel: isOpen && rowCount > 0,
		showInlineHelper: helperSearch.trim().length > 0
			&& !hasSelectedOption
			&& noResultsLabel !== undefined,
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	const t = (key: string) => key
	const typeOptions = [
		{ value: 'Crypto_Perp', label: 'Crypto Perpetual' },
		{ value: 'CFD', label: 'CFD' },
	] satisfies SelectOption[]

	describe('buildSuggestionSections', () => {
		it('puts matches from journal options into the journal section and TV rows into available', () => {
			const sections = buildSuggestionSections(
				'BTC',
				[{ value: 'BTCUSDT', label: 'BTCUSDT', icon: { kind: 'url', value: 'btc.svg' } }],
				[{ symbol: 'BTCUSDT.P', type: 'Crypto_Perp', logo: 'perp.svg' }],
				t,
				typeOptions,
			)
			expect(sections.map((section) => section.key)).toEqual(['journal', 'available'])
			expect(sections[0]?.rows[0]).toMatchObject({ value: 'BTCUSDT', source: 'journal' })
			expect(sections[1]?.rows[0]).toMatchObject({
				value: 'BTCUSDT.P',
				source: 'available',
				typeOption: { value: 'Crypto_Perp' },
			})
		})

		it('hides TV rows whose symbol already exists in the journal section', () => {
			const sections = buildSuggestionSections(
				'BTC',
				[{ value: 'BTCUSDT.P', label: 'BTCUSDT.P' }],
				[{ symbol: 'BTCUSDT.P', type: 'Crypto_Perp', logo: 'perp.svg' }],
				t,
				typeOptions,
			)
			expect(sections).toHaveLength(1)
			expect(sections[0]?.key).toBe('journal')
		})

		it('filters by the current input substring', () => {
			const sections = buildSuggestionSections(
				'XA',
				[{ value: 'EURUSD', label: 'EURUSD' }, { value: 'XAUUSD', label: 'XAUUSD' }],
				[{ symbol: 'XAGUSD', type: 'CFD', logo: 'xag.svg' }],
				t,
				typeOptions,
			)
			expect(sections.flatMap((section) => section.rows.map((row) => row.value))).toEqual(['XAUUSD', 'XAGUSD'])
		})

		it('uses the persisted journal symbol type instead of inferring from builtin metadata', () => {
			const sections = buildSuggestionSections(
				'DOGE',
				[{ value: 'DOGE', label: 'DOGE', symbolType: 'CFD' }],
				[],
				t,
				typeOptions,
			)
			expect(sections[0]?.rows[0]?.typeOption).toMatchObject({ value: 'CFD' })
		})
	})

	describe('resolveSymbolComboboxLeadingIcon', () => {
		it('uses journal option icon before available suggestion or valueIcon', () => {
			expect(resolveSymbolComboboxLeadingIcon(
				'CL',
				[{ value: 'CL', label: 'CL', icon: { kind: 'url', value: 'journal.svg' } }],
				[{ symbol: 'CL', type: 'Future', logo: 'tv.svg' }],
				{ kind: 'url', value: 'value.svg' },
			)).toEqual({ kind: 'url', value: 'journal.svg' })
		})

		it('uses exact available suggestion logo when the value is not a journal option yet', () => {
			expect(resolveSymbolComboboxLeadingIcon(
				'CL',
				[],
				[{ symbol: 'CL', type: 'Future', logo: 'https://s3-symbol-logo.tradingview.com/futures/crude-oil.svg' }],
				undefined,
			)).toEqual({ kind: 'url', value: 'https://s3-symbol-logo.tradingview.com/futures/crude-oil.svg' })
		})

		it('uses canonical builtin logo for slash pair input before suggestions resolve', () => {
			expect(resolveSymbolComboboxLeadingIcon(
				'BTC/USDT',
				[],
				[],
				undefined,
			)).toEqual({ kind: 'url', value: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg' })
		})

		it('falls back to descriptor valueIcon when neither journal nor available rows have an icon', () => {
			expect(resolveSymbolComboboxLeadingIcon(
				'ZZZZ',
				[],
				[],
				{ kind: 'url', value: 'value.svg' },
			)).toEqual({ kind: 'url', value: 'value.svg' })
		})
	})

	describe('resolveSymbolComboboxTypeOption', () => {
		it('uses the selected journal option symbol type for the input badge', () => {
			expect(resolveSymbolComboboxTypeOption(
				'BTCUSDT.P',
				[{ value: 'BTCUSDT.P', label: 'BTCUSDT.P', symbolType: 'Crypto_Perp' }],
				[],
				typeOptions,
			)).toMatchObject({ value: 'Crypto_Perp' })
		})

		it('uses the selected available suggestion type for the input badge', () => {
			expect(resolveSymbolComboboxTypeOption(
				'XAUUSD',
				[],
				[{ symbol: 'XAUUSD', type: 'CFD', logo: 'xau.svg' }],
				typeOptions,
			)).toMatchObject({ value: 'CFD' })
		})

		it('uses canonical builtin type before suggestions resolve', () => {
			expect(resolveSymbolComboboxTypeOption(
				'BTC/USDT.P',
				[],
				[],
				typeOptions,
			)).toMatchObject({ value: 'Crypto_Perp' })
		})
	})

	describe('resolveSymbolComboboxDisplayState', () => {
		it('shows the inline new-symbol helper when the current input has no rows', () => {
			expect(resolveSymbolComboboxDisplayState(false, 'CLZ9', 0, false, 'New symbol')).toEqual({
				showPanel: false,
				showInlineHelper: true,
			})
		})

		it('keeps the helper visible when rows are only available suggestions', () => {
			expect(resolveSymbolComboboxDisplayState(true, 'CL', 1, false, 'New symbol')).toEqual({
				showPanel: true,
				showInlineHelper: true,
			})
		})

		it('keeps the helper hidden for a selected journal option', () => {
			expect(resolveSymbolComboboxDisplayState(false, 'CL', 0, true, 'New symbol')).toEqual({
				showPanel: false,
				showInlineHelper: false,
			})
		})
	})

	describe('resolveSymbolComboboxDisplayValue', () => {
		it('keeps an empty editing query instead of restoring the previous value', () => {
			expect(resolveSymbolComboboxDisplayValue(true, '', 'LINK')).toBe('')
		})
	})
}
