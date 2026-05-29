import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

import { t } from '../../lang/helpers'
import { formatAmount } from '../../utils'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import type { DashboardTimeframeKey } from './dashboard-constants'
import type { getOverviewStats } from './dashboard-overview-stats'

type TimeframeFilterProps = {
	selectedTimeframeLabel: string
	timeframeOptions: {
		value: DashboardTimeframeKey
		label: string
	}[]
	onSelectTimeframe: (timeframe: DashboardTimeframeKey) => void
}

export function TimeframeFilter({ selectedTimeframeLabel, timeframeOptions, onSelectTimeframe }: TimeframeFilterProps) {
	const [isTimeframeOpen, setIsTimeframeOpen] = useState(false)

	return (
		<div className="lj:relative lj:z-20">
			<button
				onClick={() => setIsTimeframeOpen((open) => !open)}
				className="lj:flex lj:w-32 lj:items-center lj:justify-between lj:gap-3 lj:text-left lj:text-xs lj:font-medium lj:text-lj-c-tertiary lj:hover:text-lj-c-strong lj:transition-[color,transform] lj:duration-200 lj:hover:-translate-y-px lj:active:scale-[0.98] lj:bg-lj-surf-alt lj:border lj:border-lj-alpha-10 lj:px-4 lj:py-2 lj:rounded-md lj:shadow-sm"
				data-lj-control="timeframe-filter"
			>
				<span>{selectedTimeframeLabel}</span>
				<ObsidianIcon
					name="chevron-down"
					className={`lj:size-3 lj:transition-transform lj:duration-300 ${isTimeframeOpen ? 'lj:rotate-180' : ''}`}
				/>
			</button>

			{isTimeframeOpen && (
				<>
					<div className="lj:fixed lj:inset-0 lj:z-30" onClick={() => setIsTimeframeOpen(false)} />
					<div className="lj:absolute lj:top-full lj:left-1/2 lj:-translate-x-1/2 lj:mt-2 lj:w-32 lj:bg-lj-surf-popover lj:backdrop-blur-xl lj:border lj:border-lj-alpha-10 lj:rounded-md lj:shadow-xl lj:overflow-hidden lj:z-40 lj:py-2">
						{timeframeOptions.map((timeframe) => (
							<button
								key={timeframe.value}
								onClick={() => {
									onSelectTimeframe(timeframe.value)
									setIsTimeframeOpen(false)
								}}
								className={`lj:flex lj:w-full lj:items-center lj:justify-start lj:text-left lj:px-4 lj:py-2 lj:text-xs lj:transition-colors ${
									selectedTimeframeLabel === timeframe.label
										? 'lj:bg-lj-alpha-5-10 lj:text-lj-c-strong'
										: 'lj:text-lj-c-tertiary lj:hover:bg-lj-alpha-5'
								}`}
							>
								{timeframe.label}
							</button>
						))}
					</div>
				</>
			)}
		</div>
	)
}

type DashboardOverviewHeroProps = {
	stats: ReturnType<typeof getOverviewStats>
}

function resolveNetProfitAmountFontSize(containerWidth: number, text: string) {
	if (containerWidth <= 0) {
		return '8rem'
	}

	const availableWidth = Math.max(containerWidth - 56, 1)
	const glyphWidth = Math.max(text.length, 1) * 0.56
	const size = Math.max(32, Math.min(128, Math.floor(availableWidth / glyphWidth)))
	return `${size}px`
}

