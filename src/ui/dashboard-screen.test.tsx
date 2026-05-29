import { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { setCurrentLocaleSetting, t } from '../lang/helpers'

const hookState = vi.hoisted(() => ({
	cursor: 0,
	memoSlots: [] as { deps: readonly unknown[] | undefined; value: unknown }[],
	stateSlots: [] as unknown[],
	positionEntries: [] as unknown[],
	beginRender() {
		this.cursor = 0
	},
	reset() {
		this.cursor = 0
		this.memoSlots = []
		this.stateSlots = []
		this.positionEntries = []
	},
}))

vi.mock('react', async (importOriginal) => {
	const actual = await importOriginal<object>()

	return {
		...actual,
		useEffect() {
			hookState.cursor += 1
		},
		useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
			const index = hookState.cursor
			hookState.cursor += 1

			const slot = hookState.memoSlots[index]
			if (slot !== undefined && areDepsEqual(slot.deps, deps)) {
				return slot.value as T
			}

			const value = factory()
			hookState.memoSlots[index] = { deps, value }
			return value
		},
		useState<T>(initialValue: T | (() => T)): [T, (nextValue: T | ((previousValue: T) => T)) => void] {
			const index = hookState.cursor
			hookState.cursor += 1

			if (!(index in hookState.stateSlots)) {
				hookState.stateSlots[index] = typeof initialValue === 'function'
					? (initialValue as () => T)()
					: initialValue
			}

			return [
				hookState.stateSlots[index] as T,
				(nextValue) => {
					const previousValue = hookState.stateSlots[index] as T
					hookState.stateSlots[index] = typeof nextValue === 'function'
						? (nextValue as (value: T) => T)(previousValue)
						: nextValue
				},
			]
		},
	}
})

vi.mock('../domains', () => ({
	AccountDomain: {
		resolveDisplayIcon: () => ({ kind: 'lucide', value: 'wallet' }),
		resolveIcon: () => ({ kind: 'lucide', value: 'wallet' }),
		toDisplayName: () => 'Main',
		totalEntries: () => [{ file: null, fm: { name: 'Main' } }],
	},
	PlaybookDomain: {
		buildInitialFormValues: () => ({}),
		createEntry: async () => null,
		formDefinition: {},
		synchronizeFormValues: (value: unknown) => value,
		toCreateEntryErrorMessageKey: undefined,
	},
	PositionDomain: {
		isClosed: () => false,
		totalEntries: () => hookState.positionEntries,
	},
	createPositionTemplate: async () => ({ filePath: 'LucrJournal/templates/TPL-Test.md' }),
	listPlaybookEntriesWithStats: () => [],
	listPositionTemplates: () => [],
}))

import { DashboardFloatingNav } from './dashboard/dashboard-floating-nav'
import { DashboardHeader } from './dashboard/dashboard-header'
import { DashboardMetaTabPanel } from './dashboard/dashboard-meta-tab-panel'
import { DashboardOverviewCalendar } from './dashboard/dashboard-overview-calendar'
import { DashboardPlaybookPanel } from './dashboard/dashboard-playbook-panel'
import { DashboardPositionsPanel } from './dashboard/dashboard-positions-panel'
import { DashboardSettingsPanel } from './dashboard/dashboard-settings-panel'
import { NewPositionModal } from './dashboard/new-position-modal'
import { DashboardScreen } from './dashboard-screen'
import { PositionDetails } from './position-details'

import type { ReactElement, ReactNode } from 'react'

type HeaderProps = {
	tabs: { id: string; label: string }[]
	onSelectTab: (tabId: string, event?: TestLinkActivationEvent) => void
	onToggleSettings: () => void
}

type CalendarProps = {
	onSelectDate: (dateKey: string, event?: TestLinkActivationEvent) => void
}

type FloatingNavProps = {
	onEditTemplate?: (template: { filePath: string; name?: string | null }, event?: TestLinkActivationEvent) => void
}

type NewPositionModalProps = {
	onCreated?: (entry: unknown) => void
}

