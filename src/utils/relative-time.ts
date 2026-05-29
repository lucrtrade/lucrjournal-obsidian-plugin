import { moment } from 'obsidian'

import { getCurrentLocale, setCurrentLocaleSetting } from '../lang/helpers'
import { getCurrentTimeZoneSetting, setCurrentTimeZoneSetting } from '../settings/plugin-settings'

const MOMENT_LOCALE_BY_APP_LOCALE = {
	en: 'en',
	zh: 'zh-cn',
} as const

export function formatRelativeTimeFromNow(datetime: string | null | undefined): string | null {
	if (datetime == null) {
		return null
	}

	const parsed = parseDatetimeWallClock(datetime)

	if (!parsed.isValid()) {
		return null
	}

	const locale = MOMENT_LOCALE_BY_APP_LOCALE[getCurrentLocale()]
	return parsed.locale(locale).from(getCurrentWallClockMomentInTimeZone())
}

export function formatOpenedAtForDisplay(datetime: string | null | undefined): string | null {
	if (datetime == null) {
		return null
	}

	const parsed = moment.parseZone(datetime, moment.ISO_8601, true)

	if (!parsed.isValid()) {
		return null
	}

	const parts = getDateTimeParts(parsed.toDate(), getCurrentTimeZoneSetting())
	return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

function getCurrentWallClockMomentInTimeZone() {
	const timeZone = getCurrentTimeZoneSetting()
	return parseDatetimeWallClock(buildIsoDatetimeInTimeZone(new Date(), timeZone))
}

export function buildIsoDatetimeInTimeZone(date: Date, timeZone: string): string {
	const parts = getDateTimeParts(date, timeZone)
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${parts.offset}`
}

function parseDatetimeWallClock(datetime: string) {
	const wallClock = extractDatetimeWallClock(datetime)

	if (wallClock === null) {
		return moment.invalid()
	}

	return moment.parseZone(
		`${wallClock.year}-${wallClock.month}-${wallClock.day}T${wallClock.hour}:${wallClock.minute}:${wallClock.second}+00:00`,
		moment.ISO_8601,
		true,
	)
}

function getDateTimeParts(date: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
		timeZoneName: 'longOffset',
	}).formatToParts(date)

	const getPart = (type: Intl.DateTimeFormatPartTypes) => {
		const value = parts.find((part) => part.type === type)?.value

		if (value === undefined) {
			throw new Error(`Missing ${type} in datetime formatting parts`)
		}

		return value
	}

	const offset = getPart('timeZoneName').replace(/^GMT/, '')
	return {
		year: getPart('year'),
		month: getPart('month'),
		day: getPart('day'),
		hour: getPart('hour'),
		minute: getPart('minute'),
		second: getPart('second'),
		offset: offset === '' ? '+00:00' : offset,
	}
}

export function formatDuration(openedAt: string | null | undefined, closedAt: string | null | undefined): string | null {
	if (openedAt == null || closedAt == null) {
		return null
	}

	const start = moment.parseZone(openedAt, moment.ISO_8601, true)
	const end = moment.parseZone(closedAt, moment.ISO_8601, true)

	if (!start.isValid() || !end.isValid()) {
		return null
	}

	const diffMs = end.diff(start)
	if (diffMs < 0) {
		return null
	}

	const duration = moment.duration(diffMs)
	const days = Math.floor(duration.asDays())
	const hours = duration.hours()
	const minutes = duration.minutes()

	if (days > 0) {
		return hours > 0 ? `${days}d ${hours}h` : `${days}d`
	}

	if (hours > 0) {
		return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
	}

	return `${minutes}m`
}

function extractDatetimeWallClock(datetime: string) {
	const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|[+-]\d{2}:\d{2})$/)

	if (match === null) {
		return null
	}

	const [, year, month, day, hour, minute, second] = match
	if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined || second === undefined) {
		return null
	}

	return { year, month, day, hour, minute, second }
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it, vi } = import.meta.vitest

	describe('formatRelativeTimeFromNow', () => {
		const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

		afterEach(() => {
			setCurrentLocaleSetting('system')
			setCurrentTimeZoneSetting(defaultTimeZone)
			vi.useRealTimers()
		})

		it('formats relative time from opened_at in english using the configured time zone wall clock', () => {
			vi.useFakeTimers()
			vi.setSystemTime(new Date('2026-03-27T02:00:00Z'))
			setCurrentLocaleSetting('en')
			setCurrentTimeZoneSetting('Asia/Shanghai')

			expect(formatRelativeTimeFromNow('2026-03-27T09:00:00+08:00')).toBe('an hour ago')
		})

		it('returns null for omitted or invalid datetime values', () => {
			expect(formatRelativeTimeFromNow(null)).toBeNull()
			expect(formatRelativeTimeFromNow(undefined)).toBeNull()
			expect(formatRelativeTimeFromNow('2026-03-27 11:00')).toBeNull()
		})

		it('changes relative time when the configured time zone changes', () => {
			vi.useFakeTimers()
			vi.setSystemTime(new Date('2026-03-28T01:00:00Z'))
			setCurrentLocaleSetting('en')

			setCurrentTimeZoneSetting('Asia/Shanghai')
			expect(formatRelativeTimeFromNow('2026-03-27T09:00:00+08:00')).toBe('a day ago')

			setCurrentTimeZoneSetting('America/New_York')
			expect(formatRelativeTimeFromNow('2026-03-27T09:00:00+08:00')).toBe('12 hours ago')
		})
	})

	describe('formatOpenedAtForDisplay', () => {
		const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

		afterEach(() => {
			setCurrentTimeZoneSetting(defaultTimeZone)
		})

		it('formats opened_at with minute precision in the configured time zone', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')

			expect(formatOpenedAtForDisplay('2026-03-27T09:10:45+08:00')).toBe('03-27 09:10')
		})

		it('changes opened_at display when the configured time zone changes', () => {
			setCurrentTimeZoneSetting('Asia/Shanghai')
			expect(formatOpenedAtForDisplay('2026-03-27T09:10:45+08:00')).toBe('03-27 09:10')

			setCurrentTimeZoneSetting('America/New_York')
			expect(formatOpenedAtForDisplay('2026-03-27T09:10:45+08:00')).toBe('03-26 21:10')
		})
	})
}
