import { addIcon, normalizePath, Plugin } from 'obsidian'

import { registerPositionAttachmentOcrRuntime } from './attachments/ocr-runtime'
import { bindCacheRuntime } from './cache'
import { CacheRegistry } from './charts/ohlcv-cache'
import {
	BUILD_INFO,
	logBuildInfo,
	LUCR_JOURNAL_VIEW_TYPE,
	LUCR_PLAYBOOK_VIEW_TYPE,
	LUCR_POSITION_VIEW_TYPE,
	OPEN_JOURNAL_COMMAND_ID,
} from './constant'
import { registerDomainModifiedTracker } from './domains/core/domain-modified-tracker'
import { registerLucrJournalAttachmentCapture } from './editor/attachment-paste-drop'
import { IconsSvg } from './icons'
import { setCurrentLocaleSetting, t } from './lang/helpers'
import { createLogger, setDebugLoggingEnabled } from './logger'
import { registerReadonlyLucrTypeProperty } from './metadata/readonly-lucr-type-property'
import { registerPropertyTypes } from './metadata/register-property-types'
import { maybeShowReleaseNotes, openReleaseNotes } from './release-notes/release-notes-runtime'
import { handleAuthCallback, runSessionCheck } from './session/login'
import {
	createPluginSettings,
	PluginSettings,
	PluginSettingsManager,
	setCurrentTimeZoneSetting,
} from './settings/plugin-settings'
import { PluginSettingsTab } from './settings/plugin-settings-tab'
import {
	LUCR_TRADE_REQUIRED_DIRS,
} from './trade-directories'
import { registerDomainFileRouting, registerDomainMarkdownActions } from './views/domain-file-routing'
import { LucrJournalView } from './views/lucr-journal-view'
import { PlaybookFileView } from './views/playbook-file-view'
import { PositionFileView } from './views/position-file-view'

import type { WorkspaceLeaf } from 'obsidian'

const logger = createLogger('plugin')

export default class LucrJournalPlugin extends Plugin {
	public override settings = new PluginSettings()
	public settingsManager = new PluginSettingsManager(this)

	public override async onload(): Promise<void> {
		const persistedSettings = await this.loadData() as unknown
		this.settings = createPluginSettings(persistedSettings)
		this.settingsManager = new PluginSettingsManager(this)
		setCurrentLocaleSetting(this.settings.lang)
		setCurrentTimeZoneSetting(this.settings.timeZone)
		this.applyDebugMode()
		this.addSettingTab(new PluginSettingsTab(this))

		await this.onloadImpl()

		this.app.workspace.onLayoutReady(async () => {
			await this.onLayoutReady()
		})
	}

	public override onunload(): void {
		logger.debug('detaching journal leaves', {
			viewType: LUCR_JOURNAL_VIEW_TYPE,
		})
		void this.app.workspace.detachLeavesOfType(LUCR_JOURNAL_VIEW_TYPE)
		void this.app.workspace.detachLeavesOfType(LUCR_PLAYBOOK_VIEW_TYPE)
		void this.app.workspace.detachLeavesOfType(LUCR_POSITION_VIEW_TYPE)
	}

