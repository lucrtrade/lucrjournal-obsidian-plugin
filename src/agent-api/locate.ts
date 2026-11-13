import { TFile, normalizePath, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../constant'
import {
	AccountDomain,
	ConfluenceDomain,
	CriteriaDomain,
	KeyLevelDomain,
	MarketAnalysisDomain,
	NewsDomain,
	PlatformDomain,
	PlaybookDomain,
	PositionDomain,
	SymbolDomain,
	TemplateDomain,
} from '../domains'
import { getFileBasename, sanitizeObsidianFileName } from '../utils'

import { agentError, formatCandidates } from './errors'

export const ENTRY_KINDS = [
	'position',
	'account',
	'platform',
	'symbol',
	'news',
	'key_level',
	'confluence',
	'market_analysis',
	'playbook',
	'criteria',
	'template',
] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

export const CONTEXT_KINDS = ['news', 'key_level', 'confluence', 'market_analysis'] as const
export type ContextKind = (typeof CONTEXT_KINDS)[number]

/** The slice of a domain the agent API relies on, typed loosely so every domain fits. */
type LooseDomain = {
	totalEntries: (app: App) => Array<{ file: unknown; fm: Record<string, unknown> }>
	updateFields: (app: App, file: TFile, patch: Record<string, unknown>) => Promise<unknown>
}

export type LocatedEntry = {
	kind: EntryKind
	file: TFile
	fm: Record<string, unknown>
}

export function domainOf(kind: EntryKind): LooseDomain {
	switch (kind) {
		case 'position':
			return PositionDomain
		case 'account':
			return AccountDomain
		case 'platform':
			return PlatformDomain
		case 'symbol':
			return SymbolDomain
		case 'news':
			return NewsDomain
		case 'key_level':
			return KeyLevelDomain
		case 'confluence':
			return ConfluenceDomain
		case 'market_analysis':
			return MarketAnalysisDomain
		case 'playbook':
			return PlaybookDomain
		case 'criteria':
			return CriteriaDomain
		case 'template':
			return TemplateDomain
		default:
			kind satisfies never
			throw new Error('Unknown entry kind')
	}
}

export function listKind(app: App, kind: EntryKind): LocatedEntry[] {
	return domainOf(kind)
		.totalEntries(app)
		.flatMap((entry) => (entry.file instanceof TFile ? [{ kind, file: entry.file, fm: entry.fm }] : []))
}

/** Normalize the plural spellings `createPosition({ links })` uses to the entity kind. */
export function toContextKind(value: string, field: string): ContextKind {
	const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
	const singular = normalized === 'key_levels' ? 'key_level' : normalized === 'market_analyses' ? 'market_analysis' : normalized
	const match = CONTEXT_KINDS.find((kind) => kind === singular)
	if (match === undefined) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be one of ${formatCandidates(CONTEXT_KINDS)}, received ${JSON.stringify(value)}.`,
			'Pass one of the candidates.',
			{ field, received: value, candidates: [...CONTEXT_KINDS] },
		)
	}
	return match
}

/** Find a position by vault-relative path or by its id (`POS-00012`, `12`). */
export function locatePosition(app: App, reference: string, field = 'position'): LocatedEntry {
	const positions = listKind(app, 'position')
	const trimmed = reference.trim()
	const asPath = normalizePath(trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
	const byPath = positions.find((entry) => entry.file.path === asPath)
	if (byPath !== undefined) {
		return byPath
	}
	const wanted = toPositionBasename(trimmed)
	const byName = positions.filter((entry) => getFileBasename(entry.file).toLowerCase() === wanted.toLowerCase())
	if (byName.length === 1) {
		return byName[0]!
	}
	const onDisk = app.vault.getMarkdownFiles().find((file) => file.path === asPath || (file.path.startsWith(`${LUCR_TRADE_ROOT_DIR}/positions/`) && getFileBasename(file).toLowerCase() === wanted.toLowerCase()))
	if (onDisk !== undefined) {
		throw agentError(
			'POSITION_NOT_FOUND',
			`${onDisk.path} exists, but LucrJournal cannot read it as a position right now: either Obsidian is still indexing it after a change, or one of its properties was edited into an invalid value.`,
			'Do not recreate it. Retry once after a second; if it still fails, call checkHealth and tell the user which property to correct in Obsidian.',
			{ field, received: reference, details: { path: onDisk.path } },
		)
	}
	throw agentError(
		'POSITION_NOT_FOUND',
		`No LucrJournal position matches ${JSON.stringify(reference)}.`,
		'Pass the vault-relative path (e.g. "LucrJournal/positions/POS-00012.md") or the position id (e.g. "POS-00012"). Call listPositions to find it.',
		{ field, received: reference },
	)
}

function toPositionBasename(reference: string): string {
	const withoutExtension = reference.replace(/\.md$/i, '').split('/').pop() ?? reference
	return /^\d+$/.test(withoutExtension) ? `POS-${withoutExtension.padStart(5, '0')}` : withoutExtension
}

/** Find an entry of one kind by path, file name or (for accounts and symbols) display name. */
export function locateEntry(app: App, kind: EntryKind, reference: string, field = 'name'): LocatedEntry {
	if (kind === 'position') {
		return locatePosition(app, reference, field)
	}
	const entries = listKind(app, kind)
	const trimmed = reference.trim()
	const asPath = normalizePath(trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
	const byPath = entries.find((entry) => entry.file.path === asPath)
	if (byPath !== undefined) {
		return byPath
	}
	const keys = referenceKeys(trimmed)
	const matches = entries.filter((entry) => entryNames(entry).some((name) => keys.includes(name.toLowerCase())))
	if (matches.length === 1) {
		return matches[0]!
	}
	if (matches.length > 1) {
		throw agentError(
			'ENTRY_AMBIGUOUS',
			`${JSON.stringify(reference)} matches ${matches.length} ${kind} entries: ${formatCandidates(matches.map((match) => match.file.path))}.`,
			`Retry with \`${field}\` set to one of the candidate paths; ask the user which one when it is not obvious.`,
			{ field, received: reference, candidates: matches.map((match) => match.file.path) },
		)
	}
	throw agentError(
		'ENTRY_NOT_FOUND',
		`No ${kind} named ${JSON.stringify(reference)} exists in this vault.`,
		`Call listEntries({ kind: "${kind}" }) to see the existing names, then retry with one of them.`,
		{ field, received: reference, candidates: entries.slice(0, 20).map((entry) => displayName(entry)) },
	)
}

