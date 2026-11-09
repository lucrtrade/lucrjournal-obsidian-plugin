import { TFile, TFolder, normalizePath, type App } from 'obsidian'

import { AccountDomain, PositionDomain, SymbolDomain } from '../domains'
import { PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR } from '../domains/core/entry-writer'
import { applyPositionBodyAdditions, POSITION_NOTES_SECTION } from '../domains/position/body'
import { parseWikilinkHeading } from '../utils'
import { extractSection, extractSections } from '../utils/markdown-sections'

import { AgentApiError, agentError } from './errors'
import { loadDesktopModule, type NodeFs } from './node-runtime'
import { LINK_KIND_CONFIG } from './resolve'
import { waitForValue } from './wait'

import type { PositionPlan } from './plan'

const METADATA_TIMEOUT_MS = 20_000
/** Codes where the notes are already written and only the read-back is late. */
const KEEP_WRITTEN_CODES = new Set<string>(['METADATA_TIMEOUT'])

export type PositionExecutionResult = {
	path: string
	created: string[]
	frontmatter: Record<string, unknown>
}

type ExecutionScope = {
	/** Paths that existed before this call started; they are never rolled back. */
	preexisting: ReadonlySet<string>
	createdFolders: string[]
}

/**
 * Write a plan produced by `planPosition`, reusing the same domain functions as
 * the UI, then read everything back. Any failure trashes every file this call
 * created so the vault is left untouched — including files a domain cascaded
 * before it threw, which a per-call "created" list would miss.
 */
export async function executePositionPlan(app: App, plan: PositionPlan): Promise<PositionExecutionResult> {
	const execution = plan.execution
	const scope: ExecutionScope = {
		preexisting: new Set(plan.files.map((file) => normalizePath(file.path)).filter((path) => app.vault.getAbstractFileByPath(path) !== null)),
		createdFolders: [],
	}
	const created: string[] = []
	const record = (paths: readonly string[]) => {
		for (const path of paths) {
			if (!created.includes(path)) {
				created.push(path)
			}
		}
	}

	try {
		for (const plannedFile of plan.files) {
			await ensureParentFolder(app, plannedFile.path, scope)
		}

		if (execution.createAccount !== null) {
			const result = await AccountDomain.createEntry(app, {
				platform: execution.createAccount.platformName ?? '',
				name: execution.accountDisplayName,
			})
			record(result.files.map((file) => file.path))
			expectPath('account', result.file.path, execution.createAccount.accountPath)
			if (execution.createAccount.platformPath !== null) {
				await waitForFrontmatter(app, execution.createAccount.platformPath, 'platform')
			}
			await waitForFrontmatter(app, execution.createAccount.accountPath, 'account')
		}

		if (execution.createSymbol) {
			const result = await SymbolDomain.ensureEntry(app, { account: execution.accountDisplayName, name: execution.symbolName })
			// Adopting a symbol another writer created in the meantime must never make it rollback-eligible.
			if (result.created) {
				record([result.entry.file.path])
			}
			expectPath('symbol', result.entry.file.path, execution.symbolPath)
			await waitForFrontmatter(app, execution.symbolPath, 'symbol')
		}

		for (const link of execution.links.filter((candidate) => candidate.create)) {
			const config = LINK_KIND_CONFIG[link.kind]
			const formValue: Record<string, string> = link.kind === 'news' ? { name: link.basename, source: '' } : { name: link.basename, description: '' }
			const createEntry = config.domain.createEntry.bind(config.domain) as unknown as (runtimeApp: App, value: Record<string, string>) => Promise<{ file: { path: string } }>
			const result = await createEntry(app, formValue)
			record([result.file.path])
			expectPath(`links.${link.kind}`, result.file.path, link.path)
			await waitForFrontmatter(app, link.path, config.entityKind)
		}

		for (const attachment of execution.attachments) {
			await app.vault.createBinary(attachment.path, readAttachmentBytes(attachment.source))
			record([attachment.path])
		}

		const positionResult = await PositionDomain.createEntry(
			app,
			{ account: execution.accountDisplayName, side: execution.side, symbol: execution.symbolName },
			execution.template === null ? undefined : { templateFilePath: execution.template.path, templateName: execution.template.name },
		)
		record(positionResult.files.map((file) => file.path))
		expectPath('position', positionResult.file.path, execution.positionPath)
		const positionFile = await waitForFrontmatter(app, execution.positionPath, 'position')

		await PositionDomain.updateFieldsAndAppendAttachments(
			app,
			positionFile,
			execution.patch,
			execution.attachments.map((attachment) => attachment.token),
		)

		if (execution.playbook !== null) {
			const playbookLink = `[[${execution.playbook.basename}]]`
			await app.fileManager.processFrontMatter(positionFile, (frontmatter: Record<string, unknown>) => {
				frontmatter.playbook = playbookLink
			})
		}

		const bodyLinks = execution.links.map((link) => ({ sectionTitle: LINK_KIND_CONFIG[link.kind].sectionTitle, basename: link.basename }))
		if ((execution.notes?.trim() ?? '') !== '' || bodyLinks.length > 0) {
			await app.vault.process(positionFile, (content) => applyPositionBodyAdditions(content, { notes: execution.notes, links: bodyLinks }))
		}

		const frontmatter = await verifyPosition(app, plan, positionFile)
		return {
			path: positionFile.path,
			created: created.filter((path) => app.vault.getAbstractFileByPath(path) instanceof TFile),
			frontmatter,
		}
	} catch (error: unknown) {
		throw await rollback(app, plan, scope, error)
	}
}

