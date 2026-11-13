import {
	buildAttachmentMonthFolder,
	buildAttachmentToken,
	buildAttachmentTimestamp,
	buildPositionAttachmentFileName,
	buildPositionAttachmentPath,
} from '../attachments/position-attachments'
import { LUCR_TRADE_ATTACHMENTS_DIR, LUCR_TRADE_ROOT_DIR } from '../constant'

import { agentError } from './errors'
import { loadDesktopModule, type NodeFs } from './node-runtime'

import type { App } from 'obsidian'

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const
const SOURCE_FIELDS = ['sourcePath', 'base64', 'fileName'] as const

/** One image handed to the plugin: a local file, or bytes plus a name. */
export type AttachmentSourceInput = string | {
	sourcePath?: string
	base64?: string
	fileName?: string
}

export type AttachmentSource =
	| { kind: 'path'; path: string; fileName: string }
	| { kind: 'base64'; base64: string; fileName: string }

export type AttachmentPlan = {
	path: string
	monthFolder: string
	token: string
	embed: string
	bytes: number
	data: Uint8Array
}

export type SavedAttachment = {
	path: string
	token: string
	embed: string
	bytes: number
}

/**
 * Normalize one `attachments` entry — a path string or `{ sourcePath }` /
 * `{ base64, fileName }` — into a source the planner can persist. Field-level
 * validation only; the bytes are read when the attachment is planned.
 */
export function parseAttachmentSource(raw: unknown, field: string): AttachmentSource {
	if (typeof raw === 'string') {
		const sourcePath = raw.trim()
		if (sourcePath === '') {
			throw agentError('INVALID_VALUE', `\`${field}\` is an empty path.`, 'Pass an absolute path to an image file.', { field })
		}
		return { kind: 'path', path: sourcePath, fileName: baseNameOf(sourcePath) }
	}

	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be an absolute image path or an object with \`sourcePath\` or \`base64\` + \`fileName\`, received ${describeValue(raw)}.`,
			'Pass "/Users/me/shot.png", or { "base64": "...", "fileName": "shot.png" }.',
			{ field, received: raw },
		)
	}

	const record = raw as Record<string, unknown>
	const unknownFields = Object.keys(record).filter((key) => !(SOURCE_FIELDS as readonly string[]).includes(key))
	if (unknownFields.length > 0) {
		throw agentError(
			'UNKNOWN_FIELD',
			`Unknown field(s) in \`${field}\`: ${unknownFields.map((name) => JSON.stringify(name)).join(', ')}.`,
			`Use only ${SOURCE_FIELDS.join(', ')}.`,
			{ field, received: unknownFields, candidates: [...SOURCE_FIELDS] },
		)
	}

	const sourcePath = readOptionalString(record, 'sourcePath', field)
	const base64 = readOptionalString(record, 'base64', field)
	const fileName = readOptionalString(record, 'fileName', field)
	if (sourcePath === null && base64 === null) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` provides neither \`sourcePath\` nor \`base64\`.`,
			'Pass `{ sourcePath: "/absolute/path.png" }`, or `{ base64: "<base64>", fileName: "shot.png" }`.',
			{ field },
		)
	}
	if (sourcePath !== null && base64 !== null) {
		throw agentError('INVALID_VALUE', `\`${field}\` provides both \`sourcePath\` and \`base64\`.`, 'Pass exactly one of them.', { field })
	}
	if (base64 !== null && fileName === null) {
		throw agentError('INVALID_VALUE', `\`${field}.base64\` needs \`fileName\` so the attachment keeps a usable name and extension.`, 'Add `fileName`, e.g. "chart.png".', { field: `${field}.fileName` })
	}

	const resolvedName = fileName ?? baseNameOf(sourcePath ?? '')
	return sourcePath === null
		? { kind: 'base64', base64: base64 ?? '', fileName: resolvedName }
		: { kind: 'path', path: sourcePath, fileName: resolvedName }
}

