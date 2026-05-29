import { useRef } from 'react'

import { t } from '../../lang/helpers'
import { AccountDropdown, type AccountDropdownOption } from '../account-dropdown'
import { ObsidianIcon } from '../primitives/obsidian-icon'
import { useObservedWidth } from '../primitives/use-observed-width'
import { useTabIndicator } from '../primitives/use-tab-indicator'

import type { DashboardHeaderTab, DashboardHeaderTabId } from './dashboard-constants'
import type { MouseEvent } from 'react'

const DASHBOARD_HEADER_WIDE_WIDTH = 900
const DASHBOARD_HEADER_COLLAPSED_WIDTH = 640
const DASHBOARD_HEADER_WIDE_WIDTH_PER_TAB = 120
const DASHBOARD_HEADER_COLLAPSED_WIDTH_PER_TAB = 72
const DASHBOARD_ACCOUNT_TRIGGER_MIN_WIDTH = 176
const DASHBOARD_ACCOUNT_CONTROL = 'account-filter'

type DashboardHeaderProps = {
	activeTab: DashboardHeaderTabId
	tabs: DashboardHeaderTab[]
	densityTabCount?: number
	selectedAccountValue: string
	selectedAccountLabel: string
	accountOptions: AccountDropdownOption[]
	hasExistingAccounts: boolean
	isElevated?: boolean
	isSettingsActive?: boolean
	onSelectAccount?: (accountValue: string) => void
	onSettingsBack?: () => void
	onSelectTab: (tabId: DashboardHeaderTabId, event?: MouseEvent<HTMLButtonElement>) => void
	onNewAccount?: () => void
	onToggleSettings?: () => void
}

