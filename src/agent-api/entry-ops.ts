import { TFile, type App } from 'obsidian'

import {
	deleteAccount,
	deleteSymbol,
	gatherAccountDeletionScope,
	gatherSymbolDeletionScope,
	loadPlaybookCriteriaSections,
	PlaybookDomain,
	savePlaybookCriteriaSections,
	SymbolDomain,
} from '../domains'
import { syncRenamedDocumentTitle } from '../domains/core/entry-writer'
import { normalizeTags } from '../domains/core/tags'
import {
	removeAllSectionEntriesFromPositionByLinkpath,
	removePositionPlaybookFrontmatterByLinkpath,
} from '../domains/position/body'
import { createPositionTemplate } from '../domains/template'
import { listOrphanPrivateConfluenceEntriesForDeletedPlaybook } from '../ui/dashboard/dashboard-entry-actions'
import { buildRenamedEntryPath, getFileBasename, parseWikilinkHeading, sanitizeObsidianFileName } from '../utils'

import { hasArg, readArgs, readBodyText, readBoolean, readEnum, readNumber, readRequiredText, readStringList, readText, type AgentArgs } from './args'
import { AgentApiError, agentError, formatCandidates } from './errors'
import { isIndexed, type AgentJournal } from './journal'
import {
	cleanEntryName,
	CONTEXT_KINDS,
	displayName,
	domainOf,
	ENTRY_KINDS,
	listKind,
	locateAny,
	locateEntry,
	toContextKind,
	type ContextKind,
	type EntryKind,
	type LocatedEntry,
} from './locate'
import { LINK_KIND_CONFIG, resolveLink } from './resolve'
import { waitForValue } from './wait'

import type { CriteriaFormValue } from '../domains/core/form'

const INDEX_TIMEOUT_MS = 20_000
const NEWS_IMPACTS = ['high', 'medium', 'low'] as const
const SYMBOL_TYPES = ['Crypto_Perp', 'Crypto_Spot', 'Future', 'CFD'] as const
const ENTRY_VALUE_FIELDS = ['description', 'source', 'impact', 'tags', 'public', 'body'] as const
const CREATE_ENTRY_FIELDS = ['kind', 'name', ...ENTRY_VALUE_FIELDS, 'dryRun'] as const
const UPDATE_ENTRY_FIELDS = ['entry', 'kind', ...ENTRY_VALUE_FIELDS, 'dryRun'] as const
const RENAME_ENTRY_FIELDS = ['entry', 'kind', 'newName', 'confirmToken'] as const
const DELETE_ENTRY_FIELDS = ['entry', 'kind', 'confirmToken'] as const
const CREATE_PLAYBOOK_FIELDS = ['name', 'description', 'criteria', 'dryRun'] as const
const UPDATE_PLAYBOOK_FIELDS = ['playbook', 'description', 'criteria', 'dryRun'] as const
const CREATE_TEMPLATE_FIELDS = ['name', 'body', 'dryRun'] as const
const UPDATE_SYMBOL_FIELDS = ['symbol', 'account', 'type', 'fee_value', 'contract_unit', 'dryRun'] as const
const EDITABLE_KINDS: readonly EntryKind[] = [...CONTEXT_KINDS, 'playbook']

function linkKindOf(kind: ContextKind) {
	return kind === 'key_level' ? 'key_levels' as const : kind
}

function readKind(args: AgentArgs): EntryKind | null {
	const value = readText(args, 'kind')
	if (value === null) {
		return null
	}
	const normalized = value.toLowerCase().replace(/[\s-]+/g, '_')
	const singular = normalized === 'key_levels' ? 'key_level' : normalized
	const match = ENTRY_KINDS.find((kind) => kind === singular)
	if (match === undefined) {
		throw agentError('INVALID_VALUE', `\`kind\` must be one of ${formatCandidates(ENTRY_KINDS)}.`, 'Pass one of the candidates, or omit `kind` and pass a path as `entry`.', { field: 'kind', received: value, candidates: [...ENTRY_KINDS] })
	}
	return match
}

function locateReferenced(app: App, args: AgentArgs): LocatedEntry {
	const reference = readRequiredText(args, 'entry', 'Pass `entry` as a vault-relative path or the note name (add `kind` when the name alone is not unique).')
	const kind = readKind(args)
	return kind === null ? locateAny(app, reference, 'entry') : locateEntry(app, kind, reference, 'entry')
}

