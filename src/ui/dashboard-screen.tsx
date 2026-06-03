import { TFile, type App } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'

import { LUCR_TRADE_ROOT_DIR } from '../constant'
import {
	AccountDomain,
	createPositionTemplate,
	listPlaybookEntriesWithStats,
	PlaybookDomain,
	PositionDomain,
	listPositionTemplates,
	type PositionTemplateSummary,
} from '../domains'
import { t } from '../lang/helpers'
import { consumeLinkActivationEvent, isCommandClick, type LinkActivationEvent } from '../views/link-activation'

import { buildAccountDropdownOptions, type AccountDropdownOption } from './account-dropdown'
import { buildAnalysisSubTabTriggerContent } from './dashboard/dashboard-analysis-sub-tabs'
import {
	buildAnalysisSubTabs,
	buildDashboardTabs,
	buildDashboardSettingsTabs,
	type DashboardAnalysisSubTabId,
	type DashboardAnalysisTabId,
	type DashboardSettingsTabId,
	TIMEFRAME_OPTIONS,
	type DashboardTabId,
} from './dashboard/dashboard-constants'
import { DashboardFloatingNav } from './dashboard/dashboard-floating-nav'
import { DashboardHeader } from './dashboard/dashboard-header'
import { DashboardMetaTabPanel } from './dashboard/dashboard-meta-tab-panel'
import { DashboardOverviewCalendar } from './dashboard/dashboard-overview-calendar'
import { DashboardOverviewHero, TimeframeFilter } from './dashboard/dashboard-overview-hero'
import { getOverviewStats } from './dashboard/dashboard-overview-stats'
import { DashboardPlaybookDetails } from './dashboard/dashboard-playbook-details'
import { DashboardPlaybookPanel } from './dashboard/dashboard-playbook-panel'
import { filterPositionEntriesByAccountSelection } from './dashboard/dashboard-position-filters'
import { DashboardPositionTemplateDetails } from './dashboard/dashboard-position-template-details'
import { DashboardPositionsPanel } from './dashboard/dashboard-positions-panel'
import { DashboardSettingsPanel } from './dashboard/dashboard-settings-panel'
import { NewAccountForm, NewAccountModal } from './dashboard/new-account-modal'
import { NewLinkedEntryModal } from './dashboard/new-linked-entry-modal'
import { NewPositionModal } from './dashboard/new-position-modal'
import { PositionDetails } from './position-details'
import { ObsidianIcon } from './primitives/obsidian-icon'

import type LucrJournalPlugin from '../main'
import type {
	DashboardAnalysisPreferenceTabId,
	DashboardAnalysisTableColumnId,
	PositionTableColumnId,
} from '../settings/plugin-preferences'
import type { LucrJournalDashboardRouteState, LucrJournalRouteState } from '../views/lucr-journal-route'

const DASHBOARD_ALL_ACCOUNTS_VALUE = '__all__'

type DashboardScreenProps = {
	app: App
	plugin: LucrJournalPlugin
	routeState?: LucrJournalDashboardRouteState
	onOpenRoute?: (route: LucrJournalRouteState, event?: LinkActivationEvent) => void
}

