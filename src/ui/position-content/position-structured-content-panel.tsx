/// <reference types="vitest/importMeta" />

import { Notice, type App, TFile } from 'obsidian'
import { useRef, useState, type ReactNode } from 'react'

import {
	appendSectionEntry,
	ConfluenceDomain,
	confluenceLinkedPositionSection,
	ensureTopLevelSection,
	getPositionSectionTitle,
	keyLevelLinkedPositionSection,
	marketAnalysisLinkedPositionSection,
	newsLinkedPositionSection,
	POSITION_NOTES_SECTION,
	removeTopLevelSectionFromPosition,
	type PositionContextConfluenceGroup,
	type PositionContextKeyLevelGroup,
	type PositionContextMarketAnalysisGroup,
	type PositionContextNewsGroup,
	type PositionContextPlaybookGroup,
	type PositionSectionKind,
} from '../../domains'
import { KeyLevelDomain } from '../../domains/analysis/key-level'
import { MarketAnalysisDomain } from '../../domains/analysis/market-analysis'
import { NewsDomain } from '../../domains/news'
import { t } from '../../lang/helpers'
import { NewLinkedEntryModal } from '../dashboard/new-linked-entry-modal'
import { LinkedSectionPanel } from '../linked-sections/linked-section-panel'
import { PositionDetailsPlaybookContextPanel } from '../position-details/position-details-playbook-context-panel'
import { ConfirmDeleteModal } from '../primitives/confirm-delete-modal'
import { EmbeddedEditor } from '../primitives/embedded-editor'
import { ObsidianIcon } from '../primitives/obsidian-icon'
import { useObservedWidth } from '../primitives/use-observed-width'
import { useTabIndicator } from '../primitives/use-tab-indicator'

export type PositionStructuredContentTabId =
	| 'notes'
	| 'news'
	| 'key_level'
	| 'confluence'
	| 'market_analysis'
	| 'playbook'

type AnalysisTabId =
	| 'news'
	| 'key_level'
	| 'confluence'
	| 'market_analysis'

type PositionStructuredContentPanelProps = {
	app: App
	file?: TFile | null
	positionFile?: TFile | null
	newsGroup: PositionContextNewsGroup
	keyLevelGroup: PositionContextKeyLevelGroup
	confluenceGroup: PositionContextConfluenceGroup
	marketAnalysisGroup: PositionContextMarketAnalysisGroup
	playbookGroup: PositionContextPlaybookGroup
	activeTab: PositionStructuredContentTabId
	onSelectTab: (tab: PositionStructuredContentTabId) => void
	onRevealTab: (tab: PositionStructuredContentTabId) => void
}

type TabDescriptor = {
	id: Exclude<PositionStructuredContentTabId, 'playbook'>
	label: string
	icon?: string
	hasDeleteAction?: boolean
	reserveTrailingActionSpace?: boolean
	hasContent?: boolean
}

type TabVisibilityInput = Pick<
	PositionStructuredContentPanelProps,
	'newsGroup' | 'keyLevelGroup' | 'confluenceGroup' | 'marketAnalysisGroup'
>

type HiddenSectionAction = {
	tabId: AnalysisTabId
	kind: PositionSectionKind
	label: string
	icon: string
}

type TabsDensity = 'wide' | 'icon-only'

const TABS_WIDE_WIDTH = 520
const TABS_WIDE_WIDTH_PER_TAB = 96
const TABS_ACTIONS_RESERVED_WIDTH = 196

