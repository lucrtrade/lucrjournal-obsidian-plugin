import { TFile, type App } from 'obsidian'

import { parseAttachmentToken, resolvePositionAttachments } from '../attachments/position-attachments'
import { PositionDomain, SymbolDomain } from '../domains'
import {
	applyPositionBodyAdditions,
	removePositionPlaybookFrontmatter,
	removeSectionEntryFromPosition,
	setPositionPlaybookFrontmatter,
} from '../domains/position/body'
import { getCurrentTimeZoneSetting } from '../settings/plugin-settings'
import { getFileBasename, parseWikilinkHeading } from '../utils'
import { extractSection, extractSections } from '../utils/markdown-sections'

import { hasArg, readArgs, readBodyText, readBoolean, readEnum, readNumber, readPositiveNumber, readRequiredText, readText } from './args'
import { parseAttachmentSource, planAttachment, writeAttachment, type AttachmentPlan } from './attachments'
import { datetimeToEpoch, normalizeAgentDatetime } from './datetime'
import { agentError } from './errors'
import { contentRev, locatePosition, toContextKind, type ContextKind, type LocatedEntry } from './locate'
import { resolveQuantityPatch } from './plan'
import { LINK_KIND_CONFIG, resolveLink, resolvePlaybook } from './resolve'
import { waitForValue } from './wait'

import type { LinkKind } from './input'
import type { AgentJournal } from './journal'

const INDEX_TIMEOUT_MS = 20_000
const PRICE_FIELDS = ['entry_price', 'stop_loss', 'target_price', 'exit_price'] as const
const SIZE_FIELDS = ['lots', 'contract', 'notional_value', 'amount'] as const
const COMMON_FIELDS = ['position', 'ifRev', 'dryRun'] as const
const UPDATE_POSITION_FIELDS = [...COMMON_FIELDS, ...PRICE_FIELDS, ...SIZE_FIELDS, 'opened_at', 'closed_at', 'confidence', 'status', 'notes'] as const
const ADD_ATTACHMENTS_FIELDS = [...COMMON_FIELDS, 'attachments'] as const
const REMOVE_ATTACHMENT_FIELDS = [...COMMON_FIELDS, 'attachment'] as const
const LINK_FIELDS = [...COMMON_FIELDS, 'kind', 'name'] as const
const SET_PLAYBOOK_FIELDS = [...COMMON_FIELDS, 'playbook'] as const

type Target = { entry: LocatedEntry; content: string; dryRun: boolean }

/** Locate the position and refuse the call when the note changed after the agent last read it. */
async function openTarget(app: App, args: Record<string, unknown>): Promise<Target> {
	const entry = locatePosition(app, readRequiredText(args, 'position', 'Pass `position` as a path or id, e.g. "POS-00012".'))
	const content = await app.vault.read(entry.file)
	const ifRev = readText(args, 'ifRev')
	const rev = contentRev(content)
	if (ifRev !== null && ifRev !== rev) {
		throw agentError(
			'CONFLICT',
			`${entry.file.path} changed since you read it (expected rev ${ifRev}, current rev ${rev}); the user may have edited it in Obsidian.`,
			'Call getPosition again, re-apply your change to the current values, and retry with the new `rev` as `ifRev`.',
			{ field: 'ifRev', received: ifRev, details: { rev } },
		)
	}
	return { entry, content, dryRun: readBoolean(args, 'dryRun') }
}

async function describeResult(app: App, file: TFile, extra: Record<string, unknown>) {
	return { data: { path: file.path, rev: contentRev(await app.vault.read(file)), ...extra } }
}

function linkKindOf(kind: ContextKind): LinkKind {
	return kind === 'key_level' ? 'key_levels' : kind
}

function rawFrontmatter(app: App, entry: LocatedEntry): Record<string, unknown> {
	return { ...(app.metadataCache.getFileCache(entry.file)?.frontmatter ?? entry.fm) }
}

