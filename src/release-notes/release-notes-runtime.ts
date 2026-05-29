import { isVersionNewerThanOther } from './changelog'
import { ReleaseNotesModal } from './release-notes-modal'

import type LucrJournalPlugin from '../main'

export function openReleaseNotes(plugin: LucrJournalPlugin): void {
	new ReleaseNotesModal(plugin.app, plugin, plugin.manifest.version, { persistVersion: false }).open()
}

export async function maybeShowReleaseNotes(plugin: LucrJournalPlugin): Promise<void> {
	if (!plugin.settings.showReleaseNotes) {
		return
	}

	const current = plugin.manifest.version
	const previous = plugin.settings.previousRelease
	if (previous === '') {
		await plugin.settingsManager.editAndSave((settings) => {
			settings.previousRelease = current
		}, true)
		return
	}

	if (!isVersionNewerThanOther(current, previous)) {
		return
	}

	new ReleaseNotesModal(plugin.app, plugin, current).open()
}