export function PositionStructuredContentPanel({
	app,
	file,
	positionFile,
	newsGroup,
	keyLevelGroup,
	confluenceGroup,
	marketAnalysisGroup,
	playbookGroup,
	activeTab,
	onSelectTab,
	onRevealTab,
}: PositionStructuredContentPanelProps) {
	const resolvedFile = file ?? positionFile ?? null
	const headerRef = useRef<HTMLDivElement | null>(null)
	const headerWidth = useObservedWidth(headerRef)
	const playbookItems = playbookGroup.playbookEntry === null ? [] : [playbookGroup.playbookEntry]
	const tabs = buildPositionStructuredContentTabs({
		newsGroup,
		keyLevelGroup,
		confluenceGroup,
		marketAnalysisGroup,
	})
	const tabsDensity = getPositionStructuredContentTabsDensity(headerWidth, tabs.length)
	const hiddenSectionActions = buildHiddenSectionActions({
		newsGroup,
		keyLevelGroup,
		confluenceGroup,
		marketAnalysisGroup,
	})
	const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
	const [isRemovingSection, setIsRemovingSection] = useState(false)
	const [pendingDeleteTab, setPendingDeleteTab] = useState<AnalysisTabId | null>(null)
	const [pendingCreationConfig, setPendingCreationConfig] = useState<{ kind: PositionSectionKind; preFillName: string } | null>(null)
	const pendingDeleteSection = pendingDeleteTab === null
		? null
		: tabs.find((tab) => tab.id === pendingDeleteTab) ?? null
	const {
		indicatorStyle,
		registerTabButton,
		tabListRef,
	} = useTabIndicator<Exclude<PositionStructuredContentTabId, 'playbook'>>({
		activeTab: activeTab === 'playbook' ? 'notes' : activeTab,
		deps: [tabs.length],
		hidden: activeTab === 'playbook',
	})

	const handleCreateHiddenSection = async (kind: PositionSectionKind) => {
		if (resolvedFile === null) {
			return
		}

		const sectionTitle = getPositionSectionTitle(kind)
		const result = await ensureTopLevelSection(app, resolvedFile, sectionTitle)
		if (result === 'created') {
			new Notice(t('POSITION_DETAILS_CONTEXT_SECTION_CREATE_SUCCESS', { category: t(getPositionTabTitleKey(kind)) }))
		}
		onRevealTab(kind)
	}

	const handleSectionCreationRequest = (kind: PositionSectionKind, preFillName: string) => {
		setPendingCreationConfig({ kind, preFillName })
	}

	const handleDeleteSection = async (tabId: AnalysisTabId) => {
		if (resolvedFile === null) {
			return
		}

		const sectionTitle = getPositionSectionTitle(tabId)
		const tab = tabs.find((candidate) => candidate.id === tabId)
		if (tab?.hasContent) {
			setPendingDeleteTab(tabId)
			return
		}

		const removed = await removeTopLevelSectionFromPosition({
			app,
			positionFile: resolvedFile,
			sectionTitle,
		})
		if (removed) {
			new Notice(t('POSITION_DETAILS_CONTEXT_SECTION_DELETE_SUCCESS', { category: tab?.label ?? sectionTitle }))
		}
	}

	return (
		<div data-lj-panel="position-details-bottom" className="lj:mt-3 lj:bg-lj-surf lj:border lj:border-lj-alpha-10 lj:rounded-md lj:overflow-hidden lj:shadow-sm lj:flex-1 lj:flex lj:flex-col">
			<div ref={headerRef} className="lj:flex lj:items-end lj:justify-between lj:gap-3 lj:border-b lj:border-lj-alpha-5 lj:px-4 lj:pt-3">
				<div className="lj-scrollbar-hidden lj:min-w-0 lj:flex-1 lj:overflow-x-auto">
					<nav ref={tabListRef} className="lj-tab-nav lj:flex lj:min-w-max lj:items-end lj:gap-1">
						{tabs.map((tab) => (
							<div key={tab.id} className="lj:group lj:relative lj:flex lj:items-center">
								<button
									type="button"
									ref={registerTabButton(tab.id)}
									onClick={() => onSelectTab(tab.id)}
									data-lj-tab={`position-details:${tab.id}`}
									data-lj-active={activeTab === tab.id ? 'true' : 'false'}
									className={`lj:relative lj:flex lj:items-center lj:gap-1.5 lj:pl-3 lj:pb-3 lj:pt-1 lj:text-sm lj:font-medium lj:transition-colors ${getPositionStructuredContentTabPaddingClassName(tab)} ${
										activeTab === tab.id
											? 'lj:text-lj-c-strong'
											: 'lj:text-lj-c-muted lj:hover:text-lj-c-strong'
									}`}
									title={tab.label}
									aria-label={tab.label}
								>
									{tab.icon !== undefined && (
										<ObsidianIcon name={tab.icon} className="lj:size-4 lj:text-lj-c-hint" />
									)}
									{tabsDensity === 'wide' && <span>{tab.label}</span>}
									{tab.hasDeleteAction && (
										<span
											role="button"
											tabIndex={-1}
											onClick={(e) => {
												e.stopPropagation()
												void handleDeleteSection(tab.id)
											}}
											className="lj:group/del lj:absolute lj:right-1 lj:top-1/2 lj:-translate-y-1/2 lj:-mt-1 lj:inline-flex lj:items-center lj:justify-center lj:rounded-full lj:p-0.5 lj:text-lj-c-hint lj:opacity-0 lj:pointer-events-none lj:transition-all lj:duration-150 lj:group-hover:opacity-100 lj:group-hover:pointer-events-auto lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
											title={t('POSITION_DETAILS_CONTEXT_DELETE_SECTION', { category: tab.label })}
											aria-label={t('POSITION_DETAILS_CONTEXT_DELETE_SECTION', { category: tab.label })}
										>
											<ObsidianIcon name="x" className="lj:size-3 lj:transition-transform lj:duration-150 lj:group-hover/del:rotate-90" />
										</span>
									)}
								</button>
							</div>
						))}
						<div aria-hidden="true" className="lj-tab-indicator" style={indicatorStyle} />
					</nav>
				</div>

				<div className="lj:relative lj:flex lj:shrink-0 lj:items-center lj:gap-2 lj:pb-2">
					<div className="lj:relative">
						<button
							type="button"
							disabled={hiddenSectionActions.length === 0 || resolvedFile === null}
							onClick={() => setIsAddMenuOpen((current) => !current)}
							className="lj:inline-flex lj:items-center lj:justify-center lj:rounded-md lj:px-2.5 lj:py-1.5 lj:text-lj-c-hint lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong lj:disabled:cursor-not-allowed lj:disabled:opacity-40"
						>
							<ObsidianIcon name="plus" className="lj:size-4" />
						</button>

						{isAddMenuOpen && (
							<>
								<div className="lj:fixed lj:inset-0 lj:z-30" onClick={() => setIsAddMenuOpen(false)} />
								<div className="lj:absolute lj:right-0 lj:top-full lj:z-40 lj:mt-2 lj:min-w-[14rem] lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:py-2 lj:shadow-xl">
									{hiddenSectionActions.map((action) => (
										<button
											key={action.kind}
											type="button"
											onClick={() => {
												setIsAddMenuOpen(false)
												void handleCreateHiddenSection(action.kind)
											}}
											className="lj:flex lj:w-full lj:items-center lj:justify-start lj:gap-3 lj:px-4 lj:py-3 lj:text-left lj:text-sm lj:text-lj-c-muted lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
										>
											<ObsidianIcon name={action.icon} className="lj:size-4 lj:text-lj-c-hint" />
											<span>{action.label}</span>
										</button>
									))}
								</div>
							</>
						)}
					</div>

					<div className="lj:h-4 lj:w-px lj:bg-lj-alpha-10" />

					<button
						type="button"
						onClick={() => onSelectTab('playbook')}
						data-lj-tab="position-details:playbook"
						data-lj-active={activeTab === 'playbook' ? 'true' : 'false'}
						className={`lj:inline-flex lj:items-center lj:gap-2 lj:rounded-md lj:px-3 lj:py-1.5 lj:text-[11px] lj:font-medium lj:uppercase lj:tracking-[0.16em] lj:transition-colors ${
							activeTab === 'playbook'
								? 'lj:bg-lj-c-strong lj:text-lj-c-inv'
								: 'lj:text-lj-c-hint lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong'
						}`}
						title={t('TAB_PLAYBOOK')}
						aria-label={t('TAB_PLAYBOOK')}
					>
						<ObsidianIcon name="book-open" className="lj:size-3.5" />
						{tabsDensity === 'wide' && <span>{t('TAB_PLAYBOOK')}</span>}
					</button>
				</div>
			</div>

			<div className="lj:flex-1 lj:min-h-[400px] lj:p-3">
				{activeTab === 'playbook' ? (
					<PositionDetailsPlaybookContextPanel
						app={app}
						positionFile={resolvedFile}
						items={playbookItems}
						availablePlaybookEntries={playbookGroup.availablePlaybookEntries}
					/>
				) : activeTab === 'notes' ? (
					<SectionCard>
						{resolvedFile !== null ? (
							<EmbeddedEditor app={app} file={resolvedFile} section={POSITION_NOTES_SECTION} />
						) : (
							<EmptyPanel />
						)}
					</SectionCard>
				) : activeTab === 'news' ? (
					<SectionCard>
						<NewsSectionPanel
							app={app}
							file={resolvedFile}
							items={newsGroup.linkedEntries}
							availableEntries={newsGroup.availableEntries}
							onCreated={() => onRevealTab('news')}
							onCreateRequest={(name) => handleSectionCreationRequest('news', name)}
						/>
					</SectionCard>
				) : activeTab === 'key_level' ? (
					<SectionCard>
						<KeyLevelSectionPanel
							app={app}
							file={resolvedFile}
							items={keyLevelGroup.linkedEntries}
							availableEntries={keyLevelGroup.availableEntries}
							onCreated={() => onRevealTab('key_level')}
							onCreateRequest={(name) => handleSectionCreationRequest('key_level', name)}
						/>
					</SectionCard>
				) : activeTab === 'confluence' ? (
					<SectionCard>
						<ConfluenceSectionPanel
							app={app}
							file={resolvedFile}
							items={confluenceGroup.linkedEntries}
							availableEntries={confluenceGroup.availableEntries}
							onCreated={() => onRevealTab('confluence')}
							onCreateRequest={(name) => handleSectionCreationRequest('confluence', name)}
						/>
					</SectionCard>
				) : activeTab === 'market_analysis' ? (
					<SectionCard>
						<MarketAnalysisSectionPanel
							app={app}
							file={resolvedFile}
							items={marketAnalysisGroup.linkedEntries}
							availableEntries={marketAnalysisGroup.availableEntries}
							onCreated={() => onRevealTab('market_analysis')}
							onCreateRequest={(name) => handleSectionCreationRequest('market_analysis', name)}
						/>
					</SectionCard>
				) : null}
			</div>

			{pendingCreationConfig !== null && resolvedFile !== null && (
				<SectionCreationModal
					app={app}
					positionFile={resolvedFile}
					kind={pendingCreationConfig.kind}
					preFillName={pendingCreationConfig.preFillName}
					onClose={() => setPendingCreationConfig(null)}
					onCreated={(kind) => {
						setPendingCreationConfig(null)
						onRevealTab(kind)
					}}
				/>
			)}
			<ConfirmDeleteModal
				isOpen={pendingDeleteSection !== null}
				onClose={() => {
					if (!isRemovingSection) {
						setPendingDeleteTab(null)
					}
				}}
				onConfirm={() => {
					if (resolvedFile === null || pendingDeleteSection === null) {
						return
					}
					void (async () => {
						setIsRemovingSection(true)
						try {
							const removed = await removeTopLevelSectionFromPosition({
								app,
								positionFile: resolvedFile,
								sectionTitle: getPositionSectionTitle(pendingDeleteSection.id as AnalysisTabId),
							})
							if (removed) {
								new Notice(t('POSITION_DETAILS_CONTEXT_SECTION_DELETE_SUCCESS', { category: pendingDeleteSection.label }))
							}
						} finally {
							setIsRemovingSection(false)
							setPendingDeleteTab(null)
						}
					})()
				}}
				title={t('POSITION_DETAILS_CONTEXT_DELETE_SECTION_MODAL_TITLE')}
				description={t('POSITION_DETAILS_CONTEXT_DELETE_SECTION_MODAL_DESCRIPTION', {
					heading: pendingDeleteSection === null ? '# ...' : `# ${pendingDeleteSection.label}`,
				})}
				items={pendingDeleteSection === null
					? []
					: [{ label: t('POSITION_DETAILS_CONTEXT_DELETE_SECTION_HEADING'), value: `# ${pendingDeleteSection.label}` }]}
				cancelLabel={t('NEW_POSITION_CANCEL')}
				confirmLabel={t('POSITION_DETAILS_CONTEXT_DELETE_SECTION_CONFIRM')}
				isDeleting={isRemovingSection}
				isConfirmDisabled={pendingDeleteSection === null}
			/>
		</div>
	)
}

