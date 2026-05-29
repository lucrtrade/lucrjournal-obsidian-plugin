/// <reference types="vitest/importMeta" />

import { PositionDomain, type Position } from '../../domains'
import { roundAmountValue } from '../../utils'

import type { DashboardTimeframeKey } from './dashboard-constants'

type OverviewStats = {
	positions: Position[]
	closedPositions: Position[]
	netProfit: number
	totalWin: number
	totalLoss: number
	winRate: number
}

const TIMEFRAME_WINDOW_MS: Record<Exclude<DashboardTimeframeKey, 'DASHBOARD_TIMEFRAME_ALL_TIME'>, number> = {
	DASHBOARD_TIMEFRAME_ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
	DASHBOARD_TIMEFRAME_ONE_MONTH: 30 * 24 * 60 * 60 * 1000,
	DASHBOARD_TIMEFRAME_ONE_QUARTER: 90 * 24 * 60 * 60 * 1000,
	DASHBOARD_TIMEFRAME_ONE_YEAR: 365 * 24 * 60 * 60 * 1000,
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

	const cutoff = now.getTime() - TIMEFRAME_WINDOW_MS[timeframeKey]
	return positions.filter((position) => {
		if (position.opened_at == null) {
			return false
		}

		return Date.parse(position.opened_at) >= cutoff
	})
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('getOverviewStats', () => {
		const now = new Date('2026-03-27T12:00:00Z')

		it('filters bounded timeframes by opened_at and only counts closed positions in stats', () => {
			const stats = getOverviewStats([
				{ lucr_type: 'position', status: 'close', profit: 120, opened_at: '2026-03-26T10:00:00+00:00' },
				{ lucr_type: 'position', status: 'close', profit: -20, opened_at: '2026-03-24T10:00:00+00:00' },
				{ lucr_type: 'position', status: 'close', profit: 0, opened_at: '2026-03-24T11:00:00+00:00' },
				{ lucr_type: 'position', status: 'open', profit: 999, opened_at: '2026-03-25T10:00:00+00:00' },
				{ lucr_type: 'position', status: 'close', profit: 80, opened_at: '2026-03-10T10:00:00+00:00' },
				{ lucr_type: 'position', status: 'close', profit: 50, opened_at: null },
			] as Position[], 'DASHBOARD_TIMEFRAME_ONE_WEEK', now)

			expect(stats.positions).toHaveLength(4)
			expect(stats.closedPositions).toHaveLength(3)
			expect(stats.totalWin).toBe(120)
			expect(stats.totalLoss).toBe(20)
			expect(stats.netProfit).toBe(100)
			expect(stats.winRate).toBe(50)
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