/** Frontmatter fields the agent may set on a context note or playbook, validated per kind. */
function readEntryPatch(args: AgentArgs, kind: EntryKind): Record<string, unknown> {
	const patch: Record<string, unknown> = {}
	const reject = (field: string, allowedOn: string) => {
		throw agentError('INVALID_VALUE', `\`${field}\` only applies to ${allowedOn}, not to ${kind}.`, `Remove \`${field}\`.`, { field })
	}
	if (hasArg(args, 'description')) {
		patch.description = readText(args, 'description')
	}
	if (hasArg(args, 'source')) {
		if (kind !== 'news') {
			reject('source', 'news')
		}
		const source = readText(args, 'source')
		if (source !== null && !/^https?:\/\/\S+$/i.test(source)) {
			throw agentError('INVALID_VALUE', `\`source\` must be an http(s) URL, received ${JSON.stringify(source)}.`, 'Pass the article URL, or omit `source`.', { field: 'source', received: source })
		}
		patch.source = source
	}
	if (hasArg(args, 'impact')) {
		if (kind !== 'news') {
			reject('impact', 'news')
		}
		patch.impact = readEnum(args, 'impact', NEWS_IMPACTS)
	}
	if (hasArg(args, 'tags')) {
		if (kind === 'playbook') {
			reject('tags', 'news, key_level, confluence and market_analysis')
		}
		const tags = normalizeTags(readStringList(args, 'tags') ?? [])
		patch.tags = tags.length === 0 ? null : tags
	}
	if (hasArg(args, 'public')) {
		if (kind !== 'confluence') {
			reject('public', 'confluence')
		}
		patch.public = readBoolean(args, 'public')
	}
	return patch
}

async function appendBody(app: App, file: TFile, body: string | null) {
	if (body !== null) {
		await app.vault.process(file, (content) => `${content.replace(/\s+$/, '')}\n\n${body}\n`)
	}
}

/** Wait until the note is indexed and listed by its domain, so the next call (updateEntry, listEntries) finds it. */
async function waitForKind(app: App, path: string, kind: EntryKind): Promise<TFile> {
	const file = await waitForValue(async () => {
		const candidate = app.vault.getAbstractFileByPath(path)
		return candidate instanceof TFile
			&& app.metadataCache.getFileCache(candidate)?.frontmatter?.lucr_type === kind
			&& await isIndexed(app, candidate)
			&& listKind(app, kind).some((entry) => entry.file.path === path)
			? candidate
			: null
	}, INDEX_TIMEOUT_MS)
	if (file === null) {
		throw agentError('METADATA_TIMEOUT', `Obsidian did not index ${path} as a ${kind} note within ${INDEX_TIMEOUT_MS / 1000}s.`, 'Obsidian may be busy; wait a few seconds and check the note before retrying.', { details: { path } })
	}
	return file
}

async function applyPatch(app: App, entry: { kind: EntryKind; file: TFile }, patch: Record<string, unknown>): Promise<unknown> {
	if (Object.keys(patch).length === 0) {
		return null
	}
	try {
		return await domainOf(entry.kind).updateFields(app, entry.file, patch)
	} catch (error: unknown) {
		throw agentError('INVALID_VALUE', `LucrJournal rejected the change to ${entry.file.path}: ${error instanceof Error ? error.message : String(error)}.`, 'Correct the values and retry.', { received: patch })
	}
}

function resolveNewEntry(app: App, kind: ContextKind, name: string) {
	try {
		return resolveLink(app, linkKindOf(kind), name)
	} catch (error: unknown) {
		// resolveLink words its errors for `createPosition({ links })`; here the offending input is `name`.
		throw error instanceof AgentApiError ? new AgentApiError({ ...error.payload, field: 'name' }) : error
	}
}

/** Create a standalone news / key level / confluence / market analysis note with all of its fields. */
export async function createEntry(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('createEntry', rawInput, CREATE_ENTRY_FIELDS)
	const kind = toContextKind(readRequiredText(args, 'kind', 'Pass `kind` as news, key_level, confluence or market_analysis.'), 'kind')
	const name = cleanEntryName(readRequiredText(args, 'name', 'Pass `name`, the title of the note.'))
	const patch = readEntryPatch(args, kind)
	const body = readBodyText(args, 'body')
	const link = resolveNewEntry(app, kind, name)
	if (!link.create) {
		throw agentError('NAME_CONFLICT', `A ${kind} named ${JSON.stringify(link.basename)} already exists at ${link.path}.`, 'Use updateEntry to change it, or choose a more specific name.', { field: 'name', received: name, details: { path: link.path } })
	}
	if (readBoolean(args, 'dryRun')) {
		return {
			dryRun: true,
			data: {
				kind,
				name: link.basename,
				path: link.path,
				frontmatter: { ...link.frontmatter, ...patch },
				body,
				...(typeof patch.source === 'string' ? { note: 'On the real call LucrJournal tries to fetch the article text from `source` into the note; your `body` is appended after it.' } : {}),
			},
		}
	}

	const config = LINK_KIND_CONFIG[link.kind]
	return await journal.run(app, { operation: 'createEntry', summary: `Created ${kind} "${link.basename}"`, touch: [] }, async () => {
		const { source = '', description = '', ...rest } = patch as { source?: string | null; description?: string | null }
		const formValue: Record<string, string> = kind === 'news' ? { name: link.basename, source: source ?? '' } : { name: link.basename, description: description ?? '' }
		const create = config.domain.createEntry.bind(config.domain) as unknown as (runtimeApp: App, value: Record<string, string>) => Promise<{ file: { path: string } }>
		const created = await create(app, formValue)
		const file = await waitForKind(app, created.file.path, kind)
		// The metadata cache lags behind the write, so report the values the domain just saved.
		const saved = await applyPatch(app, { kind, file }, kind === 'news' && description !== null && description !== '' ? { ...rest, description } : rest)
		await appendBody(app, file, body)
		// The patch and body made Obsidian re-read the note; it is briefly unlisted until that finishes.
		await waitForKind(app, file.path, kind)
		return { dryRun: false, data:{ kind, name: getFileBasename(file), path: file.path, frontmatter: saved ?? app.metadataCache.getFileCache(file)?.frontmatter ?? null } }
	})
}