export function DashboardOverviewHero({
	stats,
}: DashboardOverviewHeroProps) {
	const netProfitAmountRowRef = useRef<HTMLDivElement>(null)
	const [netProfitAmountRowWidth, setNetProfitAmountRowWidth] = useState(0)
	const winRate = Math.round(stats.winRate)
	const winRateCircumference = 2 * Math.PI * 48
	const netProfitText = formatAmount(Math.abs(stats.netProfit))
	const netProfitPrefix = stats.netProfit < 0 ? '-$' : '$'
	const netProfitAmountStyle = {
		fontSize: resolveNetProfitAmountFontSize(netProfitAmountRowWidth, netProfitText),
	} satisfies CSSProperties
	const netProfitClassName = stats.netProfit > 0
		? 'lj:text-lj-profit-text'
		: stats.netProfit < 0
			? 'lj:text-lj-loss-text'
			: 'lj:text-lj-c-muted'
	const totalWinClassName = stats.totalWin > 0
		? 'lj:text-lj-profit-text'
		: 'lj:text-lj-c-muted'
	const totalLossClassName = stats.totalLoss > 0
		? 'lj:text-lj-loss-text'
		: 'lj:text-lj-c-muted'

	useLayoutEffect(() => {
		const el = netProfitAmountRowRef.current
		if (el === null) {
			return
		}

		const syncWidth = () => setNetProfitAmountRowWidth(el.getBoundingClientRect().width)
		syncWidth()
		const observer = new ResizeObserver(syncWidth)
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	return (
		<div className="lj:relative lj:flex lj:w-full lj:flex-col lj:items-end lj:gap-6 lj:sm:gap-8">
			<div className="lj:grid lj:grid-cols-1 lj:md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lj:gap-8 lj:md:gap-0 lj:w-full">
				<div className="lj:flex lj:min-w-0 lj:flex-col lj:items-center lj:justify-center lj:relative lj:md:pr-12">
					<div className="lj:relative lj:size-48 lj:md:size-56 lj:xl:size-64 lj:flex lj:items-center lj:justify-center">
						<svg className="lj:size-full lj:-rotate-90" viewBox="0 0 100 100">
							<circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" className="lj:text-lj-alpha-5" strokeWidth="1" />
							<circle
								cx="50"
								cy="50"
								r="48"
								fill="none"
								stroke="currentColor"
								className="lj-dashboard-hero-ring-glow lj:text-lj-c-strong"
								strokeWidth="1.5"
								strokeDasharray={winRateCircumference}
								strokeDashoffset={winRateCircumference * (1 - winRate / 100)}
								strokeLinecap="round"
							/>
						</svg>
						<div className="lj:absolute lj:flex lj:flex-col lj:items-center">
							<span className="lj:text-5xl lj:md:text-6xl lj:font-light lj:tracking-tighter lj:text-lj-c-strong">
								{winRate}
								<span className="lj:text-2xl lj:md:text-3xl lj:text-lj-c-hint-vivid">%</span>
							</span>
							<span className="lj:text-[10px] lj:tracking-[0.3em] lj:text-lj-c-hint-vivid lj:uppercase lj:mt-1">
								{t('DASHBOARD_WIN_RATE')}
							</span>
						</div>
					</div>
				</div>

				<div aria-hidden="true" className="lj:hidden lj:md:block lj:w-px lj:bg-lj-alpha-10" />

				<div className="lj:flex lj:min-w-0 lj:flex-col lj:justify-center lj:items-center lj:md:items-start lj:pt-8 lj:md:pt-0 lj:border-t lj:md:border-t-0 lj:border-lj-alpha-10 lj:md:pl-12">
					<span className="lj:text-xs lj:tracking-[0.4em] lj:text-lj-c-strong lj:uppercase lj:mb-2 lj:font-medium">
						{t('DASHBOARD_NET_PROFIT')}
					</span>
					<div ref={netProfitAmountRowRef} className="lj:flex lj:w-full lj:max-w-full lj:items-baseline lj:gap-2 lj:mb-6">
						<span className="lj:text-3xl lj:md:text-4xl lj:font-light lj:text-lj-c-hint-vivid">{netProfitPrefix}</span>
						<span className={`lj:min-w-0 lj:whitespace-nowrap lj:leading-none lj:font-light lj:tracking-tighter ${netProfitClassName}`} style={netProfitAmountStyle}>
							{netProfitText}
						</span>
					</div>
					<div className="lj:flex lj:flex-wrap lj:justify-center lj:md:justify-start lj:gap-4 lj:md:gap-6 lj:items-center">
						<div className="lj:flex lj:items-center lj:gap-2">
							<span className="lj:text-[9px] lj:tracking-widest lj:text-lj-c-hint-vivid lj:uppercase">{t('DASHBOARD_TOTAL_WIN')}</span>
							<span className={`lj:text-xs lj:font-mono ${totalWinClassName}`}>+${formatAmount(stats.totalWin)}</span>
						</div>
						<div className="lj:w-px lj:h-3 lj:bg-lj-alpha-10" />
						<div className="lj:flex lj:items-center lj:gap-2">
							<span className="lj:text-[9px] lj:tracking-widest lj:text-lj-c-hint-vivid lj:uppercase">{t('DASHBOARD_TOTAL_LOSS')}</span>
							<span className={`lj:text-xs lj:font-mono ${totalLossClassName}`}>-${formatAmount(stats.totalLoss)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('DashboardOverviewHero', () => {
		it('renders the net profit number without cqw or truncation', async () => {
			const { renderToStaticMarkup } = await import('react-dom/server')
			const html = renderToStaticMarkup(<DashboardOverviewHero stats={{
				positions: [],
				closedPositions: [],
				totalWin: 9999999,
				totalLoss: 0,
				netProfit: 1049.23,
				winRate: 56,
			}} />)

			expect(html).toContain('1,049.23')
			expect(html).toContain('md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]')
			expect(html).toContain('whitespace-nowrap')
			expect(html).not.toContain('truncate')
			expect(html).not.toContain('cqw')
		})

		it('scales net profit font size from measured width without hiding the text', () => {
			expect(resolveNetProfitAmountFontSize(300, '832.77')).toBe('72px')
			expect(resolveNetProfitAmountFontSize(640, '832.77')).toBe('128px')
		})
	})
}
