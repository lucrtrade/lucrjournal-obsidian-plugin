/// <reference types="vitest/importMeta" />

import { buildIsoDatetimeInTimeZone } from '../utils/relative-time'

import { agentError } from './errors'

const DATETIME_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

/**
 * Normalize an agent supplied datetime into the plugin's persisted format
 * (`YYYY-MM-DDTHH:mm:ss+HH:MM`) expressed in the configured time zone.
 * Values without an offset are read as wall-clock time in that time zone.
 */
export function normalizeAgentDatetime(value: string, field: string, timeZone: string): string {
	const match = DATETIME_INPUT_PATTERN.exec(value.trim())
	if (match === null) {
		throw invalidDatetime(value, field, timeZone)
	}

	const [, year = '', month = '', day = '', hour = '', minute = '', second = '00', offset] = match
	const wall = {
		year: Number(year),
		month: Number(month),
		day: Number(day),
		hour: Number(hour),
		minute: Number(minute),
		second: Number(second),
	}
	const wallUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
	const roundTrip = new Date(wallUtc)
	if (
		roundTrip.getUTCFullYear() !== wall.year
		|| roundTrip.getUTCMonth() !== wall.month - 1
		|| roundTrip.getUTCDate() !== wall.day
		|| wall.hour > 23
		|| wall.minute > 59
		|| wall.second > 59
	) {
		throw invalidDatetime(value, field, timeZone)
	}

	if (offset !== undefined) {
		return buildIsoDatetimeInTimeZone(new Date(wallUtc - parseOffsetMinutes(offset) * 60_000), timeZone)
	}

	let instant = wallUtc - offsetMinutesAt(wallUtc, timeZone) * 60_000
	instant = wallUtc - offsetMinutesAt(instant, timeZone) * 60_000
	const normalized = buildIsoDatetimeInTimeZone(new Date(instant), timeZone)
	const expectedWall = `${year}-${month}-${day}T${hour}:${minute}:${second.padStart(2, '0')}`
	if (!normalized.startsWith(expectedWall)) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` ${JSON.stringify(value)} does not exist in time zone ${timeZone} (daylight-saving gap).`,
			'Pass the time with an explicit UTC offset, e.g. 2026-03-08T02:30:00-05:00.',
			{ field, received: value },
		)
	}
	return normalized
}

export function datetimeToEpoch(value: string): number {
	return Date.parse(value)
}

function offsetMinutesAt(instant: number, timeZone: string): number {
	const iso = buildIsoDatetimeInTimeZone(new Date(instant), timeZone)
	return parseOffsetMinutes(iso.slice(19))
}

function parseOffsetMinutes(offset: string): number {
	if (offset === 'Z') {
		return 0
	}
	const match = /^([+-])(\d{2}):?(\d{2})$/.exec(offset)
	if (match === null) {
		return 0
	}
	const minutes = Number(match[2]) * 60 + Number(match[3])
	return match[1] === '-' ? -minutes : minutes
}

function invalidDatetime(value: string, field: string, timeZone: string) {
	return agentError(
		'INVALID_VALUE',
		`\`${field}\` must be a date with time like "2026-11-09 14:30" or "2026-11-09T14:30:00+08:00", received ${JSON.stringify(value)}.`,
		`Pass \`${field}\` as YYYY-MM-DD HH:mm[:ss] (read in the plugin time zone ${timeZone}) or as ISO 8601 with an offset; omit it to use the current time.`,
		{ field, received: value },
	)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('normalizeAgentDatetime', () => {
		it('reads wall-clock times in the plugin time zone', () => {
			expect(normalizeAgentDatetime('2026-11-09 14:30', 'opened_at', 'Asia/Shanghai')).toBe('2026-11-09T14:30:00+08:00')
			expect(normalizeAgentDatetime('2026-11-09T14:30:15', 'opened_at', 'Asia/Kolkata')).toBe('2026-11-09T14:30:15+05:30')
		})

		it('converts explicit offsets into the plugin time zone', () => {
			expect(normalizeAgentDatetime('2026-11-09T06:30:00Z', 'opened_at', 'Asia/Shanghai')).toBe('2026-11-09T14:30:00+08:00')
			expect(normalizeAgentDatetime('2026-11-09T14:30:00+0800', 'opened_at', 'UTC')).toBe('2026-11-09T06:30:00+00:00')
		})

		it('rejects malformed or impossible values', () => {
			expect(() => normalizeAgentDatetime('2026-11-09', 'opened_at', 'UTC')).toThrow(/must be a date with time/)
			expect(() => normalizeAgentDatetime('2026-02-30 10:00', 'opened_at', 'UTC')).toThrow(/must be a date with time/)
			expect(() => normalizeAgentDatetime('yesterday', 'opened_at', 'UTC')).toThrow(/must be a date with time/)
		})
	})
}