/** Edit the fields of a context note or playbook and append to its body. */
export async function updateEntry(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('updateEntry', rawInput, UPDATE_ENTRY_FIELDS)
	const entry = locateReferenced(app, args)
	if (!EDITABLE_KINDS.includes(entry.kind)) {
		throw agentError('INVALID_VALUE', `updateEntry cannot edit a ${entry.kind}.`, 'Use updatePosition for positions, updateSymbol for symbols and updatePlaybook for playbook criteria.', { field: 'entry', received: entry.file.path })
	}
	const patch = readEntryPatch(args, entry.kind)
	const body = readBodyText(args, 'body')
	if (Object.keys(patch).length === 0 && body === null) {
		throw agentError('INVALID_VALUE', 'updateEntry was called without anything to change.', `Pass at least one of: ${ENTRY_VALUE_FIELDS.join(', ')}.`)
	}
	if (readBoolean(args, 'dryRun')) {
		return { dryRun: true, data: { kind: entry.kind, path: entry.file.path, changes: patch, bodyAppended: body } }
	}
	return await journal.run(app, { operation: 'updateEntry', summary: `Updated ${entry.kind} "${getFileBasename(entry.file)}"`, touch: [entry.file] }, async () => {
		await applyPatch(app, entry, patch)
		await appendBody(app, entry.file, body)
		return { dryRun: false, data: { kind: entry.kind, path: entry.file.path, changes: patch, bodyAppended: body } }
	})
}

