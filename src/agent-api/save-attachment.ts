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
const ALLOWED_FIELDS = ['sourcePath', 'base64', 'fileName'] as const

export type SaveAttachmentInput = {
	sourcePath: string | null
	base64: string | null
	fileName: string | null
}

export type SavedAttachment = {
	path: string
	token: string
	embed: string
	bytes: number
}

/**
 * Parse `saveAttachment` input. Agents must hand over either a local image path
 * (desktop) or base64 bytes plus a file name; never a vault path, so the plugin
 * keeps owning the `attachments/YYYY-MM/` layout.
 */
export function parseSaveAttachmentInput(rawInput: unknown): SaveAttachmentInput {
	if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
		throw agentError(
			'INVALID_VALUE',
			`saveAttachment expects one object like { sourcePath: "/Users/me/shot.png" } or { base64: "...", fileName: "shot.png" }, received ${describeValue(rawInput)}.`,
			'Pass `{ sourcePath }` for a local image file, or `{ base64, fileName }` when only the bytes are available.',
		)
	}

	const record = rawInput as Record<string, unknown>
	const unknownFields = Object.keys(record).filter((key) => !(ALLOWED_FIELDS as readonly string[]).includes(key))
	if (unknownFields.length > 0) {
		throw agentError(
			'UNKNOWN_FIELD',
			`Unknown field(s) for saveAttachment: ${unknownFields.map((field) => JSON.stringify(field)).join(', ')}.`,
			`saveAttachment only accepts ${ALLOWED_FIELDS.join(', ')}.`,
			{ field: unknownFields[0], received: unknownFields, candidates: [...ALLOWED_FIELDS] },
		)
	}

	const sourcePath = readOptionalString(record, 'sourcePath')
	const base64 = readOptionalString(record, 'base64')
	const fileName = readOptionalString(record, 'fileName')
	if (sourcePath === null && base64 === null) {
		throw agentError(
			'INVALID_VALUE',
			'saveAttachment needs the image itself: neither `sourcePath` nor `base64` was provided.',
			'Pass `{ sourcePath: "/absolute/path.png" }`, or `{ base64: "<utf-8 base64>", fileName: "shot.png" }`.',
		)
	}
	if (sourcePath !== null && base64 !== null) {
		throw agentError(
			'INVALID_VALUE',
			'saveAttachment received both `sourcePath` and `base64`.',
			'Pass exactly one of them.',
			{ received: { sourcePath, base64Present: true } },
		)
	}
	if (base64 !== null && fileName === null) {
		throw agentError(
			'INVALID_VALUE',
			'`base64` needs `fileName` so the attachment keeps a usable name and extension.',
			'Add `fileName`, e.g. "chart.png".',
			{ field: 'fileName' },
		)
	}
	return { sourcePath, base64, fileName }
}

/**
 * Write one image into `LucrJournal/attachments/YYYY-MM/` using the same naming
 * and collision rules as the editor and `createPosition`, then return the token
 * an agent can paste into any note.
 */
export async function persistAttachment(app: App, input: SaveAttachmentInput, now: Date = new Date()): Promise<SavedAttachment> {
	const { baseName, extension } = resolveAttachmentName(input)
	if (!(IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
		throw agentError(
			'ATTACHMENT_UNSUPPORTED',
			`${JSON.stringify(input.fileName ?? input.sourcePath ?? baseName)} is not a supported image (${IMAGE_EXTENSIONS.join(', ')}).`,
			'Only attach chart or screenshot images; put other information into the note text.',
			{ field: 'fileName', received: input.fileName ?? input.sourcePath },
		)
	}

	const bytes = readBytes(input)
	const timestamp = now.getTime()
	const stem = buildAttachmentTimestamp(timestamp)
	let suffix = 1
	let path = buildPositionAttachmentPath(buildPositionAttachmentFileName(stem, extension, baseName), timestamp)
	while (app.vault.getAbstractFileByPath(path) !== null) {
		suffix += 1
		path = buildPositionAttachmentPath(buildPositionAttachmentFileName(stem, extension, `${baseName}-${suffix}`), timestamp)
	}

	await ensureAttachmentFolders(app, timestamp)
	await app.vault.createBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)

	const token = buildAttachmentToken(path, '')
	return { path, token, embed: `!${token}`, bytes: bytes.byteLength }
}

function resolveAttachmentName(input: SaveAttachmentInput): { baseName: string; extension: string } {
	const rawName = input.fileName ?? input.sourcePath ?? ''
	const fileName = rawName.split(/[\\/]/).pop() ?? rawName
	const dotIndex = fileName.lastIndexOf('.')
	const extension = dotIndex === -1 ? '' : fileName.slice(dotIndex + 1).toLowerCase()
	const baseName = (dotIndex === -1 ? fileName : fileName.slice(0, dotIndex)).trim()
	if (baseName === '') {
		throw agentError(
			'INVALID_VALUE',
			`Cannot derive a file name from ${JSON.stringify(rawName)}.`,
			'Pass `fileName` with a name and an image extension, e.g. "chart.png".',
			{ field: 'fileName', received: rawName },
		)
	}
	return { baseName, extension }
}

function readBytes(input: SaveAttachmentInput): Uint8Array {
	if (input.sourcePath !== null) {
		return readSourceFile(input.sourcePath)
	}
	return decodeBase64(input.base64 ?? '')
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
			'saveAttachment can only read a local file in the Obsidian desktop app.',
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

async function ensureAttachmentFolders(app: App, timestamp: number) {
	for (const folder of [LUCR_TRADE_ROOT_DIR, LUCR_TRADE_ATTACHMENTS_DIR, buildAttachmentMonthFolder(timestamp)]) {
		if (app.vault.getAbstractFileByPath(folder) === null) {
			await app.vault.createFolder(folder)
		}
	}
}

function readOptionalString(record: Record<string, unknown>, field: string): string | null {
	const value = record[field]
	if (value === undefined || value === null) {
		return null
	}
	if (typeof value !== 'string') {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be a string, received ${describeValue(value)}.`,
			`Pass \`${field}\` as a string or omit it.`,
			{ field, received: value },
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