function buildPositionPatch(app: App, args: Record<string, unknown>, entry: LocatedEntry): Record<string, unknown> {
	const timeZone = getCurrentTimeZoneSetting()
	const patch: Record<string, unknown> = {}
	for (const field of PRICE_FIELDS) {
		if (hasArg(args, field)) {
			patch[field] = readPositiveNumber(args, field)
		}
	}
	if (hasArg(args, 'confidence')) {
		const confidence = readNumber(args, 'confidence')
		if (confidence !== null && (!Number.isInteger(confidence) || confidence < 1 || confidence > 5)) {
			throw agentError('INVALID_VALUE', `\`confidence\` must be an integer from 1 to 5, received ${confidence}.`, 'Pass an integer 1-5.', { field: 'confidence', received: confidence })
		}
		patch.confidence = confidence
	}
	for (const field of ['opened_at', 'closed_at'] as const) {
		const value = readText(args, field)
		if (value !== null) {
			patch[field] = normalizeAgentDatetime(value, field, timeZone)
		}
	}

	const sizes = { lots: readPositiveNumber(args, 'lots'), contract: readPositiveNumber(args, 'contract'), notional_value: readPositiveNumber(args, 'notional_value'), amount: readPositiveNumber(args, 'amount') }
	if (SIZE_FIELDS.some((field) => sizes[field] !== null)) {
		const symbol = SymbolDomain.resolveEntry(app, entry.fm)
		if (symbol === null) {
			throw agentError(
				'SYMBOL_INVALID',
				`${entry.file.path} links to a symbol note that no longer resolves, so its size unit is unknown.`,
				'Ask the user to fix the position symbol in Obsidian, then retry.',
				{ field: SIZE_FIELDS.find((field) => sizes[field] !== null) },
			)
		}
		Object.assign(patch, resolveQuantityPatch(sizes, symbol.fm.name, symbol.fm.type ?? null))
	}

	const status = readEnum(args, 'status', ['open', 'close', 'closed'] as const)
	if (status === 'open') {
		// A position stays closed while either close marker is set, so reopening has to clear both.
		patch.status = 'open'
		patch.exit_price = patch.exit_price ?? null
		patch.closed_at = patch.closed_at ?? null
	} else if (status !== null || patch.exit_price != null || patch.closed_at != null) {
		patch.status = 'close'
	}

	const openedAt = (patch.opened_at ?? entry.fm.opened_at ?? null) as string | null
	const closedAt = (patch.closed_at ?? null) as string | null
	if (openedAt !== null && closedAt !== null && datetimeToEpoch(closedAt) < datetimeToEpoch(openedAt)) {
		throw agentError('INVALID_VALUE', `\`closed_at\` (${closedAt}) is earlier than \`opened_at\` (${openedAt}).`, 'Swap or correct the two times.', { field: 'closed_at', received: { opened_at: openedAt, closed_at: closedAt } })
	}
	return patch
}

function previewPosition(app: App, entry: LocatedEntry, patch: Record<string, unknown>): Record<string, unknown> {
	try {
		return PositionDomain.previewPatch(app, rawFrontmatter(app, entry), patch).record
	} catch (error: unknown) {
		throw agentError(
			'INVALID_VALUE',
			`LucrJournal rejected the change: ${error instanceof Error ? error.message : String(error)}.`,
			'Check the prices against the position side (stop below entry and target above it for LONG, the opposite for SHORT) and the size limits, then retry with corrected values.',
			{ received: patch },
		)
	}
}

function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => key !== 'modified')
	return Object.fromEntries(
		keys
			.filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
			.map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]),
	)
}

/** Edit fields of an existing position (including closing it) and append to its Notes section. */
export async function updatePosition(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('updatePosition', rawInput, UPDATE_POSITION_FIELDS)
	const { entry, dryRun } = await openTarget(app, args)
	const notes = readBodyText(args, 'notes')
	const patch = buildPositionPatch(app, args, entry)
	if (Object.keys(patch).length === 0 && notes === null) {
		throw agentError('INVALID_VALUE', 'updatePosition was called without anything to change.', `Pass at least one of: ${UPDATE_POSITION_FIELDS.filter((field) => !(COMMON_FIELDS as readonly string[]).includes(field)).join(', ')}.`)
	}
	const before = rawFrontmatter(app, entry)
	const changes = diffRecords(before, previewPosition(app, entry, patch))
	if (dryRun) {
		return { dryRun: true, data: { path: entry.file.path, changes, notesAppended: notes } }
	}

	return await journal.run(app, { operation: 'updatePosition', summary: `Updated ${getFileBasename(entry.file)}`, touch: [entry.file] }, async () => {
		if (Object.keys(patch).length > 0) {
			await PositionDomain.updateFields(app, entry.file, patch)
		}
		if (notes !== null) {
			await app.vault.process(entry.file, (content) => applyPositionBodyAdditions(content, { notes, links: [] }))
		}
		return { dryRun: false, ...(await describeResult(app, entry.file, { changes, notesAppended: notes })) }
	})
}