function buildTabCatalog() {
	return [
		{ id: 'notes', label: t('POSITION_DETAILS_TAB_NOTES'), icon: 'notebook-pen', reserveTrailingActionSpace: true },
		{ id: 'news', label: t('TAB_NEWS'), icon: newsLinkedPositionSection.icon, hasDeleteAction: true },
		{ id: 'key_level', label: t('TAB_KEY_LEVEL'), icon: keyLevelLinkedPositionSection.icon, hasDeleteAction: true },
		{ id: 'confluence', label: t('TAB_CONFLUENCE'), icon: confluenceLinkedPositionSection.icon, hasDeleteAction: true },
		{ id: 'market_analysis', label: t('TAB_MARKET_ANALYSIS'), icon: marketAnalysisLinkedPositionSection.icon, hasDeleteAction: true },
	] satisfies TabDescriptor[]
}

function getPositionStructuredContentTabPaddingClassName(tab: Pick<TabDescriptor, 'hasDeleteAction' | 'reserveTrailingActionSpace'>) {
	return (tab.hasDeleteAction ?? tab.reserveTrailingActionSpace) ? 'lj:pr-7' : 'lj:pr-3'
}

function getPositionStructuredContentTabsDensity(width: number, tabCount: number): TabsDensity {
	const availableTabsWidth = width - TABS_ACTIONS_RESERVED_WIDTH
	const wideWidth = Math.max(TABS_WIDE_WIDTH, tabCount * TABS_WIDE_WIDTH_PER_TAB)

	return availableTabsWidth > 0 && availableTabsWidth < wideWidth ? 'icon-only' : 'wide'
}