type SettingsPanelProps = {
	activeTab?: string
	onSelectAccountPositions?: (accountWikilink: string, event?: TestLinkActivationEvent) => void
	onSelectAccountSymbols?: (accountWikilink: string, event?: TestLinkActivationEvent) => void
	onSelectSymbolPositions?: (symbolWikilink: string, event?: TestLinkActivationEvent) => void
	symbolsAccountFilter?: string | null
}

type PositionsPanelProps = {
	accountFilter?: string | null
	linkedAnalysisFilter?: string | null
	linkedNewsFilter?: string | null
	linkedPlaybookFilter?: string | null
	onTableFilterOpenChange?: (isOpen: boolean) => void
	symbolFilter?: string | null
}

type MetaTabPanelProps = {
	onSelectLinkedEntryPositions?: (filePath: string, event?: TestLinkActivationEvent) => void
}

type PlaybookPanelProps = {
	onSelectPlaybook?: (filePath: string, event?: TestLinkActivationEvent) => void
	onSelectPlaybookPositions?: (filePath: string, event?: TestLinkActivationEvent) => void
}

type TestLinkActivationEvent = {
	metaKey?: boolean
	preventDefault?: () => void
	stopPropagation?: () => void
}

describe('DashboardScreen localized header tabs', () => {
	it('rebuilds header tab labels when the current locale changes without remounting', () => {
		hookState.reset()

		setCurrentLocaleSetting('en')
		expect(readHeaderLabels(renderDashboard())).toContain('Overview')

		setCurrentLocaleSetting('zh')
		expect(readHeaderLabels(renderDashboard())).toContain(t('TAB_OVERVIEW'))
	})

	it('opens Positions with the selected symbol filter from settings Symbols', () => {
		hookState.reset()

		let tree = renderDashboard()
		readHeaderProps(tree).onToggleSettings()

		tree = renderDashboard()
		readHeaderProps(tree).onSelectTab('Symbols')

		tree = renderDashboard()
		const settingsPanel = findElementByType(tree, DashboardSettingsPanel)
		if (settingsPanel === null) {
			throw new Error('DashboardSettingsPanel was not rendered')
		}

		const symbolWikilink = '[[SBL-Main-BTCUSDT]]'
		;(settingsPanel.props as SettingsPanelProps).onSelectSymbolPositions?.(symbolWikilink)

		tree = renderDashboard()
		const positionsPanel = findElementByType(tree, DashboardPositionsPanel)
		if (positionsPanel === null) {
			throw new Error('DashboardPositionsPanel was not rendered')
		}

		expect((positionsPanel.props as PositionsPanelProps).symbolFilter).toBe(symbolWikilink)
	})

	it('opens Positions with the selected account filter from settings Accounts', () => {
		hookState.reset()

		let tree = renderDashboard()
		readHeaderProps(tree).onToggleSettings()

		tree = renderDashboard()
		const settingsPanel = findElementByType(tree, DashboardSettingsPanel)
		if (settingsPanel === null) {
			throw new Error('DashboardSettingsPanel was not rendered')
		}

		const accountWikilink = '[[ACC-Main]]'
		;(settingsPanel.props as SettingsPanelProps).onSelectAccountPositions?.(accountWikilink)

		tree = renderDashboard()
		const positionsPanel = findElementByType(tree, DashboardPositionsPanel)
		if (positionsPanel === null) {
			throw new Error('DashboardPositionsPanel was not rendered')
		}

		expect((positionsPanel.props as PositionsPanelProps).accountFilter).toBe(accountWikilink)
	})

	it('opens Symbols with the selected account filter from settings Accounts', () => {
		hookState.reset()

		let tree = renderDashboard()
		readHeaderProps(tree).onToggleSettings()

		tree = renderDashboard()
		const settingsPanel = findElementByType(tree, DashboardSettingsPanel)
		if (settingsPanel === null) {
			throw new Error('DashboardSettingsPanel was not rendered')
		}

		const accountWikilink = '[[ACC-Main]]'
		;(settingsPanel.props as SettingsPanelProps).onSelectAccountSymbols?.(accountWikilink)

		tree = renderDashboard()
		const nextSettingsPanel = findElementByType(tree, DashboardSettingsPanel)
		if (nextSettingsPanel === null) {
			throw new Error('DashboardSettingsPanel was not rendered')
		}

		expect((nextSettingsPanel.props as SettingsPanelProps).activeTab).toBe('Symbols')
		expect((nextSettingsPanel.props as SettingsPanelProps).symbolsAccountFilter).toBe(accountWikilink)
	})

	it('opens Positions with the selected news linked filter', () => {
		hookState.reset()

		let tree = renderDashboard()
		readHeaderProps(tree).onSelectTab('News')

		tree = renderDashboard()
		const metaPanel = findElementByType(tree, DashboardMetaTabPanel)
		if (metaPanel === null) {
			throw new Error('DashboardMetaTabPanel was not rendered')
		}

		const newsPath = 'LucrJournal/news/CPI.md'
		;(metaPanel.props as MetaTabPanelProps).onSelectLinkedEntryPositions?.(newsPath)

		tree = renderDashboard()
		const positionsPanel = findElementByType(tree, DashboardPositionsPanel)
		if (positionsPanel === null) {
			throw new Error('DashboardPositionsPanel was not rendered')
		}

		expect((positionsPanel.props as PositionsPanelProps).linkedNewsFilter).toBe(newsPath)
	})

	it('opens Positions with the selected analysis linked filter', () => {
		hookState.reset()

		let tree = renderDashboard()
		readHeaderProps(tree).onSelectTab('Analysis')

		tree = renderDashboard()
		const metaPanel = findElementByType(tree, DashboardMetaTabPanel)
		if (metaPanel === null) {
			throw new Error('DashboardMetaTabPanel was not rendered')
		}

		const analysisPath = 'LucrJournal/analyses/Weekly.md'
		;(metaPanel.props as MetaTabPanelProps).onSelectLinkedEntryPositions?.(analysisPath)

		tree = renderDashboard()
		const positionsPanel = findElementByType(tree, DashboardPositionsPanel)
		if (positionsPanel === null) {
			throw new Error('DashboardPositionsPanel was not rendered')
		}

		expect((positionsPanel.props as PositionsPanelProps).linkedAnalysisFilter).toBe(analysisPath)
	})

	it('opens Positions with the selected playbook linked filter', () => {
		hookState.reset()

		let tree = renderDashboard()
		readHeaderProps(tree).onSelectTab('Playbook')

		tree = renderDashboard()
		const playbookPanel = findElementByType(tree, DashboardPlaybookPanel)
		if (playbookPanel === null) {
			throw new Error('DashboardPlaybookPanel was not rendered')
		}

		const playbookPath = 'LucrJournal/playbooks/Breakout.md'
		;(playbookPanel.props as PlaybookPanelProps).onSelectPlaybookPositions?.(playbookPath)

		tree = renderDashboard()
		const positionsPanel = findElementByType(tree, DashboardPositionsPanel)
		if (positionsPanel === null) {
			throw new Error('DashboardPositionsPanel was not rendered')
		}

		expect((positionsPanel.props as PositionsPanelProps).linkedPlaybookFilter).toBe(playbookPath)
	})

	it('initializes Positions from route state for new window navigation', () => {
		hookState.reset()

		const symbolWikilink = '[[SBL-Main-ETHUSDT]]'
		const tree = renderDashboard({
			routeState: {
				activeTab: 'Positions',
				kind: 'dashboard',
				positionsSymbolFilter: symbolWikilink,
			},
		})
		const positionsPanel = findElementByType(tree, DashboardPositionsPanel)
		if (positionsPanel === null) {
			throw new Error('DashboardPositionsPanel was not rendered')
		}

		expect((positionsPanel.props as PositionsPanelProps).symbolFilter).toBe(symbolWikilink)
	})

	it('requests a new LucrJournal route for command-click playbook navigation', () => {
		hookState.reset()

		const onOpenRoute = vi.fn()
		let tree = renderDashboard({ onOpenRoute })
		readHeaderProps(tree).onSelectTab('Playbook')

		tree = renderDashboard({ onOpenRoute })
		const playbookPanel = findElementByType(tree, DashboardPlaybookPanel)
		if (playbookPanel === null) {
			throw new Error('DashboardPlaybookPanel was not rendered')
		}

		const event = {
			metaKey: true,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		}
		const playbookPath = 'LucrJournal/playbooks/Breakout.md'
		;(playbookPanel.props as PlaybookPanelProps).onSelectPlaybook?.(playbookPath, event)

		expect(onOpenRoute).toHaveBeenCalledWith({
			activeTab: 'Playbook',
			kind: 'dashboard',
			selectedPlaybookPath: playbookPath,
		}, event)
		expect(event.preventDefault).toHaveBeenCalled()
		expect(event.stopPropagation).toHaveBeenCalled()
	})

	it('requests a new LucrJournal route for command-click header tab navigation', () => {
		hookState.reset()

		const onOpenRoute = vi.fn()
		const tree = renderDashboard({ onOpenRoute })
		const event = {
			metaKey: true,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		}
		readHeaderProps(tree).onSelectTab('Positions', event)

		expect(onOpenRoute).toHaveBeenCalledWith({
			activeTab: 'Positions',
			kind: 'dashboard',
		}, event)
		expect(event.preventDefault).toHaveBeenCalled()
		expect(event.stopPropagation).toHaveBeenCalled()
	})

	it('requests a new LucrJournal route for command-click analysis sub tab navigation', () => {
		hookState.reset()

		const onOpenRoute = vi.fn()
		let tree = renderDashboard({ onOpenRoute })
		readHeaderProps(tree).onSelectTab('Analysis')

		tree = renderDashboard({ onOpenRoute })
		const subTab = findElementByProp(tree, 'data-lj-tab', 'Analysis:Confluence')
		if (subTab === null) {
			throw new Error('Analysis Confluence sub tab was not rendered')
		}

		const event = {
			metaKey: true,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		}
		;(subTab.props as { onClick?: (event: TestLinkActivationEvent) => void }).onClick?.(event)

		expect(onOpenRoute).toHaveBeenCalledWith({
			activeAnalysisSubTab: 'Confluence',
			activeTab: 'Analysis',
			kind: 'dashboard',
		}, event)
		expect(event.preventDefault).toHaveBeenCalled()
		expect(event.stopPropagation).toHaveBeenCalled()
	})

	it('requests a new LucrJournal route for command-click overview date navigation', () => {
		hookState.reset()

		const onOpenRoute = vi.fn()
		const tree = renderDashboard({ onOpenRoute })
		const calendar = findElementByType(tree, DashboardOverviewCalendar)
		if (calendar === null) {
			throw new Error('DashboardOverviewCalendar was not rendered')
		}

		const event = {
			metaKey: true,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		}
		;(calendar.props as CalendarProps).onSelectDate('2026-05-22', event)

		expect(onOpenRoute).toHaveBeenCalledWith({
			activeTab: 'Positions',
			kind: 'dashboard',
			positionsOpenedAtDateFilter: '2026-05-22',
		}, event)
		expect(event.preventDefault).toHaveBeenCalled()
		expect(event.stopPropagation).toHaveBeenCalled()
	})

	it('hides the floating new position action while a dashboard table filter is open', () => {
		hookState.reset()

		let tree = renderDashboard()
		readHeaderProps(tree).onSelectTab('Positions')

		tree = renderDashboard()
		const positionsPanel = findElementByType(tree, DashboardPositionsPanel)
		if (positionsPanel === null) {
			throw new Error('DashboardPositionsPanel was not rendered')
		}

		;(positionsPanel.props as PositionsPanelProps).onTableFilterOpenChange?.(true)

		tree = renderDashboard()

		expect(findElementByType(tree, DashboardFloatingNav)).toBeNull()
	})

	it('requests a new LucrJournal route for command-click template edit navigation', () => {
		hookState.reset()

		const onOpenRoute = vi.fn()
		const tree = renderDashboard({ onOpenRoute })
		const floatingNav = findElementByType(tree, DashboardFloatingNav)
		if (floatingNav === null) {
			throw new Error('DashboardFloatingNav was not rendered')
		}

		const event = {
			metaKey: true,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		}
		;(floatingNav.props as FloatingNavProps).onEditTemplate?.({
			filePath: 'LucrJournal/templates/TPL-Test.md',
			name: 'Test',
		}, event)

		expect(onOpenRoute).toHaveBeenCalledWith({
			kind: 'dashboard',
			selectedPositionTemplatePath: 'LucrJournal/templates/TPL-Test.md',
		}, event)
		expect(event.preventDefault).toHaveBeenCalled()
		expect(event.stopPropagation).toHaveBeenCalled()
	})

	it('opens created position details after new position submit succeeds', () => {
		hookState.reset()

		const createdEntry = {
			entry: { id: 1, lucr_type: 'position' },
			file: { path: 'LucrJournal/positions/POS-00001.md' },
			files: [{ path: 'LucrJournal/positions/POS-00001.md' }],
		}

		let tree = renderDashboard()
		const modal = findElementByType(tree, NewPositionModal)
		if (modal === null) {
			throw new Error('NewPositionModal was not rendered')
		}

		;(modal.props as NewPositionModalProps).onCreated?.(createdEntry)
		hookState.positionEntries = [{
			file: { path: 'LucrJournal/positions/POS-00001.md', basename: 'POS-00001' },
			fm: { id: 1, lucr_type: 'position' },
		}]

		tree = renderDashboard()

		expect(findElementByType(tree, PositionDetails)).not.toBeNull()
	})
})

