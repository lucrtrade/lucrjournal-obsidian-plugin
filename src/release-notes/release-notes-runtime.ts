import { isVersionNewerThanOther } from './changelog'
import { ReleaseNotesModal } from './release-notes-modal'

import type LucrJournalPlugin from '../main'

export function openReleaseNotes(plugin: LucrJournalPlugin): void {
	// @story [[lucrjournal/content#^manual-release-notes]] Opens the manifest version without enabling close-time persistence.
	new ReleaseNotesModal(plugin.app, plugin, plugin.manifest.version, { persistVersion: false }).open()
}

export async function maybeShowReleaseNotes(plugin: LucrJournalPlugin): Promise<void> {
	// @story [[lucrjournal/content#^release-notes-no-show]] Skips automatic release notes when the setting is disabled.
	if (!plugin.settings.showReleaseNotes) {
		return
	}

	const current = plugin.manifest.version
	const previous = plugin.settings.previousRelease
	// @story [[lucrjournal/content#^release-notes-no-show]] Records first installation without opening release notes.
	if (previous === '') {
		await plugin.settingsManager.editAndSave((settings) => {
			settings.previousRelease = current
		}, true)
		return
	}

	// @story [[lucrjournal/content#^release-notes-no-show]] Skips versions that are not newer than the saved release.
	if (!isVersionNewerThanOther(current, previous)) {
		return
	}

	// @story [[lucrjournal/content#^release-notes-after-upgrade]] Opens an automatically persisted modal for a newer manifest version.
	new ReleaseNotesModal(plugin.app, plugin, current).open()
}