export function buildPositionStructuredContentTabs({
	newsGroup,
	keyLevelGroup,
	confluenceGroup,
	marketAnalysisGroup,
}: TabVisibilityInput) {
	return buildTabCatalog().filter((tab) => {
		switch (tab.id) {
			case 'notes':
				return true
			case 'news':
				return newsGroup.hasSection
			case 'key_level':
				return keyLevelGroup.hasSection
			case 'confluence':
				return confluenceGroup.hasSection
			case 'market_analysis':
				return marketAnalysisGroup.hasSection
			default:
				tab satisfies never
				throw new Error('Unknown structured content tab id')
		}
	}).map((tab) => ({
		...tab,
		hasContent: getSectionHasContent(tab.id, {
			newsGroup,
			keyLevelGroup,
			confluenceGroup,
			marketAnalysisGroup,
		}),
	}))
}

function buildHiddenSectionActions({
	newsGroup,
	keyLevelGroup,
	confluenceGroup,
	marketAnalysisGroup,
}: TabVisibilityInput) {
	return buildHiddenSectionCatalog().filter((action) => {
		switch (action.tabId) {
			case 'news':
				return !newsGroup.hasSection
			case 'key_level':
				return !keyLevelGroup.hasSection
			case 'confluence':
				return !confluenceGroup.hasSection
			case 'market_analysis':
				return !marketAnalysisGroup.hasSection
			default:
				action satisfies never
				throw new Error('Unknown hidden section action')
		}
	})
}

