import { TFile, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../constant'

import { AgentApiError, agentError } from './errors'

const MAX_ACTIVITY_RECORDS = 50

type FileSnapshot = { path: string; before: string; after: string }

export type AgentActivity = {
	id: string
	at: string
	operation: string
	summary: string
	created: string[]
	modified: string[]
	removed: string[]
	undoable: boolean
	undone: boolean
}

type ActivityRecord = AgentActivity & { snapshots: FileSnapshot[] }

export type WriteOptions = {
	operation: string
	summary: string
	/** Existing notes this call may rewrite; they are restored if the call fails. */
	touch: TFile[]
	/** Renames and deletions cannot be replayed backwards from text snapshots. */
	undoable?: boolean
	removed?: string[]
	/** Set for renames: the file at its new path is not a file this call created, so a rollback must not trash it. */
	skipCreatedTracking?: boolean
}

/**
 * In-memory record of what the agent changed in this Obsidian session. Every
 * write runs through `run`, which restores touched notes and trashes newly
 * created files when the operation throws, so a failed call leaves the vault as
 * it found it. The log is cleared when Obsidian restarts.
 */
export class AgentJournal {
	private readonly records: ActivityRecord[] = []
	private sequence = 0

	async run<T>(app: App, options: WriteOptions, write: () => Promise<T>): Promise<T & { activityId: string }> {
		const pathsBefore = new Set(listJournalPaths(app))
		const befores = new Map<string, string>()
		for (const file of options.touch) {
			if (!befores.has(file.path)) {
				befores.set(file.path, await app.vault.read(file))
			}
		}

		let result: T
		try {
			result = await write()
		} catch (error: unknown) {
			throw await this.rollback(app, options.skipCreatedTracking === true ? null : pathsBefore, befores, error)
		}

		const created = options.skipCreatedTracking === true ? [] : listJournalPaths(app).filter((path) => !pathsBefore.has(path))
		const snapshots: FileSnapshot[] = []
		for (const [path, before] of befores) {
			const file = app.vault.getAbstractFileByPath(path)
			if (!(file instanceof TFile)) {
				continue
			}
			const after = await app.vault.read(file)
			if (after !== before) {
				snapshots.push({ path, before, after })
			}
		}

		this.sequence += 1
		const record: ActivityRecord = {
			id: `act-${String(this.sequence).padStart(4, '0')}`,
			at: new Date().toISOString(),
			operation: options.operation,
			summary: options.summary,
			created,
			modified: snapshots.map((snapshot) => snapshot.path),
			removed: options.removed ?? [],
			undoable: options.undoable !== false,
			undone: false,
			snapshots,
		}
		this.records.push(record)
		if (this.records.length > MAX_ACTIVITY_RECORDS) {
			this.records.shift()
		}
		return { ...result, activityId: record.id }
	}

	list(limit: number): AgentActivity[] {
		return this.records
			.slice(-limit)
			.reverse()
			.map(({ snapshots: _snapshots, ...activity }) => activity)
	}

	async undo(app: App, id: string | null): Promise<AgentActivity> {
		const record = id === null
			? [...this.records].reverse().find((candidate) => !candidate.undone)
			: this.records.find((candidate) => candidate.id === id)
		if (record === undefined) {
			throw agentError(
				'UNDO_UNAVAILABLE',
				id === null ? 'There is no agent operation left to undo in this Obsidian session.' : `No agent operation with id ${JSON.stringify(id)} is recorded in this Obsidian session.`,
				'Call listAgentActivity to see what can be undone. The log is cleared when Obsidian restarts.',
				{ field: 'id', received: id },
			)
		}
		if (record.undone) {
			throw agentError('UNDO_UNAVAILABLE', `Operation ${record.id} was already undone.`, 'Nothing to do.', { field: 'id', received: record.id })
		}
		if (!record.undoable) {
			throw agentError(
				'UNDO_UNAVAILABLE',
				`Operation ${record.id} (${record.operation}) renamed or deleted files and cannot be undone automatically.`,
				'Deleted notes are in the Obsidian trash (or the system trash); ask the user to restore them from there. A rename can be reverted with another renameEntry call.',
				{ field: 'id', received: record.id },
			)
		}

		const changedSince = []
		for (const snapshot of record.snapshots) {
			const file = app.vault.getAbstractFileByPath(snapshot.path)
			if (!(file instanceof TFile) || !sameIgnoringModified(await app.vault.read(file), snapshot.after)) {
				changedSince.push(snapshot.path)
			}
		}
		if (changedSince.length > 0) {
			throw agentError(
				'CONFLICT',
				`Cannot undo ${record.id}: these notes were edited after the agent wrote them: ${changedSince.join(', ')}.`,
				'Tell the user which notes changed and let them decide; do not overwrite their edits.',
				{ details: { changedSince } },
			)
		}

		for (const snapshot of record.snapshots) {
			const file = app.vault.getAbstractFileByPath(snapshot.path)
			if (file instanceof TFile) {
				await app.vault.process(file, () => snapshot.before)
			}
		}
		for (const path of [...record.created].sort((left, right) => right.length - left.length)) {
			const file = app.vault.getAbstractFileByPath(path)
			if (file instanceof TFile) {
				await app.fileManager.trashFile(file)
			}
		}
		record.undone = true
		const { snapshots: _snapshots, ...activity } = record
		return activity
	}

	private async rollback(app: App, pathsBefore: ReadonlySet<string> | null, befores: ReadonlyMap<string, string>, cause: unknown): Promise<AgentApiError> {
		const leftovers: string[] = []
		for (const [path, before] of befores) {
			const file = app.vault.getAbstractFileByPath(path)
			try {
				if (file instanceof TFile && (await app.vault.read(file)) !== before) {
					await app.vault.process(file, () => before)
				}
			} catch {
				leftovers.push(path)
			}
		}
		for (const path of pathsBefore === null ? [] : listJournalPaths(app).filter((candidate) => !pathsBefore.has(candidate))) {
			const file = app.vault.getAbstractFileByPath(path)
			try {
				if (file instanceof TFile) {
					await app.fileManager.trashFile(file)
				}
			} catch {
				leftovers.push(path)
			}
		}

		const causeError = cause instanceof AgentApiError
			? cause
			: agentError(
				'INTERNAL_ERROR',
				`The write failed unexpectedly: ${cause instanceof Error ? cause.message : String(cause)}.`,
				'Report this message to the user; run `obsidian dev:errors` in the same vault for the stack trace.',
			)
		if (leftovers.length > 0) {
			return agentError(
				'ROLLBACK_FAILED',
				`${causeError.payload.message} Rolling back also failed for: ${leftovers.join(', ')}.`,
				'Tell the user exactly which files could not be restored; do not retry until they have checked them.',
				{ details: { cause: causeError.payload, leftovers } },
			)
		}
		return new AgentApiError({ ...causeError.payload, message: `${causeError.payload.message} Nothing was changed.` })
	}
}

function listJournalPaths(app: App): string[] {
	return app.vault
		.getFiles()
		.map((file) => file.path)
		.filter((path) => path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`))
}

/** The plugin rewrites `modified` on its own a moment after any edit; that alone is not a user change. */
function sameIgnoringModified(left: string, right: string): boolean {
	const strip = (content: string) => content.replace(/^modified:.*$/m, '')
	return strip(left) === strip(right)
}
