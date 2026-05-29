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

export function formatChartResolution(resolution: string): string {
	const timeframe = RESOLUTION_TO_TIMEFRAME[resolution as keyof typeof RESOLUTION_TO_TIMEFRAME]
	return timeframe ?? RESOLUTION_TO_TIMEFRAME[DEFAULT_RESOLUTION]
}