export function DashboardScreen({ app, plugin, routeState, onOpenRoute }: DashboardScreenProps) {
	const [activeTab, setActiveTab] = useState<DashboardTabId>(routeState?.activeTab ?? 'Overview')
	const [selectedPositionId, setSelectedPositionId] = useState<string | null>(routeState?.selectedPositionId ?? null)
	const [selectedPlaybookPath, setSelectedPlaybookPath] = useState<string | null>(routeState?.selectedPlaybookPath ?? null)
	const [selectedPositionTemplatePath, setSelectedPositionTemplatePath] = useState<string | null>(routeState?.selectedPositionTemplatePath ?? null)
	const [selectedPositionTemplate, setSelectedPositionTemplate] = useState<PositionTemplateSummary | null>(null)
	const [selectedAccountValue, setSelectedAccountValue] = useState(DASHBOARD_ALL_ACCOUNTS_VALUE)
	const [isNewPositionOpen, setIsNewPositionOpen] = useState(false)
	const [isNewPlaybookOpen, setIsNewPlaybookOpen] = useState(false)
	const [isNewAccountOpen, setIsNewAccountOpen] = useState(false)
	const [isSettingsOpen, setIsSettingsOpen] = useState(routeState?.isSettingsOpen === true || routeState?.activeSettingsTab !== undefined)
	const [activeSettingsTab, setActiveSettingsTab] = useState<DashboardSettingsTabId>(routeState?.activeSettingsTab ?? 'Accounts')
	const [isHeaderElevated, setIsHeaderElevated] = useState(false)
	const [isTableFilterOpen, setIsTableFilterOpen] = useState(false)
	const [selectedTimeframeKey, setSelectedTimeframeKey] = useState<(typeof TIMEFRAME_OPTIONS)[number]>('DASHBOARD_TIMEFRAME_ONE_MONTH')
	const [positionsOpenedAtDateFilter, setPositionsOpenedAtDateFilter] = useState<string | null>(routeState?.positionsOpenedAtDateFilter ?? null)
	const [positionsAccountFilter, setPositionsAccountFilter] = useState<string | null>(routeState?.positionsAccountFilter ?? null)
	const [positionsLinkedAnalysisFilter, setPositionsLinkedAnalysisFilter] = useState<string | null>(routeState?.positionsLinkedAnalysisFilter ?? null)
	const [positionsLinkedNewsFilter, setPositionsLinkedNewsFilter] = useState<string | null>(routeState?.positionsLinkedNewsFilter ?? null)
	const [positionsLinkedPlaybookFilter, setPositionsLinkedPlaybookFilter] = useState<string | null>(routeState?.positionsLinkedPlaybookFilter ?? null)
	const [positionsSymbolFilter, setPositionsSymbolFilter] = useState<string | null>(routeState?.positionsSymbolFilter ?? null)
	const [symbolsAccountFilter, setSymbolsAccountFilter] = useState<string | null>(routeState?.symbolsAccountFilter ?? null)
	const [activeAnalysisSubTab, setActiveAnalysisSubTab] = useState<DashboardAnalysisSubTabId>(routeState?.activeAnalysisSubTab ?? 'Key Levels')
	const [dashboardDataRevision, setDashboardDataRevision] = useState(0)
	const allAccountsLabel = t('DASHBOARD_ALL_ACCOUNTS')

	useEffect(() => {
		const refresh = () => {
			setDashboardDataRevision((revision) => revision + 1)
		}
		const refreshForPath = (path: string | null | undefined) => {
			if (path === undefined || path === null || isDashboardDataPath(path)) {
				refresh()
			}
		}
		const metadataEvents = [
			app.metadataCache.on('changed', (file) => refreshForPath(file.path)),
			app.metadataCache.on('deleted', (file) => refreshForPath(file.path)),
			app.metadataCache.on('resolved', refresh),
		]
		const vaultEvents = [
			app.vault.on('create', (file) => refreshForPath(file.path)),
			app.vault.on('delete', (file) => refreshForPath(file.path)),
			app.vault.on('rename', (file, oldPath) => {
				if (isDashboardDataPath(file.path) || isDashboardDataPath(oldPath)) {
					refresh()
				}
			}),
		]

		return () => {
			metadataEvents.forEach((eventRef) => app.metadataCache.offref(eventRef))
			vaultEvents.forEach((eventRef) => app.vault.offref(eventRef))
		}
	}, [app])

	useEffect(() => {
		setIsTableFilterOpen(false)
	}, [activeTab, isSettingsOpen, selectedPlaybookPath, selectedPositionId, selectedPositionTemplatePath])

	const accountEntries = useMemo(() => AccountDomain.totalEntries(app), [app, dashboardDataRevision])
	const accounts = useMemo(() => accountEntries.map(({ fm }) => fm), [accountEntries])

	const accountOptions = useMemo(() => buildDashboardAccountOptions(app, accountEntries, allAccountsLabel), [app, accountEntries, allAccountsLabel])
	const selectedAccountLabel = accountOptions.find((option) => option.value === selectedAccountValue)?.label ?? allAccountsLabel
	const preferredAccount = selectedAccountValue === DASHBOARD_ALL_ACCOUNTS_VALUE ? undefined : selectedAccountValue
	const timeframeOptions = TIMEFRAME_OPTIONS.map((key) => ({
		value: key,
		label: t(key),
	}))
	const selectedTimeframeLabel = timeframeOptions.find((option) => option.value === selectedTimeframeKey)?.label ?? t(selectedTimeframeKey)
	const newPositionTemplates = useMemo(() => listPositionTemplates(app), [app, dashboardDataRevision])
	const dashboardTabs = buildDashboardTabs()
	const dashboardSettingsTabs = buildDashboardSettingsTabs()
	const tabs = isSettingsOpen ? dashboardSettingsTabs : dashboardTabs
	const headerDensityTabCount = Math.max(dashboardTabs.length, dashboardSettingsTabs.length)
	const analysisSubTabs = buildAnalysisSubTabs()
	const newsTab = dashboardTabs.find((tab) => tab.id === 'News') ?? null
	const activeMetaPanelTabId: DashboardAnalysisTabId | null =
		activeTab === 'News' ? 'News'
			: activeTab === 'Analysis' ? activeAnalysisSubTab
				: null
	const activeAnalysisSubTabMeta = activeTab === 'Analysis'
		? (analysisSubTabs.find((tab) => tab.id === activeAnalysisSubTab) ?? null)
		: null
	const positionEntries = useMemo(() => PositionDomain.totalEntries(app), [app, dashboardDataRevision])
	const filteredPositionEntries = useMemo(
		() => filterPositionEntriesByAccountSelection({
			app,
			positionEntries,
			accountEntries,
			selectedAccountValue,
			allAccountsValue: DASHBOARD_ALL_ACCOUNTS_VALUE,
		}),
		[app, positionEntries, accountEntries, selectedAccountValue],
	)
	const positions = useMemo(() => filteredPositionEntries.map(({ fm }) => fm), [filteredPositionEntries])
	const playbookEntriesWithStats = useMemo(() => listPlaybookEntriesWithStats(app), [app, dashboardDataRevision])
	const selectedPlaybook = selectedPlaybookPath === null
		? null
		: playbookEntriesWithStats.find(({ entry }) => entry.file.path === selectedPlaybookPath) ?? null
	const selectedPositionTemplateDetails = selectedPositionTemplatePath === null
		? null
		: newPositionTemplates.find((template) => template.filePath === selectedPositionTemplatePath) ?? null
	const positionsTableHiddenColumnIds = plugin.settings.preferences?.Positions?.hiddenColumnIds as PositionTableColumnId[] | undefined ?? []
	const activeAnalysisTableHiddenColumnIds = activeMetaPanelTabId === null
		? []
		: plugin.settings.preferences?.[activeMetaPanelTabId]?.hiddenColumnIds as DashboardAnalysisTableColumnId[] | undefined ?? []
	const overviewStats = useMemo(() => getOverviewStats(positions, selectedTimeframeKey), [positions, selectedTimeframeKey])
	const selectedPositionEntry = selectedPositionId === null
		? null
		: positionEntries.find(({ fm }) => String(fm.id ?? '') === selectedPositionId) ?? null
	const selectedPosition = selectedPositionEntry?.fm ?? null
	const selectedPositionFile = selectedPositionEntry?.file instanceof TFile
		? selectedPositionEntry.file
		: null

	const openRouteForCommandClick = (
		route: LucrJournalRouteState,
		event: LinkActivationEvent | null | undefined,
	) => {
		if (!isCommandClick(event) || onOpenRoute === undefined) {
			return false
		}

		consumeLinkActivationEvent(event)
		onOpenRoute(route, event ?? undefined)
		return true
	}

	const handleSelectHeaderTab = (tabId: DashboardTabId | DashboardSettingsTabId, event?: LinkActivationEvent) => {
		const route = isSettingsOpen
			? {
				activeSettingsTab: tabId as DashboardSettingsTabId,
				isSettingsOpen: true,
				kind: 'dashboard',
			} satisfies LucrJournalDashboardRouteState
			: {
				activeTab: tabId as DashboardTabId,
				kind: 'dashboard',
			} satisfies LucrJournalDashboardRouteState

		if (openRouteForCommandClick(route, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPlaybookPath(null)
		setSelectedPositionTemplatePath(null)
		if (isSettingsOpen) {
			setSymbolsAccountFilter(null)
			setActiveSettingsTab(tabId as DashboardSettingsTabId)
			return
		}

		setActiveTab(tabId as DashboardTabId)
		if (tabId !== 'Positions') {
			setPositionsOpenedAtDateFilter(null)
			setPositionsAccountFilter(null)
			setPositionsLinkedAnalysisFilter(null)
			setPositionsLinkedNewsFilter(null)
			setPositionsLinkedPlaybookFilter(null)
			setPositionsSymbolFilter(null)
		}
	}

	const handleSelectPosition = (positionId: string, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			activeTab: 'Positions',
			kind: 'dashboard',
			selectedPositionId: positionId,
		}, event)) {
			return
		}

		setSelectedPositionId(positionId)
	}

	const handleSelectPlaybook = (filePath: string, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			activeTab: 'Playbook',
			kind: 'dashboard',
			selectedPlaybookPath: filePath,
		}, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPositionTemplatePath(null)
		setSelectedPlaybookPath(filePath)
	}

	const handleSelectAccountPositions = (accountWikilink: string, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			activeTab: 'Positions',
			kind: 'dashboard',
			positionsAccountFilter: accountWikilink,
		}, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPlaybookPath(null)
		setSelectedPositionTemplatePath(null)
		setPositionsOpenedAtDateFilter(null)
		setPositionsAccountFilter(accountWikilink)
		setPositionsLinkedAnalysisFilter(null)
		setPositionsLinkedNewsFilter(null)
		setPositionsLinkedPlaybookFilter(null)
		setPositionsSymbolFilter(null)
		setSymbolsAccountFilter(null)
		setSelectedAccountValue(DASHBOARD_ALL_ACCOUNTS_VALUE)
		setIsSettingsOpen(false)
		setActiveTab('Positions')
	}

	const handleSelectSymbolPositions = (symbolWikilink: string, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			activeTab: 'Positions',
			kind: 'dashboard',
			positionsSymbolFilter: symbolWikilink,
		}, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPlaybookPath(null)
		setSelectedPositionTemplatePath(null)
		setPositionsOpenedAtDateFilter(null)
		setPositionsAccountFilter(null)
		setPositionsLinkedAnalysisFilter(null)
		setPositionsLinkedNewsFilter(null)
		setPositionsLinkedPlaybookFilter(null)
		setPositionsSymbolFilter(symbolWikilink)
		setSymbolsAccountFilter(null)
		setSelectedAccountValue(DASHBOARD_ALL_ACCOUNTS_VALUE)
		setIsSettingsOpen(false)
		setActiveTab('Positions')
	}

	const handleSelectAccountSymbols = (accountWikilink: string, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			activeSettingsTab: 'Symbols',
			isSettingsOpen: true,
			kind: 'dashboard',
			symbolsAccountFilter: accountWikilink,
		}, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPlaybookPath(null)
		setSelectedPositionTemplatePath(null)
		setPositionsOpenedAtDateFilter(null)
		setPositionsAccountFilter(null)
		setPositionsLinkedAnalysisFilter(null)
		setPositionsLinkedNewsFilter(null)
		setPositionsLinkedPlaybookFilter(null)
		setPositionsSymbolFilter(null)
		setSymbolsAccountFilter(accountWikilink)
		setIsSettingsOpen(true)
		setActiveSettingsTab('Symbols')
	}

	const handleSelectLinkedEntryPositions = (tabId: DashboardAnalysisTabId | 'Playbook', filePath: string, event?: LinkActivationEvent) => {
		const route = {
			activeTab: 'Positions',
			kind: 'dashboard',
			positionsLinkedAnalysisFilter: isAnalysisPositionFilterTab(tabId) ? filePath : null,
			positionsLinkedNewsFilter: tabId === 'News' ? filePath : null,
			positionsLinkedPlaybookFilter: tabId === 'Playbook' ? filePath : null,
		} satisfies LucrJournalDashboardRouteState

		if (openRouteForCommandClick(route, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPlaybookPath(null)
		setSelectedPositionTemplatePath(null)
		setPositionsOpenedAtDateFilter(null)
		setPositionsAccountFilter(null)
		setPositionsLinkedAnalysisFilter(route.positionsLinkedAnalysisFilter)
		setPositionsLinkedNewsFilter(route.positionsLinkedNewsFilter)
		setPositionsLinkedPlaybookFilter(route.positionsLinkedPlaybookFilter)
		setPositionsSymbolFilter(null)
		setSymbolsAccountFilter(null)
		setSelectedAccountValue(DASHBOARD_ALL_ACCOUNTS_VALUE)
		setIsSettingsOpen(false)
		setActiveTab('Positions')
	}

	const handleSelectAnalysisSubTab = (tabId: DashboardAnalysisSubTabId, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			activeAnalysisSubTab: tabId,
			activeTab: 'Analysis',
			kind: 'dashboard',
		}, event)) {
			return
		}

		setActiveAnalysisSubTab(tabId)
	}

	const handleSelectOverviewDate = (dateKey: string, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			activeTab: 'Positions',
			kind: 'dashboard',
			positionsOpenedAtDateFilter: dateKey,
		}, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPlaybookPath(null)
		setPositionsOpenedAtDateFilter(dateKey)
		setPositionsAccountFilter(null)
		setPositionsLinkedAnalysisFilter(null)
		setPositionsLinkedNewsFilter(null)
		setPositionsLinkedPlaybookFilter(null)
		setPositionsSymbolFilter(null)
		setActiveTab('Positions')
	}

	const handleEditPositionTemplate = (template: PositionTemplateSummary, event?: LinkActivationEvent) => {
		if (openRouteForCommandClick({
			kind: 'dashboard',
			selectedPositionTemplatePath: template.filePath,
		}, event)) {
			return
		}

		setSelectedPositionId(null)
		setSelectedPlaybookPath(null)
		setSelectedPositionTemplatePath(template.filePath)
	}

	const handleCreatedPosition = (entry: Awaited<ReturnType<typeof PositionDomain.createEntry>>) => {
		setSelectedPositionTemplate(null)
		setSelectedPlaybookPath(null)
		setSelectedPositionTemplatePath(null)
		setIsSettingsOpen(false)
		setActiveTab('Positions')
		setSelectedPositionId(String(entry.entry.id ?? ''))
	}

	const handleToggleSettings = () => {
		setIsSettingsOpen((open) => {
			if (!open) {
				setSelectedPositionId(null)
				setSelectedPlaybookPath(null)
				setSelectedPositionTemplatePath(null)
				setActiveSettingsTab('Accounts')
				setSymbolsAccountFilter(null)
			}
			return !open
		})
	}

	if (accounts.length === 0) {
		return (
			<div
				className="lj:h-full lj:bg-lj-bg lj:text-lj-text lj:font-sans lj:overflow-hidden lj:relative lj:flex lj:items-center lj:justify-center lj:p-4 lj:sm:p-6"
				data-lj-screen="dashboard-initial-setup"
			>
				<div className="lj-modal-surface-shadow lj:relative lj:flex lj:max-h-[90vh] lj:w-full lj:max-w-md lj:flex-col lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised">
					<div className="lj:flex lj:shrink-0 lj:items-center lj:justify-between lj:border-b lj:border-lj-alpha-5 lj:px-8 lj:py-6">
						<h2 className="lj:text-[20px] lj:font-medium lj:tracking-[0.01em] lj:text-lj-c-strong">
							{t('NEW_ACCOUNT_TITLE')}
						</h2>
					</div>
					<NewAccountForm
						app={app}
						isOpen={true}
						onClose={() => {}}
						showCancel={false}
					/>
				</div>
			</div>
		)
	}

	return (
		<div
			className="lj:h-full lj:bg-lj-bg lj:text-lj-text lj:font-sans lj:overflow-hidden lj:relative lj:flex lj:flex-col"
			data-lj-screen="dashboard"
		>
			<DashboardHeader
				activeTab={isSettingsOpen ? activeSettingsTab : activeTab}
				densityTabCount={headerDensityTabCount}
				tabs={tabs}
				accountOptions={accountOptions}
				hasExistingAccounts={accounts.length > 0}
				isElevated={isHeaderElevated}
				isSettingsActive={isSettingsOpen}
				onSelectAccount={setSelectedAccountValue}
				onSettingsBack={() => setIsSettingsOpen(false)}
				selectedAccountValue={selectedAccountValue}
				selectedAccountLabel={selectedAccountLabel}
				onSelectTab={handleSelectHeaderTab}
				onNewAccount={() => setIsNewAccountOpen(true)}
				onToggleSettings={handleToggleSettings}
			/>

			<div
				className="lj:flex-1 lj:min-h-0 lj:overflow-y-auto lj:overflow-x-hidden"
				onScroll={(event) => {
					const nextElevated = event.currentTarget.scrollTop > 8
					setIsHeaderElevated((previous) => previous === nextElevated ? previous : nextElevated)
				}}
			>
				{isSettingsOpen ? (
					<main className="lj:max-w-7xl lj:mx-auto lj:w-full lj:px-4 lj:sm:px-8 lj:pt-6 lj:sm:pt-8 lj:pb-[calc(env(safe-area-inset-bottom)+4rem)] lj:sm:pb-16 lj:min-h-full">
						<DashboardSettingsPanel
							app={app}
							dataRevision={dashboardDataRevision}
							activeTab={activeSettingsTab}
							onNewAccount={() => setIsNewAccountOpen(true)}
							onSelectAccountPositions={handleSelectAccountPositions}
							onSelectAccountSymbols={handleSelectAccountSymbols}
							onSelectSymbolPositions={handleSelectSymbolPositions}
							preferredAccount={preferredAccount}
							symbolsAccountFilter={symbolsAccountFilter}
						/>
					</main>
				) : selectedPosition !== null ? (
					<PositionDetails
						app={app}
						plugin={plugin}
						position={selectedPosition}
						positionFile={selectedPositionFile}
						onBack={() => setSelectedPositionId(null)}
					/>
				) : selectedPlaybook !== null ? (
					<DashboardPlaybookDetails
						app={app}
						playbook={selectedPlaybook}
						onBack={() => setSelectedPlaybookPath(null)}
						onPlaybookPathChange={setSelectedPlaybookPath}
						onSelectPlaybookPositions={(filePath, event) => handleSelectLinkedEntryPositions('Playbook', filePath, event)}
					/>
				) : selectedPositionTemplateDetails !== null ? (
					<DashboardPositionTemplateDetails
						app={app}
						template={selectedPositionTemplateDetails}
					/>
				) : (
					<>
						{activeTab === 'Overview' && (
							<div className="lj:mx-auto lj:w-full lj:max-w-7xl lj:flex lj:justify-end lj:px-4 lj:sm:px-8 lj:pt-8 lj:sm:pt-14">
								<TimeframeFilter
									selectedTimeframeLabel={selectedTimeframeLabel}
									timeframeOptions={timeframeOptions}
									onSelectTimeframe={setSelectedTimeframeKey}
								/>
							</div>
						)}
						{activeTab === 'Overview' && (
							<main className="lj:max-w-[1080px] lj:mx-auto lj:w-full lj:px-4 lj:sm:px-8 lj:pt-6 lj:sm:pt-10 lj:pb-[calc(env(safe-area-inset-bottom)+10.5rem)] lj:sm:pb-24 lj:min-h-full lj:flex lj:flex-col">
								<div className="lj:flex lj:flex-1 lj:flex-col lj:gap-20 lj:sm:gap-24" data-lj-panel="overview">
									<DashboardOverviewHero stats={overviewStats} />
									<DashboardOverviewCalendar
										positions={positions}
										onSelectDate={handleSelectOverviewDate}
									/>
								</div>
							</main>
						)}
						{activeTab !== 'Overview' && (
							<main className="lj:max-w-7xl lj:mx-auto lj:w-full lj:px-4 lj:sm:px-8 lj:pt-6 lj:sm:pt-8 lj:pb-[calc(env(safe-area-inset-bottom)+10.5rem)] lj:sm:pb-24 lj:min-h-full lj:flex lj:flex-col">
								{activeTab === 'Positions' && (
									<DashboardPositionsPanel
										app={app}
										hiddenColumnIds={positionsTableHiddenColumnIds}
										onChangeHiddenColumnIds={(hiddenColumnIds) => {
											void persistPositionsTableHiddenColumnIds(plugin, hiddenColumnIds)
										}}
										positionEntries={filteredPositionEntries}
										onSelectPosition={handleSelectPosition}
										onSelectPlaybook={handleSelectPlaybook}
										openedAtDateFilter={positionsOpenedAtDateFilter}
										accountFilter={positionsAccountFilter}
										linkedAnalysisFilter={positionsLinkedAnalysisFilter}
										linkedNewsFilter={positionsLinkedNewsFilter}
										linkedPlaybookFilter={positionsLinkedPlaybookFilter}
										onTableFilterOpenChange={setIsTableFilterOpen}
										symbolFilter={positionsSymbolFilter}
									/>
								)}
								{activeTab === 'Playbook' && (
									<DashboardPlaybookPanel
										app={app}
										dataRevision={dashboardDataRevision}
										playbooks={playbookEntriesWithStats}
										onCreatePlaybook={() => setIsNewPlaybookOpen(true)}
										onSelectPlaybook={handleSelectPlaybook}
										onSelectPlaybookPositions={(filePath, event) => handleSelectLinkedEntryPositions('Playbook', filePath, event)}
									/>
								)}
								{activeTab === 'News' && newsTab !== null && (
									<DashboardMetaTabPanel
										key={newsTab.id}
										app={app}
										dataRevision={dashboardDataRevision}
										icon={newsTab.icon}
										label={newsTab.label}
										tabId="News"
										panelId={`meta:${newsTab.id}`}
										hiddenColumnIds={activeAnalysisTableHiddenColumnIds}
										onChangeHiddenColumnIds={(hiddenColumnIds) => {
											void persistAnalysisTableHiddenColumnIds(plugin, 'News', hiddenColumnIds)
										}}
										onSelectLinkedEntryPositions={(filePath, event) => handleSelectLinkedEntryPositions('News', filePath, event)}
										onTableFilterOpenChange={setIsTableFilterOpen}
									/>
								)}
								{activeTab === 'Analysis' && activeAnalysisSubTabMeta !== null && (
									<>
										<div className="lj:mb-4 lj:flex lj:items-center lj:gap-2">
											{analysisSubTabs.map((subTab) => {
												const isActive = subTab.id === activeAnalysisSubTab
												const content = buildAnalysisSubTabTriggerContent(subTab)
												return (
													<button
														key={subTab.id}
														type="button"
														onClick={(event) => handleSelectAnalysisSubTab(subTab.id, event)}
														data-lj-tab={`Analysis:${subTab.id}`}
														data-lj-active={isActive ? 'true' : 'false'}
														className={`lj:rounded-lg lj:border lj:px-4 lj:py-2 lj:text-sm lj:font-medium lj:transition-colors ${
															isActive
																? 'lj:border-lj-c-strong lj:bg-lj-c-strong lj:text-lj-c-inv'
																: 'lj:border-lj-alpha-10 lj:text-lj-c-secondary lj:hover:bg-lj-surf-button-hover lj:hover:text-lj-c-strong'
														}`}
													>
														<ObsidianIcon name={content.icon} className="lj:mr-2 lj:size-4 lj:shrink-0" />
														<span>{content.label}</span>
													</button>
												)
											})}
										</div>
										<DashboardMetaTabPanel
											key={activeAnalysisSubTab}
											app={app}
											dataRevision={dashboardDataRevision}
											icon={activeAnalysisSubTabMeta.icon}
											label={activeAnalysisSubTabMeta.label}
											tabId={activeAnalysisSubTab}
											panelId={`meta:${activeAnalysisSubTab}`}
											hiddenColumnIds={activeAnalysisTableHiddenColumnIds}
											onChangeHiddenColumnIds={(hiddenColumnIds) => {
												void persistAnalysisTableHiddenColumnIds(plugin, activeAnalysisSubTab, hiddenColumnIds)
											}}
											onSelectLinkedEntryPositions={(filePath, event) => handleSelectLinkedEntryPositions(activeAnalysisSubTab, filePath, event)}
											onTableFilterOpenChange={setIsTableFilterOpen}
										/>
									</>
								)}
							</main>
						)}
					</>
				)}
			</div>

			{selectedPosition === null && selectedPlaybook === null && selectedPositionTemplateDetails === null && !isSettingsOpen && !isTableFilterOpen && (
				<DashboardFloatingNav
					label={t('DASHBOARD_NEW_POSITION')}
					onAction={() => {
						setSelectedPositionTemplate(null)
						setIsNewPositionOpen(true)
					}}
					onEditTemplate={handleEditPositionTemplate}
					onSelectTemplate={(template) => {
						setSelectedPositionTemplate(template)
						setIsNewPositionOpen(true)
					}}
					onCreateTemplate={async (name) => {
						const template = await createPositionTemplate(app, name)
						setSelectedPositionId(null)
						setSelectedPlaybookPath(null)
						setSelectedPositionTemplatePath(template.filePath)
					}}
					templates={newPositionTemplates}
				/>
			)}
			<NewPositionModal
				app={app}
				isOpen={isNewPositionOpen}
				preferredAccount={preferredAccount}
				selectedTemplate={selectedPositionTemplate}
				onCreated={handleCreatedPosition}
				onClose={() => {
					setIsNewPositionOpen(false)
					setSelectedPositionTemplate(null)
				}}
			/>
			<NewLinkedEntryModal
				app={app}
				title={t('NEW_PLAYBOOK_TITLE')}
				submitLabel={t('NEW_PLAYBOOK_SAVE')}
				formDefinition={PlaybookDomain.formDefinition}
				buildInitialFormValues={PlaybookDomain.buildInitialFormValues.bind(PlaybookDomain)}
				synchronizeFormValues={PlaybookDomain.synchronizeFormValues.bind(PlaybookDomain)}
				createEntry={PlaybookDomain.createEntry.bind(PlaybookDomain)}
				toSubmitErrorMessage={PlaybookDomain.toCreateEntryErrorMessageKey?.bind(PlaybookDomain)}
				isOpen={isNewPlaybookOpen}
				onClose={() => setIsNewPlaybookOpen(false)}
			/>
			<NewAccountModal
				app={app}
				isOpen={isNewAccountOpen}
				onClose={() => setIsNewAccountOpen(false)}
			/>
		</div>
	)
}

