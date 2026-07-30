/// <reference types="vitest/importMeta" />

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { resolveTableFilterOptions, type TableFilterDefinition, type TableFilterOption, type TableFilterState } from '../../domains/core/table-filters'
import { formatLocalizedMonthYear, t } from '../../lang/helpers'
import { toDateKey } from '../../utils'
import { rankAutocompleteOptions } from '../primitives/autocomplete-match'
import { IconView } from '../primitives/icon-view'
import { ObsidianIcon } from '../primitives/obsidian-icon'
import { useCalendar } from '../primitives/use-calendar'

import type { DomainPersistedEntry, DomainRuntimeApp } from '../../domains/core/type'

const SHORT_WEEKDAY_KEYS = [
	'DASHBOARD_WEEKDAY_SHORT_SUN',
	'DASHBOARD_WEEKDAY_SHORT_MON',
	'DASHBOARD_WEEKDAY_SHORT_TUE',
	'DASHBOARD_WEEKDAY_SHORT_WED',
	'DASHBOARD_WEEKDAY_SHORT_THU',
	'DASHBOARD_WEEKDAY_SHORT_FRI',
	'DASHBOARD_WEEKDAY_SHORT_SAT',
] as const
const FILTER_OPTION_ROW_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:justify-between lj:gap-3 lj:rounded-md lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:transition-colors'
const FILTER_COMBOBOX_PANEL_CLASS_NAME = 'lj:flex lj:flex-col lj:overflow-hidden lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised lj:shadow-xl'
const FILTER_COMBOBOX_PANEL_GAP = 4
const FILTER_COMBOBOX_PANEL_MARGIN = 8
const FILTER_COMBOBOX_PANEL_MAX_HEIGHT = 320

type TableFilterPopoverProps<
	Schema,
> = {
	title: string
	definitions: readonly TableFilterDefinition<Schema, string>[]
	value: TableFilterState
	app: DomainRuntimeApp
	entries: DomainPersistedEntry<Schema>[]
	onApply: (value: TableFilterState) => void
	normalizeDraft?: (value: TableFilterState, context: {
		app: DomainRuntimeApp
		entries: DomainPersistedEntry<Schema>[]
		definitions: readonly TableFilterDefinition<Schema, string>[]
	}) => TableFilterState
	onReset: () => void
	onClose: () => void
}

export function TableFilterPopover<
	Schema,
