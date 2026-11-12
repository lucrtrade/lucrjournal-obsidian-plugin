import { type App } from 'obsidian'

import { resolvePositionAttachments } from '../attachments/position-attachments'
import { AccountDomain, derivePositionAccountWikilink, PositionDomain, SymbolDomain, type Position } from '../domains'
import { POSITION_NOTES_SECTION } from '../domains/position/body'
import { getCurrentTimeZoneSetting } from '../settings/plugin-settings'
import { getFileBasename, parseWikilinkHeading } from '../utils'
import { extractSection } from '../utils/markdown-sections'

import { readArgs, readEnum, readNumber, readRequiredText, readText } from './args'
import { datetimeToEpoch, normalizeAgentDatetime } from './datetime'
import { contentRev, displayName, ENTRY_KINDS, listKind, locatePosition, type EntryKind, type LocatedEntry } from './locate'

const LIST_POSITIONS_FIELDS = ['symbol', 'account', 'status', 'side', 'from', 'to', 'playbook', 'limit'] as const
const GET_POSITION_FIELDS = ['position'] as const
const LIST_ENTRIES_FIELDS = ['kind', 'query', 'limit'] as const
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

function summarizePosition(app: App, entry: LocatedEntry) {
	const position = entry.fm as Position
	const accountWikilink = derivePositionAccountWikilink(app, position)
	const account = AccountDomain.findByWikilink(app, accountWikilink)
	return {
		path: entry.file.path,
		id: getFileBasename(entry.file),
		symbol: SymbolDomain.resolveName(app, position),
		account: account === undefined ? null : AccountDomain.toDisplayName(account.fm),
		side: position.side ?? null,
		status: PositionDomain.isClosed(position) ? 'closed' : 'open',
		entry_price: position.entry_price ?? null,
		stop_loss: position.stop_loss ?? null,
		target_price: position.target_price ?? null,
		exit_price: position.exit_price ?? null,
		opened_at: position.opened_at ?? null,
		closed_at: position.closed_at ?? null,
		profit: position.profit ?? null,
		risk: position.risk ?? null,
		playbook: parseWikilinkHeading(position.playbook ?? '')?.linkpath ?? null,
		modified: (position as { modified?: string | null }).modified ?? null,
	}
}

function readBoundary(args: Record<string, unknown>, field: 'from' | 'to', timeZone: string): number | null {
	const value = readText(args, field)
	if (value === null) {
		return null
	}
	const withTime = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} ${field === 'from' ? '00:00:00' : '23:59:59'}` : value
	return datetimeToEpoch(normalizeAgentDatetime(withTime, field, timeZone))
}

function readLimit(args: Record<string, unknown>): number {
	const limit = readNumber(args, 'limit')
	return limit === null ? DEFAULT_LIMIT : Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
}

export function listPositions(app: App, rawInput: unknown) {
	const args = readArgs('listPositions', rawInput ?? {}, LIST_POSITIONS_FIELDS)
	const timeZone = getCurrentTimeZoneSetting()
	const symbol = readText(args, 'symbol')?.toLowerCase() ?? null
	const account = readText(args, 'account')?.toLowerCase() ?? null
	const playbook = readText(args, 'playbook')?.toLowerCase() ?? null
	const status = readEnum(args, 'status', ['open', 'closed'] as const)
	const side = readEnum(args, 'side', ['LONG', 'SHORT'] as const)
	const from = readBoundary(args, 'from', timeZone)
	const to = readBoundary(args, 'to', timeZone)
	const limit = readLimit(args)

	const matches = listKind(app, 'position')
		.map((entry) => summarizePosition(app, entry))
		.filter((position) => {
			const openedAt = position.opened_at === null ? null : datetimeToEpoch(position.opened_at)
			return (symbol === null || (position.symbol ?? '').toLowerCase().includes(symbol))
				&& (account === null || (position.account ?? '').toLowerCase() === account)
				&& (playbook === null || (position.playbook ?? '').toLowerCase() === playbook)
				&& (status === null || position.status === status)
				&& (side === null || position.side === side)
				&& (from === null || (openedAt !== null && openedAt >= from))
				&& (to === null || (openedAt !== null && openedAt <= to))
		})
		.sort((left, right) => (right.opened_at ?? '').localeCompare(left.opened_at ?? '') || right.id.localeCompare(left.id))

	return { data: { total: matches.length, truncated: matches.length > limit, positions: matches.slice(0, limit) } }
}

async function readPositionDetails(app: App, entry: LocatedEntry) {
	const content = await app.vault.read(entry.file)
	const groups = await PositionDomain.listContextGroups(app, entry.file)
	const links: Record<string, string[]> = { news: [], key_level: [], confluence: [], market_analysis: [] }
	let playbook: string | null = null
	for (const group of groups) {
		if (group.kind === 'playbook') {
			playbook = group.playbookEntry === null ? null : getFileBasename(group.playbookEntry.file)
			continue
		}
		links[group.kind] = group.linkedEntries.map((linked) => getFileBasename(linked.file))
	}
	return {
		...summarizePosition(app, entry),
		playbook,
		frontmatter: entry.fm,
		links,
		attachments: resolvePositionAttachments(entry.fm),
		notes: extractSection(content, POSITION_NOTES_SECTION).body,
		rev: contentRev(content),
	}
}

export async function getPosition(app: App, rawInput: unknown) {
	const args = readArgs('getPosition', rawInput, GET_POSITION_FIELDS)
	const entry = locatePosition(app, readRequiredText(args, 'position', 'Pass `position` as a path or id, e.g. "POS-00012".'))
	return { data: await readPositionDetails(app, entry) }
}

function summarizeEntry(app: App, entry: LocatedEntry) {
	const { lucr_type: _type, ...fields } = entry.fm
	return {
		kind: entry.kind,
		name: displayName(entry),
		path: entry.file.path,
		...fields,
		...(entry.kind === 'symbol' ? { account_name: accountNameOf(app, entry) } : {}),
	}
}

function accountNameOf(app: App, entry: LocatedEntry): string | null {
	const account = AccountDomain.findByWikilink(app, typeof entry.fm.account === 'string' ? entry.fm.account : null)
	return account === undefined ? null : AccountDomain.toDisplayName(account.fm)
}

export function listEntries(app: App, rawInput: unknown) {
	const args = readArgs('listEntries', rawInput, LIST_ENTRIES_FIELDS)
	const kind = readEnum(args, 'kind', ENTRY_KINDS.filter((candidate) => candidate !== 'position'))
	if (kind === null) {
		readRequiredText(args, 'kind', `Pass \`kind\` as one of: ${ENTRY_KINDS.filter((candidate) => candidate !== 'position').join(', ')}. Use listPositions for positions.`)
	}
	const query = readText(args, 'query')?.toLowerCase() ?? null
	const limit = readLimit(args)
	const matches = listKind(app, kind as EntryKind)
		.map((entry) => summarizeEntry(app, entry))
		.filter((entry) => query === null || entry.name.toLowerCase().includes(query))
		.sort((left, right) => left.name.localeCompare(right.name))
	return { data: { kind, total: matches.length, truncated: matches.length > limit, entries: matches.slice(0, limit) } }
}
