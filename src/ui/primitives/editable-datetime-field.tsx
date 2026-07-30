/// <reference types="vitest/importMeta" />

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { LUCR_JOURNAL_VIEW_TYPE } from '../../constant'
import { formatLocalizedMonthYear, t } from '../../lang/helpers'
import { getCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import { buildIsoDatetimeInTimeZone } from '../../utils'

import { ObsidianIcon } from './obsidian-icon'

import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, ReactNode, SetStateAction } from 'react'

type EditableDatetimeFieldProps = {
	value: string | null | undefined
	onSave: (newValue: string) => void
	align?: 'left' | 'right'
	renderDisplay: (value: string | null | undefined) => ReactNode
	className?: string
}

type DateParts = {
	year: number
	month: number
	day: number
	hour: number
	minute: number
	offset: string
}

const WEEKDAY_LABEL_KEYS = [
	'DASHBOARD_WEEKDAY_NARROW_MON',
	'DASHBOARD_WEEKDAY_NARROW_TUE',
	'DASHBOARD_WEEKDAY_NARROW_WED',
	'DASHBOARD_WEEKDAY_NARROW_THU',
	'DASHBOARD_WEEKDAY_NARROW_FRI',
	'DASHBOARD_WEEKDAY_NARROW_SAT',
	'DASHBOARD_WEEKDAY_NARROW_SUN',
] as const

const MINUTE_STEP = 5
const POPOVER_HORIZONTAL_PADDING = 12
const POPOVER_WIDTH = 280