/** Store images and reference them from an existing position, like dropping them on the media panel. */
export async function addAttachments(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('addAttachments', rawInput, ADD_ATTACHMENTS_FIELDS)
	const { entry, dryRun } = await openTarget(app, args)
	const inputs = args.attachments
	if (!Array.isArray(inputs) || inputs.length === 0) {
		throw agentError('INVALID_VALUE', '`attachments` must be a non-empty array of image paths or `{ sourcePath | base64 + fileName }` objects.', 'Pass e.g. `attachments: ["/Users/me/shot.png"]`.', { field: 'attachments', received: inputs })
	}
	const now = new Date()
	const reserved = new Set<string>()
	const plans: AttachmentPlan[] = inputs.map((raw, index) => {
		const plan = planAttachment(app, parseAttachmentSource(raw, `attachments[${index}]`), now, reserved)
		reserved.add(plan.path)
		return plan
	})
	const added = plans.map((plan) => ({ path: plan.path, token: plan.token, bytes: plan.bytes }))
	if (dryRun) {
		return { dryRun: true, data: { path: entry.file.path, added } }
	}

	return await journal.run(app, { operation: 'addAttachments', summary: `Added ${plans.length} image(s) to ${getFileBasename(entry.file)}`, touch: [entry.file] }, async () => {
		for (const plan of plans) {
			await writeAttachment(app, plan)
		}
		const updated = await PositionDomain.updateFieldsAndAppendAttachments(app, entry.file, {}, plans.map((plan) => plan.token))
		return { dryRun: false, ...(await describeResult(app, entry.file, { added, attachments: resolvePositionAttachments(updated) })) }
	})
}

/** Drop one image reference from a position. The image file itself is kept; checkHealth reports it if nothing else uses it. */
export async function removeAttachment(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('removeAttachment', rawInput, REMOVE_ATTACHMENT_FIELDS)
	const { entry, dryRun } = await openTarget(app, args)
	const wanted = readRequiredText(args, 'attachment', 'Pass `attachment` as a token, path or file name from getPosition `attachments`.')
	const wantedName = attachmentFileName(wanted)
	const current = resolvePositionAttachments(rawFrontmatter(app, entry))
	const remaining = current.filter((token) => token !== wanted && attachmentFileName(token) !== wantedName)
	if (remaining.length === current.length) {
		throw agentError(
			'ATTACHMENT_NOT_FOUND',
			`${entry.file.path} has no attachment matching ${JSON.stringify(wanted)}.`,
			'Retry with one of the candidates.',
			{ field: 'attachment', received: wanted, candidates: current },
		)
	}
	const removed = current.filter((token) => !remaining.includes(token))
	if (dryRun) {
		return { dryRun: true, data: { path: entry.file.path, removed, attachments: remaining } }
	}

	return await journal.run(app, { operation: 'removeAttachment', summary: `Removed an image reference from ${getFileBasename(entry.file)}`, touch: [entry.file] }, async () => {
		await app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
			if (remaining.length > 0) {
				frontmatter.attachments = remaining
			} else {
				delete frontmatter.attachments
			}
		})
		return { dryRun: false, ...(await describeResult(app, entry.file, { removed, attachments: remaining })) }
	})
}

function attachmentFileName(value: string): string {
	const parsed = parseAttachmentToken(value)
	const target = parsed === null ? value : parsed.kind === 'vault' ? parsed.linkpath : parsed.url
	return (target.split('/').pop() ?? target).toLowerCase()
}

function isLinked(content: string, sectionTitle: string, basename: string): boolean {
	return extractSections(extractSection(content, sectionTitle).body, 2)
		.some((section) => parseWikilinkHeading(section.title)?.linkpath.toLowerCase() === basename.toLowerCase())
}

/** Link a news / key level / confluence / market analysis note into an existing position, creating the note when it does not exist yet. */
export async function linkContext(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('linkContext', rawInput, LINK_FIELDS)
	const { entry, content, dryRun } = await openTarget(app, args)
	const kind = toContextKind(readRequiredText(args, 'kind', 'Pass `kind` as news, key_level, confluence or market_analysis.'), 'kind')
	const link = resolveLink(app, linkKindOf(kind), readRequiredText(args, 'name', 'Pass `name`, the title of the note to link.'))
	const config = LINK_KIND_CONFIG[link.kind]
	const alreadyLinked = isLinked(content, config.sectionTitle, link.basename)
	const outcome = { kind, name: link.basename, entryPath: link.path, created: link.create, linked: alreadyLinked ? 'exists' : 'appended' }
	if (dryRun || alreadyLinked) {
		return { dryRun, data: { path: entry.file.path, ...outcome } }
	}

	return await journal.run(app, { operation: 'linkContext', summary: `Linked ${kind} "${link.basename}" to ${getFileBasename(entry.file)}`, touch: [entry.file] }, async () => {
		if (link.create) {
			const formValue: Record<string, string> = link.kind === 'news' ? { name: link.basename, source: '' } : { name: link.basename, description: '' }
			const createEntry = config.domain.createEntry.bind(config.domain) as unknown as (runtimeApp: App, value: Record<string, string>) => Promise<{ file: { path: string } }>
			await createEntry(app, formValue)
			await waitForValue(() => {
				const created = app.vault.getAbstractFileByPath(link.path)
				return created instanceof TFile && app.metadataCache.getFileCache(created)?.frontmatter?.lucr_type === config.entityKind ? true : null
			}, INDEX_TIMEOUT_MS)
		}
		await app.vault.process(entry.file, (current) => applyPositionBodyAdditions(current, { notes: null, links: [{ sectionTitle: config.sectionTitle, basename: link.basename }] }))
		return { dryRun: false, ...(await describeResult(app, entry.file, outcome)) }
	})
}