/** Find any LucrJournal entry by vault-relative path or by a file name that is unique across kinds. */
export function locateAny(app: App, reference: string, field = 'path'): LocatedEntry {
	const trimmed = reference.trim()
	const asPath = normalizePath(trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
	const all = ENTRY_KINDS.flatMap((kind) => listKind(app, kind))
	const byPath = all.find((entry) => entry.file.path === asPath)
	if (byPath !== undefined) {
		return byPath
	}
	const keys = [...referenceKeys(trimmed), (trimmed.replace(/\.md$/i, '').split('/').pop() ?? trimmed).toLowerCase()]
	const matches = all.filter((entry) => keys.includes(getFileBasename(entry.file).toLowerCase()))
	if (matches.length === 1) {
		return matches[0]!
	}
	if (matches.length > 1) {
		throw agentError(
			'ENTRY_AMBIGUOUS',
			`${JSON.stringify(reference)} matches ${matches.length} entries: ${formatCandidates(matches.map((match) => match.file.path))}.`,
			`Retry with \`${field}\` set to one of the candidate paths.`,
			{ field, received: reference, candidates: matches.map((match) => match.file.path) },
		)
	}
	throw agentError(
		'ENTRY_NOT_FOUND',
		`No LucrJournal entry matches ${JSON.stringify(reference)}.`,
		`Pass the vault-relative path under ${LUCR_TRADE_ROOT_DIR}/ or the exact file name; call listEntries or listPositions to find it.`,
		{ field, received: reference },
	)
}

/** A name as the agent wrote it, and as LucrJournal stores it once file-name characters are replaced. */
export function referenceKeys(reference: string): string[] {
	const plain = cleanEntryName(reference).replace(/\.md$/i, '')
	return [...new Set([plain.toLowerCase(), sanitizeObsidianFileName(plain).toLowerCase()])]
}

/** Drop the wikilink brackets an agent may copy along with a note name. */
export function cleanEntryName(value: string): string {
	return value.trim().replace(/^!?\[\[/, '').replace(/\]\]$/, '').trim()
}

function entryNames(entry: LocatedEntry): string[] {
	const names = [getFileBasename(entry.file)]
	const fmName = typeof entry.fm.name === 'string' ? entry.fm.name.trim() : ''
	if (fmName !== '') {
		names.push(fmName)
	}
	return names
}

export function displayName(entry: LocatedEntry): string {
	if (entry.kind === 'account' || entry.kind === 'symbol' || entry.kind === 'template') {
		const fmName = typeof entry.fm.name === 'string' ? entry.fm.name.trim() : ''
		if (fmName !== '') {
			return fmName
		}
	}
	return getFileBasename(entry.file)
}

/** Stable short fingerprint of a note's text, used as the optimistic-concurrency token (`rev` / `ifRev`). */
export function contentRev(content: string): string {
	let hash = 5381
	for (let index = 0; index < content.length; index += 1) {
		hash = ((hash << 5) + hash + content.charCodeAt(index)) | 0
	}
	return (hash >>> 0).toString(16).padStart(8, '0')
}