function isDashboardDataPath(path: string) {
	return path === LUCR_TRADE_ROOT_DIR || path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`)
}

function isAnalysisPositionFilterTab(tabId: DashboardAnalysisTabId | 'Playbook') {
	return tabId === 'Key Levels' || tabId === 'Confluence' || tabId === 'Market Analysis'
}

async function persistPositionsTableHiddenColumnIds(
	plugin: LucrJournalPlugin,
	hiddenColumnIds: PositionTableColumnId[],
): Promise<void> {
	const currentHiddenColumnIds = plugin.settings.preferences?.Positions?.hiddenColumnIds as PositionTableColumnId[] | undefined ?? []
	if (areColumnIdListsEqual(currentHiddenColumnIds, hiddenColumnIds)) {
		return
	}

	await plugin.settingsManager.editAndSave((settings) => {
		settings.preferences.Positions = {
			hiddenColumnIds,
		}
	})
	plugin.requestJournalViewsRender()
}

async function persistAnalysisTableHiddenColumnIds(
	plugin: LucrJournalPlugin,
	tabId: DashboardAnalysisPreferenceTabId,
	hiddenColumnIds: DashboardAnalysisTableColumnId[],
): Promise<void> {
	const currentHiddenColumnIds = plugin.settings.preferences?.[tabId]?.hiddenColumnIds as DashboardAnalysisTableColumnId[] | undefined ?? []
	if (areColumnIdListsEqual(currentHiddenColumnIds, hiddenColumnIds)) {
		return
	}

	await plugin.settingsManager.editAndSave((settings) => {
		settings.preferences[tabId] = {
			hiddenColumnIds,
		}
	})
	plugin.requestJournalViewsRender()
}

function buildDashboardAccountOptions(app: App, accounts: ReturnType<typeof AccountDomain.totalEntries>, allAccountsLabel: string): AccountDropdownOption[] {
	const options = buildAccountDropdownOptions({
		app,
		accounts,
		allLabel: allAccountsLabel,
	})

	return options.map((option, index) => index === 0
		? {
			...option,
			value: DASHBOARD_ALL_ACCOUNTS_VALUE,
		}
		: option)
}

function areColumnIdListsEqual(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((columnId, index) => columnId === right[index])
}