/**
 * Allocate the dated attachment path and read its bytes, using the exact naming
 * and collision rules of the editor and the position media panel.
 */
export function planAttachment(
	app: App,
	source: AttachmentSource,
	now: Date,
	reserved: ReadonlySet<string> = new Set(),
): AttachmentPlan {
	const { baseName, extension } = splitAttachmentName(source.fileName)
	if (baseName === '') {
		throw agentError(
			'INVALID_VALUE',
			`Cannot derive a file name from ${JSON.stringify(source.fileName)}.`,
			'Pass a name with an image extension, e.g. "chart.png".',
			{ field: 'fileName', received: source.fileName },
		)
	}
	if (!(IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
		throw agentError(
			'ATTACHMENT_UNSUPPORTED',
			`${JSON.stringify(source.fileName)} is not a supported image (${IMAGE_EXTENSIONS.join(', ')}).`,
			'Only attach chart or screenshot images; put other information into the note text.',
			{ field: 'fileName', received: source.fileName },
		)
	}

	const data = readAttachmentBytes(source)
	const timestamp = now.getTime()
	const stem = buildAttachmentTimestamp(timestamp)
	let suffix = 1
	let path = buildPositionAttachmentPath(buildPositionAttachmentFileName(stem, extension, baseName), timestamp)
	while (reserved.has(path) || app.vault.getAbstractFileByPath(path) !== null) {
		suffix += 1
		path = buildPositionAttachmentPath(buildPositionAttachmentFileName(stem, extension, `${baseName}-${suffix}`), timestamp)
	}

	const token = buildAttachmentToken(path, '')
	return { path, monthFolder: buildAttachmentMonthFolder(timestamp), token, embed: `!${token}`, bytes: data.byteLength, data }
}

/** Write a planned attachment into the vault, creating the dated folders first. */
export async function writeAttachment(app: App, plan: AttachmentPlan): Promise<void> {
	const folders = [LUCR_TRADE_ROOT_DIR, LUCR_TRADE_ATTACHMENTS_DIR, plan.monthFolder]
	for (const folder of folders) {
		if (app.vault.getAbstractFileByPath(folder) === null) {
			await app.vault.createFolder(folder)
		}
	}
	await app.vault.createBinary(plan.path, plan.data.buffer.slice(plan.data.byteOffset, plan.data.byteOffset + plan.data.byteLength) as ArrayBuffer)
}

/**
 * `saveAttachment` entry point: plan and write one image, returning the token a
 * note can embed. Shares the planner with `createPosition({ attachments })`.
 */
export async function persistAttachment(
	app: App,
	rawInput: unknown,
	now: Date = new Date(),
): Promise<SavedAttachment> {
	const { source: sourceInput, dryRun } = splitDryRun(rawInput)
	const source = parseAttachmentSource(sourceInput, 'attachment')
	const plan = planAttachment(app, source, now)
	if (!dryRun) {
		await writeAttachment(app, plan)
	}
	return { path: plan.path, token: plan.token, embed: plan.embed, bytes: plan.bytes }
}

/** `saveAttachment` also takes `dryRun` next to the image source fields. */
export function isAttachmentDryRun(rawInput: unknown): boolean {
	return splitDryRun(rawInput).dryRun
}

function splitDryRun(raw: unknown): { source: unknown; dryRun: boolean } {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return { source: raw, dryRun: false }
	}
	const { dryRun, ...source } = raw as Record<string, unknown>
	if (dryRun === undefined) {
		return { source: raw, dryRun: false }
	}
	if (dryRun !== undefined && dryRun !== null && typeof dryRun !== 'boolean') {
		throw agentError('INVALID_VALUE', '`dryRun` must be true or false.', 'Pass `dryRun: true` or omit it.', { field: 'dryRun', received: dryRun })
	}
	return { source, dryRun: dryRun === true }
}