>({
	title,
	definitions,
	value,
	app,
	entries,
	onApply,
	normalizeDraft,
	onReset,
	onClose,
}: TableFilterPopoverProps<Schema>) {
	// @story [[lucrjournal/fields#^filter-draft-isolation]] Keeps popover edits local until explicit apply
	const [draft, setDraft] = useState<TableFilterState>(value)

	const normalizeNextDraft = (nextValue: TableFilterState) => normalizeDraft?.(nextValue, {
		app,
		entries,
		definitions,
	}) ?? nextValue

	const setFilterValue = (id: string, nextValue: string) => {
		setDraft((current) => normalizeNextDraft({
			...current,
			[id]: nextValue,
		}))
	}

	return (
		<>
			{/* @story [[lucrjournal/fields#^filter-draft-isolation]] Closes without applying the local draft */}
			<div className="lj:fixed lj:inset-0 lj:z-40" onClick={onClose} />
			<div
				className="lj:absolute lj:left-0 lj:top-full lj:mt-2 lj:z-50 lj:w-[320px] lj:rounded-2xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:shadow-2xl"
				data-lj-panel="table-filter-popover"
			>
				<div className="lj:flex lj:flex-col lj:gap-6 lj:p-6">
					<div className="lj:text-lg lj:font-semibold lj:text-lj-c-strong">
						{title}
					</div>
					{definitions.map((definition) => {
						const options = resolveTableFilterOptions(definition, {
							app,
							entries,
							state: draft,
						})
						const currentValue = draft[definition.id] ?? definition.defaultValue

						switch (definition.type) {
							case 'segmented':
								return (
									<SegmentedFilterControl
										key={definition.id}
										label={definition.label()}
										options={options}
										value={currentValue}
										onChange={(nextValue) => setFilterValue(definition.id, nextValue)}
									/>
								)
							case 'select':
								return (
									<SelectFilterControl
										key={definition.id}
										label={definition.label()}
										options={options}
										value={currentValue}
										placeholder={definition.placeholder?.() ?? ''}
										onChange={(nextValue) => setFilterValue(definition.id, nextValue)}
									/>
								)
							case 'combobox':
								return (
									<ComboboxFilterControl
										key={definition.id}
										label={definition.label()}
										options={options}
										value={currentValue}
										placeholder={definition.placeholder?.() ?? ''}
										onChange={(nextValue) => setFilterValue(definition.id, nextValue)}
									/>
								)
							case 'date':
								return (
									<DateFilterControl
										key={definition.id}
										label={definition.label()}
										value={currentValue}
										emptyLabel={definition.placeholder?.() ?? t('DASHBOARD_ANALYSIS_TABLE_FILTER_ALL_DATES')}
										onChange={(nextValue) => setFilterValue(definition.id, nextValue)}
									/>
								)
							default:
								definition satisfies never
								// eslint-disable-next-line i18next/no-literal-string -- Internal error message not user facing
								throw new Error('Unknown table filter definition type')
						}
					})}
				</div>
				<div className="lj:px-6 lj:py-4 lj:border-t lj:border-lj-alpha-10 lj:flex lj:items-center lj:justify-between">
					{/* @story [[lucrjournal/fields#^filter-apply-reset]] Restores definition defaults before closing the popover */}
					<button
						type="button"
						onClick={() => {
							onReset()
							onClose()
						}}
						className="lj:text-sm lj:text-lj-c-muted-bright lj:hover:text-lj-c-strong-soft lj:transition-colors"
					>
						{t('DASHBOARD_TABLE_FILTER_RESET_ALL')}
					</button>
					{/* @story [[lucrjournal/fields#^filter-apply-reset]] Normalizes and applies the complete draft before closing */}
					<button
						type="button"
						onClick={() => {
							onApply(normalizeNextDraft(draft))
							onClose()
						}}
						className="lj:bg-lj-c-strong-soft lj:text-lj-surf lj:px-6 lj:py-2.5 lj:rounded-lg lj:text-sm lj:font-medium lj:transition-colors lj:hover:opacity-90"
					>
						{t('DASHBOARD_TABLE_FILTER_SHOW_RESULTS')}
					</button>
				</div>
			</div>
		</>
	)
}

function SegmentedFilterControl({
	label,
	options,
	value,
	onChange,
}: {
	label: string
	options: TableFilterOption[]
	value: string
	onChange: (value: string) => void
}) {
	return (
		<div className="lj:flex lj:flex-col lj:gap-2.5">
			<div className="lj:text-[10px] lj:font-bold lj:tracking-widest lj:text-lj-c-muted lj:uppercase">
				{label}
			</div>
			<div className="lj:flex lj:flex-wrap lj:gap-2">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => onChange(option.value)}
						className={`lj:rounded-md lj:px-4 lj:py-2 lj:text-xs lj:font-medium lj:transition-colors ${
							value === option.value
								? 'lj:bg-lj-c-strong-soft lj:text-lj-surf'
								: 'lj:bg-lj-surf-segmented lj:text-lj-c-secondary lj:hover:bg-lj-alpha-5'
						}`}
					>
						{option.label()}
					</button>
				))}
			</div>
		</div>
	)
}

function SelectFilterControl({
	label,
	options,
	value,
	placeholder,
	onChange,
}: {
	label: string
	options: TableFilterOption[]
	value: string
	placeholder: string
	onChange: (value: string) => void
}) {
	return (
		<FilterInputDropdownControl
			label={label}
			options={options}
			value={value}
			placeholder={placeholder}
			onChange={onChange}
			allowFreeText={false}
		/>
	)
}

function ComboboxFilterControl({
	label,
	options,
	value,
	placeholder,
	onChange,
}: {
	label: string
	options: TableFilterOption[]
	value: string
	placeholder: string
	onChange: (value: string) => void
}) {
	return (
		<FilterInputDropdownControl
			label={label}
			options={options}
			value={value}
			placeholder={placeholder}
			onChange={onChange}
			allowFreeText
		/>
	)
}

