import { ItemView, type ViewStateResult } from 'obsidian'
import { createRoot, type Root } from 'react-dom/client'

import { LUCR_JOURNAL_VIEW_TYPE } from '../constant'
import { createLogger } from '../logger'
import { getToken, requiresJournalUpgrade } from '../session/storage'
import { DashboardScreen } from '../ui/dashboard-screen'
import { SessionGateScreen } from '../ui/login-screen'

import { isCommandClick, type LinkActivationEvent } from './link-activation'
import {
	createLucrJournalRouteViewState,
	DEFAULT_JOURNAL_ROUTE_STATE,
	resolveLucrJournalRouteStateFromViewState,
	type LucrJournalRouteState,
} from './lucr-journal-route'

import type LucrJournalPlugin from '../main'
import type { WorkspaceLeaf } from 'obsidian'

const logger = createLogger('view')

export class LucrJournalView extends ItemView {
	private root: Root | null = null
	private routeState: LucrJournalRouteState = DEFAULT_JOURNAL_ROUTE_STATE
	private workspaceLeafEl: HTMLElement | null = null

	constructor(leaf: WorkspaceLeaf, private readonly plugin: LucrJournalPlugin) {
		super(leaf)
	}

	getViewType(): string {
		return LUCR_JOURNAL_VIEW_TYPE
	}

	getDisplayText(): string {
		return 'LucrJournal'
	}

	override getIcon(): string {
		return 'lucrtrade'
	}

	async showDashboard(): Promise<void> {
		this.showRoute(DEFAULT_JOURNAL_ROUTE_STATE)
	}

	showRoute(route: LucrJournalRouteState): void {
		this.routeState = route
		this.render()
	}

	async openRoute(route: LucrJournalRouteState, event?: LinkActivationEvent): Promise<void> {
		if (!isCommandClick(event)) {
			// @story [[lucrjournal/runtime#^same-leaf-route]] Updates normal route activation in the current journal view.
			this.showRoute(route)
			return
		}

		// @story [[lucrjournal/runtime#^command-route-new-tab]] Opens command-click routes as complete journal view state in a new tab.
		const leaf = this.app.workspace.getLeaf('tab')
		await leaf.setViewState(createLucrJournalRouteViewState(route))
		await this.app.workspace.revealLeaf(leaf)
	}

	override getState(): Record<string, unknown> {
		return { route: this.routeState }
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result)
		this.showRoute(resolveLucrJournalRouteStateFromViewState(state))
	}

	override async onOpen(): Promise<void> {
		const span = logger.span('open journal view', {
			viewType: LUCR_JOURNAL_VIEW_TYPE,
		})
		this.workspaceLeafEl = this.getWorkspaceLeafEl()
		this.workspaceLeafEl.addClass('lucrjournal-leaf')
		this.workspaceLeafEl.addClass('lucrjournal-dashboard-leaf')
		this.contentEl.empty()

		// @story [[lucrjournal/runtime#^dashboard-react-root]] Mounts the dashboard React root with stable runtime selectors.
		const container = this.contentEl.createDiv({
			cls: 'lucrjournal-view lucrjournal-dashboard-view',
			attr: {
				'data-lj-root': 'journal-view',
				'data-lj-view-type': LUCR_JOURNAL_VIEW_TYPE,
			},
		})

		this.root = createRoot(container)
		this.render()
		span.end({
			hasRoot: this.root !== null,
		})
	}

	override async onClose(): Promise<void> {
		logger.debug('close journal view', {
			hasRoot: this.root !== null,
			viewType: LUCR_JOURNAL_VIEW_TYPE,
		})
		// @story [[lucrjournal/runtime#^view-react-cleanup]] Unmounts and clears the dashboard React runtime when its view closes.
		this.root?.unmount()
		this.root = null
		this.workspaceLeafEl?.removeClass('lucrjournal-dashboard-leaf')
		this.workspaceLeafEl?.removeClass('lucrjournal-leaf')
		this.workspaceLeafEl = null
		this.contentEl.empty()
	}

	public requestRender(): void {
		this.render()
	}

	private render(): void {
		if (this.root === null) {
			return
		}

		// @story [[lucrjournal/entitlement#^views-share-access-gate]] Gates the main journal view with the shared session predicate.
		if (getToken(this.app) === null || requiresJournalUpgrade(this.app)) {
			this.root.render(<SessionGateScreen
				app={this.app}
				onRecheck={() => this.plugin.recheckJournalAccess()}
			/>)
			return
		}

		const routeKey = JSON.stringify(this.routeState)

		this.root.render(
			<DashboardScreen
				key={routeKey}
				app={this.app}
				plugin={this.plugin}
				routeState={this.routeState}
				onOpenRoute={(route, event) => {
					void this.openRoute(route, event)
				}}
			/>,
		)
	}

	private getWorkspaceLeafEl(): HTMLElement {
		const leafEl = this.containerEl.closest('.workspace-leaf')
		if (!(leafEl instanceof HTMLElement)) {
			throw new Error('Missing workspace leaf element')
		}
		return leafEl
	}
}