function getSectionHasContent(
	tabId: AnalysisTabId | 'notes',
	{
		newsGroup,
		keyLevelGroup,
		confluenceGroup,
		marketAnalysisGroup,
	}: TabVisibilityInput,
) {
	switch (tabId) {
		case 'notes':
			return true
		case 'news':
			return newsGroup.hasContent
		case 'key_level':
			return keyLevelGroup.hasContent
		case 'confluence':
			return confluenceGroup.hasContent
		case 'market_analysis':
			return marketAnalysisGroup.hasContent
		default:
			tabId satisfies never
			throw new Error('Unknown tab content state')
	}
}

function getPositionTabTitleKey(kind: PositionSectionKind) {
	switch (kind) {
		case 'news':
			return 'TAB_NEWS'
		case 'key_level':
			return 'TAB_KEY_LEVEL'
		case 'confluence':
			return 'TAB_CONFLUENCE'
		case 'market_analysis':
			return 'TAB_MARKET_ANALYSIS'
		default:
			kind satisfies never
			throw new Error('Unknown position tab kind')
	}
}

function buildHiddenSectionCatalog() {
	return [
		{
			tabId: 'news',
			kind: newsLinkedPositionSection.kind,
			label: t(newsLinkedPositionSection.titleKey),
			icon: newsLinkedPositionSection.icon,
		},
		{
			tabId: 'key_level',
			kind: keyLevelLinkedPositionSection.kind,
			label: t(keyLevelLinkedPositionSection.titleKey),
			icon: keyLevelLinkedPositionSection.icon,
		},
		{
			tabId: 'confluence',
			kind: confluenceLinkedPositionSection.kind,
			label: t(confluenceLinkedPositionSection.titleKey),
			icon: confluenceLinkedPositionSection.icon,
		},
		{
			tabId: 'market_analysis',
			kind: marketAnalysisLinkedPositionSection.kind,
			label: t(marketAnalysisLinkedPositionSection.titleKey),
			icon: marketAnalysisLinkedPositionSection.icon,
		},
	] satisfies HiddenSectionAction[]
}

export function resolveVisiblePositionStructuredContentTab(
	activeTab: PositionStructuredContentTabId,
	tabs: TabDescriptor[],
) {
	if (activeTab === 'playbook') {
		return activeTab
	}

	return tabs.some((tab) => tab.id === activeTab)
		? activeTab
		: tabs[0]?.id ?? 'notes'
}

