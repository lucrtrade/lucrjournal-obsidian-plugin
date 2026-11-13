import { TFile, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../constant'

import { AgentApiError, agentError } from './errors'
import { waitForValue } from './wait'

const MAX_ACTIVITY_RECORDS = 50
const REINDEX_TIMEOUT_MS = 5000

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

type ActivityRecord = AgentActivity & {
	snapshots: FileSnapshot[]
	/** Text of each created note as the agent left it; binary files map to null. */
	createdContents: Map<string, string | null>
}

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
	/** Paths to report as created when tracking is skipped (the new path of a rename). */
	created?: string[]
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
	private queue: Promise<unknown> = Promise.resolve()

	/**
	 * Run writes one at a time. Two calls that plan against the same vault state
	 * would pick the same next position id and roll back each other's files.
	 */
	async serial<T>(task: () => Promise<T>): Promise<T> {
		const next = this.queue.then(task, task)
		this.queue = next.catch(() => undefined)
		return await next
	}

	/** Record a write that did its own rollback (createPosition) so it shows in the log and can be undone. */
	async note(app: App, operation: string, summary: string, created: string[]): Promise<string> {
		return (await this.push(app, { operation, summary, created, snapshots: [], removed: [], undoable: true })).id
	}

	private async push(app: App, input: { operation: string; summary: string; created: string[]; snapshots: FileSnapshot[]; removed: string[]; undoable: boolean }): Promise<ActivityRecord> {
		const createdContents = new Map<string, string | null>()
		for (const path of input.created) {
			const file = app.vault.getAbstractFileByPath(path)
			createdContents.set(path, file instanceof TFile && file.extension === 'md' ? await app.vault.read(file) : null)
		}
		this.sequence += 1
		const record: ActivityRecord = {
			id: `act-${String(this.sequence).padStart(4, '0')}`,
			at: new Date().toISOString(),
			operation: input.operation,
			summary: input.summary,
			created: input.created,
			modified: input.snapshots.map((snapshot) => snapshot.path),
			removed: input.removed,
			undoable: input.undoable,
			undone: false,
			snapshots: input.snapshots,
			createdContents,
		}
		this.records.push(record)
		if (this.records.length > MAX_ACTIVITY_RECORDS) {
			this.records.shift()
		}
		return record
	}

	async run<T>(app: App, options: WriteOptions, write: () => Promise<T>): Promise<T & { activityId?: string; unchanged?: boolean }> {
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

		await waitForReindex(app, [...befores.keys()])
		const removed = options.removed ?? []
		const reportedCreated = options.skipCreatedTracking === true ? options.created ?? [] : created
		if (reportedCreated.length === 0 && snapshots.length === 0 && removed.length === 0) {
			// Nothing on disk changed: keep the undo log for real changes.
			return { ...result, unchanged: true }
		}
		const record = await this.push(app, { operation: options.operation, summary: options.summary, created: reportedCreated, snapshots, removed, undoable: options.undoable !== false })
		return { ...result, activityId: record.id }
	}

	list(limit: number): AgentActivity[] {
		return this.records
			.slice(-limit)
			.reverse()
			.map(({ snapshots: _snapshots, createdContents: _createdContents, ...activity }) => activity)
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

		const changedSince: string[] = []
		for (const snapshot of record.snapshots) {
			const file = app.vault.getAbstractFileByPath(snapshot.path)
			if (!(file instanceof TFile) || !sameIgnoringModified(await app.vault.read(file), snapshot.after)) {
				changedSince.push(snapshot.path)
			}
		}
		const missing: string[] = []
		for (const [path, content] of record.createdContents) {
			const file = app.vault.getAbstractFileByPath(path)
			if (!(file instanceof TFile)) {
				missing.push(path)
			} else if (content !== null && !sameIgnoringModified(await app.vault.read(file), content)) {
				changedSince.push(path)
			}
		}
		if (missing.length > 0) {
			throw agentError(
				'UNDO_UNAVAILABLE',
				`Cannot undo ${record.id}: ${missing.join(', ')} no longer exists at that path (renamed, moved or deleted since).`,
				'Nothing was changed. Use deleteEntry on the note under its current name if it should go.',
				{ field: 'id', received: record.id, details: { missing } },
			)
		}
		if (changedSince.length > 0) {
			const later = this.records
				.filter((candidate) => candidate !== record && !candidate.undone && this.records.indexOf(candidate) > this.records.indexOf(record))
				.filter((candidate) => [...candidate.modified, ...candidate.created].some((path) => changedSince.includes(path)))
				.map((candidate) => candidate.id)
			throw agentError(
				'CONFLICT',
				`Cannot undo ${record.id}: these notes changed after that operation: ${changedSince.join(', ')}.`,
				later.length > 0
					? `Later agent operations touched them: undo ${[...later].reverse().join(', ')} first (newest first). If it still conflicts, the user edited the notes; tell them and do not overwrite their edits.`
					: 'The user edited them in Obsidian. Tell the user which notes changed and let them decide; do not overwrite their edits.',
				{ details: { changedSince, laterOperations: later } },
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
		const { snapshots: _snapshots, createdContents: _createdContents, ...activity } = record
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

/** Obsidian drops a note from its metadata cache while it re-reads it; wait so the next call can find the note again. */
async function waitForReindex(app: App, paths: string[]): Promise<void> {
	for (const path of paths) {
		await waitForValue(() => {
			const file = app.vault.getAbstractFileByPath(path)
			return !(file instanceof TFile) || app.metadataCache.getFileCache(file)?.frontmatter !== undefined ? true : null
		}, REINDEX_TIMEOUT_MS)
	}
}