export function EditableDatetimeField({
	value,
	onSave,
	align = 'left',
	renderDisplay,
	className = '',
}: EditableDatetimeFieldProps) {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState<DateParts | null>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const popoverRef = useRef<HTMLDivElement>(null)
	const initialFocusRef = useRef<HTMLButtonElement>(null)
	const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
	const weekdayLabels = WEEKDAY_LABEL_KEYS.map((key) => t(key))

	useEffect(() => {
		if (!isEditing || !triggerRef.current) {
			return
		}

		const updatePosition = () => {
			if (!triggerRef.current) {
				return
			}

			const rect = triggerRef.current.getBoundingClientRect()
			const portalTarget = triggerRef.current.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`)
			const offset = portalTarget?.getBoundingClientRect() ?? {
				top: 0,
				left: 0,
				width: window.innerWidth,
				height: window.innerHeight,
			}
			const unclampedLeft = rect.left - offset.left
			const maxLeft = Math.max(
				POPOVER_HORIZONTAL_PADDING,
				(offset.width ?? window.innerWidth) - POPOVER_WIDTH - POPOVER_HORIZONTAL_PADDING,
			)
			setMenuPos({
				top: rect.bottom + 8 - offset.top,
				left: clamp(unclampedLeft, POPOVER_HORIZONTAL_PADDING, maxLeft),
			})
		}

		updatePosition()

		// @story [[lucrjournal/primitives#^editable-datetime-cancel]] Discards the popover draft on outside click scroll or Escape
		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target as Node
			if (
				(triggerRef.current?.contains(target) ?? false) ||
				(popoverRef.current?.contains(target) ?? false)
			) {
				return
			}

			setIsEditing(false)
		}

		const handleScroll = () => setIsEditing(false)
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setIsEditing(false)
				triggerRef.current?.focus()
			}
		}

		activeDocument.addEventListener('mousedown', handlePointerDown)
		activeDocument.addEventListener('keydown', handleEscape)
		window.addEventListener('resize', updatePosition)
		window.addEventListener('scroll', handleScroll, true)

		const timer = window.setTimeout(() => {
			initialFocusRef.current?.focus()
		}, 0)

		return () => {
			window.clearTimeout(timer)
			activeDocument.removeEventListener('mousedown', handlePointerDown)
			activeDocument.removeEventListener('keydown', handleEscape)
			window.removeEventListener('resize', updatePosition)
			window.removeEventListener('scroll', handleScroll, true)
		}
	}, [isEditing])

	const openEditor = useCallback(() => {
		setDraft(readDraftFromValue(value))
		setIsEditing(true)
	}, [value])

	// @story [[lucrjournal/primitives#^editable-datetime-save]] Commits a formatted draft or empty clear value then restores trigger focus
	const commit = useCallback((nextDraft: DateParts | null) => {
		onSave(nextDraft === null ? '' : formatDraftAsIso(nextDraft))
		setIsEditing(false)
		triggerRef.current?.focus()
	}, [onSave])

	const currentDraft = draft ?? readDraftFromValue(value)
	const visibleMonth = currentDraft === null
		? getCurrentMonthSeed()
		: new Date(currentDraft.year, currentDraft.month - 1, 1)
	const calendarDays = useMemo(
		() => buildCalendarDays(visibleMonth, currentDraft),
		[visibleMonth, currentDraft],
	)

	return (
		<div className="lj:relative lj:inline-flex">
			<button
				ref={triggerRef}
				type="button"
				className={getEditableDatetimeTriggerClassName(align, className)}
				onClick={(event) => {
					event.stopPropagation()
					if (isEditing) {
						// @story [[lucrjournal/primitives#^editable-datetime-cancel]] Closes an open popover without saving from its trigger
						setIsEditing(false)
						return
					}
					openEditor()
				}}
			>
				<span className={getEditableDatetimeDisplayClassName(align)}>{renderDisplay(value)}</span>
				<span className={getEditableDatetimeIconClassName(align)}>
					<ObsidianIcon name="chevron-down" className="lj:size-3" />
				</span>
			</button>

			{isEditing && menuPos !== null && currentDraft !== null && createPortal(
				<div
					ref={popoverRef}
					role="dialog"
					aria-modal="false"
					className="lj:fixed lj:z-[9999] lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:shadow-xl lj:backdrop-blur-md"
					style={{ top: menuPos.top, left: menuPos.left, width: `${POPOVER_WIDTH}px` }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => handlePopoverKeyDown(event, currentDraft, setDraft, commit)}
				>
					<div className="lj:relative lj:flex lj:flex-col lj:gap-4 lj:p-4">
						<div className="lj:flex lj:items-center lj:justify-between">
							<button
								type="button"
								className="lj:flex lj:h-7 lj:w-7 lj:items-center lj:justify-center lj:rounded-md lj:text-lj-c-secondary lj:transition-colors lj:hover:bg-lj-surf-button-hover-soft lj:hover:text-lj-c-strong"
								onClick={() => setDraft((prev) => shiftDraftMonth(prev, -1))}
							>
								<ObsidianIcon name="chevron-left" className="lj:size-4" />
							</button>
							<div className="lj:text-[13px] lj:font-medium lj:text-lj-c-strong">
								{formatLocalizedMonthYear(visibleMonth)}
							</div>
							<button
								type="button"
								className="lj:flex lj:h-7 lj:w-7 lj:items-center lj:justify-center lj:rounded-md lj:text-lj-c-secondary lj:transition-colors lj:hover:bg-lj-surf-button-hover-soft lj:hover:text-lj-c-strong"
								onClick={() => setDraft((prev) => shiftDraftMonth(prev, 1))}
							>
								<ObsidianIcon name="chevron-right" className="lj:size-4" />
							</button>
						</div>

						<div className="lj:flex lj:flex-col lj:gap-1">
							<div className="lj:mb-1 lj:grid lj:grid-cols-7 lj:gap-1">
								{weekdayLabels.map((weekday, index) => (
									<div
										key={`${weekday}-${index}`}
										className="lj:flex lj:h-6 lj:items-center lj:justify-center lj:text-[10px] lj:uppercase lj:tracking-wider lj:text-lj-c-hint"
									>
										{weekday}
									</div>
								))}
							</div>
							<div className="lj:grid lj:grid-cols-7 lj:gap-1">
								{calendarDays.map((day, index) => (
									<button
										key={`${day.dateKey}-${index}`}
										ref={day.isSelected ? initialFocusRef : undefined}
										type="button"
										className={getDayButtonClassName(day)}
										onClick={() => setDraft((prev) => selectDay(prev, day.date))}
									>
										{day.date.getDate()}
									</button>
								))}
							</div>
						</div>

						<div className="lj:-mx-4 lj:h-px lj:bg-lj-alpha-5" />

						<div className="lj:flex lj:flex-col lj:gap-3">
							<div className="lj:flex lj:items-center lj:justify-between">
								<div className="lj:flex lj:items-center lj:gap-1.5 lj:text-lj-c-secondary">
									<ObsidianIcon name="clock" className="lj:size-3.5" />
								</div>
								<div className="lj:flex lj:items-center lj:gap-1">
									<TimeStepper
										value={currentDraft.hour}
										max={23}
										onChange={(hour) => setDraft((prev) => prev ? { ...prev, hour } : null)}
									/>
									<span className="lj:px-0.5 lj:font-mono lj:text-lj-c-muted">:</span>
									<TimeStepper
										value={currentDraft.minute}
										max={59}
										step={MINUTE_STEP}
										onChange={(minute) => setDraft((prev) => prev ? { ...prev, minute } : null)}
									/>
								</div>
							</div>

							<div className="lj:flex lj:items-center lj:justify-between lj:pt-1">
								<div className="lj:flex lj:items-center lj:gap-3">
									<button
										type="button"
										className="lj:text-[11px] lj:font-medium lj:uppercase lj:tracking-wide lj:text-lj-c-secondary lj:transition-colors lj:hover:text-lj-c-strong"
										onClick={() => commit(null)}
									>
										{t('DATETIME_PICKER_CLEAR')}
									</button>
									<button
										type="button"
										className="lj:text-[11px] lj:font-medium lj:uppercase lj:tracking-wide lj:text-lj-c-secondary lj:transition-colors lj:hover:text-lj-c-strong"
										onClick={() => setDraft(readDraftFromValue(buildIsoDatetimeInTimeZone(new Date(), getCurrentTimeZoneSetting())))}
									>
										{t('DATETIME_PICKER_TODAY')}
									</button>
								</div>
								<div className="lj:flex lj:items-center lj:gap-2">
									<ActionButton variant="subtle" onClick={() => setIsEditing(false)}>
										{t('DATETIME_PICKER_CANCEL')}
									</ActionButton>
									<ActionButton variant="primary" onClick={() => commit(currentDraft)}>
										{t('DATETIME_PICKER_APPLY')}
									</ActionButton>
								</div>
							</div>
						</div>
					</div>
				</div>,
				triggerRef.current?.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`) ?? activeDocument.body,
			)}
		</div>
	)
}