async function ensureParentFolder(app: App, filePath: string, scope: ExecutionScope) {
	const segments = normalizePath(filePath).split('/').slice(0, -1)
	for (let index = 1; index <= segments.length; index += 1) {
		const folderPath = segments.slice(0, index).join('/')
		if (app.vault.getAbstractFileByPath(folderPath) === null) {
			await app.vault.createFolder(folderPath)
			scope.createdFolders.push(folderPath)
		}
	}
}

function readAttachmentBytes(source: string): ArrayBuffer {
	const fs = loadDesktopModule<NodeFs>('fs')
	if (fs === null) {
		throw agentError('ATTACHMENT_UNSUPPORTED', 'Attachments can only be imported on Obsidian desktop.', 'Drop `attachments` and retry.', { field: 'attachments' })
	}
	const bytes = fs.readFileSync(source) as Uint8Array
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function expectPath(what: string, actual: string, expected: string) {
	if (actual !== expected) {
		throw agentError(
			'POST_WRITE_VERIFY_FAILED',
			`The ${what} note was written to ${actual}, but the plan expected ${expected} (the vault changed while writing).`,
			'Retry the same call once; the plan is recomputed from the current vault.',
			{ details: { what, actual, expected } },
		)
	}
}

async function waitForFrontmatter(app: App, path: string, lucrType: string): Promise<TFile> {
	const file = await waitForValue(() => {
		const candidate = app.vault.getAbstractFileByPath(path)
		if (!(candidate instanceof TFile)) {
			return null
		}
		const frontmatter = app.metadataCache.getFileCache(candidate)?.frontmatter
		return frontmatter?.lucr_type === lucrType ? candidate : null
	}, METADATA_TIMEOUT_MS)
	if (file === null) {
		throw agentError(
			'METADATA_TIMEOUT',
			`Obsidian did not index ${path} as a ${lucrType} note within ${METADATA_TIMEOUT_MS / 1000}s.`,
			'Obsidian may be busy (large vault or sync in progress). The written notes are kept; wait a few seconds and check them in Obsidian before retrying.',
			{ details: { path } },
		)
	}
	return file
}

type VerificationState = {
	indexed: boolean
	mismatches: string[]
	frontmatter: Record<string, unknown>
}

async function verifyPosition(app: App, plan: PositionPlan, positionFile: TFile): Promise<Record<string, unknown>> {
	const execution = plan.execution
	const readState = (): VerificationState => {
		const raw = app.metadataCache.getFileCache(positionFile)?.frontmatter
		if (raw === undefined) {
			return { indexed: false, mismatches: ['frontmatter is not indexed yet'], frontmatter: {} }
		}
		const refinedValue = PositionDomain.refine(raw)
		if (refinedValue === null) {
			return { indexed: true, mismatches: ['frontmatter does not pass the position schema'], frontmatter: { ...raw } }
		}
		const refined: Record<string, unknown> = { ...refinedValue }
		const mismatches = Object.entries(execution.expectedFrontmatter).flatMap(([field, expected]) => {
			const actual = refined[field] ?? null
			return JSON.stringify(actual) === JSON.stringify(expected)
				? []
				: [`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`]
		})
		const symbolEntry = SymbolDomain.resolveEntry(app, refined)
		if (symbolEntry?.fm.name !== execution.symbolName) {
			mismatches.push(`symbol link does not resolve to ${execution.symbolName}`)
		}
		return { indexed: true, mismatches, frontmatter: refined }
	}

	const settled = await waitForValue(() => {
		const state = readState()
		return state.indexed && state.mismatches.length === 0 ? state : null
	}, METADATA_TIMEOUT_MS)
	const state = settled ?? readState()
	if (!state.indexed) {
		throw agentError(
			'METADATA_TIMEOUT',
			`Obsidian did not index ${positionFile.path} within ${METADATA_TIMEOUT_MS / 1000}s, so the written position could not be read back.`,
			'Obsidian may be busy (large vault or sync in progress). The written notes are kept; wait a few seconds and check them in Obsidian before retrying.',
			{ details: { path: positionFile.path } },
		)
	}

	const content = await app.vault.read(positionFile)
	const bodyMismatches = execution.links.flatMap((link) => {
		const section = extractSection(content, LINK_KIND_CONFIG[link.kind].sectionTitle)
		const linked = extractSections(section.body, 2).some((heading) => parseWikilinkHeading(heading.title)?.linkpath === link.basename)
		const target = app.metadataCache.getFirstLinkpathDest(link.basename, positionFile.path)
		return linked && target?.path === link.path ? [] : [`link [[${link.basename}]] missing from "${LINK_KIND_CONFIG[link.kind].sectionTitle}" or not resolving to ${link.path}`]
	})
	const notes = execution.notes?.trim() ?? ''
	if (notes !== '' && !extractSection(content, POSITION_NOTES_SECTION).body.includes(notes)) {
		bodyMismatches.push('notes are missing from the Notes section')
	}
	if (execution.playbook !== null && app.metadataCache.getFirstLinkpathDest(execution.playbook.basename, positionFile.path)?.path !== execution.playbook.path) {
		bodyMismatches.push(`playbook [[${execution.playbook.basename}]] does not resolve to ${execution.playbook.path}`)
	}

	const mismatches = [...state.mismatches, ...bodyMismatches]
	if (mismatches.length > 0) {
		throw agentError(
			'POST_WRITE_VERIFY_FAILED',
			`The position was written but reading it back did not match the plan: ${mismatches.join('; ')}.`,
			'All files from this call were moved to trash. Report the mismatch to the user; do not retry with the same input more than once.',
			{ details: { mismatches } },
		)
	}
	return state.frontmatter
}

async function rollback(app: App, plan: PositionPlan, scope: ExecutionScope, cause: unknown): Promise<AgentApiError> {
	const causeError = toAgentApiError(cause)
	if (KEEP_WRITTEN_CODES.has(causeError.payload.code)) {
		// The notes are on disk; deleting them because indexing is slow would destroy a good record.
		return new AgentApiError({
			...causeError.payload,
			message: `${causeError.payload.message} The written files were kept in the vault; nothing was deleted.`,
			fix: 'Wait for Obsidian to finish indexing, then check the created notes before retrying; retry only if a note is incomplete.',
			details: { ...causeError.payload.details, keptPaths: plan.files.map((file) => file.path) },
		})
	}

	// Deepest paths first so a created folder is empty by the time it is trashed.
	const targets = [...new Set([...plan.files.map((file) => file.path), ...scope.createdFolders])]
		.filter((path) => !scope.preexisting.has(path))
		.sort((left, right) => right.split('/').length - left.split('/').length)
	const leftovers: string[] = []
	let removed = 0
	for (const path of targets) {
		const file = app.vault.getAbstractFileByPath(path)
		if (file === null) {
			continue
		}
		if (file instanceof TFolder && file.children.length > 0) {
			continue
		}
		try {
			await app.fileManager.trashFile(file)
			removed += 1
		} catch {
			leftovers.push(path)
		}
	}

	if (leftovers.length > 0) {
		return agentError(
			'ROLLBACK_FAILED',
			`${causeError.payload.message} Rolling back also failed, these files are still in the vault: ${leftovers.join(', ')}.`,
			'Tell the user exactly which files were left behind so they can delete them; do not retry until they are removed.',
			{ details: { cause: causeError.payload, leftovers } },
		)
	}

	return new AgentApiError({
		...causeError.payload,
		message: `${causeError.payload.message} ${removed === 0 ? 'Nothing was written.' : `All ${removed} file(s) created by this call were moved to trash.`}`,
	})
}

function toAgentApiError(cause: unknown): AgentApiError {
	if (cause instanceof AgentApiError) {
		return new AgentApiError({ ...cause.payload })
	}
	const message = cause instanceof Error ? cause.message : String(cause)
	if (message === PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR) {
		return agentError('NAME_CONFLICT', 'A note with the same file name was created while writing.', 'Retry the same call once; the plan is recomputed from the current vault.')
	}
	return agentError(
		'INTERNAL_ERROR',
		`Writing the position failed unexpectedly: ${message}.`,
		'Report this to the user; run `obsidian dev:errors` in the same vault for the stack trace.',
		{ details: { stack: cause instanceof Error ? cause.stack?.split('\n').slice(0, 6).join('\n') : undefined } },
	)
}
