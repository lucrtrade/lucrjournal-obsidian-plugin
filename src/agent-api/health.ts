import { TFile, type App } from 'obsidian'

import { parseAttachmentToken, resolvePositionAttachments } from '../attachments/position-attachments'
import { LUCR_TRADE_ATTACHMENTS_DIR, LUCR_TRADE_ROOT_DIR } from '../constant'
import { AccountDomain, Domains, SymbolDomain } from '../domains'
import {
	POSITION_CONFLUENCE_SECTION,
	POSITION_KEY_LEVEL_SECTION,
	POSITION_MARKET_ANALYSIS_SECTION,
	POSITION_NEWS_SECTION,
} from '../domains/position/body'
import { getFileBasename, parseWikilinkHeading } from '../utils'
import { extractSection, extractSections } from '../utils/markdown-sections'

import { readArgs } from './args'
import { listKind, type LocatedEntry } from './locate'

type HealthIssue = {
	type: 'invalid_note' | 'broken_link' | 'duplicate_name' | 'orphan_attachment' | 'attachment_mismatch'
	path: string
	message: string
	fix: string
}

const CONTEXT_SECTIONS = [POSITION_NEWS_SECTION, POSITION_KEY_LEVEL_SECTION, POSITION_CONFLUENCE_SECTION, POSITION_MARKET_ANALYSIS_SECTION] as const

/**
 * Read-only audit of `LucrJournal/`: notes the plugin can no longer read,
 * links that resolve to nothing, duplicate file names and attachment
 * references that disagree. It reports; it never repairs.
 */
export async function checkHealth(app: App, rawInput: unknown) {
	readArgs('checkHealth', rawInput ?? {}, [])
	const notes = app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`))
	const referencedAttachments = new Set<string>()
	const issues: HealthIssue[] = [...findInvalidNotes(app, notes), ...findDuplicateNames(notes)]
	for (const position of listKind(app, 'position')) {
		issues.push(...(await inspectPosition(app, position, referencedAttachments)))
	}
	issues.push(...findOrphanSymbols(app), ...findOrphanAttachments(app, referencedAttachments))
	issues.push(...findUnresolvedLinks(app, issues))

	const counts: Record<string, number> = {}
	for (const issue of issues) {
		counts[issue.type] = (counts[issue.type] ?? 0) + 1
	}
	return { data: { healthy: issues.length === 0, notesChecked: notes.length, counts, issues } }
}

function findInvalidNotes(app: App, notes: TFile[]): HealthIssue[] {
	return notes.flatMap((file): HealthIssue[] => {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter
		const lucrType = typeof frontmatter?.lucr_type === 'string' ? frontmatter.lucr_type.trim().toLowerCase() : ''
		const domain = Domains.find((candidate) => candidate.name === lucrType)
		if (domain === undefined) {
			return [{
				type: 'invalid_note',
				path: file.path,
				message: lucrType === '' ? 'The note has no `lucr_type` property, so LucrJournal ignores it.' : `Unknown \`lucr_type\` ${JSON.stringify(lucrType)}.`,
				fix: 'Ask the user whether this note belongs to the journal; if not, move it out of LucrJournal/.',
			}]
		}
		return domain.refine(frontmatter) !== null
			? []
			: [{
				type: 'invalid_note',
				path: file.path,
				message: `The properties do not match the ${lucrType} schema, so the note is hidden from LucrJournal lists.`,
				fix: 'Ask the user to open the note in Obsidian and correct the property that was edited by hand.',
			}]
	})
}

function findDuplicateNames(notes: TFile[]): HealthIssue[] {
	const seen = new Map<string, string>()
	return notes.flatMap((file): HealthIssue[] => {
		const key = getFileBasename(file).toLowerCase()
		const previous = seen.get(key)
		if (previous === undefined) {
			seen.set(key, file.path)
			return []
		}
		return [{ type: 'duplicate_name', path: file.path, message: `Shares its file name with ${previous}; wikilinks to it are ambiguous.`, fix: 'Rename one of the two notes with renameEntry.' }]
	})
}