function getEditableDatetimeTriggerClassName(align: 'left' | 'right', className: string) {
	return `lj:group/datetime lj:inline-flex lj:cursor-text lj:items-center lj:gap-1.5 lj:rounded-md lj:border lj:border-transparent lj:px-2 lj:py-1 lj:transition-all lj:hover:bg-lj-surf-button-hover-soft ${align === 'right' ? 'lj:relative lj:w-full lj:justify-end lj:text-right lj:overflow-visible' : 'lj:text-left'} ${className}`.trim()
}

function getEditableDatetimeDisplayClassName(align: 'left' | 'right') {
	return align === 'right' ? 'lj:min-w-0 lj:flex-1 lj:text-right' : ''
}

function getEditableDatetimeIconClassName(align: 'left' | 'right') {
	return `lj:text-lj-c-hint-faint lj:opacity-0 lj:transition-opacity lj:group-hover/datetime:opacity-100 ${align === 'right' ? 'lj:absolute lj:right-1' : ''}`.trim()
}

function TimeStepper({
	value,
	max,
	step = 1,
	onChange,
}: {
	value: number
	max: number
	step?: number
	onChange: (val: number) => void
}) {
	const [draft, setDraft] = useState(padNumber(value))

	useEffect(() => {
		setDraft(padNumber(value))
	}, [value])

	const commit = () => {
		let parsed = parseInt(draft, 10)
		if (Number.isNaN(parsed)) {
			parsed = value
		} else {
			parsed = clamp(parsed, 0, max)
		}
		setDraft(padNumber(parsed))
		if (parsed !== value) {
			onChange(parsed)
		}
	}

	const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		e.stopPropagation()
		switch (e.key) {
			case 'Enter':
				e.preventDefault()
				e.currentTarget.blur()
				break
			case 'ArrowUp':
				e.preventDefault()
				onChange((value + step) % (max + 1))
				break
			case 'ArrowDown':
				e.preventDefault()
				onChange((value - step + max + 1) % (max + 1))
				break
			default:
				break
		}
	}

	return (
		<div className="lj:flex lj:items-center lj:gap-0.5 lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-panel-faint lj:p-0.5">
			<button
				type="button"
				tabIndex={-1}
				className="lj:flex lj:h-6 lj:w-5 lj:items-center lj:justify-center lj:rounded-[4px] lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-surf-button-hover-soft lj:hover:text-lj-c-strong"
				onClick={() => onChange((value - step + max + 1) % (max + 1))}
			>
				<ObsidianIcon name="minus" className="lj:size-3" />
			</button>
			<input
				type="text"
				inputMode="numeric"
				value={draft}
				onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
				onBlur={commit}
				onKeyDown={handleKeyDown}
				className="lj:w-6 lj:rounded lj:bg-transparent lj:p-0 lj:text-center lj:font-mono lj:text-[13px] lj:text-lj-c-strong lj:outline-none lj:border-none lj:ring-0 lj:focus:ring-0 lj:focus:bg-lj-alpha-5"
			/>
			<button
				type="button"
				tabIndex={-1}
				className="lj:flex lj:h-6 lj:w-5 lj:items-center lj:justify-center lj:rounded-[4px] lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-surf-button-hover-soft lj:hover:text-lj-c-strong"
				onClick={() => onChange((value + step) % (max + 1))}
			>
				<ObsidianIcon name="plus" className="lj:size-3" />
			</button>
		</div>
	)
}

