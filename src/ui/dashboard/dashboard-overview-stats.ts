/// <reference types="vitest/importMeta" />

import { PositionDomain, type Position } from '../../domains'
import { getCurrentTimeZoneSetting, setCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import { roundAmountValue, toDateKey, toDateKeyInTimeZone } from '../../utils'

import type { DashboardTimeframeKey } from './dashboard-constants'

type OverviewStats = {
	positions: Position[]
	closedPositions: Position[]
	netProfit: number
	totalWin: number
	totalLoss: number
	winRate: number
}

export function getOverviewStats(
	positions: Position[],
	timeframeKey: DashboardTimeframeKey,
	now = new Date(),
): OverviewStats {
	const timeframePositions = filterPositionsByOpenedAt(positions, timeframeKey, now)
	const closedPositions = timeframePositions.filter((p) => PositionDomain.isClosed(p))
	let totalWin = 0
	let totalLoss = 0
	let wins = 0
	let losses = 0

	for (const position of closedPositions) {
		const profit = position.profit
		if (typeof profit !== 'number' || profit === 0) {
			continue
		}

		if (profit > 0) {
			totalWin = roundAmountValue(totalWin + profit)
			wins += 1
			continue
		}

		if (profit < 0) {
			totalLoss = roundAmountValue(totalLoss + Math.abs(profit))
			losses += 1
		}
	}

	const settledCount = wins + losses

	return {
		positions: timeframePositions,
		closedPositions,
		netProfit: roundAmountValue(totalWin - totalLoss),
		totalWin,
		totalLoss,
		winRate: settledCount === 0 ? 0 : (wins / settledCount) * 100,
	}
}

function filterPositionsByOpenedAt(
	positions: Position[],
	timeframeKey: DashboardTimeframeKey,
	now: Date,
) {
	if (timeframeKey === 'DASHBOARD_TIMEFRAME_ALL_TIME') {
		return positions
	}

	const timeZone = getCurrentTimeZoneSetting()
	const [start, end] = resolveTimeframeRange(timeframeKey, now, timeZone)
	return positions.filter((position) => {
		if (position.opened_at == null) {
			return false
		}

		const openedAt = new Date(position.opened_at)
		if (Number.isNaN(openedAt.getTime())) {
			return false
		}

		const openedAtKey = toDateKeyInTimeZone(openedAt, timeZone)
		return openedAtKey >= start && openedAtKey < end
	})
}

function resolveTimeframeRange(
	timeframeKey: Exclude<DashboardTimeframeKey, 'DASHBOARD_TIMEFRAME_ALL_TIME'>,
	now: Date,
	timeZone: string,
) {
	const [year, month, day] = parseDateKey(toDateKeyInTimeZone(now, timeZone))

	if (timeframeKey === 'DASHBOARD_TIMEFRAME_ONE_WEEK') {
		const mondayOffset = (new Date(year, month - 1, day).getDay() + 6) % 7
		return [
			formatDateKey(year, month, day - mondayOffset),
			formatDateKey(year, month, day - mondayOffset + 7),
		] as const
	}

	if (timeframeKey === 'DASHBOARD_TIMEFRAME_ONE_MONTH') {
		return [formatDateKey(year, month, 1), formatDateKey(year, month + 1, 1)] as const
	}

	if (timeframeKey === 'DASHBOARD_TIMEFRAME_ONE_QUARTER') {
		const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1
		return [formatDateKey(year, quarterMonth, 1), formatDateKey(year, quarterMonth + 3, 1)] as const
	}

	return [formatDateKey(year, 1, 1), formatDateKey(year + 1, 1, 1)] as const
}

function parseDateKey(dateKey: string) {
	const parts = dateKey.split('-')
	return [Number(parts[0]), Number(parts[1]), Number(parts[2])] as const
}

function formatDateKey(year: number, month: number, day: number) {
	return toDateKey(new Date(year, month - 1, day))
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it } = import.meta.vitest

	describe('getOverviewStats', () => {
		const defaultTimeZone = getCurrentTimeZoneSetting()
		const now = new Date('2026-03-27T12:00:00')

		afterEach(() => {
			setCurrentTimeZoneSetting(defaultTimeZone)
		})

		it('filters bounded timeframes to the current calendar period by opened_at', () => {
			const positions = [
				{ lucr_type: 'position', status: 'close', profit: 1, opened_at: '2025-12-31T12:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 2, opened_at: '2026-01-01T00:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 4, opened_at: '2026-02-28T12:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 8, opened_at: '2026-03-01T00:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 16, opened_at: '2026-03-22T23:59:59' },
				{ lucr_type: 'position', status: 'close', profit: 32, opened_at: '2026-03-23T00:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 64, opened_at: '2026-03-29T23:59:59' },
				{ lucr_type: 'position', status: 'close', profit: 128, opened_at: '2026-03-30T00:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 256, opened_at: '2026-04-01T00:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 512, opened_at: '2026-12-31T23:59:59' },
				{ lucr_type: 'position', status: 'close', profit: 1024, opened_at: '2027-01-01T00:00:00' },
				{ lucr_type: 'position', status: 'close', profit: 2048, opened_at: null },
			] as Position[]

			expect(getOverviewStats(positions, 'DASHBOARD_TIMEFRAME_ONE_WEEK', now).netProfit).toBe(96)
			expect(getOverviewStats(positions, 'DASHBOARD_TIMEFRAME_ONE_MONTH', now).netProfit).toBe(248)
			expect(getOverviewStats(positions, 'DASHBOARD_TIMEFRAME_ONE_QUARTER', now).netProfit).toBe(254)
			expect(getOverviewStats(positions, 'DASHBOARD_TIMEFRAME_ONE_YEAR', now).netProfit).toBe(1022)
		})

		it('uses the configured timezone when resolving the current calendar period', () => {
			setCurrentTimeZoneSetting('America/New_York')
			const stats = getOverviewStats([
				{ lucr_type: 'position', status: 'close', profit: 10, opened_at: '2026-02-28T23:00:00-05:00' },
				{ lucr_type: 'position', status: 'close', profit: 20, opened_at: '2026-03-01T00:30:00-05:00' },
			] as Position[], 'DASHBOARD_TIMEFRAME_ONE_MONTH', new Date('2026-03-01T04:30:00Z'))

			expect(stats.netProfit).toBe(10)
		})

		it('keeps all positions for all time but still computes stats from closed positions only', () => {
			const stats = getOverviewStats([
				{ lucr_type: 'position', status: 'close', profit: 200, opened_at: '2026-01-01T10:00:00+00:00' },
				{ lucr_type: 'position', status: 'close', profit: -50, opened_at: null },
				{ lucr_type: 'position', status: 'close', profit: null, opened_at: null },
				{ lucr_type: 'position', status: 'open', profit: 999, opened_at: null },
			] as Position[], 'DASHBOARD_TIMEFRAME_ALL_TIME', now)

			expect(stats.positions).toHaveLength(4)
			expect(stats.closedPositions).toHaveLength(3)
			expect(stats.netProfit).toBe(150)
			expect(stats.totalWin).toBe(200)
			expect(stats.totalLoss).toBe(50)
			expect(stats.winRate).toBe(50)
		})

		it('rounds accumulated amount totals to suppress floating point artifacts', () => {
			const stats = getOverviewStats([
				{ lucr_type: 'position', status: 'close', profit: 0.1, opened_at: '2026-03-26T10:00:00+00:00' },
				{ lucr_type: 'position', status: 'close', profit: 0.2, opened_at: '2026-03-26T11:00:00+00:00' },
				{ lucr_type: 'position', status: 'close', profit: -0.000012333333333, opened_at: '2026-03-26T12:00:00+00:00' },
			] as Position[], 'DASHBOARD_TIMEFRAME_ALL_TIME', now)

			expect(stats.totalWin).toBe(0.3)
			expect(stats.totalLoss).toBe(0.00001233)
			expect(stats.netProfit).toBe(0.29998767)
		})
	})
}