export function DashboardHeader({
	activeTab,
	tabs,
	densityTabCount,
	accountOptions,
	hasExistingAccounts,
	isElevated = false,
	isSettingsActive = false,
	onSelectAccount,
	onSettingsBack,
	selectedAccountValue,
	selectedAccountLabel,
	onSelectTab,
	onNewAccount,
	onToggleSettings,
}: DashboardHeaderProps) {
	const {
		indicatorStyle,
		registerTabButton,
		tabListRef,
	} = useTabIndicator<DashboardHeaderTabId>({
		activeTab,
		deps: [tabs.length],
		hidden: activeTab === 'Playbook',
	})
	const headerRowRef = useRef<HTMLDivElement>(null)
	const headerRowWidth = useObservedWidth(headerRowRef)
	const headerDensity = getDashboardHeaderDensity(headerRowWidth, densityTabCount ?? tabs.length)
	const showTabLabels = headerDensity === 'wide'

	return (
		<header
			className={`lj:sticky lj:top-0 lj:z-30 lj:pt-4 lj:sm:pt-5 lj:flex lj:flex-col lj:gap-4 lj:sm:gap-5 lj:transition-[background-color,box-shadow,border-color] lj:duration-200 ${
				isElevated
					? 'lj:bg-lj-bg lj-dashboard-header-elevated'
					: 'lj:bg-lj-bg/95 lj:backdrop-blur-md'
			}`}
		>
			<div className="lj:mx-auto lj:w-full lj:max-w-7xl lj:px-4 lj:sm:px-8">
				<div ref={headerRowRef} className="lj:flex lj:min-h-14 lj:items-end lj:justify-between lj:gap-3 lj:border-b lj:border-lj-border">
					<div className="lj:flex lj:min-h-14 lj:min-w-0 lj:flex-1 lj:items-end lj:gap-1.5 lj:sm:gap-3 lj:md:gap-5">
						{isSettingsActive && (
							<button
								type="button"
								onClick={onSettingsBack}
								data-lj-control="settings-back"
								className="lj:flex lj:h-14 lj:w-10 lj:shrink-0 lj:items-center lj:justify-center lj:text-lj-c-muted lj:transition-colors lj:hover:text-lj-c-strong"
								title={t('DASHBOARD_SETTINGS_BACK')}
								aria-label={t('DASHBOARD_SETTINGS_BACK')}
							>
								<ObsidianIcon name="arrow-left" className="lj:size-4" />
							</button>
						)}
						<nav ref={tabListRef} className="lj-tab-nav lj:flex lj:min-h-14 lj:min-w-0 lj:flex-1 lj:items-end lj:gap-1.5 lj:sm:gap-3 lj:md:gap-5">
							{tabs.map((tab) => {
								const isPlaybook = tab.id === 'Playbook'
								const isActive = activeTab === tab.id

								return (
									<button
										key={tab.id}
										ref={registerTabButton(tab.id)}
										type="button"
										onClick={(event) => onSelectTab(tab.id, event)}
										data-lj-tab={tab.id}
										data-lj-active={isActive ? 'true' : 'false'}
										className={
											isPlaybook
												? 'lj:relative lj:mb-2 lj:flex lj:h-10 lj:shrink-0 lj:items-center lj:justify-center lj:gap-2 lj:rounded-md lj:bg-lj-c-strong lj:px-3 lj:text-sm lj:font-medium lj:text-lj-c-inv lj:shadow-sm lj:transition-all lj:sm:px-4'
												: `lj-tab-trigger lj:relative lj:flex lj:h-14 lj:shrink-0 lj:items-center lj:justify-center lj:gap-2 lj:px-2 lj:sm:px-0 lj:text-sm lj:font-medium lj:transition-all ${
													isActive
														? 'lj:text-lj-c-strong'
														: 'lj:text-lj-c-muted lj:hover:text-lj-c-secondary-bright'
												}`
										}
										title={tab.label}
										aria-label={tab.label}
									>
										<ObsidianIcon name={tab.icon} className="lj:size-4" />
										{showTabLabels && <span>{tab.label}</span>}
										{/* {isPlaybook && isActive && (
										<span className="lj:absolute lj:bottom-0 lj:left-3 lj:right-3 lj:h-0.5 lj:rounded-full lj:bg-lj-b-on-accent-hover lj:sm:left-4 lj:sm:right-4" />
									)} */}
									</button>
								)
							})}
							<div
								aria-hidden="true"
								className="lj-tab-indicator"
								style={indicatorStyle}
							/>
						</nav>
					</div>

					<div className="lj:relative lj:flex lj:min-h-14 lj:shrink-0 lj:items-end lj:justify-end lj:gap-1.5">
						<button
							type="button"
							onClick={onToggleSettings}
							data-lj-control="settings-toggle"
							data-lj-active={isSettingsActive ? 'true' : 'false'}
							className={`lj:relative lj:flex lj:h-14 lj:shrink-0 lj:items-center lj:justify-center lj:px-2 lj:transition-colors ${
								isSettingsActive
									? 'lj:text-lj-c-strong'
									: 'lj:text-lj-c-muted lj:hover:text-lj-c-secondary-bright'
							}`}
						>
							<ObsidianIcon name="settings" className="lj:size-4" />
						</button>
						<AccountDropdown
							variant="header"
							headerDensity={headerDensity}
							options={accountOptions}
							value={selectedAccountValue}
							onChange={(accountValue) => onSelectAccount?.(accountValue)}
							align="right"
							minMenuWidth={DASHBOARD_ACCOUNT_TRIGGER_MIN_WIDTH}
							triggerDataControl={DASHBOARD_ACCOUNT_CONTROL}
							triggerTitle={selectedAccountLabel}
							triggerAriaLabel={selectedAccountLabel}
							footerActionLabel={t('DASHBOARD_NEW_ACCOUNT')}
							showFooterActionDivider={hasExistingAccounts}
							onFooterAction={onNewAccount}
						/>
					</div>
				</div>
			</div>
		</header>
	)
}

function getDashboardHeaderDensity(width: number, tabCount: number) {
	const wideWidth = Math.max(DASHBOARD_HEADER_WIDE_WIDTH, tabCount * DASHBOARD_HEADER_WIDE_WIDTH_PER_TAB)
	const collapsedWidth = Math.max(DASHBOARD_HEADER_COLLAPSED_WIDTH, tabCount * DASHBOARD_HEADER_COLLAPSED_WIDTH_PER_TAB)

	if (width < collapsedWidth) {
		return 'collapsed'
	}

	if (width < wideWidth) {
		return 'compact'
	}

	return 'wide'
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('getDashboardHeaderDensity', () => {
		it('keeps wide labels for small tab sets on roomy panes', () => {
			expect(getDashboardHeaderDensity(980, 5)).toBe('wide')
		})

		it('downgrades to compact when many tabs would collide with the trailing account filter', () => {
			expect(getDashboardHeaderDensity(980, 9)).toBe('compact')
		})

		it('collapses the header controls when the tab area becomes narrow', () => {
			expect(getDashboardHeaderDensity(620, 9)).toBe('collapsed')
		})
	})
}