function ActionButton({
	children,
	onClick,
	variant,
}: {
	children: ReactNode
	onClick: () => void
	variant: 'subtle' | 'primary'
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`lj:inline-flex lj:h-7 lj:items-center lj:justify-center lj:rounded-md lj:px-3 lj:text-[11px] lj:font-medium lj:uppercase lj:tracking-wide lj:transition-colors ${
				variant === 'primary'
					? 'lj:bg-lj-fill-contrast lj:text-lj-c-inv lj:hover:bg-lj-fill-contrast-soft'
					: 'lj:bg-lj-surf-button-subtle lj:text-lj-c-strong lj:hover:bg-lj-surf-button-hover-soft'
			}`}
		>
			{children}
		</button>
	)
}

function handlePopoverKeyDown(
	event: ReactKeyboardEvent<HTMLDivElement>,
	draft: DateParts,
	setDraft: Dispatch<SetStateAction<DateParts | null>>,
	commit: (nextDraft: DateParts | null) => void,
) {
	switch (event.key) {
		case 'ArrowLeft':
			event.preventDefault()
			setDraft((prev) => prev === null ? prev : shiftDraftDay(prev, -1))
			return
		case 'ArrowRight':
			event.preventDefault()
			setDraft((prev) => prev === null ? prev : shiftDraftDay(prev, 1))
			return
		case 'ArrowUp':
			event.preventDefault()
			setDraft((prev) => prev === null ? prev : shiftDraftDay(prev, -7))
			return
		case 'ArrowDown':
			event.preventDefault()
			setDraft((prev) => prev === null ? prev : shiftDraftDay(prev, 7))
			return
		case 'Enter':
			// @story [[lucrjournal/primitives#^editable-datetime-save]] Commits the current datetime draft with Enter
			event.preventDefault()
			commit(draft)
			return
		default:
			return
	}
}

function readDraftFromValue(value: string | null | undefined): DateParts {
	const parsed = parseIsoDatetime(value)
	if (parsed !== null) {
		return parsed
	}

	return parseIsoDatetime(buildIsoDatetimeInTimeZone(new Date(), getCurrentTimeZoneSetting()))!
}

function parseIsoDatetime(value: string | null | undefined): DateParts | null {
	if (value == null) {
		return null
	}

	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/)
	if (match === null) {
		return null
	}

	const [, year, month, day, hour, minute, offset] = match
	if (
		year === undefined ||
		month === undefined ||
		day === undefined ||
		hour === undefined ||
		minute === undefined ||
		offset === undefined
	) {
		return null
	}

	return {
		year: Number(year),
		month: Number(month),
		day: Number(day),
		hour: Number(hour),
		minute: Number(minute),
		offset: offset === 'Z' ? '+00:00' : offset,
	}
}

function formatDraftAsIso(draft: DateParts): string {
	return `${draft.year}-${padNumber(draft.month)}-${padNumber(draft.day)}T${padNumber(draft.hour)}:${padNumber(draft.minute)}:00${draft.offset}`
}

function padNumber(value: number): string {
	return String(value).padStart(2, '0')
}

function getCurrentMonthSeed() {
	const now = readDraftFromValue(null)
	return new Date(now.year, now.month - 1, 1)
}

