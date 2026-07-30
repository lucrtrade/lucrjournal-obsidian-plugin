import { Component, MarkdownRenderer, Modal } from 'obsidian'

import { t } from '../lang/helpers'

import {
	formatChangelogEntries,
	getChangelogEntries,
	selectChangelogVersions,
} from './changelog'

import type LucrJournalPlugin from '../main'
import type { App } from 'obsidian'

// @story [[lucrjournal/content#^changelog-version-range]] Caps the selected release note range shown in one modal.
const MAX_RELEASE_NOTES_ENTRIES = 10

type ReleaseNotesModalOptions = {
	persistVersion?: boolean
}

export class ReleaseNotesModal extends Modal {
	private readonly renderHost = new Component()

	public constructor(
		app: App,
		private readonly plugin: LucrJournalPlugin,
		private readonly version: string,
		private readonly options: ReleaseNotesModalOptions = {},
	) {
		super(app)
	}

	public override onOpen(): void {
		this.titleEl.setText(t('RELEASE_NOTES_TITLE', { version: this.version }))
		this.contentEl.addClass('lucrjournal-release-notes')
		this.renderHost.load()
		void this.renderBody()
	}

	public override onClose(): void {
		this.contentEl.empty()
		this.renderHost.unload()
		// @story [[lucrjournal/content#^manual-release-notes]] Keeps manually opened release notes from changing the saved version.
		if (this.options.persistVersion === false) {
			return
		}

		// @story [[lucrjournal/content#^release-notes-after-upgrade]] Persists the automatically shown manifest version when the modal closes.
		void this.plugin.settingsManager.editAndSave((settings) => {
			settings.previousRelease = this.version
		}, true)
	}

	private async renderBody(): Promise<void> {
		await MarkdownRenderer.render(this.app, this.buildMarkdown(), this.contentEl, '', this.renderHost)

		const footer = this.contentEl.createDiv({ cls: 'lucrjournal-release-notes-footer' })
		footer.createEl('button', { text: t('RELEASE_NOTES_CLOSE') }).addEventListener('click', () => {
			this.close()
		})
	}

	private buildMarkdown(): string {
		const { versions, bodies } = getChangelogEntries()
		const selectedVersions = selectChangelogVersions(
			versions,
			this.plugin.settings.previousRelease,
			this.version,
		).slice(0, MAX_RELEASE_NOTES_ENTRIES)

		return formatChangelogEntries(selectedVersions, bodies, t('RELEASE_NOTES_EMPTY'))
	}
}
