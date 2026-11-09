import { TFile, TFolder, normalizePath, type App, type TAbstractFile } from 'obsidian'

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

const METADATA_TIMEOUT_MS = 5000

export type PositionExecutionResult = {
	path: string
	created: string[]
	frontmatter: Record<string, unknown>
}

/**
 * Write a plan produced by `planPosition`, reusing the same domain functions as
 * the UI, then read everything back. Any failure trashes every file created by
 * this call so the vault is left untouched.
 */
export async function executePositionPlan(app: App, plan: PositionPlan): Promise<PositionExecutionResult> {
	const execution = plan.execution
	const createdFiles: TAbstractFile[] = []
	const track = (path: string) => {
		const file = app.vault.getAbstractFileByPath(path)
		if (file !== null && !createdFiles.includes(file)) {
			createdFiles.push(file)
		}
		return file
	}

	try {
		for (const plannedFile of plan.files) {
			await ensureParentFolder(app, plannedFile.path, track)
		}

		if (execution.createAccount !== null) {
			const result = await AccountDomain.createEntry(app, {
				platform: execution.createAccount.platformName ?? '',
				name: execution.accountDisplayName,
			})
			for (const file of result.files) {
				track(file.path)
			}
			expectPath('account', result.file.path, execution.createAccount.accountPath)
			if (execution.createAccount.platformPath !== null) {
				await waitForFrontmatter(app, execution.createAccount.platformPath, 'platform')
			}
			await waitForFrontmatter(app, execution.createAccount.accountPath, 'account')
		}

		if (execution.createSymbol) {
			const result = await SymbolDomain.ensureEntry(app, { account: execution.accountDisplayName, name: execution.symbolName })
			track(result.entry.file.path)
			expectPath('symbol', result.entry.file.path, execution.symbolPath)
			await waitForFrontmatter(app, execution.symbolPath, 'symbol')
		}

		for (const link of execution.links.filter((candidate) => candidate.create)) {
			const config = LINK_KIND_CONFIG[link.kind]
			const formValue: Record<string, string> = link.kind === 'news' ? { name: link.basename, source: '' } : { name: link.basename, description: '' }
			const createEntry = config.domain.createEntry.bind(config.domain) as unknown as (runtimeApp: App, value: Record<string, string>) => Promise<{ file: { path: string } }>
			const result = await createEntry(app, formValue)
			track(result.file.path)
			expectPath(`links.${link.kind}`, result.file.path, link.path)
			await waitForFrontmatter(app, link.path, config.entityKind)
		}

		for (const attachment of execution.attachments) {
			await app.vault.createBinary(attachment.path, readAttachmentBytes(attachment.source))
			track(attachment.path)
		}

		const positionResult = await PositionDomain.createEntry(
			app,
			{ account: execution.accountDisplayName, side: execution.side, symbol: execution.symbolName },
			execution.template === null ? undefined : { templateFilePath: execution.template.path, templateName: execution.template.name },
		)
		for (const file of positionResult.files) {
			track(file.path)
		}
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
			created: createdFiles.filter((file): file is TFile => file instanceof TFile).map((file) => file.path),
			frontmatter,
		}
	} catch (error: unknown) {
		throw await rollback(app, createdFiles, error)
	}
}

async function ensureParentFolder(app: App, filePath: string, track: (path: string) => unknown) {
	const segments = normalizePath(filePath).split('/').slice(0, -1)
	for (let index = 1; index <= segments.length; index += 1) {
		const folderPath = segments.slice(0, index).join('/')
		if (app.vault.getAbstractFileByPath(folderPath) === null) {
			await app.vault.createFolder(folderPath)
			track(folderPath)
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
			'Obsidian may be busy (large vault or sync in progress). Wait a few seconds and retry the same call.',
			{ details: { path } },
		)
	}
	return file
}

async function verifyPosition(app: App, plan: PositionPlan, positionFile: TFile): Promise<Record<string, unknown>> {
	const execution = plan.execution
	const mismatchesNow = (): { mismatches: string[]; frontmatter: Record<string, unknown> } => {
		const raw = (app.metadataCache.getFileCache(positionFile)?.frontmatter ?? {}) as Record<string, unknown>
		const refined = PositionDomain.refine(raw) as Record<string, unknown> | null
		if (refined === null) {
			return { mismatches: ['frontmatter does not pass the position schema'], frontmatter: raw }
		}
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
		return { mismatches, frontmatter: refined }
	}

	const settled = await waitForValue(() => {
		const state = mismatchesNow()
		return state.mismatches.length === 0 ? state : null
	}, METADATA_TIMEOUT_MS)
	const state = settled ?? mismatchesNow()

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

async function rollback(app: App, createdFiles: TAbstractFile[], cause: unknown): Promise<AgentApiError> {
	const leftovers: string[] = []
	for (const file of [...createdFiles].reverse()) {
		try {
			if (file instanceof TFolder && file.children.length > 0) {
				continue
			}
			await app.fileManager.trashFile(file)
		} catch {
			leftovers.push(file.path)
		}
	}

	const causeError = toAgentApiError(cause, createdFiles.length)
	if (leftovers.length > 0) {
		return agentError(
			'ROLLBACK_FAILED',
			`${causeError.payload.message} Rolling back also failed, these files are still in the vault: ${leftovers.join(', ')}.`,
			'Tell the user exactly which files were left behind so they can delete them; do not retry until they are removed.',
			{ details: { cause: causeError.payload, leftovers } },
		)
	}
	return causeError
}

function toAgentApiError(cause: unknown, createdCount: number): AgentApiError {
	const rolledBack = createdCount === 0 ? 'Nothing was written.' : `All ${createdCount} file(s) created by this call were moved to trash.`
	if (cause instanceof AgentApiError) {
		return new AgentApiError({ ...cause.payload, message: `${cause.payload.message} ${rolledBack}` })
	}
	const message = cause instanceof Error ? cause.message : String(cause)
	if (message === PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR) {
		return agentError('NAME_CONFLICT', `A note with the same file name was created while writing. ${rolledBack}`, 'Retry the same call once; the plan is recomputed from the current vault.')
	}
	return agentError(
		'INTERNAL_ERROR',
		`Writing the position failed unexpectedly: ${message}. ${rolledBack}`,
		'Report this to the user; run `obsidian dev:errors` in the same vault for the stack trace.',
		{ details: { stack: cause instanceof Error ? cause.stack?.split('\n').slice(0, 6).join('\n') : undefined } },
	)
}