function buildCalendarDays(visibleMonth: Date, draft: DateParts | null) {
	const year = visibleMonth.getFullYear()
	const monthIndex = visibleMonth.getMonth()
	const firstOfMonth = new Date(year, monthIndex, 1)
	const startOffset = (firstOfMonth.getDay() + 6) % 7
	const startDate = new Date(year, monthIndex, 1 - startOffset)

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(startDate)
		date.setDate(startDate.getDate() + index)
		const isCurrentMonth = date.getMonth() === monthIndex
		const isToday = isSameDate(date, new Date())
		const isSelected = draft !== null &&
			draft.year === date.getFullYear() &&
			draft.month === date.getMonth() + 1 &&
			draft.day === date.getDate()
		return {
			date,
			dateKey: `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
			isCurrentMonth,
			isToday,
			isSelected,
		}
	})
}

function getDayButtonClassName(day: ReturnType<typeof buildCalendarDays>[number]) {
	return `lj:relative lj:flex lj:h-8 lj:w-full lj:items-center lj:justify-center lj:rounded-md lj:text-[13px] lj:tabular-nums lj:transition-colors ${
		day.isSelected
			? 'lj:bg-lj-fill-contrast lj:font-medium lj:text-lj-c-inv lj:shadow-sm'
			: day.isToday
				? 'lj:border lj:border-lj-alpha-20 lj:bg-lj-alpha-5 lj:font-medium lj:text-lj-c-strong'
				: day.isCurrentMonth
					? 'lj:text-lj-c-strong lj:hover:bg-lj-surf-button-hover-soft'
					: 'lj:text-lj-c-muted-faint lj:hover:bg-lj-surf-button-hover-faint'
	}`
}

function selectDay(prev: DateParts | null, date: Date): DateParts {
	const base = prev ?? readDraftFromValue(null)
	return {
		...base,
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate(),
	}
}

function shiftDraftMonth(prev: DateParts | null, delta: number): DateParts {
	const base = prev ?? readDraftFromValue(null)
	const shifted = new Date(base.year, base.month - 1 + delta, 1)
	const clampedDay = Math.min(base.day, new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate())
	return {
		...base,
		year: shifted.getFullYear(),
		month: shifted.getMonth() + 1,
		day: clampedDay,
	}
}

function shiftDraftDay(prev: DateParts, delta: number): DateParts {
	const shifted = new Date(prev.year, prev.month - 1, prev.day + delta)
	return {
		...prev,
		year: shifted.getFullYear(),
		month: shifted.getMonth() + 1,
		day: shifted.getDate(),
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('getEditableDatetimeTriggerClassName', () => {
		it('keeps default datetime triggers left aligned', () => {
			expect(getEditableDatetimeTriggerClassName('left', '')).toContain('lj:text-left')
			expect(getEditableDatetimeTriggerClassName('left', '')).not.toContain('lj:justify-end')
		})

		it('right aligns datetime trigger content for sidebar usage', () => {
			expect(getEditableDatetimeTriggerClassName('right', '')).toContain('lj:w-full')
			expect(getEditableDatetimeTriggerClassName('right', '')).toContain('lj:justify-end')
			expect(getEditableDatetimeTriggerClassName('right', '')).toContain('lj:text-right')
			expect(getEditableDatetimeTriggerClassName('right', '')).toContain('lj:overflow-visible')
		})
	})

	describe('getEditableDatetimeDisplayClassName', () => {
		it('makes right aligned datetime text fill the value column', () => {
			expect(getEditableDatetimeDisplayClassName('right')).toContain('lj:flex-1')
			expect(getEditableDatetimeDisplayClassName('right')).toContain('lj:text-right')
		})
	})

	describe('getEditableDatetimeIconClassName', () => {
		it('pins right aligned datetime icons to the trailing edge instead of shifting the value', () => {
			expect(getEditableDatetimeIconClassName('right')).toContain('lj:absolute')
			expect(getEditableDatetimeIconClassName('right')).toContain('lj:right-1')
		})
	})
}

function isSameDate(left: Date, right: Date) {
	return left.getFullYear() === right.getFullYear()
		&& left.getMonth() === right.getMonth()
		&& left.getDate() === right.getDate()
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('parseIsoDatetime', () => {
		it('parses second precision ISO datetimes and preserves offset', () => {
			expect(parseIsoDatetime('2026-04-05T13:25:00+08:00')).toEqual({
				year: 2026,
				month: 4,
				day: 5,
				hour: 13,
				minute: 25,
				offset: '+08:00',
			})
		})

		it('rejects invalid wall clock formats', () => {
			expect(parseIsoDatetime('2026-04-05 13:25')).toBeNull()
		})
	})

	describe('shiftDraftMonth', () => {
		it('clamps the day when the target month is shorter', () => {
			expect(shiftDraftMonth({
				year: 2026,
				month: 3,
				day: 31,
				hour: 11,
				minute: 5,
				offset: '+08:00',
			}, 1)).toMatchObject({
				year: 2026,
				month: 4,
				day: 30,
			})
		})
	})
}