function readAttachmentBytes(source: AttachmentSource): Uint8Array {
	if (source.kind === 'base64') {
		return decodeBase64(source.base64)
	}
	return readSourceFile(source.path)
}

function readSourceFile(sourcePath: string): Uint8Array {
	if (!sourcePath.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(sourcePath)) {
		throw agentError(
			'INVALID_VALUE',
			'`sourcePath` must be an absolute path to a local image file.',
			'Pass the absolute path on this computer, e.g. "/Users/me/shot.png"; use `base64` + `fileName` when only the bytes are available.',
			{ field: 'sourcePath', received: sourcePath },
		)
	}
	const fs = loadDesktopModule<NodeFs>('fs')
	if (fs === null) {
		throw agentError(
			'ATTACHMENT_UNSUPPORTED',
			'Attachments can only be read from a local file in the Obsidian desktop app.',
			'Pass `{ base64, fileName }` instead, or run the call on the desktop app.',
			{ field: 'sourcePath', received: sourcePath },
		)
	}
	if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
		throw agentError(
			'ATTACHMENT_NOT_FOUND',
			`\`sourcePath\` file ${JSON.stringify(sourcePath)} does not exist or is not a file.`,
			'Check the path (it must be readable by Obsidian on this computer).',
			{ field: 'sourcePath', received: sourcePath },
		)
	}
	const stats = fs.statSync(sourcePath)
	if (stats.size > MAX_ATTACHMENT_BYTES) {
		throw agentError(
			'INVALID_VALUE',
			`\`sourcePath\` file is ${stats.size} bytes, above the ${MAX_ATTACHMENT_BYTES} byte limit.`,
			'Resize or re-export the image and retry.',
			{ field: 'sourcePath', received: sourcePath },
		)
	}
	return fs.readFileSync(sourcePath) as Uint8Array
}

function decodeBase64(encoded: string): Uint8Array {
	let binary: string
	try {
		binary = atob(encoded.trim())
	} catch {
		throw agentError(
			'INVALID_VALUE',
			'`base64` is not valid base64.',
			'Pass the standard base64 encoding of the image bytes, without a data: URI prefix.',
			{ field: 'base64' },
		)
	}
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
	if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
		throw agentError(
			'INVALID_VALUE',
			`\`base64\` decodes to ${bytes.byteLength} bytes, above the ${MAX_ATTACHMENT_BYTES} byte limit.`,
			'Resize or re-export the image and retry.',
			{ field: 'base64' },
		)
	}
	return bytes
}

function splitAttachmentName(fileName: string): { baseName: string; extension: string } {
	const base = fileName.split(/[\\/]/).pop() ?? fileName
	const dotIndex = base.lastIndexOf('.')
	const extension = dotIndex === -1 ? '' : base.slice(dotIndex + 1).toLowerCase()
	// `#` and `^` start a heading / block reference inside a wikilink, so a file named with them cannot be linked.
	return { baseName: (dotIndex === -1 ? base : base.slice(0, dotIndex)).replace(/[#^]/g, '-').trim(), extension }
}

function baseNameOf(path: string): string {
	return path.split(/[\\/]/).pop() ?? path
}

function readOptionalString(record: Record<string, unknown>, field: string, parent: string): string | null {
	const value = record[field]
	if (value === undefined || value === null) {
		return null
	}
	if (typeof value !== 'string') {
		throw agentError(
			'INVALID_VALUE',
			`\`${parent}.${field}\` must be a string, received ${describeValue(value)}.`,
			`Pass \`${field}\` as a string or omit it.`,
			{ field: `${parent}.${field}`, received: value },
		)
	}
	const trimmed = value.trim()
	return trimmed === '' ? null : trimmed
}

function describeValue(value: unknown): string {
	if (value === null) {
		return 'null'
	}
	if (Array.isArray(value)) {
		return `an array ${JSON.stringify(value).slice(0, 80)}`
	}
	return `${typeof value} ${JSON.stringify(value)?.slice(0, 80) ?? typeof value}`
}
