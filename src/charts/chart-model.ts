/// <reference types="vitest/importMeta" />

export const RESOLUTION_TO_TIMEFRAME = {
	1: '1m',
	5: '5m',
	15: '15m',
	30: '30m',
	60: '1h',
	120: '2h',
	240: '4h',
	D: '1d',
	W: '1w',
	M: '1M',
} as const

const DEFAULT_RESOLUTION = '60'
const REQUEST_RESOLUTION_ALIASES: Record<string, string> = {
	'1D': 'D',
	'1W': 'W',
	'1M': 'M',
	'1d': 'D',
	'1w': 'W',
}

export function formatChartResolution(resolution: string): string {
	const timeframe = RESOLUTION_TO_TIMEFRAME[resolution as keyof typeof RESOLUTION_TO_TIMEFRAME]
	return timeframe ?? RESOLUTION_TO_TIMEFRAME[DEFAULT_RESOLUTION]
}

export function normalizeChartResolution(resolution: string): string {
	return REQUEST_RESOLUTION_ALIASES[resolution] ?? resolution
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('normalizeChartResolution', () => {
		it('maps TradingView daily and higher aliases to host resolutions', () => {
			expect(normalizeChartResolution('1D')).toBe('D')
			expect(normalizeChartResolution('1W')).toBe('W')
			expect(normalizeChartResolution('1M')).toBe('M')
		})

		it('leaves minute resolutions unchanged', () => {
			expect(normalizeChartResolution('15')).toBe('15')
			expect(normalizeChartResolution('60')).toBe('60')
		})
	})
}
