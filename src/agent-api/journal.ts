/// <reference types="vitest/importMeta" />

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
		const removable = (options.removed ?? []).filter((path) => app.vault.getAbstractFileByPath(path) !== null)

		let result: T
		try {
			result = await write()
		} catch (error: unknown) {
			throw await this.rollback(app, options.skipCreatedTracking === true ? null : pathsBefore, befores, error, removable)
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

		const removed = options.removed ?? []
		const reportedCreated = options.skipCreatedTracking === true ? options.created ?? [] : created
		// Created notes too: the next call (updateEntry, getPosition, ...) must find them.
		await waitForReindex(app, [...befores.keys(), ...reportedCreated.filter((path) => path.endsWith('.md'))])
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
			const later = this.laterOperationsTouching(record, changedSince)
			const permanent = later.filter((id) => this.records.find((candidate) => candidate.id === id)?.undoable === false)
			throw agentError(
				'CONFLICT',
				`Cannot undo ${record.id}: these notes changed after that operation: ${changedSince.join(', ')}.`,
				permanent.length > 0
					// A rename or deletion cannot be undone, so "undo the later ones first" would be a dead end.
					? `Later operations ${permanent.join(', ')} renamed or deleted something and cannot be undone, so ${record.id} cannot be undone either. Make the change forward instead (e.g. updatePosition with the old values) after reading the note again, and tell the user.`
					: later.length > 0
						? `Later agent operations touched them: undo ${[...later].reverse().join(', ')} first (newest first). If it still conflicts, the user edited the notes; tell them and do not overwrite their edits.`
						: 'The user edited them in Obsidian; do not overwrite their edits. If the operation only changed fields (a price, a stop, the status), set those back with updatePosition and the latest rev, which keeps the user\'s text; otherwise tell the user which notes changed and let them decide.',
				{ details: { changedSince, laterOperations: later } },
			)
		}
		// Trashing a created note that another note now links to would leave that link pointing at nothing.
		const ownPaths = new Set([...record.created, ...record.modified])
		const linkingNotes = [...new Set(record.created.flatMap((path) => linkedFrom(app, path)))].filter((path) => !ownPaths.has(path)).sort()
		if (linkingNotes.length > 0) {
			// Only the newest operation on each linking note is suggested: undoing an older one (e.g. the
			// createPosition of the linking note) would remove more than the link.
			const later = [...new Set(linkingNotes.flatMap((path) => this.laterOperationsTouching(record, [path]).slice(-1)))]
			throw agentError(
				'CONFLICT',
				`Cannot undo ${record.id}: ${linkingNotes.join(', ')} now link to a note it created, and removing that note would leave broken links.`,
				later.length > 0
					? `Later agent operations probably added those links: undo ${[...later].reverse().join(', ')} first (newest first), then retry.`
					: 'Remove those links first (unlinkContext for a position), or keep the note.',
				{ details: { linkedFrom: linkingNotes, laterOperations: later } },
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

	/** Ids of agent operations after `record` that are not undone and created or modified any of `paths`. */
	private laterOperationsTouching(record: ActivityRecord, paths: readonly string[]): string[] {
		const start = this.records.indexOf(record)
		return this.records
			.filter((candidate, index) => index > start && !candidate.undone)
			.filter((candidate) => [...candidate.modified, ...candidate.created].some((path) => paths.includes(path)))
			.map((candidate) => candidate.id)
	}

	/**
	 * Undo a failed write: restore touched notes and trash files it created.
	 * `removable` lists notes the write was allowed to trash or move; one that
	 * is gone cannot be put back from here, so it is reported instead of
	 * claiming nothing changed.
	 */
	private async rollback(app: App, pathsBefore: ReadonlySet<string> | null, befores: ReadonlyMap<string, string>, cause: unknown, removable: readonly string[]): Promise<AgentApiError> {
		const leftovers = new Set<string>()
		for (const [path, before] of befores) {
			const file = app.vault.getAbstractFileByPath(path)
			try {
				if (!(file instanceof TFile)) {
					leftovers.add(path)
				} else if ((await app.vault.read(file)) !== before) {
					await app.vault.process(file, () => before)
				}
			} catch {
				leftovers.add(path)
			}
		}
		for (const path of removable) {
			if (app.vault.getAbstractFileByPath(path) === null) {
				leftovers.add(path)
			}
		}
		for (const path of pathsBefore === null ? [] : listJournalPaths(app).filter((candidate) => !pathsBefore.has(candidate))) {
			const file = app.vault.getAbstractFileByPath(path)
			try {
				if (file instanceof TFile) {
					await app.fileManager.trashFile(file)
				}
			} catch {
				leftovers.add(path)
			}
		}

		const causeError = cause instanceof AgentApiError
			? cause
			: agentError(
				'INTERNAL_ERROR',
				`The write failed unexpectedly: ${cause instanceof Error ? cause.message : String(cause)}.`,
				'Report this message to the user; run `obsidian dev:errors` in the same vault for the stack trace.',
			)
		if (leftovers.size > 0) {
			const paths = [...leftovers].sort()
			return agentError(
				'ROLLBACK_FAILED',
				`${causeError.payload.message} Rolling back also failed for: ${paths.join(', ')}.`,
				'Tell the user exactly which files could not be restored; do not retry until they have checked them.',
				{ details: { cause: causeError.payload, leftovers: paths } },
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

const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

/**
 * The plugin rewrites the `modified` property on its own a moment after any
 * edit; that alone is not a user change. Only the frontmatter key is ignored:
 * a body line that happens to start with `modified:` is the user's text.
 */
function sameIgnoringModified(left: string, right: string): boolean {
	const strip = (content: string) => {
		const frontmatter = FRONTMATTER_BLOCK.exec(content)?.[0]
		return frontmatter === undefined ? content : `${frontmatter.replace(/^modified:.*(?:\r?\n)?/gm, '')}${content.slice(frontmatter.length)}`
	}
	return strip(left) === strip(right)
}

/** Notes whose links resolve to `targetPath`. */
function linkedFrom(app: App, targetPath: string): string[] {
	return Object.entries(app.metadataCache.resolvedLinks ?? {})
		.filter(([sourcePath, links]) => sourcePath !== targetPath && (links[targetPath] ?? 0) > 0)
		.map(([sourcePath]) => sourcePath)
}

/** Obsidian drops a note from its metadata cache while it re-reads it; wait so the next call can find the note again. */
async function waitForReindex(app: App, paths: string[]): Promise<void> {
	for (const path of paths) {
		await waitForValue(async () => {
			const file = app.vault.getAbstractFileByPath(path)
			return !(file instanceof TFile) || await isIndexed(app, file) ? true : null
		}, REINDEX_TIMEOUT_MS)
	}
}

type IndexedVersion = { mtime: number; size: number }

/**
 * True once Obsidian has parsed the version of the note that is on disk now.
 * Right after a write the cache still answers with the previous version, then
 * drops the note while it re-reads it, so "has frontmatter" alone passes too
 * early. Obsidian records the mtime and size it indexed; when that record is
 * not available, fall back to "has frontmatter".
 */
export async function isIndexed(app: App, file: TFile): Promise<boolean> {
	if (app.metadataCache.getFileCache(file)?.frontmatter === undefined) {
		return false
	}
	const indexed = (app.metadataCache as unknown as { fileCache?: Record<string, IndexedVersion | undefined> }).fileCache
	if (indexed === undefined) {
		return true
	}
	const version = indexed[file.path]
	const onDisk = await app.vault.adapter.stat(file.path)
	return version !== undefined && onDisk !== null && version.mtime === onDisk.mtime && version.size === onDisk.size
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('sameIgnoringModified', () => {
		it('ignores only the frontmatter modified property', () => {
			expect(sameIgnoringModified('---\nmodified: 1\na: 1\n---\nbody', '---\nmodified: 2\na: 1\n---\nbody')).toBe(true)
			expect(sameIgnoringModified('---\na: 1\n---\nbody', '---\na: 1\nmodified: 2\n---\nbody')).toBe(true)
			expect(sameIgnoringModified('---\na: 1\n---\nmodified: draft', '---\na: 1\n---\nmodified: final')).toBe(false)
			expect(sameIgnoringModified('modified: draft\nbody', 'modified: final\nbody')).toBe(false)
		})
	})
}
