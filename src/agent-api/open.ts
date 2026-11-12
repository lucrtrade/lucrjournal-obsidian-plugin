import { Platform, TFile, normalizePath, type App, type WorkspaceLeaf } from 'obsidian'

import { LUCR_POSITION_VIEW_TYPE } from '../constant'
import { PositionDomain } from '../domains'
import { getToken, requiresJournalUpgrade } from '../session/storage'
import { createMarkdownFileViewState, createPlaybookFileViewState, createPositionFileViewState } from '../views/domain-file-routing'

import { readArgs, readRequiredText } from './args'
import { agentError, formatCandidates } from './errors'
import { locateAny } from './locate'
import { waitForValue } from './wait'

const OPEN_TIMEOUT_MS = 5000
export const OPEN_POSITION_URI_ACTION = 'lucrjournal-open-position'

const inFlightOpens = new Map<string, Promise<OpenPositionResult>>()

type OpenPositionResult = { data: { path: string; viewType: string; reusedTab: boolean } }

/**
 * Commands that bring Obsidian to the foreground on the position: the OS
 * dispatches the `obsidian://` URI, which activates the vault window and runs the
 * plugin's protocol handler; the chained `obsidian eval` confirms the result.
 *
 * The URI carries the vault-relative path as `file`: Obsidian reserves `path` for
 * absolute filesystem paths and shows a blocking "Vault not found" dialog otherwise.
 */
type OpenerPlatform = { isWin: boolean; isMacOS: boolean }

export function buildOpenPositionCommands(
	vaultId: string,
	path: string,
	pluginId: string,
	platform: OpenerPlatform = Platform,
) {
	const uri = `obsidian://${OPEN_POSITION_URI_ACTION}?vault=${encodeUriParam(vaultId)}&file=${encodeUriParam(path)}`
	const code = `app.plugins.plugins.${pluginId}.api.openPosition({ path: '${toShellSafeJsString(path)}' })`
	// Git Bash on Windows has no reliable `start`; PowerShell's Start-Process is always there.
	const bashActivate = platform.isWin
		? `powershell.exe -NoProfile -Command "Start-Process '${uri}'"`
		: platform.isMacOS
			// `open <uri>` dispatches the link but leaves focus to macOS; `open -a` only helps when the
			// bundle is named exactly "Obsidian", so it is best-effort and must never break the
			// `obsidian eval` verification that follows.
			? `open "${uri}" && (open -a Obsidian 2>/dev/null || true)`
			: `xdg-open "${uri}"`
	return {
		uri,
		bash: `${bashActivate} && obsidian vault=${vaultId} eval code="${code}"`,
		powershell: `Start-Process '${uri}'; obsidian vault=${vaultId} eval "code=${code}"`,
	}
}

