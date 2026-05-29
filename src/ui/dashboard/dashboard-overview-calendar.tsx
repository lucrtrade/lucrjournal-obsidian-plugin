/// <reference types="vitest/importMeta" />

import { Fragment, useMemo, type MouseEvent, type ReactElement, type ReactNode } from 'react'

import { formatLocalizedMonthName, getCurrentLocale, t } from '../../lang/helpers'
import { getCurrentTimeZoneSetting, setCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import { formatAmount, formatCompactAmount, roundAmountValue, toDateKey, toDateKeyInTimeZone, type CalendarCell } from '../../utils'
import { ObsidianIcon } from '../primitives/obsidian-icon'
import { StatusDot } from '../primitives/status-dot'
import { useCalendar } from '../primitives/use-calendar'

import { WEEKDAY_HEADERS } from './dashboard-constants'

import type { Position } from '../../domains/position'
import type { LinkActivationEvent } from '../../views/link-activation'

type TradeData = { trades: number; pnl: number }

const NARROW_WEEKDAY_LABEL_KEYS = {
	MON: 'DASHBOARD_WEEKDAY_NARROW_MON',
	TUE: 'DASHBOARD_WEEKDAY_NARROW_TUE',
	WED: 'DASHBOARD_WEEKDAY_NARROW_WED',
	THU: 'DASHBOARD_WEEKDAY_NARROW_THU',
	FRI: 'DASHBOARD_WEEKDAY_NARROW_FRI',
	SAT: 'DASHBOARD_WEEKDAY_NARROW_SAT',
	SUN: 'DASHBOARD_WEEKDAY_NARROW_SUN',
} as const

const MOBILE_WEEKDAY_IDS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const SMALL_STATUS_DOT_SIZE_CLASS_NAME = 'lj:size-1.5'
const LEGEND_STATUS_DOT_SIZE_CLASS_NAME = 'lj:size-2'

function getDesktopCalendarGridClassName() {
	return 'lj:grid lj:grid-cols-8 lj:border lj:border-lj-calendar-grid-line lj:rounded-lg lj:overflow-hidden lj:shadow-xl lj:dark:shadow-2xl'
}

function getWeekdayHeaderClassName(dayId: string) {
	return `lj-calendar-grid-cell lj:bg-lj-calendar-header-bg lj:p-4 lj:text-[10px] lj:tracking-[0.2em] lj:text-lj-calendar-header-text lj:font-medium lj:text-center ${dayId === 'WEEKLY' ? 'lj:bg-lj-weekly-bg' : ''}`
}

function buildTradesByDate(positions: Position[]): Record<string, TradeData> {
	const map: Record<string, TradeData> = {}
	for (const p of positions) {
		if (!p.opened_at) {
			continue 
		}
		const openedAt = new Date(p.opened_at)
		if (Number.isNaN(openedAt.getTime())) {
			continue
		}

		const key = toDateKeyInTimeZone(openedAt, getCurrentTimeZoneSetting())
		const existing = map[key]
		if (existing) {
			existing.trades += 1
			existing.pnl = roundAmountValue(existing.pnl + (p.profit ?? 0))
		} else {
			map[key] = { trades: 1, pnl: roundAmountValue(p.profit ?? 0) }
		}
	}
	return map
}

function formatMonthYear(year: number, month: number) {
	const date = new Date(year, month, 1)
	const monthName = formatLocalizedMonthName(date)
	return { monthName, year: String(year) }
}

function CalendarDayCell({
	cell,
	trade,
	onSelectDate,
}: {
	cell: CalendarCell
	trade?: TradeData
	onSelectDate: (dateKey: string, event?: LinkActivationEvent) => void
}) {
	if (!cell.isCurrentMonth) {
		return <div className="lj-calendar-grid-cell lj:aspect-[4/3] lj:bg-lj-calendar-cell-bg lj:p-4 lj:md:p-5 lj:overflow-hidden" />
	}

	const dateKey = toDateKey(cell.date)
	const isClickable = trade !== undefined
	const hasProfit = trade && trade.pnl > 0
	const hasLoss = trade && trade.pnl < 0

	return (
		<div
			onClick={isClickable ? (event: MouseEvent<HTMLDivElement>) => onSelectDate(dateKey, event) : undefined}
			className={`lj-calendar-grid-cell lj:group lj:aspect-[4/3] lj:bg-lj-calendar-cell-bg lj:p-4 lj:md:p-5 lj:flex lj:flex-col lj:justify-between lj:relative lj:overflow-hidden lj:hover:bg-lj-calendar-cell-hover lj:transition-colors ${
				isClickable ? 'lj:cursor-pointer' : ''
			}`}
		>
			<span className={`lj:text-xs lj:font-mono lj:transition-colors ${cell.isToday ? 'lj:font-bold lj:text-lj-c-strong' : 'lj:text-lj-c-hint lj:group-hover:text-lj-c-tertiary'}`}>
				{cell.day}
			</span>
			{trade && (
				<StatusDot sizeClassName={SMALL_STATUS_DOT_SIZE_CLASS_NAME} className="lj:absolute lj:top-4 lj:right-4 lj:md:top-5 lj:md:right-5" tone={hasProfit ? 'highlight' : 'muted'} emphasized={hasProfit} />
			)}
			{trade && (
				<div className="lj:absolute lj:bottom-2 lj:left-2 lj:right-2 lj:md:bottom-3 lj:md:left-3 lj:md:right-3 lj:flex lj:min-w-0 lj:flex-col lj:gap-0.5 lj:overflow-hidden">
					<div className="lj:truncate lj:text-[8px] lj:md:text-[9px] lj:tracking-wider lj:font-mono lj:text-lj-c-hint">
						{t('DASHBOARD_TRADES_COUNT', { count: trade.trades })}
					</div>
					<div className={`lj:truncate lj:text-xs lj:md:text-[13px] lj:font-mono lj:tracking-tight ${hasLoss ? 'lj:text-lj-c-hint' : 'lj:text-lj-c-strong'}`}>
						{hasLoss ? '-' : '+'}${formatAmount(Math.abs(trade.pnl))}
					</div>
				</div>
			)}
		</div>
	)
}

function MobileCalendarDayCell({
	cell,
	trade,
	onSelectDate,
}: {
	cell: CalendarCell
	trade?: TradeData
	onSelectDate: (dateKey: string, event?: LinkActivationEvent) => void
}) {
	const hasTrade = trade !== undefined
	const hasProfit = (trade?.pnl ?? 0) > 0
	const hasLoss = (trade?.pnl ?? 0) < 0
	const pnlText = trade
		? `${hasLoss ? '-' : '+'}${formatCompactAmount(Math.abs(trade.pnl))}`
		: null
	const isClickable = hasTrade && cell.isCurrentMonth

	return (
		<td
			onClick={isClickable ? (event: MouseEvent<HTMLTableCellElement>) => onSelectDate(toDateKey(cell.date), event) : undefined}
			className={`lj:w-[14.285%] lj:border lj:border-lj-border lj:p-1 lj:align-top lj:h-14 lj:sm:h-16 lj:relative lj:overflow-hidden ${
				cell.isCurrentMonth
					? cell.isToday
						? 'lj:bg-lj-surf-segmented-active'
						: ''
					: 'lj:bg-lj-surf-segmented-muted'
			} ${isClickable ? 'lj:cursor-pointer' : ''}`}
		>
			<div className="lj:flex lj:min-w-0 lj:flex-col lj:h-full lj:justify-between">
				<div className="lj:flex lj:min-w-0 lj:items-start lj:justify-between">
					<span
						className={`lj:min-w-0 lj:truncate lj:text-[10px] lj:sm:text-xs ${
							cell.isCurrentMonth
								? cell.isToday
									? 'lj:font-bold lj:text-lj-text'
									: 'lj:text-lj-text-secondary'
								: 'lj:text-lj-text-muted/40'
						}`}
					>
						{cell.day}
					</span>
					{hasTrade && cell.isCurrentMonth && (
						<StatusDot
							sizeClassName={SMALL_STATUS_DOT_SIZE_CLASS_NAME}
							tone={hasProfit ? 'highlight' : hasLoss ? 'muted' : 'faint'}
							emphasized={hasProfit}
						/>
					)}
				</div>

				{hasTrade && cell.isCurrentMonth && (
					<div className="lj:flex lj:min-w-0 lj:flex-col lj:gap-0.5">
						<div className="lj:flex lj:min-w-0 lj:items-center lj:gap-0.5 lj:text-[9px] lj:text-lj-text-muted">
							<ObsidianIcon name="list" className="lj:size-2.5" />
							<span className="lj:min-w-0 lj:truncate lj:leading-none">{trade.trades}</span>
						</div>
						<div
							className={`lj:flex lj:min-w-0 lj:items-center lj:gap-0.5 lj:text-[9px] lj:sm:text-[10px] lj:font-medium lj:leading-none ${
								hasProfit ? 'lj:text-lj-profit-text' : hasLoss ? 'lj:text-lj-loss-text' : 'lj:text-lj-text-muted'
							}`}
						>
							<ObsidianIcon
								name={hasLoss ? 'arrow-down-right' : 'arrow-up-right'}
								className="lj:size-2.5"
							/>
							<span className="lj:min-w-0 lj:truncate">{pnlText}</span>
						</div>
					</div>
				)}
			</div>
		</td>
	)
}

function WeeklySummary({ week, tradesByDate }: { week: CalendarCell[]; tradesByDate: Record<string, TradeData> }) {
	let trades = 0
	let pnl = 0
	for (const cell of week) {
		const trade = tradesByDate[toDateKey(cell.date)]
		if (trade) {
			trades += trade.trades
			pnl = roundAmountValue(pnl + trade.pnl)
		}
	}

	if (trades === 0) {
		return <div className="lj-calendar-grid-cell lj:aspect-[4/3] lj:bg-lj-weekly-bg lj:p-4 lj:md:p-5 lj:overflow-hidden" />
	}

	return (
		<div className="lj-calendar-grid-cell lj:aspect-[4/3] lj:bg-lj-weekly-bg lj:p-4 lj:md:p-5 lj:flex lj:flex-col lj:items-center lj:justify-center lj:relative lj:text-center lj:overflow-hidden">
			<div className="lj:truncate lj:text-[9px] lj:md:text-[10px] lj:tracking-wider lj:font-mono lj:text-lj-c-hint lj:mb-2">
				{t('DASHBOARD_TRADES_COUNT', { count: trades })}
			</div>
			<div className={`lj:truncate lj:text-xs lj:md:text-sm lj:font-mono lj:tracking-tight ${pnl >= 0 ? 'lj:text-lj-c-strong' : 'lj:text-lj-c-hint'}`}>
				{pnl >= 0 ? '+' : '-'}${formatAmount(Math.abs(pnl))}
			</div>
		</div>
	)
}

export function DashboardOverviewCalendar({
	positions,
	onSelectDate,
}: {
	positions: Position[]
	onSelectDate: (dateKey: string, event?: LinkActivationEvent) => void
}) {
	const locale = getCurrentLocale()
	const { year, month, weeks, prevMonth, nextMonth, goToToday } = useCalendar()
	const { monthName, year: yearStr } = formatMonthYear(year, month)
	const tradesByDate = useMemo(() => buildTradesByDate(positions), [positions])

	return (
		<section className="lj:flex lj:flex-col lj:gap-6 lj:sm:gap-8">
			<div className="lj:flex lj:flex-col lj:gap-2 lj:md:flex-row lj:md:justify-between lj:md:items-end">
				<div className="lj:flex lj:items-center lj:gap-3 lj:sm:gap-4">
					<h2 className="lj:flex lj:items-baseline lj:gap-2 lj:text-2xl lj:sm:text-3xl lj:font-light lj:tracking-tight lj:text-lj-c-strong">
						{locale === 'zh' ? (
							<>
								<span className="lj:text-lj-c-hint-vivid">{yearStr}</span>
								<span>{monthName}</span>
							</>
						) : (
							<>
								<span>{monthName}</span>
								<span className="lj:text-lj-c-hint-vivid">{yearStr}</span>
							</>
						)}
					</h2>
					<div className="lj:flex lj:items-center lj:gap-1">
						<button
							onClick={prevMonth}
							className="lj:p-1.5 lj:rounded-md lj:text-lj-text-muted lj:hover:text-lj-text lj:hover:bg-lj-alpha-5 lj:transition-colors"
							aria-label={t('DASHBOARD_CALENDAR_PREVIOUS_MONTH')}
						>
							<svg className="lj:size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
						</button>
						<button
							onClick={goToToday}
							className="lj:px-2 lj:py-1 lj:rounded-md lj:text-[10px] lj:tracking-wider lj:font-medium lj:text-lj-text-muted lj:hover:text-lj-text lj:hover:bg-lj-alpha-5 lj:transition-colors"
						>
							{t('DASHBOARD_CALENDAR_GO_TO_TODAY')}
						</button>
						<button
							onClick={nextMonth}
							className="lj:p-1.5 lj:rounded-md lj:text-lj-text-muted lj:hover:text-lj-text lj:hover:bg-lj-alpha-5 lj:transition-colors"
							aria-label={t('DASHBOARD_CALENDAR_NEXT_MONTH')}
						>
							<svg className="lj:size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
						</button>
					</div>
				</div>
				<div className="lj:hidden lj:md:flex lj:items-center lj:gap-4 lj:text-xs lj:tracking-wider lj:text-lj-c-hint-vivid">
					<span className="lj:flex lj:items-center lj:gap-1.5">
						<StatusDot sizeClassName={LEGEND_STATUS_DOT_SIZE_CLASS_NAME} tone="highlight" />
						{t('DASHBOARD_CALENDAR_PROFIT')}
					</span>
					<span className="lj:flex lj:items-center lj:gap-1.5">
						<StatusDot sizeClassName={LEGEND_STATUS_DOT_SIZE_CLASS_NAME} tone="muted" />
						{t('DASHBOARD_CALENDAR_LOSS')}
					</span>
				</div>
			</div>

			<div className="lj:md:hidden lj:border lj:border-lj-alpha-10 lj:rounded-xl lj:overflow-hidden lj:bg-lj-surf-panel-faint">
				<table className="lj:w-full lj:border-collapse lj:table-fixed">
					<thead>
						<tr>
							{MOBILE_WEEKDAY_IDS.map((dayId) => (
								<th
									key={dayId}
									className="lj:text-[9px] lj:sm:text-[10px] lj:tracking-[0.08em] lj:text-lj-c-hint lj:font-medium lj:py-2 lj:text-center lj:border-b lj:border-lj-alpha-10"
								>
									{t(NARROW_WEEKDAY_LABEL_KEYS[dayId])}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{weeks.map((week, index) => (
							<tr key={index}>
								{week.map((cell) => (
									<MobileCalendarDayCell
										key={toDateKey(cell.date)}
										cell={cell}
										trade={cell.isCurrentMonth ? tradesByDate[toDateKey(cell.date)] : undefined}
										onSelectDate={onSelectDate}
									/>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="lj:hidden lj:md:block lj:w-full lj:overflow-x-auto lj:pb-4">
				<div className="lj:min-w-[800px]">
					<div className={getDesktopCalendarGridClassName()}>
						{WEEKDAY_HEADERS.map((day) => (
							<div key={day.id} className={getWeekdayHeaderClassName(day.id)}>
								{t(day.labelKey)}
							</div>
						))}
						{weeks.map((week, index) => (
							<Fragment key={index}>
								{week.map((cell) => (
									<CalendarDayCell
										key={toDateKey(cell.date)}
										cell={cell}
										trade={cell.isCurrentMonth ? tradesByDate[toDateKey(cell.date)] : undefined}
										onSelectDate={onSelectDate}
									/>
								))}
								<WeeklySummary key={`weekly-${index}`} week={week} tradesByDate={tradesByDate} />
							</Fragment>
						))}
					</div>
				</div>
			</div>
		</section>
	)
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it } = import.meta.vitest

	type TestElement = ReactElement<{ className?: string; children?: ReactNode }>

	function asTestElement(value: ReactNode): TestElement {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			throw new Error('value is not a React element')
		}
		return value as TestElement
	}

	function child(element: TestElement, index: number): TestElement {
		const children = element.props.children
		if (!Array.isArray(children)) {
			throw new Error('children is not an array')
		}
		return asTestElement(children[index] as ReactNode)
	}

	function onlyChild(element: TestElement): TestElement {
		return asTestElement(element.props.children)
	}

	function expectClassName(value: unknown, className: string) {
		if (typeof value !== 'string') {
			throw new Error('className is not a string')
		}
		expect(value.split(/\s+/u)).toContain(className)
	}

	describe('buildTradesByDate', () => {
		const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

		afterEach(() => {
			setCurrentTimeZoneSetting(defaultTimeZone)
		})

		it('aggregates trades and PnL by opened_at date key', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
			const map = buildTradesByDate([
				{ opened_at: '2026-05-01T03:00:00+08:00', profit: 10 } as Position,
				{ opened_at: '2026-05-01T08:00:00+08:00', profit: 4.005 } as Position,
				{ opened_at: '2026-05-02T01:00:00+08:00', profit: -7 } as Position,
			])

			expect(Object.entries(map).sort()).toEqual([
				['2026-05-01', { trades: 2, pnl: 14.005 }],
				['2026-05-02', { trades: 1, pnl: -7 }],
			])
		})

		it('skips positions with missing or unparseable opened_at', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
			const map = buildTradesByDate([
				{ opened_at: '', profit: 1 } as unknown as Position,
				{ opened_at: 'not-a-date', profit: 2 } as Position,
				{ opened_at: '2026-05-01T00:00:00+08:00', profit: 3 } as Position,
			])

			expect(Object.entries(map)).toEqual([
				['2026-05-01', { trades: 1, pnl: 3 }],
			])
		})

		it('treats missing profit as zero', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
			const map = buildTradesByDate([
				{ opened_at: '2026-05-01T08:00:00+08:00' } as Position,
				{ opened_at: '2026-05-01T09:00:00+08:00', profit: null } as unknown as Position,
			])

			expect(Object.entries(map)).toEqual([
				['2026-05-01', { trades: 2, pnl: 0 }],
			])
		})

		it('uses settings timezone instead of process timezone for date keys', () => {
			setCurrentTimeZoneSetting('America/New_York')
			const map = buildTradesByDate([
				{ opened_at: '2026-05-01T03:00:00+08:00', profit: 10 } as Position,
			])

			expect(Object.entries(map)).toEqual([
				['2026-04-30', { trades: 1, pnl: 10 }],
			])
		})
	})

	describe('getWeekdayHeaderClassName', () => {
		it('matches the desktop grid header surface', () => {
			const classes = getWeekdayHeaderClassName('MON').split(/\s+/u)
			expect(classes).toContain('lj-calendar-grid-cell')
			expect(classes).toContain('lj:bg-lj-calendar-header-bg')
			expect(classes).not.toContain('lj:border-b')
			expect(classes).not.toContain('lj:border-l')
		})

		it('uses the weekly surface for the weekly header', () => {
			expectClassName(getWeekdayHeaderClassName('WEEKLY'), 'lj:bg-lj-weekly-bg')
		})
	})

	describe('getDesktopCalendarGridClassName', () => {
		it('uses one-pixel grid gaps as calendar lines', () => {
			expectClassName(getDesktopCalendarGridClassName(), 'lj:grid')
			expectClassName(getDesktopCalendarGridClassName(), 'lj:grid-cols-8')
			expect(getDesktopCalendarGridClassName().split(/\s+/u)).not.toContain('lj:gap-px')
			expect(getDesktopCalendarGridClassName().split(/\s+/u)).not.toContain('lj:bg-lj-calendar-grid-line')
			expectClassName(getDesktopCalendarGridClassName(), 'lj:border-lj-calendar-grid-line')
		})
	})

	describe('CalendarDayCell', () => {
		it('keeps desktop day amounts inside the calendar cell', () => {
			const cell = {
				date: new Date(2026, 4, 1),
				day: 1,
				isCurrentMonth: true,
				isToday: false,
			}
			const td = asTestElement(CalendarDayCell({
				cell,
				trade: { trades: 1, pnl: 9999999 },
				onSelectDate: () => {},
			}))
			const amountBox = child(td, 2)
			const amount = child(amountBox, 1)

			expect(td.type).toBe('div')
			expectClassName(td.props.className, 'lj-calendar-grid-cell')
			expectClassName(td.props.className, 'lj:aspect-[4/3]')
			expect(td.props.className?.split(/\s+/u)).not.toContain('lj:border')
			expectClassName(td.props.className, 'lj:overflow-hidden')
			expectClassName(amountBox.props.className, 'lj:right-2')
			expectClassName(amountBox.props.className, 'lj:overflow-hidden')
			expectClassName(amount.props.className, 'lj:truncate')
		})

		it('keeps mobile day amounts inside the calendar cell', () => {
			const cell = {
				date: new Date(2026, 4, 1),
				day: 1,
				isCurrentMonth: true,
				isToday: false,
			}
			const td = asTestElement(MobileCalendarDayCell({
				cell,
				trade: { trades: 1, pnl: 0.00001233 },
				onSelectDate: () => {},
			}))
			const content = onlyChild(td)
			const amountBox = child(content, 1)
			const pnlRow = child(amountBox, 1)
			const amount = child(pnlRow, 1)

			expectClassName(td.props.className, 'lj:overflow-hidden')
			expectClassName(amountBox.props.className, 'lj:min-w-0')
			expectClassName(pnlRow.props.className, 'lj:min-w-0')
			expectClassName(amount.props.className, 'lj:truncate')
		})

		it('keeps weekly summary amounts inside the summary cell', () => {
			const week = [
				{ date: new Date(2026, 4, 1), day: 1, isCurrentMonth: true, isToday: false },
			]
			const td = asTestElement(WeeklySummary({
				week,
				tradesByDate: {
					'2026-05-01': { trades: 1, pnl: 9999999 },
				},
			}))
			const amount = child(td, 1)

			expect(td.type).toBe('div')
			expectClassName(td.props.className, 'lj-calendar-grid-cell')
			expectClassName(td.props.className, 'lj:aspect-[4/3]')
			expect(td.props.className?.split(/\s+/u)).not.toContain('lj:border')
			expectClassName(td.props.className, 'lj:overflow-hidden')
			expectClassName(amount.props.className, 'lj:truncate')
		})
	})
}