function SectionCard({ children }: { children: ReactNode }) {
	return (
		<section className="lj:flex lj:h-full lj:min-h-[340px] lj:flex-col lj:rounded-xl lj:border lj:border-lj-alpha-8-10 lj:bg-lj-surf-deep">
			<div className="lj:min-h-0 lj:flex-1 lj:p-3">{children}</div>
		</section>
	)
}

function EmptyPanel() {
	return (
		<div className="lj:flex lj:h-full lj:min-h-[240px] lj:items-center lj:justify-center lj:text-lj-c-hint lj:italic">
			{t('POSITION_DETAILS_ADD_ANALYSES')}
		</div>
	)
}

function NewsSectionPanel(props: {
	app: App
	file: TFile | null
	items: PositionContextNewsGroup['linkedEntries']
	availableEntries: PositionContextNewsGroup['availableEntries']
	onCreated: () => void
	onCreateRequest: (name: string) => void
}) {
	return (
		<LinkedSectionPanel
			app={props.app}
			createEntry={(name) => newsLinkedPositionSection.createLinkedEntry(props.app, name)}
			kind={newsLinkedPositionSection.kind}
			title={t(newsLinkedPositionSection.titleKey)}
			positionFile={props.file}
			items={props.items}
			availableEntries={props.availableEntries}
			onCreated={props.onCreated}
			onCreateRequest={props.onCreateRequest}
		/>
	)
}

function KeyLevelSectionPanel(props: {
	app: App
	file: TFile | null
	items: PositionContextKeyLevelGroup['linkedEntries']
	availableEntries: PositionContextKeyLevelGroup['availableEntries']
	onCreated: () => void
	onCreateRequest: (name: string) => void
}) {
	return (
		<LinkedSectionPanel
			app={props.app}
			createEntry={(name) => keyLevelLinkedPositionSection.createLinkedEntry(props.app, name)}
			kind={keyLevelLinkedPositionSection.kind}
			title={t(keyLevelLinkedPositionSection.titleKey)}
			positionFile={props.file}
			items={props.items}
			availableEntries={props.availableEntries}
			onCreated={props.onCreated}
			onCreateRequest={props.onCreateRequest}
		/>
	)
}

function ConfluenceSectionPanel(props: {
	app: App
	file: TFile | null
	items: PositionContextConfluenceGroup['linkedEntries']
	availableEntries: PositionContextConfluenceGroup['availableEntries']
	onCreated: () => void
	onCreateRequest: (name: string) => void
}) {
	return (
		<LinkedSectionPanel
			app={props.app}
			createEntry={(name) => confluenceLinkedPositionSection.createLinkedEntry(props.app, name)}
			kind={confluenceLinkedPositionSection.kind}
			title={t(confluenceLinkedPositionSection.titleKey)}
			positionFile={props.file}
			items={props.items}
			availableEntries={props.availableEntries}
			onCreated={props.onCreated}
			onCreateRequest={props.onCreateRequest}
		/>
	)
}

function MarketAnalysisSectionPanel(props: {
	app: App
	file: TFile | null
	items: PositionContextMarketAnalysisGroup['linkedEntries']
	availableEntries: PositionContextMarketAnalysisGroup['availableEntries']
	onCreated: () => void
	onCreateRequest: (name: string) => void
}) {
	return (
		<LinkedSectionPanel
			app={props.app}
			createEntry={(name) => marketAnalysisLinkedPositionSection.createLinkedEntry(props.app, name)}
			kind={marketAnalysisLinkedPositionSection.kind}
			title={t(marketAnalysisLinkedPositionSection.titleKey)}
			positionFile={props.file}
			items={props.items}
			availableEntries={props.availableEntries}
			onCreated={props.onCreated}
			onCreateRequest={props.onCreateRequest}
		/>
	)
}