function renderDashboard(extraProps: Record<string, unknown> = {}): ReactElement<{ children?: ReactNode }> {
	hookState.beginRender()
	return DashboardScreen({
		app: {} as Parameters<typeof DashboardScreen>[0]['app'],
		plugin: {
			requestJournalViewsRender() {},
			settings: { preferences: {} },
			settingsManager: {
				editAndSave: async () => {},
			},
		} as unknown as Parameters<typeof DashboardScreen>[0]['plugin'],
		...extraProps,
	})
}

function readHeaderLabels(tree: ReactElement<{ children?: ReactNode }>): string[] {
	return readHeaderProps(tree).tabs.map((tab) => tab.label)
}

function readHeaderProps(tree: ReactElement<{ children?: ReactNode }>): HeaderProps {
	const header = findElementByType(tree, DashboardHeader)
	if (header === null) {
		throw new Error('DashboardHeader was not rendered')
	}

	return header.props as HeaderProps
}

function findElementByType(node: ReactNode, type: unknown): ReactElement<{ children?: ReactNode }> | null {
	if (isReactNodeArray(node)) {
		for (const child of node) {
			const result = findElementByType(child, type)
			if (result !== null) {
				return result
			}
		}
		return null
	}

	if (!isReactElement(node)) {
		return null
	}

	if (node.type === type) {
		return node
	}

	return findElementByType(node.props.children, type)
}

function findElementByProp(node: ReactNode, propName: string, value: unknown): ReactElement<{ children?: ReactNode }> | null {
	if (isReactNodeArray(node)) {
		for (const child of node) {
			const result = findElementByProp(child, propName, value)
			if (result !== null) {
				return result
			}
		}
		return null
	}

	if (!isReactElement(node)) {
		return null
	}

	if ((node.props as Record<string, unknown>)[propName] === value) {
		return node
	}

	return findElementByProp(node.props.children, propName, value)
}

function isReactElement(node: ReactNode): node is ReactElement<{ children?: ReactNode }> {
	return isValidElement(node)
}

function isReactNodeArray(node: ReactNode): node is ReactNode[] {
	return Array.isArray(node)
}

function areDepsEqual(left: readonly unknown[] | undefined, right: readonly unknown[] | undefined): boolean {
	if (left === undefined || right === undefined) {
		return false
	}

	return left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
}