/** Remove one linked note from a position. The note itself is kept. */
export async function unlinkContext(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('unlinkContext', rawInput, LINK_FIELDS)
	const { entry, dryRun } = await openTarget(app, args)
	const kind = toContextKind(readRequiredText(args, 'kind', 'Pass `kind` as news, key_level, confluence or market_analysis.'), 'kind')
	const name = readRequiredText(args, 'name', 'Pass `name`, the title of the linked note.')
	const groups = await PositionDomain.listContextGroups(app, entry.file)
	const group = groups.find((candidate) => candidate.kind === kind)
	const linkedEntries = group === undefined || group.kind === 'playbook' ? [] : group.linkedEntries
	const linked = linkedEntries.find((candidate) => getFileBasename(candidate.file).toLowerCase() === name.toLowerCase())
	if (linked === undefined || group === undefined || group.kind === 'playbook') {
		throw agentError(
			'ENTRY_NOT_FOUND',
			`${entry.file.path} has no linked ${kind} named ${JSON.stringify(name)}.`,
			'Retry with one of the candidates, or call getPosition to see what is linked.',
			{ field: 'name', received: name, candidates: linkedEntries.map((candidate) => getFileBasename(candidate.file)) },
		)
	}
	const outcome = { kind, name: getFileBasename(linked.file), unlinked: true }
	if (dryRun) {
		return { dryRun: true, data: { path: entry.file.path, ...outcome } }
	}

	return await journal.run(app, { operation: 'unlinkContext', summary: `Unlinked ${kind} "${outcome.name}" from ${getFileBasename(entry.file)}`, touch: [entry.file] }, async () => {
		await removeSectionEntryFromPosition({ app, linkpath: linked.linkpath, positionFile: entry.file, sectionStart: linked.sectionStart, sectionTitle: group.sectionTitle })
		return { dryRun: false, ...(await describeResult(app, entry.file, outcome)) }
	})
}

/** Set or replace the playbook a position follows. */
export async function setPlaybook(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('setPlaybook', rawInput, SET_PLAYBOOK_FIELDS)
	const { entry, dryRun } = await openTarget(app, args)
	const playbook = resolvePlaybook(app, readRequiredText(args, 'playbook', 'Pass `playbook`, the name of an existing playbook.'))
	const playbookFile = app.vault.getAbstractFileByPath(playbook.path)
	if (!(playbookFile instanceof TFile)) {
		throw agentError('PLAYBOOK_NOT_FOUND', `Playbook file ${playbook.path} disappeared.`, 'Retry once.', { field: 'playbook', received: playbook.basename })
	}
	if (dryRun) {
		return { dryRun: true, data: { path: entry.file.path, playbook: playbook.basename } }
	}
	return await journal.run(app, { operation: 'setPlaybook', summary: `Set playbook "${playbook.basename}" on ${getFileBasename(entry.file)}`, touch: [entry.file] }, async () => {
		const outcome = await setPositionPlaybookFrontmatter({ app, positionFile: entry.file, playbookFile })
		return { dryRun: false, ...(await describeResult(app, entry.file, { playbook: playbook.basename, changed: outcome === 'appended' })) }
	})
}

/** Clear the playbook of a position. */
export async function removePlaybook(app: App, journal: AgentJournal, rawInput: unknown) {
	const args = readArgs('removePlaybook', rawInput, COMMON_FIELDS)
	const { entry, dryRun } = await openTarget(app, args)
	const current = parseWikilinkHeading(typeof entry.fm.playbook === 'string' ? entry.fm.playbook : '')?.linkpath ?? null
	if (dryRun) {
		return { dryRun: true, data: { path: entry.file.path, removed: current } }
	}
	return await journal.run(app, { operation: 'removePlaybook', summary: `Cleared the playbook of ${getFileBasename(entry.file)}`, touch: [entry.file] }, async () => {
		const changed = await removePositionPlaybookFrontmatter({ app, positionFile: entry.file })
		return { dryRun: false, ...(await describeResult(app, entry.file, { removed: current, changed })) }
	})
}
