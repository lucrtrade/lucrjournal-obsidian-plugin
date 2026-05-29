/// <reference types="vitest/importMeta" />

export type CalendarCell = {
	date: Date
	day: number
	isCurrentMonth: boolean
	isToday: boolean
}

export function buildCalendarGrid(year: number, month: number, startOfWeek: 0 | 1 = 1): CalendarCell[][] {
	const today = new Date()
	const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`

	const firstDay = new Date(year, month, 1)
	const startOffset = (firstDay.getDay() + (7 - startOfWeek)) % 7

	const daysInMonth = new Date(year, month + 1, 0).getDate()
	const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

	const cells: CalendarCell[] = []
	for (let index = 0; index < totalCells; index += 1) {
		const date = new Date(year, month, 1 - startOffset + index)
		const isCurrentMonth = date.getMonth() === month && date.getFullYear() === year
		const cellStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
		cells.push({
			date,
			day: date.getDate(),
			isCurrentMonth,
			isToday: cellStr === todayStr,
		})
	}

	const weeks: CalendarCell[][] = []
	for (let index = 0; index < cells.length; index += 7) {
		weeks.push(cells.slice(index, index + 7))
	}
	return weeks
}

export function toDateKey(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

export function toDateKeyInTimeZone(date: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date)

	const getPart = (type: Intl.DateTimeFormatPartTypes) => {
		const value = parts.find((part) => part.type === type)?.value
		if (value === undefined) {
			throw new Error(`Missing ${type} in date key formatting parts`)
		}
		return value
	}

	return `${getPart('year')}-${getPart('month')}-${getPart('day')}`
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('buildCalendarGrid', () => {
		it('produces only the weeks needed for the visible month', () => {
			const grid = buildCalendarGrid(2026, 4)
			expect(grid).toHaveLength(5)
			for (const week of grid) {
				expect(week).toHaveLength(7)
			}
		})

		it('keeps six rows when the visible month spans six weeks', () => {
			expect(buildCalendarGrid(2026, 2)).toHaveLength(6)
		})

		it('aligns the first column to Monday when startOfWeek is 1', () => {
			const grid = buildCalendarGrid(2026, 0, 1)
			for (const week of grid) {
				expect(week[0]!.date.getDay()).toBe(1)
				expect(week[6]!.date.getDay()).toBe(0)
			}
		})

		it('aligns the first column to Sunday when startOfWeek is 0', () => {
			const grid = buildCalendarGrid(2026, 0, 0)
			for (const week of grid) {
				expect(week[0]!.date.getDay()).toBe(0)
				expect(week[6]!.date.getDay()).toBe(6)
			}
		})

		it('flags only in-month cells as current month', () => {
			const grid = buildCalendarGrid(2026, 4)
			for (const week of grid) {
				for (const cell of week) {
					expect(cell.isCurrentMonth).toBe(cell.date.getMonth() === 4 && cell.date.getFullYear() === 2026)
				}
			}
		})
	})

	describe('toDateKey', () => {
		it('zero-pads month and day to YYYY-MM-DD', () => {
			expect(toDateKey(new Date(2026, 0, 3))).toBe('2026-01-03')
			expect(toDateKey(new Date(2026, 10, 30))).toBe('2026-11-30')
		})
	})

	describe('toDateKeyInTimeZone', () => {
		it('formats date keys in an explicit timezone', () => {
			const date = new Date('2026-05-01T03:00:00+08:00')
			expect(toDateKeyInTimeZone(date, 'Asia/Shanghai')).toBe('2026-05-01')
			expect(toDateKeyInTimeZone(date, 'America/New_York')).toBe('2026-04-30')
		})
	})
}
