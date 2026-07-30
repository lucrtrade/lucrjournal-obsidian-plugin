import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view'
import { TFile, editorInfoField, type App } from 'obsidian'

import { Domains } from '..'
import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { createLogger } from '../../logger'

import { buildDomainTimestamp } from './domain-timestamps'

import type LucrJournalPlugin from '../../main'
import type { Extension } from '@codemirror/state'

const logger = createLogger('domain-modified')
const DOMAIN_MODIFIED_DEBOUNCE_MS = 2000

type DomainModifiedTracker = {
	editorExtension: Extension
	flushNow: () => Promise<void>
	unregister: () => void
}

export function registerDomainModifiedTracker(plugin: LucrJournalPlugin): DomainModifiedTracker {
	const { app } = plugin
	const timers = new Map<string, number>()
	const lastAutoWriteAt = new Map<string, number>()

	// @story [[lucrjournal/domain-model#^file-driven-modified]] Filters vault modify events before scheduling tracked domain writes
	const vaultModifyEventRef = app.vault.on('modify', (file) => {
		if (!plugin.settings.enableAutoModifiedUpdate || plugin.settings.modifiedUpdateMode !== 'file-driven') {
			return
		}

		if (!(file instanceof TFile) || !isTrackedDomainFile(app, file)) {
			return
		}

		if (wasRecentlyAutoWritten(file, lastAutoWriteAt)) {
			return
		}

		scheduleFileUpdate(app, file, timers, lastAutoWriteAt)
	})

	return {
		editorExtension: createUserDrivenModifiedExtension(plugin, timers, lastAutoWriteAt).extension,
		async flushNow() {
			for (const filePath of [...timers.keys()]) {
				const file = app.vault.getAbstractFileByPath(filePath)
				if (file instanceof TFile && isTrackedDomainFile(app, file)) {
					await updateModifiedFrontmatter(app, file, lastAutoWriteAt)
				}
			}
		},
		unregister() {
			app.vault.offref(vaultModifyEventRef)
			for (const timer of timers.values()) {
				window.clearTimeout(timer)
			}
			timers.clear()
		},
	}
}

function createUserDrivenModifiedExtension(
	plugin: LucrJournalPlugin,
	timers: Map<string, number>,
	lastAutoWriteAt: Map<string, number>,
) {
	return ViewPlugin.define((view: EditorView) => {
		const readStateField = (field: unknown) => view.state.field(field as never)
		const fileInfo = readStateField(editorInfoField) as { file?: unknown } | undefined
		const file = fileInfo?.file

		return {
			// @story [[lucrjournal/domain-model#^user-driven-modified]] Accepts only user editing events for tracked domain files
			update(update: ViewUpdate) {
				if (!plugin.settings.enableAutoModifiedUpdate || plugin.settings.modifiedUpdateMode !== 'user-driven') {
					return
				}

				if (!(file instanceof TFile) || !isTrackedDomainFile(plugin.app, file)) {
					return
				}

				if (!isUserChange(update) || wasRecentlyAutoWritten(file, lastAutoWriteAt)) {
					return
				}

				scheduleFileUpdate(plugin.app, file, timers, lastAutoWriteAt)
			},
		}
	})
}

function isUserChange(update: {
	docChanged: boolean
	transactions: ReadonlyArray<{ isUserEvent: (event: string) => boolean }>
}) {
	if (!update.docChanged || update.transactions.some((transaction) => transaction.isUserEvent('set'))) {
		return false
	}

	return update.transactions.some((transaction) =>
		transaction.isUserEvent('input')
		|| transaction.isUserEvent('delete')
		|| transaction.isUserEvent('move'),
	)
}

// @story [[lucrjournal/domain-model#^write-modified-timestamp]] Debounces each file before writing its timestamp
function scheduleFileUpdate(
	app: App,
	file: TFile,
	timers: Map<string, number>,
	lastAutoWriteAt: Map<string, number>,
) {
	const previousTimer = timers.get(file.path)
	if (previousTimer !== undefined) {
		window.clearTimeout(previousTimer)
	}

	const timer = window.setTimeout(() => {
		timers.delete(file.path)
		void updateModifiedFrontmatter(app, file, lastAutoWriteAt)
	}, DOMAIN_MODIFIED_DEBOUNCE_MS)
	timers.set(file.path, timer)
}

function wasRecentlyAutoWritten(file: TFile, lastAutoWriteAt: Map<string, number>) {
	const lastWriteAt = lastAutoWriteAt.get(file.path)
	return lastWriteAt !== undefined && Date.now() - lastWriteAt < DOMAIN_MODIFIED_DEBOUNCE_MS + 500
}

function isTrackedDomainFile(app: App, file: TFile): boolean {
	if (!file.path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`) || file.extension !== 'md') {
		return false
	}

	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter
	return Domains.some((domain) => domain.refine(frontmatter) !== null)
}

// @story [[lucrjournal/domain-model#^write-modified-timestamp]] Writes modified and backfills a missing created value while suppressing feedback
async function updateModifiedFrontmatter(
	app: App,
	file: TFile,
	lastAutoWriteAt: Map<string, number>,
) {
	lastAutoWriteAt.set(file.path, Date.now())
	const nextModified = buildDomainTimestamp()

	logger.debug('update modified frontmatter', {
		filePath: file.path,
		modified: nextModified,
	})

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		const frontmatterRecord = frontmatter as Record<string, unknown>
		frontmatterRecord.modified = nextModified
		frontmatterRecord.created ??= nextModified
	})
}
