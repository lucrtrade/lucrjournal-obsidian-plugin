import { t } from '../../lang/helpers'

const DASHBOARD_CORE_TABS = [
	{ id: 'Overview', label: () => t('TAB_OVERVIEW'), icon: 'layout-dashboard' },
	{ id: 'Positions', label: () => t('TAB_POSITIONS'), icon: 'list' },
	{ id: 'News', label: () => t('TAB_NEWS'), icon: 'newspaper' },
	{ id: 'Analysis', label: () => t('TAB_ANALYSIS'), icon: 'file-bar-chart' },
	{ id: 'Playbook', label: () => t('TAB_PLAYBOOK'), icon: 'book-open' },
] as const

const DASHBOARD_SETTINGS_TABS = [
	{ id: 'Accounts', label: () => t('DASHBOARD_SETTINGS_ACCOUNTS_LABEL'), icon: 'wallet' },
	{ id: 'Symbols', label: () => t('TAB_SYMBOLS'), icon: 'circle-dollar-sign' },
] as const

const ANALYSIS_SUB_TABS = [
	{ id: 'Key Levels', label: () => t('TAB_KEY_LEVEL'), icon: 'crosshair' },
	{ id: 'Confluence', label: () => t('TAB_CONFLUENCE'), icon: 'git-merge' },
	{ id: 'Market Analysis', label: () => t('TAB_MARKET_ANALYSIS'), icon: 'sunrise' },
] as const

type DashboardCoreTabId = (typeof DASHBOARD_CORE_TABS)[number]['id']
export type DashboardSettingsTabId = (typeof DASHBOARD_SETTINGS_TABS)[number]['id']
export type DashboardAnalysisSubTabId = (typeof ANALYSIS_SUB_TABS)[number]['id']
export type DashboardAnalysisTabId = 'News' | DashboardAnalysisSubTabId
export type DashboardTabId = DashboardCoreTabId
export type DashboardHeaderTabId = DashboardTabId | DashboardSettingsTabId

export type DashboardHeaderTab = {
	id: DashboardHeaderTabId
	label: string
	icon: string
}

type DashboardAnalysisSubTab = {
	id: DashboardAnalysisSubTabId
	label: string
	icon: string
}

export function buildDashboardTabs(): DashboardHeaderTab[] {
	if (DASHBOARD_CORE_TABS.length !== 5) {
		throw new Error('Dashboard core tabs must include Overview, Positions, News, Analysis, and Playbook')
	}

	return DASHBOARD_CORE_TABS.map((tab) => ({
		id: tab.id,
		label: tab.label(),
		icon: tab.icon,
	}))
}

export function buildDashboardSettingsTabs(): DashboardHeaderTab[] {
	return DASHBOARD_SETTINGS_TABS.map((tab) => ({
		id: tab.id,
		label: tab.label(),
		icon: tab.icon,
	}))
}

export function buildAnalysisSubTabs(): DashboardAnalysisSubTab[] {
	return ANALYSIS_SUB_TABS.map((tab) => ({
		id: tab.id,
		label: tab.label(),
		icon: tab.icon,
	}))
}

export const TIMEFRAME_OPTIONS = [
	'DASHBOARD_TIMEFRAME_ONE_WEEK',
	'DASHBOARD_TIMEFRAME_ONE_MONTH',
	'DASHBOARD_TIMEFRAME_ONE_QUARTER',
	'DASHBOARD_TIMEFRAME_ONE_YEAR',
	'DASHBOARD_TIMEFRAME_ALL_TIME',
] as const

export type DashboardTimeframeKey = (typeof TIMEFRAME_OPTIONS)[number]

export const WEEKDAY_HEADERS = [
	{ id: 'MON', labelKey: 'DASHBOARD_WEEKDAY_MON' },
	{ id: 'TUE', labelKey: 'DASHBOARD_WEEKDAY_TUE' },
	{ id: 'WED', labelKey: 'DASHBOARD_WEEKDAY_WED' },
	{ id: 'THU', labelKey: 'DASHBOARD_WEEKDAY_THU' },
	{ id: 'FRI', labelKey: 'DASHBOARD_WEEKDAY_FRI' },
	{ id: 'SAT', labelKey: 'DASHBOARD_WEEKDAY_SAT' },
	{ id: 'SUN', labelKey: 'DASHBOARD_WEEKDAY_SUN' },
	{ id: 'WEEKLY', labelKey: 'DASHBOARD_WEEKDAY_WEEKLY' },
] as const