function SectionCreationModal({
	app,
	positionFile,
	kind,
	preFillName,
	onClose,
	onCreated,
}: {
	app: App
	positionFile: TFile
	kind: PositionSectionKind
	preFillName: string
	onClose: () => void
	onCreated: (kind: PositionSectionKind) => void
}) {
	const sectionTitle = getPositionSectionTitle(kind)
	switch (kind) {
		case 'news':
			return (
				<NewLinkedEntryModal
					app={app}
					isOpen
					title={t('DASHBOARD_META_TAB_NEW', { tab: t(newsLinkedPositionSection.titleKey) })}
					submitLabel={t('NEW_NEWS_SAVE')}
					formDefinition={NewsDomain.formDefinition}
					buildInitialFormValues={() => ({
						...NewsDomain.buildInitialFormValues({ app }),
						name: preFillName,
					})}
					synchronizeFormValues={NewsDomain.synchronizeFormValues.bind(NewsDomain)}
					createEntry={async (runtimeApp: App, formValue: Parameters<typeof NewsDomain.createEntry>[1]) => {
						const result = await NewsDomain.createEntry(runtimeApp, formValue)
						const entryFile = runtimeApp.vault.getAbstractFileByPath(result.file.path)
						if (entryFile instanceof TFile) {
							await appendSectionEntry(runtimeApp, positionFile, sectionTitle, entryFile)
						}
					}}
					toSubmitErrorMessage={(error) => {
						const errorMessageKey = NewsDomain.toCreateEntryErrorMessageKey(error)
						return errorMessageKey === null ? null : t(errorMessageKey)
					}}
					onClose={onClose}
					onSubmitSuccess={() => onCreated(kind)}
				/>
			)
		case 'key_level':
			return (
				<NewLinkedEntryModal
					app={app}
					isOpen
					title={t('DASHBOARD_META_TAB_NEW', { tab: t(keyLevelLinkedPositionSection.titleKey) })}
					submitLabel={t('NEW_KEY_LEVEL_SAVE')}
					formDefinition={KeyLevelDomain.formDefinition}
					buildInitialFormValues={() => ({
						...KeyLevelDomain.buildInitialFormValues({ app }),
						name: preFillName,
					})}
					synchronizeFormValues={KeyLevelDomain.synchronizeFormValues.bind(KeyLevelDomain)}
					createEntry={async (runtimeApp: App, formValue: Parameters<typeof KeyLevelDomain.createEntry>[1]) => {
						const result = await KeyLevelDomain.createEntry(runtimeApp, formValue)
						const entryFile = runtimeApp.vault.getAbstractFileByPath(result.file.path)
						if (entryFile instanceof TFile) {
							await appendSectionEntry(runtimeApp, positionFile, sectionTitle, entryFile)
						}
					}}
					toSubmitErrorMessage={(error) => {
						const errorMessageKey = KeyLevelDomain.toCreateEntryErrorMessageKey(error)
						return errorMessageKey === null ? null : t(errorMessageKey)
					}}
					onClose={onClose}
					onSubmitSuccess={() => onCreated(kind)}
				/>
			)
		case 'confluence':
			return (
				<NewLinkedEntryModal
					app={app}
					isOpen
					title={t('DASHBOARD_META_TAB_NEW', { tab: t(confluenceLinkedPositionSection.titleKey) })}
					submitLabel={t('NEW_CONFLUENCE_SAVE')}
					formDefinition={ConfluenceDomain.formDefinition}
					buildInitialFormValues={() => ({
						...ConfluenceDomain.buildInitialFormValues({ app }),
						name: preFillName,
					})}
					synchronizeFormValues={ConfluenceDomain.synchronizeFormValues.bind(ConfluenceDomain)}
					createEntry={async (runtimeApp: App, formValue: Parameters<typeof ConfluenceDomain.createEntry>[1]) => {
						const result = await ConfluenceDomain.createEntry(runtimeApp, formValue)
						const entryFile = runtimeApp.vault.getAbstractFileByPath(result.file.path)
						if (entryFile instanceof TFile) {
							await appendSectionEntry(runtimeApp, positionFile, sectionTitle, entryFile)
						}
					}}
					toSubmitErrorMessage={(error) => {
						const errorMessageKey = ConfluenceDomain.toCreateEntryErrorMessageKey(error)
						return errorMessageKey === null ? null : t(errorMessageKey)
					}}
					onClose={onClose}
					onSubmitSuccess={() => onCreated(kind)}
				/>
			)
		case 'market_analysis':
			return (
				<NewLinkedEntryModal
					app={app}
					isOpen
					title={t('DASHBOARD_META_TAB_NEW', { tab: t(marketAnalysisLinkedPositionSection.titleKey) })}
					submitLabel={t('NEW_MARKET_ANALYSIS_SAVE')}
					formDefinition={MarketAnalysisDomain.formDefinition}
					buildInitialFormValues={() => ({
						...MarketAnalysisDomain.buildInitialFormValues({ app }),
						name: preFillName,
					})}
					synchronizeFormValues={MarketAnalysisDomain.synchronizeFormValues.bind(MarketAnalysisDomain)}
					createEntry={async (runtimeApp: App, formValue: Parameters<typeof MarketAnalysisDomain.createEntry>[1]) => {
						const result = await MarketAnalysisDomain.createEntry(runtimeApp, formValue)
						const entryFile = runtimeApp.vault.getAbstractFileByPath(result.file.path)
						if (entryFile instanceof TFile) {
							await appendSectionEntry(runtimeApp, positionFile, sectionTitle, entryFile)
						}
					}}
					toSubmitErrorMessage={(error) => {
						const errorMessageKey = MarketAnalysisDomain.toCreateEntryErrorMessageKey(error)
						return errorMessageKey === null ? null : t(errorMessageKey)
					}}
					onClose={onClose}
					onSubmitSuccess={() => onCreated(kind)}
				/>
			)
		default:
			kind satisfies never
			throw new Error('Unknown section kind')
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('buildPositionStructuredContentTabs', () => {
		it('keeps existing left tabs even when the section is empty, and always keeps notes', () => {
			const tabs = buildPositionStructuredContentTabs({
				newsGroup: { kind: 'news', sectionTitle: 'News', linkedEntries: [] as never[], availableEntries: [], hasSection: true, hasContent: false },
				keyLevelGroup: { kind: 'key_level', sectionTitle: 'Key Levels', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
				confluenceGroup: { kind: 'confluence', sectionTitle: 'Confluence', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
				marketAnalysisGroup: { kind: 'market_analysis', sectionTitle: 'Market Analysis', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
			})

			expect(tabs.map((tab) => tab.id)).toEqual(['notes', 'news'])
		})

		it('reserves trailing action space for notes so its label aligns with deletable tabs', () => {
			const tabs = buildPositionStructuredContentTabs({
				newsGroup: { kind: 'news', sectionTitle: 'News', linkedEntries: [] as never[], availableEntries: [], hasSection: true, hasContent: false },
				keyLevelGroup: { kind: 'key_level', sectionTitle: 'Key Levels', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
				confluenceGroup: { kind: 'confluence', sectionTitle: 'Confluence', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
				marketAnalysisGroup: { kind: 'market_analysis', sectionTitle: 'Market Analysis', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
			})
			const notesTab = tabs.find((tab) => tab.id === 'notes')
			const newsTab = tabs.find((tab) => tab.id === 'news')

			expect(notesTab).toBeDefined()
			expect(newsTab).toBeDefined()
			expect(getPositionStructuredContentTabPaddingClassName(notesTab!)).toBe('lj:pr-7')
			expect(getPositionStructuredContentTabPaddingClassName(newsTab!)).toBe('lj:pr-7')
		})
	})

	describe('buildHiddenSectionActions', () => {
		it('exposes missing analysis sections in the right-side add menu', () => {
			const actions = buildHiddenSectionActions({
				newsGroup: { kind: 'news', sectionTitle: 'News', linkedEntries: [{ path: 'news-1' }] as never[], availableEntries: [], hasSection: true, hasContent: true },
				keyLevelGroup: { kind: 'key_level', sectionTitle: 'Key Levels', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
				confluenceGroup: { kind: 'confluence', sectionTitle: 'Confluence', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
				marketAnalysisGroup: { kind: 'market_analysis', sectionTitle: 'Market Analysis', linkedEntries: [] as never[], availableEntries: [], hasSection: false, hasContent: false },
			})

			expect(actions.map((action) => action.tabId)).toEqual(['key_level', 'confluence', 'market_analysis'])
		})
	})

	describe('resolveVisiblePositionStructuredContentTab', () => {
		it('keeps playbook on the fixed right-side action path', () => {
			expect(resolveVisiblePositionStructuredContentTab('playbook', [
				{ id: 'notes', label: 'Notes' },
			])).toBe('playbook')
		})

		it('falls back to the first visible tab when the current analysis tab is hidden', () => {
			expect(resolveVisiblePositionStructuredContentTab('news', [
				{ id: 'notes', label: 'Notes' },
			])).toBe('notes')
		})

		it('keeps the current tab when it remains visible', () => {
			expect(resolveVisiblePositionStructuredContentTab('news', [
				{ id: 'notes', label: 'Notes' },
				{ id: 'news', label: 'News' },
			])).toBe('news')
		})
	})

	describe('getPositionStructuredContentTabsDensity', () => {
		it('keeps labels when the header width still leaves enough room after reserving the right action area', () => {
			expect(getPositionStructuredContentTabsDensity(760, 5)).toBe('wide')
		})

		it('collapses to icon-only when the remaining left-side width is too narrow for the visible tabs', () => {
			expect(getPositionStructuredContentTabsDensity(620, 5)).toBe('icon-only')
		})
	})
}