/** Wikilinks and embeds in `content` whose target names the note `linkpath` (any folder, any case, with or without `.md`). */
function countLinksTo(content: string, linkpath: string): number {
	const wanted = linkpath.toLowerCase()
	return [...content.matchAll(/\[\[([^\]|#^]+)/g)]
		.filter((match) => (match[1] ?? '').trim().split('/').pop()?.replace(/\.md$/i, '').toLowerCase() === wanted)
		.length
}

function referencingPaths(app: App, targetPath: string): string[] {
	return Object.entries(app.metadataCache.resolvedLinks ?? {})
		.filter(([sourcePath, links]) => sourcePath !== targetPath && (links[targetPath] ?? 0) > 0)
		.map(([sourcePath]) => sourcePath)
		.sort()
}

/**
 * Destructive operations run in two calls: the first returns what would be
 * affected plus a one-time token for that exact scope, the second repeats the
 * call with the token. A token stops matching as soon as the scope changes.
 */
function confirmOrPreview(args: AgentArgs, operation: string, scope: Record<string, unknown>): { confirmed: boolean; token: string } {
	const expected = JSON.stringify({ operation, scope })
	const given = readText(args, 'confirmToken')
	if (given === null) {
		const token = newConfirmToken()
		pendingConfirmations.set(token, expected)
		if (pendingConfirmations.size > MAX_PENDING_CONFIRMATIONS) {
			pendingConfirmations.delete(pendingConfirmations.keys().next().value ?? '')
		}
		return { confirmed: false, token }
	}
	// The full scope is compared, not a hash of it, so a token can only confirm the exact preview it came from.
	if (pendingConfirmations.get(given) !== expected) {
		throw agentError(
			'CONFIRMATION_INVALID',
			`\`confirmToken\` does not match the current scope of ${operation}; the vault changed since the preview, the token belongs to another call, or it was already used.`,
			`Call ${operation} again without \`confirmToken\`, show the user the new scope, and retry with the new token.`,
			{ field: 'confirmToken', received: given },
		)
	}
	pendingConfirmations.delete(given)
	return { confirmed: true, token: given }
}

const MAX_PENDING_CONFIRMATIONS = 100
/** Preview tokens handed out in this Obsidian session, each mapped to the exact operation and scope it confirms. */
const pendingConfirmations = new Map<string, string>()

function newConfirmToken(): string {
	const bytes = new Uint8Array(8)
	crypto.getRandomValues(bytes)
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function previewResult(operation: string, scope: Record<string, unknown>, token: string) {
	return {
		needsConfirmation: true,
		data: {
			scope,
			confirmToken: token,
			next: `Nothing was changed. Show the user this scope; after they agree, call ${operation} again with the same input plus this confirmToken.`,
		},
	}
}

/** Rename a context note or playbook; Obsidian rewrites every link to it. */
export async function renameEntry(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('renameEntry', rawInput, RENAME_ENTRY_FIELDS)
	const entry = locateReferenced(app, args)
	if (!EDITABLE_KINDS.includes(entry.kind)) {
		throw agentError('INVALID_VALUE', `A ${entry.kind} cannot be renamed through the agent API: its file name is its identity.`, 'Only news, key_level, confluence, market_analysis and playbook notes can be renamed.', { field: 'entry', received: entry.file.path })
	}
	const newName = sanitizeObsidianFileName(readRequiredText(args, 'newName', 'Pass `newName`, the new title.'))
	const nextPath = buildRenamedEntryPath(entry.file, newName)
	if (nextPath === null || newName === getFileBasename(entry.file)) {
		throw agentError('INVALID_VALUE', '`newName` is empty or equal to the current name.', 'Pass a different, non-empty name.', { field: 'newName', received: newName })
	}
	const conflict = app.vault.getMarkdownFiles().find((file) => file.path !== entry.file.path && getFileBasename(file).toLowerCase() === newName.toLowerCase())
	if (conflict !== undefined) {
		throw agentError('NAME_CONFLICT', `Another note already uses the name ${JSON.stringify(newName)} (${conflict.path}); LucrJournal file names must be unique.`, 'Choose a more specific name.', { field: 'newName', received: newName, details: { conflictingPath: conflict.path } })
	}

	const scope = { rename: { from: entry.file.path, to: nextPath }, linksUpdatedIn: referencingPaths(app, entry.file.path) }
	const confirmation = confirmOrPreview(args, 'renameEntry', scope)
	if (!confirmation.confirmed) {
		return previewResult('renameEntry', scope, confirmation.token)
	}
	return await journal.run(app, { operation: 'renameEntry', summary: `Renamed ${entry.kind} "${getFileBasename(entry.file)}" to "${newName}"`, touch: [entry.file], undoable: false, skipCreatedTracking: true, created: [nextPath], removed: [entry.file.path] }, async () => {
		await app.fileManager.renameFile(entry.file, nextPath)
		try {
			await syncRenamedDocumentTitle(app, entry.file, newName)
		} catch (error: unknown) {
			// Move the note back (Obsidian rewrites the links again) so a failed call leaves the vault as it was;
			// if this fails too, the journal reports the old path as not restored.
			await app.fileManager.renameFile(entry.file, scope.rename.from)
			throw error
		}
		return { needsConfirmation: false, data: { kind: entry.kind, path: nextPath, previousPath: scope.rename.from, linksUpdatedIn: scope.linksUpdatedIn } }
	})
}

/** Playbooks whose criteria structure names this criteria or confluence. */
async function playbooksNaming(app: App, name: string): Promise<string[]> {
	const paths: string[] = []
	for (const playbook of listKind(app, 'playbook')) {
		const sections = await loadPlaybookCriteriaSections(app, playbook.file)
		const names = sections.flatMap((section) => [section.criteriaName, ...section.confluences.map((confluence) => confluence.name)])
		if (names.some((candidate) => candidate.toLowerCase() === name.toLowerCase())) {
			paths.push(playbook.file.path)
		}
	}
	return paths
}

/** `touch`: existing notes the delete rewrites (not trashes); they are restored if a later step fails. */
type DeletionPlan = { scope: Record<string, unknown>; removed: string[]; touch?: TFile[]; execute: () => Promise<void> }

/** A context note or playbook: positions lose their `## [[entry]]` headings and playbook property, like the UI delete. */
async function planLinkedEntryDeletion(app: App, entry: LocatedEntry): Promise<DeletionPlan> {
	const linkpath = getFileBasename(entry.file)
	const referencing: TFile[] = []
	// Positions whose every link to the entry is a `## [[entry]]` heading or the playbook property: deleting cleans them fully.
	const fullyCleaned = new Set<string>()
	for (const position of listKind(app, 'position')) {
		const playbook = parseWikilinkHeading(typeof position.fm.playbook === 'string' ? position.fm.playbook : '')?.linkpath
		const content = await app.vault.read(position.file)
		const headings = content.split('\n').filter((line) => line.startsWith('## ') && parseWikilinkHeading(line.replace(/^##\s+/, '').trim())?.linkpath === linkpath).length
		const cleared = headings + (playbook === linkpath ? 1 : 0)
		if (cleared > 0) {
			referencing.push(position.file)
			if (countLinksTo(content, linkpath) <= cleared) {
				fullyCleaned.add(position.file.path)
			}
		}
	}
	const orphans = (await listOrphanPrivateConfluenceEntriesForDeletedPlaybook(app, entry.file)).map((confluence) => confluence.file)
	const playbooksUsingIt = entry.kind === 'confluence' ? await playbooksNaming(app, linkpath) : []
	return {
		scope: {
			trash: { [entry.kind]: entry.file.path, privateConfluences: orphans.map((file) => file.path) },
			unlinkedFromPositions: referencing.map((file) => file.path),
			// These keep a link that will point to nothing; LucrJournal does not rewrite them.
			linksLeftBroken: [...new Set([...playbooksUsingIt, ...referencingPaths(app, entry.file.path).filter((path) => !fullyCleaned.has(path))])].sort(),
		},
		removed: [entry.file.path, ...orphans.map((file) => file.path)],
		touch: referencing,
		execute: async () => {
			for (const positionFile of referencing) {
				await removeAllSectionEntriesFromPositionByLinkpath({ app, linkpath, positionFile })
				await removePositionPlaybookFrontmatterByLinkpath({ app, linkpath, positionFile })
			}
			for (const orphan of orphans) {
				await app.fileManager.trashFile(orphan)
			}
			await app.fileManager.trashFile(entry.file)
		},
	}
}

async function planDeletion(app: App, entry: LocatedEntry): Promise<DeletionPlan> {
	switch (entry.kind) {
		case 'account': {
			const scope = gatherAccountDeletionScope(app, entry as unknown as Parameters<typeof gatherAccountDeletionScope>[1])
			if (scope === null) {
				throw agentError('ENTRY_NOT_FOUND', `Account ${entry.file.path} is not a persisted note.`, 'Retry once.')
			}
			const removed = [...scope.positionFiles, ...scope.symbolFiles, scope.accountFile, ...(scope.platformFile === null ? [] : [scope.platformFile])].map((file) => file.path)
			return {
				scope: { trash: { account: scope.accountFile.path, platform: scope.platformFile?.path ?? null, symbols: scope.symbolFiles.map((file) => file.path), positions: scope.positionFiles.map((file) => file.path) } },
				removed,
				execute: async () => await deleteAccount(app, scope),
			}
		}
		case 'symbol': {
			const scope = gatherSymbolDeletionScope(app, entry as unknown as Parameters<typeof gatherSymbolDeletionScope>[1])
			if (scope === null) {
				throw agentError('ENTRY_NOT_FOUND', `Symbol ${entry.file.path} is not a persisted note.`, 'Retry once.')
			}
			return {
				scope: { trash: { symbol: scope.symbolFile.path, positions: scope.positionFiles.map((file) => file.path) } },
				removed: [...scope.positionFiles, scope.symbolFile].map((file) => file.path),
				execute: async () => await deleteSymbol(app, scope),
			}
		}
		case 'position':
		case 'template':
			return {
				scope: { trash: { [entry.kind]: entry.file.path }, note: entry.kind === 'position' ? 'Attachment image files are kept.' : undefined },
				removed: [entry.file.path],
				execute: async () => await app.fileManager.trashFile(entry.file),
			}
		case 'news':
		case 'key_level':
		case 'confluence':
		case 'market_analysis':
		case 'playbook':
			return await planLinkedEntryDeletion(app, entry)
		case 'criteria': {
			const usedBy = await playbooksNaming(app, getFileBasename(entry.file))
			if (usedBy.length > 0) {
				throw agentError('INVALID_VALUE', `Criteria ${JSON.stringify(getFileBasename(entry.file))} is still used by ${usedBy.join(', ')}.`, 'Remove it from those playbooks with updatePlaybook first.', { field: 'entry', received: entry.file.path, candidates: usedBy })
			}
			return { scope: { trash: { criteria: entry.file.path } }, removed: [entry.file.path], execute: async () => await app.fileManager.trashFile(entry.file) }
		}
		case 'platform':
			throw agentError('INVALID_VALUE', 'A platform note is managed by LucrJournal and cannot be deleted directly.', 'Delete the account that uses it; an unused platform goes with it.', { field: 'entry', received: entry.file.path })
		default:
			entry.kind satisfies never
			throw new Error('Unknown entry kind')
	}
}

/**
 * Every deletion scope says which surviving notes keep a link to something it trashes (an account's
 * positions linked from an analysis, ...), so the agent can always show `linksLeftBroken` to the user.
 * Context-note and playbook plans compute it themselves, leaving out positions they clean up.
 */
function withLinksLeftBroken(app: App, plan: DeletionPlan): DeletionPlan {
	if (plan.scope.linksLeftBroken !== undefined) {
		return plan
	}
	const removed = new Set(plan.removed)
	const linking = plan.removed.flatMap((path) => referencingPaths(app, path)).filter((path) => !removed.has(path))
	return { ...plan, scope: { ...plan.scope, linksLeftBroken: [...new Set(linking)].sort() } }
}

/** Move an entry (and whatever the UI would delete with it) to the trash, after a confirmed preview. */
export async function deleteEntry(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('deleteEntry', rawInput, DELETE_ENTRY_FIELDS)
	const entry = locateReferenced(app, args)
	const plan = withLinksLeftBroken(app, await planDeletion(app, entry))
	const confirmation = confirmOrPreview(args, 'deleteEntry', plan.scope)
	if (!confirmation.confirmed) {
		return previewResult('deleteEntry', plan.scope, confirmation.token)
	}
	return await journal.run(app, { operation: 'deleteEntry', summary: `Deleted ${entry.kind} "${displayName(entry)}"`, touch: plan.touch ?? [], undoable: false, skipCreatedTracking: true, removed: plan.removed }, async () => {
		await plan.execute()
		return { needsConfirmation: false, data: { kind: entry.kind, trashed: plan.removed, scope: plan.scope } }
	})
}

function readCriteria(args: AgentArgs): CriteriaFormValue | null {
	if (!hasArg(args, 'criteria') || args.criteria === null) {
		return null
	}
	const value = args.criteria
	const invalid = () => agentError(
		'INVALID_VALUE',
		'`criteria` must be an array like [{ "name": "Trend", "confluences": ["HTF trend", "Break of structure"] }].',
		'Give every criteria group a `name` and at least one confluence name.',
		{ field: 'criteria', received: value },
	)
	if (!Array.isArray(value)) {
		throw invalid()
	}
	return value.map((section: unknown) => {
		if (typeof section !== 'object' || section === null) {
			throw invalid()
		}
		const unknownKeys = Object.keys(section).filter((key) => key !== 'name' && key !== 'confluences')
		if (unknownKeys.length > 0) {
			throw agentError('UNKNOWN_FIELD', `Unknown field(s) in a criteria group: ${formatCandidates(unknownKeys)}.`, 'A criteria group only has `name` and `confluences`.', { field: 'criteria', received: unknownKeys, candidates: ['name', 'confluences'] })
		}
		const { name, confluences } = section as { name?: unknown; confluences?: unknown }
		if (typeof name !== 'string' || name.trim() === '' || !Array.isArray(confluences) || confluences.length === 0 || confluences.some((item) => typeof item !== 'string' || item.trim() === '')) {
			throw invalid()
		}
		return { criteriaName: name.trim(), confluences: (confluences as string[]).map((item) => ({ name: item.trim() })) }
	})
}

function toPlaybookError(error: unknown, field: string) {
	const key = PlaybookDomain.toCreateEntryErrorMessageKey(error)
	const message = error instanceof Error ? error.message : String(error)
	switch (key) {
		case 'DASHBOARD_PLAYBOOK_CRITERIA_DUPLICATE':
			return agentError('INVALID_VALUE', 'Two criteria groups share the same name.', 'Give every criteria group a unique name.', { field: 'criteria' })
		case 'DASHBOARD_PLAYBOOK_CONFLUENCES_DUPLICATE':
			return agentError('INVALID_VALUE', 'The same confluence appears more than once in this playbook.', 'List each confluence under one criteria group only.', { field: 'criteria' })
		case 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE':
			return agentError('NAME_CONFLICT', 'A note with this name already exists; LucrJournal file names must be unique.', 'Choose a more specific name.', { field })
		case 'DASHBOARD_ENTRY_FIELD_NAME_REQUIRED':
			return agentError('INVALID_VALUE', 'The playbook name is empty.', 'Pass a non-empty `name`.', { field })
		case null:
			return agentError('INTERNAL_ERROR', `Saving the playbook failed: ${message}.`, 'Report this message to the user.')
		default:
			key satisfies never
			throw new Error('Unknown playbook error key')
	}
}

/**
 * A playbook creates the confluence and criteria notes it names. Find the names
 * that are already taken by a note of another kind, and list what is missing,
 * so a dry run reports the same conflict the real write would hit.
 */
function planPlaybookDependencies(app: App, criteria: CriteriaFormValue) {
	const notes = app.vault.getMarkdownFiles()
	const kindOf = (name: string): { path: string; lucrType: unknown } | null => {
		const key = sanitizeObsidianFileName(name).toLowerCase()
		const file = notes.find((candidate) => getFileBasename(candidate).toLowerCase() === key)
		return file === undefined ? null : { path: file.path, lucrType: app.metadataCache.getFileCache(file)?.frontmatter?.lucr_type }
	}
	const willCreate: Array<{ kind: 'criteria' | 'confluence'; name: string }> = []
	const wanted = criteria.flatMap((section) => [
		{ kind: 'criteria' as const, name: section.criteriaName },
		...section.confluences.map((confluence) => ({ kind: 'confluence' as const, name: confluence.name })),
	])
	for (const dependency of wanted) {
		const existing = kindOf(dependency.name)
		if (existing === null) {
			willCreate.push(dependency)
		} else if (existing.lucrType !== dependency.kind) {
			throw agentError(
				'NAME_CONFLICT',
				`The ${dependency.kind} name ${JSON.stringify(dependency.name)} is already used by another note (${existing.path}); LucrJournal file names must be unique.`,
				`Choose a different name for this ${dependency.kind}.`,
				{ field: 'criteria', received: dependency.name, details: { conflictingPath: existing.path } },
			)
		}
	}
	return willCreate
}

/** Create a playbook with its criteria groups; missing confluences and criteria notes are created with it. */
export async function createPlaybook(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('createPlaybook', rawInput, CREATE_PLAYBOOK_FIELDS)
	const name = sanitizeObsidianFileName(readRequiredText(args, 'name', 'Pass `name`, the playbook title.'))
	const description = readText(args, 'description') ?? ''
	const criteria = readCriteria(args) ?? []
	const conflict = app.vault.getMarkdownFiles().find((file) => getFileBasename(file).toLowerCase() === name.toLowerCase())
	if (conflict !== undefined) {
		throw agentError('NAME_CONFLICT', `Another note already uses the name ${JSON.stringify(name)} (${conflict.path}).`, 'Choose a more specific name, or use updatePlaybook when it is the playbook you mean.', { field: 'name', received: name })
	}
	const willCreate = planPlaybookDependencies(app, criteria)
	if (readBoolean(args, 'dryRun')) {
		return { dryRun: true, data: { name, description: description === '' ? null : description, criteria: criteria.map((section) => ({ name: section.criteriaName, confluences: section.confluences.map((confluence) => confluence.name) })), willCreate } }
	}
	return await journal.run(app, { operation: 'createPlaybook', summary: `Created playbook "${name}"`, touch: [] }, async () => {
		try {
			const result = await PlaybookDomain.createEntry(app, { name, description, criteria })
			return { dryRun: false, data: { name: getFileBasename(result.file), path: result.file.path } }
		} catch (error: unknown) {
			throw toPlaybookError(error, 'name')
		}
	})
}

/** Change a playbook description and/or replace its whole criteria structure. */
export async function updatePlaybook(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('updatePlaybook', rawInput, UPDATE_PLAYBOOK_FIELDS)
	const entry = locateEntry(app, 'playbook', readRequiredText(args, 'playbook', 'Pass `playbook`, the name of an existing playbook.'), 'playbook')
	const criteria = readCriteria(args)
	const hasDescription = hasArg(args, 'description')
	if (criteria === null && !hasDescription) {
		throw agentError('INVALID_VALUE', 'updatePlaybook was called without anything to change.', 'Pass `description` and/or `criteria`.')
	}
	const previous = await loadPlaybookCriteriaSections(app, entry.file)
	const willCreate = criteria === null ? [] : planPlaybookDependencies(app, criteria)
	if (readBoolean(args, 'dryRun')) {
		return {
			dryRun: true,
			data: {
				path: entry.file.path,
				...(hasDescription ? { description: { from: entry.fm.description ?? null, to: readText(args, 'description') } } : {}),
				previousCriteria: previous,
				criteria: criteria ?? previous,
				willCreate,
				...(criteria === null ? {} : { note: 'Saving criteria replaces the whole playbook body; free text in it is not kept.' }),
			},
		}
	}
	return await journal.run(app, { operation: 'updatePlaybook', summary: `Updated playbook "${getFileBasename(entry.file)}"`, touch: [entry.file] }, async () => {
		if (hasDescription) {
			await applyPatch(app, entry, { description: readText(args, 'description') })
		}
		if (criteria !== null) {
			try {
				await savePlaybookCriteriaSections(app, entry.file, criteria)
			} catch (error: unknown) {
				throw toPlaybookError(error, 'criteria')
			}
		}
		return { dryRun: false, data: { path: entry.file.path, criteria: await loadPlaybookCriteriaSections(app, entry.file) } }
	})
}

/** Create a position template; `body` becomes the template text (it may contain the position sections). */
export async function createTemplate(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('createTemplate', rawInput, CREATE_TEMPLATE_FIELDS)
	const name = readRequiredText(args, 'name', 'Pass `name`, the template title.')
	const body = readText(args, 'body')
	const duplicate = listKind(app, 'template').find((template) => typeof template.fm.name === 'string' && template.fm.name.trim().toLowerCase() === name.toLowerCase())
	if (duplicate !== undefined) {
		throw agentError('NAME_CONFLICT', `A template named ${JSON.stringify(name)} already exists (${duplicate.file.path}); a second one could not be picked by name.`, 'Choose a different template name.', { field: 'name', received: name, details: { conflictingPath: duplicate.file.path } })
	}
	if (readBoolean(args, 'dryRun')) {
		return { dryRun: true, data: { name, body } }
	}
	return await journal.run(app, { operation: 'createTemplate', summary: `Created position template "${name}"`, touch: [] }, async () => {
		const template = await createPositionTemplate(app, name)
		const file = app.vault.getAbstractFileByPath(template.filePath)
		if (file instanceof TFile) {
			await appendBody(app, file, body)
		}
		return { dryRun: false, data: { name: template.name, path: template.filePath } }
	})
}

/** Edit the trading parameters of a symbol (fee, contract unit, asset type). */
export async function updateSymbol(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('updateSymbol', rawInput, UPDATE_SYMBOL_FIELDS)
	const reference = readRequiredText(args, 'symbol', 'Pass `symbol` as a symbol name (e.g. "SOLUSDT.P") or path.')
	const account = readText(args, 'account')?.toLowerCase() ?? null
	const key = reference.toLowerCase()
	const symbols = listKind(app, 'symbol')
	const matches = symbols.filter((entry) => {
		const names = [entry.file.path, getFileBasename(entry.file), typeof entry.fm.name === 'string' ? entry.fm.name : ''].map((value) => value.toLowerCase())
		const accountName = (parseWikilinkHeading(typeof entry.fm.account === 'string' ? entry.fm.account : '')?.linkpath ?? '').toLowerCase()
		return names.includes(key) && (account === null || accountName === account || accountName === `acc-${account}`)
	})
	if (matches.length !== 1) {
		throw agentError(
			matches.length === 0 ? 'ENTRY_NOT_FOUND' : 'ENTRY_AMBIGUOUS',
			matches.length === 0 ? `No symbol matches ${JSON.stringify(reference)}.` : `${JSON.stringify(reference)} exists on several accounts.`,
			matches.length === 0 ? 'Call listEntries({ kind: "symbol" }) and retry with an existing name.' : 'Retry with `account` set, or with `symbol` set to one of the candidate paths.',
			{ field: 'symbol', received: reference, candidates: (matches.length === 0 ? symbols : matches).slice(0, 20).map((entry) => entry.file.path) },
		)
	}
	const entry = matches[0]!
	const patch: Record<string, unknown> = {}
	if (hasArg(args, 'type')) {
		patch.type = readEnum(args, 'type', SYMBOL_TYPES)
	}
	for (const field of ['fee_value', 'contract_unit'] as const) {
		if (hasArg(args, field)) {
			patch[field] = readNumber(args, field)
		}
	}
	if (Object.keys(patch).length === 0) {
		throw agentError('INVALID_VALUE', 'updateSymbol was called without anything to change.', 'Pass at least one of: type, fee_value, contract_unit.')
	}
	const before = { ...(app.metadataCache.getFileCache(entry.file)?.frontmatter ?? entry.fm) } as Record<string, unknown>
	let preview: Record<string, unknown>
	try {
		preview = SymbolDomain.previewPatch(app, before, patch).record
	} catch (error: unknown) {
		throw agentError('INVALID_VALUE', `LucrJournal rejected the symbol change: ${error instanceof Error ? error.message : String(error)}.`, 'Correct the values and retry (fee_value must be above 0 and fit the symbol type; contract_unit must be positive).', { received: patch })
	}
	// The symbol model silently drops or rounds values it does not accept; report that instead of a false success.
	const ignored = Object.keys(patch).find((field) => JSON.stringify(preview[field] ?? null) !== JSON.stringify(patch[field] ?? null))
	if (ignored !== undefined) {
		throw agentError(
			'INVALID_VALUE',
			`\`${ignored}\` = ${JSON.stringify(patch[ignored])} would be stored as ${JSON.stringify(preview[ignored] ?? null)} for a ${typeof preview.type === 'string' ? preview.type : 'symbol of unknown type'}.`,
			ignored === 'contract_unit' ? 'contract_unit must be a positive whole number and can only be set on CFD symbols; omit it otherwise.' : `Pass a value LucrJournal accepts for \`${ignored}\`, or omit it.`,
			{ field: ignored, received: patch[ignored] },
		)
	}
	const changes = Object.fromEntries(
		[...new Set([...Object.keys(before), ...Object.keys(preview)])]
			.filter((field) => field !== 'modified' && JSON.stringify(before[field] ?? null) !== JSON.stringify(preview[field] ?? null))
			.map((field) => [field, { from: before[field] ?? null, to: preview[field] ?? null }]),
	)
	if (readBoolean(args, 'dryRun')) {
		return { dryRun: true, data: { path: entry.file.path, changes } }
	}
	return await journal.run(app, { operation: 'updateSymbol', summary: `Updated symbol "${displayName(entry)}"`, touch: [entry.file] }, async () => {
		try {
			const updated = await SymbolDomain.updateFields(app, entry.file, patch)
			return { dryRun: false, data: { path: entry.file.path, changes, frontmatter: updated } }
		} catch (error: unknown) {
			throw agentError('INVALID_VALUE', `LucrJournal rejected the symbol change: ${error instanceof Error ? error.message : String(error)}.`, 'Correct the values and retry (fee_value must fit the symbol type; contract_unit must be positive and is fixed for crypto and futures).', { received: patch })
		}
	})
}