	private async onloadImpl(): Promise<void> {
		this.register(registerPositionAttachmentOcrRuntime(this))
		bindCacheRuntime(this.app, CacheRegistry)
		const domainModifiedTracker = registerDomainModifiedTracker(this)
		this.registerEditorExtension(domainModifiedTracker.editorExtension)
		this.register(() => domainModifiedTracker.unregister())
		registerLucrJournalAttachmentCapture(this)

		logBuildInfo(this.manifest.version)
		logger.debug('registering plugin runtime', {
			commandId: OPEN_JOURNAL_COMMAND_ID,
			environment: BUILD_INFO.environment,
			gitCommitSha: BUILD_INFO.gitCommitSha,
			version: this.manifest.version,
			viewType: LUCR_JOURNAL_VIEW_TYPE,
		})

		this.registerView(
			LUCR_JOURNAL_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new LucrJournalView(leaf, this),
		)
		this.registerView(
			LUCR_POSITION_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new PositionFileView(leaf, this),
		)
		this.registerView(
			LUCR_PLAYBOOK_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new PlaybookFileView(leaf),
		)
		registerDomainFileRouting(this)

		addIcon('lucrtrade', IconsSvg.LucrTrade)
		registerDomainMarkdownActions(this)
		registerReadonlyLucrTypeProperty(this)
		this.addRibbonIcon('lucrtrade', t('OPEN_JOURNAL'), async () => {
			await this.activateJournalView()
		})

		this.addCommand({
			icon: 'lucrtrade',
			id: OPEN_JOURNAL_COMMAND_ID,
			name: t('OPEN_JOURNAL'),
			callback: async () => {
				await this.activateJournalView()
			},
		})

		this.addCommand({
			id: 'show-release-notes',
			name: t('RELEASE_NOTES_COMMAND'),
			callback: () => {
				openReleaseNotes(this)
			},
		})

		this.registerObsidianProtocolHandler('lucrjournal-auth', async ({ code, state }) => {
			const signedIn = await handleAuthCallback(this.app, this.manifest.version, { code, state })
			if (signedIn) {
				this.requestJournalViewsRender()
			}
		})
	}

	private async ensureFolders(): Promise<void> {
		const span = logger.span('ensure vault structure', {
			rootDir: LUCR_TRADE_REQUIRED_DIRS.root,
		})

		for (const dir of LUCR_TRADE_REQUIRED_DIRS.paths) {
			const path = normalizePath(dir)
			const folder = this.app.vault.getAbstractFileByPath(path)
			if (folder) {
				continue
			}

			try {
				await this.app.vault.createFolder(path)
				logger.debug('created required vault directory', {
					path,
				})
			} catch (error: unknown) {
				const cachedFolder = this.app.vault.getAbstractFileByPath(path)
				if (cachedFolder) {
					logger.warn('required vault directory creation raced with cache update', {
						error,
						path,
					})
					continue
				}

				span.fail('ensure vault structure failed', {
					error,
					path,
				})
				// throw error;
			}
		}

		span.end({
			directories: LUCR_TRADE_REQUIRED_DIRS.paths.length,
		})
	}

	private async onLayoutReady(): Promise<void> {
		registerPropertyTypes(this.app)

		await sleep(100)

		await this.ensureFolders()
		await maybeShowReleaseNotes(this)
		await runSessionCheck(this.app)
		this.requestJournalViewsRender()
	}

	private async activateJournalView(): Promise<void> {
		await this.ensureFolders()
		const span = logger.span('activate journal dashboard', {
			viewType: LUCR_JOURNAL_VIEW_TYPE,
		})
		const leaf = await this.ensureJournalLeaf()
		await this.getJournalView(leaf).showDashboard()
		await this.app.workspace.revealLeaf(leaf)
		span.end({
			mode: 'dashboard',
		})
	}

	private async ensureJournalLeaf(): Promise<WorkspaceLeaf> {
		const existingLeaf = this.app.workspace.getLeavesOfType(LUCR_JOURNAL_VIEW_TYPE)[0]
		if (existingLeaf) {
			logger.debug('reusing existing journal leaf')
			return existingLeaf
		}

		logger.debug('creating journal leaf')
		const leaf = this.app.workspace.getLeaf(false)
		await leaf.setViewState({
			active: true,
			type: LUCR_JOURNAL_VIEW_TYPE,
		})
		return leaf
	}

	private getJournalView(leaf: WorkspaceLeaf): LucrJournalView {
		if (!(leaf.view instanceof LucrJournalView)) {
			throw new Error('journal leaf did not resolve to LucrJournalView')
		}

		return leaf.view
	}

	public refreshLocalizedUi(): void {
		setCurrentLocaleSetting(this.settings.lang)
		setCurrentTimeZoneSetting(this.settings.timeZone)

		this.requestJournalViewsRender()
	}

	public applyDebugMode(): void {
		setDebugLoggingEnabled(this.settings.debugMode)
	}

	public requestJournalViewsRender(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(LUCR_JOURNAL_VIEW_TYPE)) {
			this.getJournalView(leaf).requestRender()
		}
	}
}

function sleep(timeoutMs: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, timeoutMs)
	})
}