/** encodeURIComponent leaves `'` and other sub-delims as-is; the URI is wrapped in single quotes in shells. */
function encodeUriParam(value: string): string {
	return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** Single-quoted JS string content that also survives double-quoted shell and PowerShell strings. */
function toShellSafeJsString(value: string): string {
	return [...value].map((character) => (/[\w./ -]/.test(character) ? character : `\\u{${(character.codePointAt(0) ?? 0).toString(16)}}`)).join('')
}

const ALLOWED_FIELDS = ['path'] as const

/** Open (or focus) the position view; concurrent calls for the same path share one open. */
export async function openPositionView(app: App, rawInput: unknown): Promise<OpenPositionResult> {
	const path = readPath(rawInput)
	const inFlight = inFlightOpens.get(path)
	if (inFlight !== undefined) {
		return await inFlight
	}
	const pending = openPositionViewOnce(app, path)
	inFlightOpens.set(path, pending)
	try {
		return await pending
	} finally {
		inFlightOpens.delete(path)
	}
}

async function openPositionViewOnce(app: App, path: string): Promise<OpenPositionResult> {
	const file = app.vault.getAbstractFileByPath(path)
	if (!(file instanceof TFile)) {
		throw agentError(
			'POSITION_NOT_FOUND',
			`No file exists at ${JSON.stringify(path)}.`,
			'Pass the exact `data.path` returned by createPosition (vault-relative, e.g. "LucrJournal/positions/POS-00012.md").',
			{ field: 'path', received: path },
		)
	}

	const isPosition = await waitForValue(() => PositionDomain.refine(app.metadataCache.getFileCache(file)?.frontmatter ?? null) === null ? null : true, OPEN_TIMEOUT_MS)
	if (isPosition === null) {
		throw agentError(
			'POSITION_NOT_FOUND',
			`${path} is not a LucrJournal position note (missing or invalid position frontmatter).`,
			'Pass the `data.path` returned by createPosition.',
			{ field: 'path', received: path },
		)
	}

	const existingLeaf = app.workspace.getLeavesOfType(LUCR_POSITION_VIEW_TYPE).find((leaf) => leafFilePath(leaf) === path)
	const createdLeaf = existingLeaf === undefined
	const leaf = existingLeaf ?? app.workspace.getLeaf('tab')
	try {
		if (createdLeaf) {
			await leaf.setViewState(createPositionFileViewState(path))
		}
		app.workspace.setActiveLeaf(leaf, { focus: true })
		await app.workspace.revealLeaf(leaf)
	} catch (error: unknown) {
		// A tab we opened ourselves must not survive as an empty editor.
		if (createdLeaf) {
			leaf.detach()
		}
		throw error
	}

	const ready = await waitForValue(() => (leaf.view.getViewType() === LUCR_POSITION_VIEW_TYPE && leafFilePath(leaf) === path ? true : null), OPEN_TIMEOUT_MS)
	if (ready === null) {
		if (createdLeaf) {
			leaf.detach()
		}
		throw agentError(
			'OPEN_FAILED',
			`Obsidian did not show ${path} in the position view (the tab shows view type ${JSON.stringify(leaf.view.getViewType())} for ${JSON.stringify(leafFilePath(leaf))}).`,
			'Make sure the LucrJournal plugin is enabled and the Obsidian window is not showing a modal, then retry openPosition once.',
			{ field: 'path', received: path },
		)
	}

	// The domain views render a sign-in / upgrade screen instead of the position when access is gated.
	if (getToken(app) === null || requiresJournalUpgrade(app)) {
		throw agentError(
			'JOURNAL_LOCKED',
			`${path} is saved and its tab is open, but LucrJournal shows its sign-in / upgrade screen instead of the position because the journal is not unlocked in this vault.`,
			'Tell the user the position was recorded and that they need to sign in to LucrJournal (or upgrade) to view it. Do not create the position again.',
			{ field: 'path', received: path },
		)
	}

	return { data: { path, viewType: LUCR_POSITION_VIEW_TYPE, reusedTab: existingLeaf !== undefined } }
}

/** Show any LucrJournal entry to the user: positions and playbooks in their own views, everything else as a note. */
export async function openEntryView(app: App, rawInput: unknown) {
	const args = readArgs('open', rawInput, ['entry'])
	const entry = locateAny(app, readRequiredText(args, 'entry', 'Pass `entry` as a vault-relative path or a unique note name.'), 'entry')
	if (entry.kind === 'position') {
		const opened = await openPositionView(app, { path: entry.file.path })
		return { data: { kind: entry.kind, ...opened.data } }
	}
	const viewState = entry.kind === 'playbook' ? createPlaybookFileViewState(entry.file.path) : createMarkdownFileViewState(entry.file.path)
	const leaf = app.workspace.getLeaf('tab')
	try {
		await leaf.setViewState(viewState)
		app.workspace.setActiveLeaf(leaf, { focus: true })
		await app.workspace.revealLeaf(leaf)
	} catch (error: unknown) {
		leaf.detach()
		throw agentError('OPEN_FAILED', `Obsidian could not open ${entry.file.path}: ${error instanceof Error ? error.message : String(error)}.`, 'Make sure Obsidian is not showing a modal, then retry once.', { field: 'entry', received: entry.file.path })
	}
	return { data: { kind: entry.kind, path: entry.file.path, viewType: viewState.type, reusedTab: false } }
}

function readPath(rawInput: unknown): string {
	if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
		throw agentError('INVALID_VALUE', 'openPosition expects an object like { path: "LucrJournal/positions/POS-00012.md" }.', 'Pass `{ path: data.path }` from the createPosition result.')
	}
	const record = rawInput as Record<string, unknown>
	const unknownFields = Object.keys(record).filter((key) => !(ALLOWED_FIELDS as readonly string[]).includes(key))
	if (unknownFields.length > 0) {
		throw agentError('UNKNOWN_FIELD', `Unknown field(s) for openPosition: ${formatCandidates(unknownFields)}.`, 'openPosition only accepts `path`.', { field: unknownFields[0], candidates: [...ALLOWED_FIELDS] })
	}
	if (typeof record.path !== 'string' || record.path.trim() === '') {
		throw agentError('INVALID_VALUE', '`path` must be a non-empty string.', 'Pass `{ path: data.path }` from the createPosition result.', { field: 'path', received: record.path })
	}
	const trimmedPath = record.path.trim()
	// A leading slash or `..` means the caller is not passing a vault-relative path; normalizePath would hide that.
	if (trimmedPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmedPath) || trimmedPath.split(/[\\/]/).includes('..')) {
		throw agentError(
			'INVALID_VALUE',
			`\`path\` must be vault-relative, received ${JSON.stringify(trimmedPath)}.`,
			'Pass `{ path: data.path }` exactly as createPosition returned it (e.g. "LucrJournal/positions/POS-00012.md"), with no leading slash and no "..".',
			{ field: 'path', received: trimmedPath },
		)
	}
	return normalizePath(trimmedPath)
}

function leafFilePath(leaf: WorkspaceLeaf): string | null {
	const view = leaf.view as { file?: TFile | null }
	return view.file?.path ?? null
}
