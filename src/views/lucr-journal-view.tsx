import { ItemView, type ViewStateResult } from 'obsidian'
import { createRoot, type Root } from 'react-dom/client'

import { LUCR_JOURNAL_VIEW_TYPE } from '../constant'
import { createLogger } from '../logger'
import { DashboardScreen } from '../ui/dashboard-screen'

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

	constructor(leaf: WorkspaceLeaf, private readonly plugin: LucrJournalPlugin) {
		super(leaf)
	}

	getViewType(): string {
		return LUCR_JOURNAL_VIEW_TYPE
	}

	getDisplayText(): string {
		// eslint-disable-next-line obsidianmd/ui/sentence-case
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
			this.showRoute(route)
			return
		}

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
		this.contentEl.empty()

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
		this.root?.unmount()
		this.root = null
		this.contentEl.empty()
	}

	public requestRender(): void {
		this.render()
	}

	private render(): void {
		if (this.root === null) {
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
}