async function inspectPosition(app: App, position: LocatedEntry, referencedAttachments: Set<string>): Promise<HealthIssue[]> {
	const { file, fm } = position
	const resolves = (linkpath: string) => app.metadataCache.getFirstLinkpathDest(linkpath, file.path) instanceof TFile
	const issues: HealthIssue[] = []
	if (SymbolDomain.resolveEntry(app, fm) === null) {
		issues.push({ type: 'broken_link', path: file.path, message: `Symbol ${JSON.stringify(fm.symbol ?? null)} does not resolve to a symbol note.`, fix: 'Ask the user to pick the symbol again in the position view.' })
	}
	const playbook = parseWikilinkHeading(typeof fm.playbook === 'string' ? fm.playbook : '')?.linkpath
	if (playbook !== undefined && !resolves(playbook)) {
		issues.push({ type: 'broken_link', path: file.path, message: `Playbook [[${playbook}]] does not exist.`, fix: 'Call removePlaybook, or setPlaybook with an existing playbook.' })
	}

	const content = await app.vault.read(file)
	for (const sectionTitle of CONTEXT_SECTIONS) {
		for (const section of extractSections(extractSection(content, sectionTitle).body, 2)) {
			const linkpath = parseWikilinkHeading(section.title)?.linkpath
			if (linkpath !== undefined && !resolves(linkpath)) {
				issues.push({ type: 'broken_link', path: file.path, message: `"${sectionTitle}" links to [[${linkpath}]], which does not exist.`, fix: 'Create the note with createEntry, or ask the user to remove the heading.' })
			}
		}
	}
	return [...issues, ...inspectAttachments(file.path, fm, content, resolves, referencedAttachments)]
}

function inspectAttachments(
	path: string,
	fm: Record<string, unknown>,
	content: string,
	resolves: (linkpath: string) => boolean,
	referencedAttachments: Set<string>,
): HealthIssue[] {
	const issues: HealthIssue[] = []
	const frontmatterNames = new Set<string>()
	for (const token of resolvePositionAttachments(fm)) {
		const parsed = parseAttachmentToken(token)
		if (parsed?.kind !== 'vault') {
			continue
		}
		const name = (parsed.linkpath.split('/').pop() ?? parsed.linkpath).toLowerCase()
		frontmatterNames.add(name)
		referencedAttachments.add(name)
		if (!resolves(parsed.linkpath)) {
			issues.push({ type: 'broken_link', path, message: `Attachment ${token} points to a file that does not exist.`, fix: 'Call removeAttachment for it.' })
		}
	}
	for (const match of content.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
		const name = ((match[1] ?? '').split('/').pop() ?? '').trim().toLowerCase()
		referencedAttachments.add(name)
		if (name !== '' && !frontmatterNames.has(name)) {
			issues.push({ type: 'attachment_mismatch', path, message: `The body embeds ${name}, but the position \`attachments\` property does not list it, so the media panel does not show it.`, fix: 'Tell the user; LucrJournal does not reconcile body embeds with the attachments property.' })
		}
	}
	return issues
}

function findOrphanSymbols(app: App): HealthIssue[] {
	return listKind(app, 'symbol')
		.filter((symbol) => AccountDomain.findByWikilink(app, typeof symbol.fm.account === 'string' ? symbol.fm.account : null) === undefined)
		.map((symbol) => ({
			type: 'broken_link' as const,
			path: symbol.file.path,
			message: `Account ${JSON.stringify(symbol.fm.account ?? null)} does not resolve to an account note.`,
			fix: 'Ask the user whether the account was deleted; the symbol and its positions are orphaned.',
		}))
}

function findOrphanAttachments(app: App, referencedAttachments: Set<string>): HealthIssue[] {
	for (const links of Object.values(app.metadataCache.resolvedLinks ?? {})) {
		for (const targetPath of Object.keys(links)) {
			referencedAttachments.add((targetPath.split('/').pop() ?? targetPath).toLowerCase())
		}
	}
	return app.vault
		.getFiles()
		.filter((file) => file.path.startsWith(`${LUCR_TRADE_ATTACHMENTS_DIR}/`) && !referencedAttachments.has(file.name.toLowerCase()))
		.map((file) => ({
			type: 'orphan_attachment' as const,
			path: file.path,
			message: 'No note references this image.',
			fix: 'Ask the user whether it can be deleted; the agent API does not delete attachment files.',
		}))
}

/** Links Obsidian itself could not resolve (inline text links, playbook headings) that the checks above did not already name. */
function findUnresolvedLinks(app: App, known: readonly HealthIssue[]): HealthIssue[] {
	return Object.entries(app.metadataCache.unresolvedLinks ?? {})
		.filter(([sourcePath]) => sourcePath.startsWith(`${LUCR_TRADE_ROOT_DIR}/`))
		.flatMap(([sourcePath, links]) => Object.keys(links)
			.filter((linkpath) => !known.some((issue) => issue.path === sourcePath && issue.message.includes(linkpath)))
			.map((linkpath) => ({
				type: 'broken_link' as const,
				path: sourcePath,
				message: `Links to [[${linkpath}]], which does not exist.`,
				fix: 'Tell the user; create the missing note, or let them remove the link.',
			})))
}
