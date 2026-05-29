import { useMemo, useState } from 'react'

import { buildCalendarGrid, type CalendarCell } from '../../utils'

type UseCalendarReturn = {
	year: number
	month: number
	weeks: CalendarCell[][]
	prevMonth: () => void
	nextMonth: () => void
	goToToday: () => void
}

export function useCalendar(initialDate?: Date, startOfWeek: 0 | 1 = 1): UseCalendarReturn {
	const now = initialDate ?? new Date()
	const [year, setYear] = useState(now.getFullYear())
	const [month, setMonth] = useState(now.getMonth())

	const weeks = useMemo(() => buildCalendarGrid(year, month, startOfWeek), [year, month, startOfWeek])

	const navigate = (delta: number) => {
		const d = new Date(year, month + delta, 1)
		setYear(d.getFullYear())
		setMonth(d.getMonth())
	}

	return {
		year,
		month,
		weeks,
		prevMonth: () => navigate(-1),
		nextMonth: () => navigate(1),
		goToToday: () => {
			const today = new Date()
			setYear(today.getFullYear())
			setMonth(today.getMonth())
		},
	}
}