function FilterInputDropdownControl({
	label,
	options,
	value,
	placeholder,
	onChange,
	allowFreeText,
}: {
	label: string
	options: TableFilterOption[]
	value: string
	placeholder: string
	onChange: (value: string) => void
	allowFreeText: boolean
}) {
	const [isOpen, setIsOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [activeIndex, setActiveIndex] = useState(0)
	const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
	const containerRef = useRef<HTMLDivElement>(null)

	const normalizedOptions = options.map((option) => ({
		value: option.value,
		label: option.label(),
		icon: option.icon,
		keywords: option.keywords,
		metaIcon: option.metaIcon,
		metaLabel: option.metaLabel?.(),
	}))

	const filteredOptions = rankAutocompleteOptions(normalizedOptions, query, (candidate) => candidate.trim())

	useLayoutEffect(() => {
		setActiveIndex(0)
	}, [query])

	useEffect(() => {
		if (!isOpen) {
			return
		}
		const updatePanelStyle = () => {
			const rect = containerRef.current?.getBoundingClientRect()
			if (rect === undefined) {
				return
			}
			setPanelStyle(buildFloatingComboboxPanelStyle(rect, {
				height: activeDocument.documentElement.clientHeight,
			}))
		}
		updatePanelStyle()
		activeWindow.addEventListener('resize', updatePanelStyle)
		activeDocument.addEventListener('scroll', updatePanelStyle, true)
		return () => {
			activeWindow.removeEventListener('resize', updatePanelStyle)
			activeDocument.removeEventListener('scroll', updatePanelStyle, true)
		}
	}, [filteredOptions.length, isOpen])

	useEffect(() => {
		if (!isOpen) {
			return
		}
		const handleClick = (event: MouseEvent) => {
			if (containerRef.current?.contains(event.target as Node)) {
				return
			}
			setIsOpen(false)
			setQuery('')
		}
		activeDocument.addEventListener('click', handleClick)
		return () => activeDocument.removeEventListener('click', handleClick)
	}, [isOpen])

	const selectOption = (nextValue: string) => {
		onChange(nextValue)
		setQuery('')
		setIsOpen(false)
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!isOpen) {
			if (event.key === 'ArrowDown' || event.key === 'Enter') {
				setIsOpen(true)
				event.preventDefault()
			}
			return
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1))
				break
			case 'ArrowUp':
				event.preventDefault()
				setActiveIndex((current) => Math.max(current - 1, 0))
				break
			case 'Enter':
				event.preventDefault()
				if (filteredOptions[activeIndex] !== undefined) {
					selectOption(filteredOptions[activeIndex].value)
				}
				break
			case 'Escape':
				event.preventDefault()
				setIsOpen(false)
				setQuery('')
				break
			default:
				break
		}
	}

	const displayValue = options.find((option) => option.value === value)?.label() ?? value
	const displayIcon = normalizedOptions.find((option) => option.value === value)?.icon

	return (
		<div className="lj:flex lj:flex-col lj:gap-2.5">
			<div className="lj:text-[10px] lj:font-bold lj:tracking-widest lj:text-lj-c-muted lj:uppercase">
				{label}
			</div>
			<div
				ref={containerRef}
				className="lj:relative"
			>
				<div className="lj:relative">
					<div className="lj:pointer-events-none lj:absolute lj:left-3 lj:top-1/2 lj:-translate-y-1/2">
						{displayIcon == null
							? <ObsidianIcon name="search" className="lj:size-4 lj:text-lj-c-hint-vivid" />
							: <IconView icon={displayIcon} className="lj:size-4" />}
					</div>
					<input
						type="text"
						value={isOpen ? query : displayValue}
						placeholder={placeholder}
						className="lj:h-10 lj:w-full lj:appearance-none lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:pl-10 lj:pr-8 lj:text-[13px] lj:text-lj-c-strong lj:placeholder:text-lj-c-hint-faint lj:outline-none lj:ring-0 lj:shadow-none lj:transition-[border-color] lj:focus:border-lj-alpha-20"
						onChange={(event) => {
							const nextValue = event.target.value
							setQuery(nextValue)
							if (allowFreeText) {
								onChange(nextValue)
							}
							setIsOpen(true)
						}}
						onFocus={() => {
							setQuery('')
							setIsOpen(true)
						}}
						onKeyDown={handleKeyDown}
					/>
					<div className="lj:pointer-events-none lj:absolute lj:right-3 lj:top-1/2 lj:-translate-y-1/2">
						<ObsidianIcon
							name="chevron-down"
							className={`lj:size-4 lj:text-lj-c-hint-vivid lj:transition-transform ${isOpen ? 'lj:rotate-180' : ''}`}
						/>
					</div>
				</div>

				{isOpen && filteredOptions.length > 0 && (
					<div
						style={panelStyle}
						className={FILTER_COMBOBOX_PANEL_CLASS_NAME}
					>
						<div className="lj:flex-1 lj:overflow-y-auto lj:p-1">
							{filteredOptions.map((option, index) => {
								const selected = index === activeIndex || option.value === value
								return (
									<button
										key={option.value}
										type="button"
										onMouseEnter={() => setActiveIndex(index)}
										onClick={() => selectOption(option.value)}
										className={`${FILTER_OPTION_ROW_CLASS_NAME} ${
											selected
												? 'lj:bg-lj-alpha-5-10 lj:text-lj-c-strong'
												: 'lj:text-lj-c-secondary lj:hover:bg-lj-alpha-5'
										}`}
									>
										<div className="lj:flex lj:min-w-0 lj:flex-1 lj:items-center lj:gap-2">
											{option.icon != null && <IconView icon={option.icon} className="lj:size-4" />}
											<span className="lj:min-w-0 lj:flex-1 lj:truncate">{option.label}</span>
										</div>
										{option.metaLabel !== undefined && (
											<span className="lj:flex lj:shrink-0 lj:items-center lj:gap-1 lj:rounded-sm lj:bg-lj-alpha-5 lj:px-1.5 lj:py-0.5 lj:text-[10px] lj:leading-none lj:text-lj-c-hint-vivid">
												{option.metaIcon != null && <IconView icon={option.metaIcon} className="lj:size-3" />}
												{option.metaLabel}
											</span>
										)}
									</button>
								)
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

function buildFloatingComboboxPanelStyle(
	anchorRect: Pick<DOMRect, 'bottom' | 'top'>,
	viewport: { height: number },
): CSSProperties {
	const availableBelow = viewport.height - FILTER_COMBOBOX_PANEL_MARGIN - anchorRect.bottom - FILTER_COMBOBOX_PANEL_GAP
	const availableAbove = anchorRect.top - FILTER_COMBOBOX_PANEL_MARGIN - FILTER_COMBOBOX_PANEL_GAP
	const openAbove = availableBelow < FILTER_COMBOBOX_PANEL_MAX_HEIGHT && availableAbove > availableBelow
	const availableHeight = Math.max(0, openAbove ? availableAbove : availableBelow)
	const maxHeight = Math.min(FILTER_COMBOBOX_PANEL_MAX_HEIGHT, availableHeight)

	return openAbove
		? {
			bottom: `calc(100% + ${FILTER_COMBOBOX_PANEL_GAP}px)`,
			left: 0,
			maxHeight,
			position: 'absolute',
			right: 0,
			zIndex: 9999,
		}
		: {
			left: 0,
			maxHeight,
			position: 'absolute',
			right: 0,
			top: `calc(100% + ${FILTER_COMBOBOX_PANEL_GAP}px)`,
			zIndex: 9999,
		}
}

function DateFilterControl({
	label,
	value,
	emptyLabel,
	onChange,
}: {
	label: string
	value: string
	emptyLabel: string
	onChange: (value: string) => void
}) {
	const [isOpen, setIsOpen] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)

	const initialDate = value === '' ? new Date() : new Date(value)
	const { weeks, year, month, prevMonth, nextMonth } = useCalendar(initialDate, 0)

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current?.contains(event.target as Node)) {
				return
			}
			setIsOpen(false)
		}
		activeDocument.addEventListener('mousedown', handleClickOutside)
		return () => activeDocument.removeEventListener('mousedown', handleClickOutside)
	}, [])

	const monthYearLabel = formatLocalizedMonthYear(new Date(year, month), 'short')

	return (
		<div className="lj:flex lj:flex-col lj:gap-2.5">
			<div className="lj:text-[10px] lj:font-bold lj:tracking-widest lj:text-lj-c-muted lj:uppercase">
				{label}
			</div>
			<div className="lj:relative" ref={dropdownRef}>
				<button
					type="button"
					onClick={() => setIsOpen((current) => !current)}
					className="lj:flex lj:h-10 lj:w-full lj:items-center lj:justify-between lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:px-3 lj:text-left lj:transition-colors lj:hover:bg-lj-alpha-5"
				>
					<span className={`lj:text-[13px] ${value === '' ? 'lj:text-lj-c-hint' : 'lj:text-lj-c-strong lj:font-medium'}`}>
						{value === '' ? emptyLabel : value}
					</span>
					<ObsidianIcon
						name="chevron-down"
						className={`lj:size-4 lj:text-lj-c-hint-vivid lj:transition-transform ${isOpen ? 'lj:rotate-180' : ''}`}
					/>
				</button>

				{isOpen && (
					<div className="lj:absolute lj:left-0 lj:right-0 lj:top-full lj:z-[100] lj:mt-2 lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:p-4 lj:shadow-2xl lj:backdrop-blur-md">
						<div className="lj:flex lj:items-center lj:justify-between lj:mb-4">
							<button
								type="button"
								onClick={prevMonth}
								className="lj:p-1 lj:rounded-md lj:hover:bg-lj-alpha-5 lj:transition-colors"
							>
								<ObsidianIcon name="chevron-left" className="lj:size-3.5 lj:text-lj-c-muted" />
							</button>
							<span className="lj:text-[11px] lj:font-bold lj:tracking-wider lj:text-lj-c-strong lj:uppercase">
								{monthYearLabel}
							</span>
							<button
								type="button"
								onClick={nextMonth}
								className="lj:p-1 lj:rounded-md lj:hover:bg-lj-alpha-5 lj:transition-colors"
							>
								<ObsidianIcon name="chevron-right" className="lj:size-3.5 lj:text-lj-c-muted" />
							</button>
						</div>

						<div className="lj:grid lj:grid-cols-7 lj:mb-3">
							{SHORT_WEEKDAY_KEYS.map((key) => (
								<div key={key} className="lj:text-[10px] lj:font-bold lj:text-lj-c-muted/40 lj:text-center lj:uppercase">
									{t(key)}
								</div>
							))}
						</div>

						<div className="lj:flex lj:flex-col lj:gap-1.5">
							{weeks.map((week, weekIndex) => (
								<div key={weekIndex} className="lj:grid lj:grid-cols-7">
									{week.map((cell) => {
										const dateKey = toDateKey(cell.date)
										const isSelected = value === dateKey
										const isCurrentMonth = cell.isCurrentMonth

										return (
											<button
												key={dateKey}
												type="button"
												onClick={() => {
													if (!isCurrentMonth) {
														return
													}
													onChange(isSelected ? '' : dateKey)
													setIsOpen(false)
												}}
												className={`lj:mx-auto lj:flex lj:size-7 lj:items-center lj:justify-center lj:rounded-full lj:text-[11px] lj:transition-colors ${
													!isCurrentMonth
														? 'lj:invisible'
														: isSelected
															? 'lj:bg-lj-c-strong lj:font-bold lj:text-lj-bg'
															: cell.isToday
																? 'lj:border lj:border-lj-alpha-20 lj:font-bold lj:text-lj-c-strong'
																: 'lj:text-lj-c-strong/70 lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong'
												}`}
											>
												{cell.day}
											</button>
										)
									})}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('buildFloatingComboboxPanelStyle', () => {
		it('opens above the input in local coordinates when the bottom viewport space is smaller', () => {
			const style = buildFloatingComboboxPanelStyle({
				bottom: 540,
				top: 500,
			}, {
				height: 560,
			})

			expect(style).toMatchObject({
				bottom: 'calc(100% + 4px)',
				left: 0,
				maxHeight: 320,
				position: 'absolute',
				right: 0,
				zIndex: 9999,
			})
			expect(style).not.toHaveProperty('top')
		})

		it('keeps a below-opening panel inside the viewport when below has more room', () => {
			const style = buildFloatingComboboxPanelStyle({
				bottom: 120,
				top: 80,
			}, {
				height: 320,
			})

			expect(style).toMatchObject({
				left: 0,
				maxHeight: 188,
				position: 'absolute',
				right: 0,
				top: 'calc(100% + 4px)',
				zIndex: 9999,
			})
			expect(style).not.toHaveProperty('bottom')
		})
	})
}
