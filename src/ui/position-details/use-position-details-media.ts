import { Notice, TFile, type App } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
	buildPositionAttachmentOcrFieldPatch,
	detectPositionAttachmentOcr,
	hasRecognizedPositionAttachmentOcrResult,
	listRecognizedPositionAttachmentOcrValues,
	mergePositionAttachmentOcrResults,
	preparePositionAttachmentOcr,
	type PositionAttachmentOcrDraft,
	type PositionAttachmentOcrResult,
} from '../../attachments/ocr'
import {
	applyAttachmentTokensToFrontmatter,
	buildAttachmentToken,
	buildAttachmentMonthFolder,
	buildAttachmentTimestamp,
	buildPositionAttachmentFileName,
	buildPositionAttachmentPath,
	isSupportedImageMimeType,
	parseAttachmentToken,
	resolveImageExtensionFromMimeType,
	resolvePositionAttachments,
} from '../../attachments/position-attachments'
import { LUCR_TRADE_ATTACHMENTS_DIR, LUCR_TRADE_ROOT_DIR } from '../../constant'
import { PositionDomain } from '../../domains'
import { t } from '../../lang/helpers'
import { createLogger } from '../../logger'
import { useChartIframe } from '../chart/use-chart-iframe'

import { checkAttachmentDependencies } from './attachment-dependency-checker'

import type { PositionAttachmentOcrProgress } from '../../attachments/ocr-runtime'
import type { Position } from '../../domains'
import type { en } from '../../lang/locale/en'
import type LucrJournalPlugin from '../../main'

const logger = createLogger('position-media')

export type PositionAttachment = {
	extension: string | null
	fileSizeBytes: number | null
	id: string
	kind: 'external' | 'vault'
	label: string
	path: string
	referenceKey: string
	src: string
	token: string
}

type UsePositionDetailsMediaParams = {
	app: App
	onPositionUpdated: (position: Position) => void
	plugin: LucrJournalPlugin
	position: Position
	positionFile: TFile | null
}

type PendingAttachmentFile = {
	buffer: ArrayBuffer
	extension: string
	originalName: string
}

type ClipboardPayload =
	| {
		buffer: ArrayBuffer
		kind: 'image'
		mimeType: string
	}
	| {
		kind: 'text'
		text: string
	}

type ClipboardReadDiagnostics = {
	browserItemTypes: string[][]
	fileCount: number
	nativeFormats: string[]
	nativeImageSize: { height: number; width: number } | null
	selectedFormat: string | null
	selectedSource: string | null
	sourceCandidates: string[]
}

type ClipboardReadResult = {
	diagnostics: ClipboardReadDiagnostics
	payloads: ClipboardPayload[]
}

class ClipboardReadError extends Error {
	readonly diagnostics: ClipboardReadDiagnostics

	constructor(message: string, diagnostics: ClipboardReadDiagnostics) {
		super(message)
		this.name = 'ClipboardReadError'
		this.diagnostics = diagnostics
	}
}

export function usePositionDetailsMedia({
	app,
	onPositionUpdated,
	plugin,
	position,
	positionFile,
}: UsePositionDetailsMediaParams) {
	const [attachments, setAttachments] = useState<PositionAttachment[]>([])
	const [pendingAttachmentOcrResult, setPendingAttachmentOcrResult] = useState<PositionAttachmentOcrResult | null>(null)
	const [pendingAttachmentOcrFile, setPendingAttachmentOcrFile] = useState<PendingAttachmentFile | null>(null)
	const [isApplyingAttachmentOcr, setIsApplyingAttachmentOcr] = useState(false)
	const [isImportingAttachmentOcr, setIsImportingAttachmentOcr] = useState(false)
	const [isSavingAttachment, setIsSavingAttachment] = useState(false)
	const [isDeletingAttachment, setIsDeletingAttachment] = useState(false)

	const handleSnapshotRef = useRef<(base64: string) => void>(null!)
	handleSnapshotRef.current = (base64: string) => {
		if (positionFile === null) {
			return
		}
		setIsSavingAttachment(true)
		void persistPositionAttachments({
			app,
			files: [{ buffer: base64ToArrayBuffer(base64), extension: 'png', originalName: 'chart-snapshot' }],
			position,
			positionFile,
		})
			.then((createdAttachments) => {
				setAttachments((previous) => [...previous, ...createdAttachments])
				new Notice(t('POSITION_DETAILS_ATTACHMENT_CAPTURE_SUCCESS'))
			})
			.catch((error: unknown) => {
				logger.warn('failed to save chart snapshot attachment', {
					error,
					positionFile: positionFile.path,
				})
				new Notice(t('POSITION_DETAILS_ATTACHMENT_CAPTURE_FAILED'))
			})
			.finally(() => {
				setIsSavingAttachment(false)
			})
	}

	const onSnapshot = useCallback((base64: string) => {
		handleSnapshotRef.current(base64)
	}, [])

	const { iframeRef: chartIframeRef, isChartAvailable, isChartReady } = useChartIframe({
		plugin,
		position,
		positionFile,
		onSnapshot,
	})

	useEffect(() => {
		setAttachments(resolveAttachmentItems(app, positionFile, position))
	}, [app, position, positionFile])

	useEffect(() => {
		setPendingAttachmentOcrResult(null)
		setPendingAttachmentOcrFile(null)
	}, [positionFile?.path])

	useEffect(() => {
		return () => {
			if (pendingAttachmentOcrResult?.image_url?.startsWith('blob:')) {
				URL.revokeObjectURL(pendingAttachmentOcrResult.image_url)
			}
		}
	}, [pendingAttachmentOcrResult?.image_url])

	const deleteAttachment = async (attachment: PositionAttachment) => {
		if (positionFile === null) {
			return false
		}

		setIsDeletingAttachment(true)

		try {
			const { deletedFile } = await removePositionAttachment({
				app,
				attachment,
				positionFile,
			})
			setAttachments((previous) => previous.filter((item) => item.id !== attachment.id))
			new Notice(t('POSITION_DETAILS_ATTACHMENT_DELETE_SUCCESS'))

			logger.debug('removed position attachment', {
				attachmentPath: attachment.path,
				deletedFile,
				positionFile: positionFile.path,
			})

			return true
		} catch (error: unknown) {
			logger.warn('failed to delete position attachment', {
				attachmentPath: attachment.path,
				error,
				positionFile: positionFile.path,
			})
			new Notice(t('POSITION_DETAILS_ATTACHMENT_DELETE_FAILED'))
			return false
		} finally {
			setIsDeletingAttachment(false)
		}
	}

	const saveSelectedAttachments = async (files: FileList | File[] | null): Promise<boolean> => {
		if (positionFile === null) {
			return false
		}

		const currentPositionFile = positionFile
		const imageCount = countSelectedImageFiles(files)
		if (imageCount === 0) {
			return false
		}

		return await savePendingAttachments({
			files: () => readSelectedImageFiles(files),
			logContext: {
				imageCount,
				positionFile: currentPositionFile.path,
			},
			logMessage: 'failed to save selected position attachments',
			positionFile: currentPositionFile,
		})
	}

	const savePendingAttachments = async ({
		files,
		logContext,
		logMessage,
		positionFile,
	}: {
		files: () => Promise<PendingAttachmentFile[]>
		logContext: Record<string, unknown>
		logMessage: string
		positionFile: TFile
	}): Promise<boolean> => {
		setIsSavingAttachment(true)

		try {
			const imageFiles = await files()
			if (imageFiles.length === 0) {
				return false
			}

			const createdAttachments = await persistPositionAttachments({
				app,
				files: imageFiles,
				position,
				positionFile,
			})
			setAttachments((previous) => [...previous, ...createdAttachments])
			new Notice(t('POSITION_DETAILS_ATTACHMENT_CAPTURE_SUCCESS'))
			return true
		} catch (error: unknown) {
			logger.warn(logMessage, { error, ...logContext })
			new Notice(t('POSITION_DETAILS_ATTACHMENT_CAPTURE_FAILED'))
			return false
		} finally {
			setIsSavingAttachment(false)
		}
	}

	const importAttachmentOcrFromFiles = async (
		files: FileList | File[] | null,
		source: 'modal-drop' | 'modal-upload',
	): Promise<boolean> => {
		if (positionFile === null) {
			return false
		}

		setIsImportingAttachmentOcr(true)

		try {
			const imageFile = await readFirstSelectedImageFile(files)
			logger.debug('resolved attachment OCR import files', {
				file: imageFile === null
					? null
					: {
						byteLength: imageFile.buffer.byteLength,
						extension: imageFile.extension,
					},
				positionFile: positionFile.path,
				source,
			})
			if (imageFile === null) {
				logger.error('attachment OCR import did not receive any image files', {
					positionFile: positionFile.path,
					source,
				})
				new Notice(t('POSITION_DETAILS_ATTACHMENT_PASTE_EMPTY'))
				return false
			}

			const ocrResult = await runAttachmentOcr({
				files: [imageFile],
				positionFile,
			})
			if (ocrResult === null) {
				return false
			}

			setPendingAttachmentOcrResult(ocrResult)
			setPendingAttachmentOcrFile(imageFile)
			return true
		} catch (error: unknown) {
			logger.error('failed to import image files for attachment OCR', {
				error,
				positionFile: positionFile.path,
				source,
			})
			new Notice(t('POSITION_DETAILS_ATTACHMENT_PASTE_FAILED'))
			return false
		} finally {
			setIsImportingAttachmentOcr(false)
		}
	}

	const importAttachmentOcrFromAttachment = async (attachment: PositionAttachment): Promise<boolean> => {
		if (positionFile === null) {
			return false
		}

		setIsImportingAttachmentOcr(true)

		try {
			const imageFile = await readAttachmentPendingFile(app, attachment)
			logger.debug('resolved attachment OCR preview file', {
				attachmentPath: attachment.path,
				file: imageFile === null
					? null
					: {
						byteLength: imageFile.buffer.byteLength,
						extension: imageFile.extension,
					},
				positionFile: positionFile.path,
				source: 'lightbox-preview',
			})
			if (imageFile === null) {
				new Notice(t('POSITION_DETAILS_ATTACHMENT_OCR_FAILED'))
				return false
			}

			const ocrResult = await runAttachmentOcr({
				files: [imageFile],
				positionFile,
			})
			if (ocrResult === null) {
				return false
			}

			setPendingAttachmentOcrResult(ocrResult)
			setPendingAttachmentOcrFile(imageFile)
			return true
		} catch (error: unknown) {
			logger.error('failed to import preview attachment for OCR', {
				attachmentPath: attachment.path,
				error,
				positionFile: positionFile.path,
			})
			new Notice(t('POSITION_DETAILS_ATTACHMENT_OCR_FAILED'))
			return false
		} finally {
			setIsImportingAttachmentOcr(false)
		}
	}

	const prepareAttachmentOcr = async (): Promise<boolean> => {
		if (positionFile === null) {
			return false
		}

		setIsImportingAttachmentOcr(true)
		const notice = new Notice(t('POSITION_DETAILS_ATTACHMENT_OCR_PREPARING'), 0)

		try {
			await preparePositionAttachmentOcr({
				onProgress: (progress) => {
					notice.setMessage(buildAttachmentOcrProgressMessage(progress))
				},
			})
			notice.setMessage(t('POSITION_DETAILS_ATTACHMENT_OCR_READY'))
			queueNoticeHide(notice)
			return true
		} catch (error: unknown) {
			logger.error('failed to prepare attachment OCR runtime', {
				error,
				positionFile: positionFile.path,
			})
			notice.setMessage(t('POSITION_DETAILS_ATTACHMENT_OCR_FAILED'))
			queueNoticeHide(notice)
			return false
		} finally {
			setIsImportingAttachmentOcr(false)
		}
	}

	const importAttachmentOcrFromPasteEvent = async (event: ClipboardEvent): Promise<boolean> => {
		if (positionFile === null) {
			return false
		}

		setIsImportingAttachmentOcr(true)

		try {
			event.preventDefault()
			event.stopPropagation()

			const { diagnostics, payloads } = await readClipboardEventPayloads(event)
			logger.debug('resolved attachment OCR paste payloads', {
				diagnostics,
				payloads: payloads.map((payload) => payload.kind === 'image'
					? {
						byteLength: payload.buffer.byteLength,
						kind: payload.kind,
						mimeType: payload.mimeType,
					}
					: {
						kind: payload.kind,
						textLength: payload.text.length,
					}),
				positionFile: positionFile.path,
				source: 'modal-paste',
			})

			const imagePayload = payloads.find((payload) => payload.kind === 'image')
			if (imagePayload === undefined) {
				const hasTextPayload = payloads.some((payload) => payload.kind === 'text')
				logger.error('attachment OCR paste did not include an image payload', {
					diagnostics,
					hasTextPayload,
					positionFile: positionFile.path,
				})
				new Notice(t(hasTextPayload
					? 'POSITION_DETAILS_ATTACHMENT_PASTE_TEXT_UNSUPPORTED'
					: 'POSITION_DETAILS_ATTACHMENT_PASTE_EMPTY'))
				return false
			}

			const ocrResult = await runAttachmentOcr({
				files: [{
					buffer: imagePayload.buffer,
					extension: resolveImageExtensionFromMimeType(imagePayload.mimeType) ?? 'png',
					originalName: 'image',
				}],
				positionFile,
			})
			if (ocrResult === null) {
				return false
			}

			setPendingAttachmentOcrResult(ocrResult)
			setPendingAttachmentOcrFile({
				buffer: imagePayload.buffer,
				extension: resolveImageExtensionFromMimeType(imagePayload.mimeType) ?? 'png',
				originalName: 'image',
			})
			return true
		} catch (error: unknown) {
			logger.error('failed to import clipboard payload for attachment OCR', {
				diagnostics: error instanceof ClipboardReadError ? error.diagnostics : undefined,
				error,
				positionFile: positionFile.path,
			})
			new Notice(t('POSITION_DETAILS_ATTACHMENT_PASTE_FAILED'))
			return false
		} finally {
			setIsImportingAttachmentOcr(false)
		}
	}

	const applyPendingAttachmentOcr = async (draft: PositionAttachmentOcrDraft): Promise<boolean> => {
		if (positionFile === null || pendingAttachmentOcrResult === null || pendingAttachmentOcrFile === null) {
			return false
		}

		setIsApplyingAttachmentOcr(true)
		let createdFileAttachments: PositionAttachment[] = []

		try {
			const patch = buildPositionAttachmentOcrFieldPatch(pendingAttachmentOcrResult, draft, {
				notionalAsset: position.notional_asset ?? 'usd',
			})
			const attachmentResult = await createPositionAttachmentFiles({
				app,
				files: [pendingAttachmentOcrFile],
				position,
				positionFile,
			})
			createdFileAttachments = attachmentResult.createdFileAttachments
			const updated = await PositionDomain.updateFieldsAndAppendAttachments(
				app,
				positionFile,
				patch,
				attachmentResult.attachmentTokens,
			)
			onPositionUpdated(updated)
			setAttachments((previous) => [...previous, ...attachmentResult.createdAttachments])
			setPendingAttachmentOcrResult(null)
			setPendingAttachmentOcrFile(null)
			new Notice(t('POSITION_DETAILS_ATTACHMENT_OCR_APPLY_SUCCESS'))
			return true
		} catch (error: unknown) {
			try {
				await trashCreatedAttachments(app, createdFileAttachments)
			} catch (cleanupError: unknown) {
				logger.warn('failed to cleanup OCR attachment after apply failure', {
					cleanupError,
					positionFile: positionFile.path,
				})
			}
			logger.warn('failed to apply attachment OCR fields', {
				error,
				positionFile: positionFile.path,
			})
			new Notice(t(error instanceof Error && error.message === 'POSITION_RISK_DIRECTION_ERROR'
				? 'POSITION_DETAILS_RISK_DIRECTION_INVALID'
				: 'POSITION_DETAILS_ATTACHMENT_OCR_APPLY_FAILED'))
			return false
		} finally {
			setIsApplyingAttachmentOcr(false)
		}
	}

	function dismissPendingAttachmentOcr() {
		setPendingAttachmentOcrResult(null)
		setPendingAttachmentOcrFile(null)
	}

	async function runAttachmentOcr({
		files,
		positionFile,
	}: {
		files: PendingAttachmentFile[]
		positionFile: TFile
	}): Promise<PositionAttachmentOcrResult | null> {
		const notice = new Notice(t('POSITION_DETAILS_ATTACHMENT_OCR_RUNNING'), 0)

		try {
			const results: PositionAttachmentOcrResult[] = []
			for (const file of files) {
				notice.setMessage(t('POSITION_DETAILS_ATTACHMENT_OCR_RECOGNIZING'))
				results.push(await detectPositionAttachmentOcr(file.buffer, {
					onProgress: (progress) => {
						notice.setMessage(buildAttachmentOcrProgressMessage(progress))
					},
				}))
			}
			const mergedResult = mergePositionAttachmentOcrResults(results)

			if (files.length > 0) {
				const firstFile = files[0]!
				const blob = new Blob([firstFile.buffer], { type: `image/${firstFile.extension}` })
				mergedResult.image_url = URL.createObjectURL(blob)
			}

			const recognizedValues = listRecognizedPositionAttachmentOcrValues(mergedResult)

			if (recognizedValues.length === 0) {
				notice.setMessage(t('POSITION_DETAILS_ATTACHMENT_OCR_EMPTY'))
				queueNoticeHide(notice)
				return null
			}

			notice.setMessage(t('POSITION_DETAILS_ATTACHMENT_OCR_RESULT', {
				values: recognizedValues
					.map((item) => `${t(item.labelKey)}: ${item.value}`)
					.join(', '),
			}))
			queueNoticeHide(notice)

			return hasRecognizedPositionAttachmentOcrResult(mergedResult)
				? mergedResult
				: null
		} catch (error: unknown) {
			logger.warn('failed to run attachment OCR', {
				error,
				fileCount: files.length,
				positionFile: positionFile.path,
			})
			notice.setMessage(t('POSITION_DETAILS_ATTACHMENT_OCR_FAILED'))
			queueNoticeHide(notice)
			return null
		}
	}

	return {
		applyPendingAttachmentOcr,
		attachments,
		chartIframeRef,
		deleteAttachment,
		dismissPendingAttachmentOcr,
		isDeletingAttachment,
		isApplyingAttachmentOcr,
		isChartAvailable,
		isChartReady,
		isImportingAttachmentOcr,
		isSavingAttachment,
		importAttachmentOcrFromAttachment,
		importAttachmentOcrFromFiles,
		importAttachmentOcrFromPasteEvent,
		prepareAttachmentOcr,
		pendingAttachmentOcrResult,
		saveSelectedAttachments,
	}
}

const OCR_PROGRESS_ASSET_LABEL_KEYS = {
	detection_model: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_DETECTION_MODEL',
	dictionary: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_DICTIONARY',
	onnx_runtime_binary: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_ONNX_RUNTIME_BINARY',
	onnx_runtime_module: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_ONNX_RUNTIME_MODULE',
	recognition_model: 'POSITION_DETAILS_ATTACHMENT_OCR_ASSET_RECOGNITION_MODEL',
} as const satisfies Record<
	Extract<PositionAttachmentOcrProgress, { kind: 'asset' }>['asset'],
	keyof typeof en
>

function buildAttachmentOcrProgressMessage(progress: PositionAttachmentOcrProgress) {
	if (progress.kind === 'initializing') {
		return t('POSITION_DETAILS_ATTACHMENT_OCR_INITIALIZING')
	}

	const assetLabel = t(OCR_PROGRESS_ASSET_LABEL_KEYS[progress.asset])
	return t('POSITION_DETAILS_ATTACHMENT_OCR_PROGRESS_CACHED', {
		asset: assetLabel,
		current: progress.step,
		total: progress.total,
	})
}

// ─── Attachment helpers ───────────────────────────────────────────────────────

function resolveAttachmentItems(
	app: App,
	positionFile: TFile | null,
	position: Position,
): PositionAttachment[] {
	if (positionFile === null) {
		return []
	}

	const frontmatter = app.metadataCache.getFileCache(positionFile)?.frontmatter
	const attachmentTokens = resolvePositionAttachments(frontmatter ?? position)

	return attachmentTokens.flatMap<PositionAttachment>((token, index) => {
		const parsed = parseAttachmentToken(token)
		if (parsed === null) {
			return []
		}

		if (parsed.kind === 'external') {
			return [{
				extension: getPathExtension(parsed.url),
				fileSizeBytes: null,
				id: `external:${parsed.url}:${index}`,
				kind: 'external',
				label: parsed.label ?? parsed.url,
				path: parsed.url,
				referenceKey: `external:${parsed.url}`,
				src: parsed.url,
				token,
			}]
		}

		const abstractFile = app.metadataCache.getFirstLinkpathDest(parsed.linkpath, positionFile.path)
			?? app.vault.getAbstractFileByPath(parsed.linkpath)

		if (!(abstractFile instanceof TFile) || !isImageFile(abstractFile.path)) {
			return []
		}

		return [{
			extension: abstractFile.extension || getPathExtension(abstractFile.path),
			fileSizeBytes: abstractFile.stat.size,
			id: `vault:${abstractFile.path}:${index}`,
			kind: 'vault',
			label: parsed.label ?? abstractFile.basename,
			path: abstractFile.path,
			referenceKey: `vault:${abstractFile.path}`,
			src: app.vault.getResourcePath(abstractFile),
			token,
		}]
	})
}

async function persistPositionAttachments({
	app,
	files,
	position,
	positionFile,
}: {
	app: App
	files: PendingAttachmentFile[]
	position: Position
	positionFile: TFile
}): Promise<PositionAttachment[]> {
	const { attachmentTokens, createdAttachments } = await createPositionAttachmentFiles({
		app,
		files,
		position,
		positionFile,
	})

	if (attachmentTokens.length > 0) {
		await app.fileManager.processFrontMatter(positionFile, (frontmatter) => {
			applyAttachmentTokensToFrontmatter(frontmatter as Record<string, unknown>, attachmentTokens)
		})
	}

	return createdAttachments
}

async function createPositionAttachmentFiles({
	app,
	files,
	position,
	positionFile,
}: {
	app: App
	files: PendingAttachmentFile[]
	position: Position
	positionFile: TFile
}): Promise<{
	attachmentTokens: string[]
	createdFileAttachments: PositionAttachment[]
	createdAttachments: PositionAttachment[]
}> {
	if (files.length === 0) {
		return {
			attachmentTokens: [],
			createdFileAttachments: [],
			createdAttachments: [],
		}
	}

	const linkedHashes = await resolveLinkedAttachmentHashes(app, positionFile, position)
	const reusableFilesByHash = await indexReusableAttachmentFilesByHash(app, linkedHashes)
	const baseTimestamp = Date.now()
	const createdAttachments: PositionAttachment[] = []
	const createdFileAttachments: PositionAttachment[] = []
	const attachmentTokens: string[] = []
	let didEnsureAttachmentDirectory = false

	for (const pendingFile of files) {
		const hash = await hashArrayBuffer(pendingFile.buffer)
		if (linkedHashes.has(hash)) {
			continue
		}

		let timestamp = baseTimestamp + attachmentTokens.length
		const reusableFile = reusableFilesByHash.get(hash)
		if (reusableFile !== undefined) {
			const label = new Date(timestamp).toISOString()
			const token = buildAttachmentToken(reusableFile.path, label)

			linkedHashes.add(hash)
			attachmentTokens.push(token)
			createdAttachments.push(buildAttachmentItemFromFile(app, reusableFile, token, label, timestamp))
			continue
		}

		if (!didEnsureAttachmentDirectory) {
			await ensureAttachmentDirectory(app, timestamp)
			didEnsureAttachmentDirectory = true
		}

		let fileName = buildPositionAttachmentFileName(buildAttachmentTimestamp(timestamp), pendingFile.extension, pendingFile.originalName)
		let filePath = buildPositionAttachmentPath(fileName, timestamp)
		while (app.vault.getAbstractFileByPath(filePath) !== null) {
			timestamp++
			fileName = buildPositionAttachmentFileName(buildAttachmentTimestamp(timestamp), pendingFile.extension, pendingFile.originalName)
			filePath = buildPositionAttachmentPath(fileName, timestamp)
		}

		await ensureAttachmentDirectory(app, timestamp)
		const label = new Date(timestamp).toISOString()
		const createdFile = await app.vault.createBinary(filePath, pendingFile.buffer)
		const token = buildAttachmentToken(filePath, label)

		linkedHashes.add(hash)
		attachmentTokens.push(token)
		const attachment = buildAttachmentItemFromFile(app, createdFile, token, label, timestamp, pendingFile.buffer.byteLength)
		createdAttachments.push(attachment)
		createdFileAttachments.push(attachment)
	}

	return {
		attachmentTokens,
		createdFileAttachments,
		createdAttachments,
	}
}

async function resolveLinkedAttachmentHashes(
	app: App,
	positionFile: TFile,
	position: Position,
): Promise<Set<string>> {
	const hashes = new Set<string>()

	for (const attachment of resolveAttachmentItems(app, positionFile, position)) {
		if (attachment.kind !== 'vault') {
			continue
		}

		const file = app.vault.getAbstractFileByPath(attachment.path)
		if (file instanceof TFile) {
			hashes.add(await hashVaultFile(app, file))
		}
	}

	return hashes
}

async function indexReusableAttachmentFilesByHash(
	app: App,
	linkedHashes: Set<string>,
): Promise<Map<string, TFile>> {
	const filesByHash = new Map<string, TFile>()

	for (const file of app.vault.getFiles()) {
		if (!file.path.startsWith(`${LUCR_TRADE_ATTACHMENTS_DIR}/`) || !isImageFile(file.path)) {
			continue
		}

		const hash = await hashVaultFile(app, file)
		if (linkedHashes.has(hash) || filesByHash.has(hash)) {
			continue
		}

		filesByHash.set(hash, file)
	}

	return filesByHash
}

function buildAttachmentItemFromFile(
	app: App,
	file: TFile,
	token: string,
	label: string,
	timestamp: number,
	fileSizeBytes: number | null = file.stat.size,
): PositionAttachment {
	return {
		extension: file.extension || getPathExtension(file.path),
		fileSizeBytes,
		id: `vault:${file.path}:${timestamp}`,
		kind: 'vault',
		label,
		path: file.path,
		referenceKey: `vault:${file.path}`,
		src: app.vault.getResourcePath(file),
		token,
	}
}

async function hashVaultFile(app: App, file: TFile) {
	return await hashArrayBuffer(await app.vault.readBinary(file))
}

async function hashArrayBuffer(buffer: ArrayBuffer) {
	const digest = await crypto.subtle.digest('SHA-256', buffer)
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

async function trashCreatedAttachments(app: App, attachments: PositionAttachment[]) {
	for (const attachment of attachments) {
		if (attachment.kind !== 'vault') {
			continue
		}

		const abstractFile = app.vault.getAbstractFileByPath(attachment.path)
		if (abstractFile instanceof TFile) {
			await app.fileManager.trashFile(abstractFile)
		}
	}
}

async function removePositionAttachment({
	app,
	attachment,
	positionFile,
}: {
	app: App
	attachment: PositionAttachment
	positionFile: TFile
}): Promise<{ deletedFile: boolean }> {
	const { otherReferencesCount } = checkAttachmentDependencies(app, attachment, positionFile)
	const isReferencedElsewhere = otherReferencesCount > 0

	await app.fileManager.processFrontMatter(positionFile, (frontmatter) => {
		const frontmatterRecord = frontmatter as Record<string, unknown>
		const existingAttachments = resolvePositionAttachments(frontmatterRecord)
		const nextAttachments = removeAttachmentToken(existingAttachments, attachment, app, positionFile)

		if (nextAttachments.length > 0) {
			frontmatterRecord.attachments = nextAttachments
		} else {
			delete frontmatterRecord.attachments
		}

		if (Object.prototype.hasOwnProperty.call(frontmatterRecord, 'chart_screenshots')) {
			delete frontmatterRecord.chart_screenshots
		}
	})

	if (attachment.kind !== 'vault' || isReferencedElsewhere || !attachment.path.startsWith(`${LUCR_TRADE_ATTACHMENTS_DIR}/`)) {
		return { deletedFile: false }
	}

	const abstractFile = app.vault.getAbstractFileByPath(attachment.path)
	if (abstractFile instanceof TFile) {
		await app.fileManager.trashFile(abstractFile)
		return { deletedFile: true }
	}

	return { deletedFile: false }
}

function resolveAttachmentReferenceKey(
	app: App,
	positionFile: TFile,
	token: string,
): string | null {
	const parsed = parseAttachmentToken(token)
	if (parsed === null) {
		return null
	}

	if (parsed.kind === 'external') {
		return `external:${parsed.url}`
	}

	const abstractFile = app.metadataCache.getFirstLinkpathDest(parsed.linkpath, positionFile.path)
		?? app.vault.getAbstractFileByPath(parsed.linkpath)

	if (abstractFile instanceof TFile) {
		return `vault:${abstractFile.path}`
	}

	return `vault:${parsed.linkpath}`
}

function removeAttachmentToken(
	attachmentTokens: string[],
	attachment: PositionAttachment,
	app: App,
	positionFile: TFile,
): string[] {
	let removed = false
	const withoutExactToken = attachmentTokens.filter((token) => {
		if (!removed && token === attachment.token) {
			removed = true
			return false
		}

		return true
	})

	if (removed) {
		return withoutExactToken
	}

	return attachmentTokens.filter((token) => resolveAttachmentReferenceKey(app, positionFile, token) !== attachment.referenceKey)
}

async function ensureAttachmentDirectory(app: App, timestamp: number) {
	for (const path of [LUCR_TRADE_ROOT_DIR, LUCR_TRADE_ATTACHMENTS_DIR, buildAttachmentMonthFolder(timestamp)]) {
		if (app.vault.getAbstractFileByPath(path) === null) {
			await app.vault.createFolder(path)
		}
	}
}

function countSelectedImageFiles(files: FileList | File[] | null): number {
	return Array.from(files ?? []).filter(isSelectableImageFile).length
}

async function readSelectedImageFiles(files: FileList | File[] | null): Promise<PendingAttachmentFile[]> {
	const selectedFiles = Array.from(files ?? []).filter(isSelectableImageFile)

	return await Promise.all(selectedFiles.map(async (file) => ({
		buffer: await file.arrayBuffer(),
		extension: resolveImageExtensionFromMimeType(file.type) ?? getPathExtension(file.name) ?? 'png',
		originalName: getPathBasenameWithoutExtension(file.name),
	})))
}

async function readFirstSelectedImageFile(files: FileList | File[] | null): Promise<PendingAttachmentFile | null> {
	const [firstImage] = await readSelectedImageFiles(files)
	return firstImage ?? null
}

async function readAttachmentPendingFile(app: App, attachment: PositionAttachment): Promise<PendingAttachmentFile | null> {
	if (attachment.kind !== 'vault') {
		return null
	}

	const file = app.vault.getAbstractFileByPath(attachment.path)
	if (!(file instanceof TFile) || !isImageFile(file.path)) {
		return null
	}

	return {
		buffer: await app.vault.readBinary(file),
		extension: attachment.extension ?? getPathExtension(file.path) ?? 'png',
		originalName: getPathBasenameWithoutExtension(file.path),
	}
}

function isSelectableImageFile(file: File): boolean {
	if (isSupportedImageMimeType(file.type)) {
		return true
	}

	const extension = getPathExtension(file.name)
	return extension !== null && ['gif', 'jpg', 'jpeg', 'png', 'svg', 'webp'].includes(extension)
}

function isImageFile(path: string): boolean {
	return /\.(png|jpe?g|gif|webp|svg)$/i.test(path)
}

function getPathExtension(path: string): string | null {
	const normalizedPath = path.split('?')[0]?.split('#')[0] ?? path
	const match = normalizedPath.match(/\.([a-z0-9]+)$/i)
	return match?.[1]?.toLowerCase() ?? null
}

function getPathBasenameWithoutExtension(path: string): string {
	const name = path.split('/').pop()?.trim() ?? ''
	return name.replace(/\.[a-z0-9]+$/i, '') || 'attachment'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const raw = base64.includes(',') ? base64.split(',')[1]! : base64
	const binary = atob(raw)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes.buffer
}

function queueNoticeHide(notice: Notice) {
	window.setTimeout(() => {
		notice.hide()
	}, 4000)
}

function createClipboardReadDiagnostics(): ClipboardReadDiagnostics {
	return {
		browserItemTypes: [],
		fileCount: 0,
		nativeFormats: [],
		nativeImageSize: null,
		selectedFormat: null,
		selectedSource: null,
		sourceCandidates: [],
	}
}

async function readClipboardEventPayloads(event: ClipboardEvent): Promise<ClipboardReadResult> {
	const clipboardData = event.clipboardData
	if (clipboardData === null) {
		throw new ClipboardReadError('Paste event clipboardData is unavailable', createClipboardReadDiagnostics())
	}

	const diagnostics = createClipboardReadDiagnostics()
	diagnostics.browserItemTypes = Array.from(clipboardData.items).map((item) => [item.kind, item.type].filter(Boolean))
	diagnostics.fileCount = clipboardData.files.length

	const imageFiles = Array.from(clipboardData.files)
		.filter((file) => isSelectableImageFile(file))
	if (imageFiles.length > 0) {
		return {
			diagnostics,
			payloads: await Promise.all(imageFiles.map(async (file) => ({
				buffer: await file.arrayBuffer(),
				kind: 'image',
				mimeType: file.type || `image/${getPathExtension(file.name) ?? 'png'}`,
			}))),
		}
	}

	const payloads: ClipboardPayload[] = []
	for (const item of Array.from(clipboardData.items)) {
		if (item.kind === 'file' && item.type.startsWith('image/')) {
			const file = item.getAsFile()
			if (file === null) {
				continue
			}
			payloads.push({
				buffer: await file.arrayBuffer(),
				kind: 'image',
				mimeType: file.type || 'image/png',
			})
			continue
		}

		if (item.kind === 'string' && item.type === 'text/plain') {
			const text = await new Promise<string>((resolve) => {
				item.getAsString(resolve)
			})
			payloads.push({
				kind: 'text',
				text,
			})
		}
	}

	if (payloads.length === 0) {
		const nativePayload = readNativeClipboardImagePayload(diagnostics)
		if (nativePayload !== null) {
			payloads.push(nativePayload)
		}
	}

	if (payloads.length === 0) {
		throw new ClipboardReadError('Paste event exposed unsupported clipboard payloads', diagnostics)
	}

	return {
		diagnostics,
		payloads,
	}
}

function readNativeClipboardImagePayload(diagnostics: ClipboardReadDiagnostics): ClipboardPayload | null {
	const electron = getRuntimeRequire()?.('electron') as {
		clipboard?: {
			availableFormats: () => string[]
			readImage: () => {
				getSize: () => { height: number; width: number }
				isEmpty: () => boolean
				toPNG: () => ArrayBuffer | Uint8Array
			}
		}
	} | undefined
	const clipboard = electron?.clipboard
	if (clipboard === undefined) {
		return null
	}

	diagnostics.nativeFormats = clipboard.availableFormats()
	diagnostics.sourceCandidates = diagnostics.nativeFormats.filter(isNativeImageClipboardFormat)
	if (diagnostics.sourceCandidates.length === 0) {
		return null
	}

	const image = clipboard.readImage()
	diagnostics.nativeImageSize = image.getSize()
	if (image.isEmpty()) {
		throw new ClipboardReadError('Native clipboard exposed image-like formats but no image data', diagnostics)
	}

	const bytes = image.toPNG()
	const buffer = toArrayBuffer(bytes)
	if (buffer.byteLength === 0) {
		throw new ClipboardReadError('Native clipboard image encoded to empty PNG data', diagnostics)
	}

	diagnostics.selectedSource = 'electron.clipboard'
	diagnostics.selectedFormat = 'nativeImage.toPNG'
	return {
		buffer,
		kind: 'image',
		mimeType: 'image/png',
	}
}

function isNativeImageClipboardFormat(format: string): boolean {
	return /image|png|jpeg|jpg|tiff|bitmap/i.test(format)
}

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
	if (bytes instanceof ArrayBuffer) {
		return bytes
	}

	const buffer = new ArrayBuffer(bytes.byteLength)
	new Uint8Array(buffer).set(bytes)
	return buffer
}

function getRuntimeRequire(): ((id: string) => unknown) | null {
	return (window as Window & { require?: (id: string) => unknown }).require ?? null
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it, vi } = import.meta.vitest

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('readAttachmentPendingFile', () => {
		it('reads a vault attachment as an OCR pending file', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ATTACHMENTS_DIR}/shot.png`
			file.basename = 'shot'
			file.extension = 'png'
			const app = {
				vault: {
					getAbstractFileByPath: (path: string) => path === file.path ? file : null,
					readBinary: async () => new Uint8Array([1, 2, 3]).buffer,
				},
			} as unknown as App

			const result = await readAttachmentPendingFile(app, {
				extension: 'png',
				fileSizeBytes: 3,
				id: 'vault:shot',
				kind: 'vault',
				label: 'shot',
				path: file.path,
				referenceKey: `vault:${file.path}`,
				src: 'app://shot.png',
				token: `[[${file.path}|shot]]`,
			})

			expect(result?.extension).toBe('png')
			expect(Array.from(new Uint8Array(result!.buffer))).toEqual([1, 2, 3])
		})

		it('does not read external attachments for OCR', async () => {
			const app = {
				vault: {
					getAbstractFileByPath: () => {
						throw new Error('external attachment should not touch vault')
					},
				},
			} as unknown as App

			const result = await readAttachmentPendingFile(app, {
				extension: 'png',
				fileSizeBytes: null,
				id: 'external:shot',
				kind: 'external',
				label: 'shot',
				path: 'https://example.com/shot.png',
				referenceKey: 'external:https://example.com/shot.png',
				src: 'https://example.com/shot.png',
				token: 'https://example.com/shot.png',
			})

			expect(result).toBeNull()
		})
	})

	describe('createPositionAttachmentFiles', () => {
		it('creates attachment files without mutating position frontmatter', async () => {
			const timestamp = new Date(2026, 4, 15, 10, 20, 30).getTime()
			vi.spyOn(Date, 'now').mockReturnValue(timestamp)
			const positionFile = new TFile()
			positionFile.path = 'LucrJournal/positions/POS-00001.md'
			positionFile.basename = 'POS-00001'
			positionFile.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				attachments: ['[[LucrJournal/attachments/existing.png|existing]]'],
			}
			const createdPaths: string[] = []
			const createdFolders: string[] = []
			const existingPaths = new Set<string>([LUCR_TRADE_ROOT_DIR, LUCR_TRADE_ATTACHMENTS_DIR])
			let frontmatterMutationCount = 0
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (fm: Record<string, unknown>) => void) => {
						frontmatterMutationCount += 1
						updater(frontmatter)
					},
				},
				vault: {
					createBinary: async (path: string) => {
						createdPaths.push(path)
						const file = new TFile()
						file.path = path
						file.basename = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '')
						file.extension = path.replace(/^.*\./, '')
						return file
					},
					getFiles: () => [],
					getAbstractFileByPath: (path: string) => existingPaths.has(path) ? {} : null,
					getResourcePath: (file: TFile) => `app:///${file.path}`,
					readBinary: async () => new ArrayBuffer(0),
					createFolder: async (path: string) => {
						createdFolders.push(path)
						existingPaths.add(path)
					},
				},
				metadataCache: {
					getFileCache: () => ({ frontmatter }),
					getFirstLinkpathDest: () => null,
				},
			} as unknown as App

			const result = await createPositionAttachmentFiles({
				app,
				files: [{ buffer: new Uint8Array([1, 2, 3]).buffer, extension: 'png', originalName: 'logo_black_tight' }],
				position: { lucr_type: 'position', id: 1 },
				positionFile,
			})

			expect(frontmatterMutationCount).toBe(0)
			expect(createdFolders).toEqual(['LucrJournal/attachments/2026-05'])
			expect(createdPaths).toEqual(['LucrJournal/attachments/2026-05/2026-05-15_10-20-30-000_logo_black_tight.png'])
			expect(result.attachmentTokens).toEqual(['[[2026-05-15_10-20-30-000_logo_black_tight.png]]'])
			expect(result.createdAttachments).toHaveLength(1)
			expect(frontmatter.attachments).toEqual(['[[LucrJournal/attachments/existing.png|existing]]'])
		})

		it('skips images already linked to the current position', async () => {
			const positionFile = new TFile()
			positionFile.path = 'LucrJournal/positions/POS-00001.md'
			positionFile.basename = 'POS-00001'
			positionFile.extension = 'md'
			const existingFile = new TFile()
			existingFile.path = `${LUCR_TRADE_ATTACHMENTS_DIR}/existing.png`
			existingFile.basename = 'existing'
			existingFile.extension = 'png'
			existingFile.stat = { ...existingFile.stat, size: 3 }
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				attachments: [`[[${existingFile.path}|existing]]`],
			}
			let createCount = 0
			const app = {
				vault: {
					createBinary: async () => {
						createCount += 1
						return new TFile()
					},
					getFiles: () => [existingFile],
					getAbstractFileByPath: (path: string) => {
						if (path === LUCR_TRADE_ATTACHMENTS_DIR) {
							return {}
						}
						return path === existingFile.path ? existingFile : null
					},
					getResourcePath: (file: TFile) => `app:///${file.path}`,
					readBinary: async (file: TFile) => file === existingFile
						? new Uint8Array([1, 2, 3]).buffer
						: new ArrayBuffer(0),
					createFolder: async () => {},
				},
				metadataCache: {
					getFileCache: () => ({ frontmatter }),
					getFirstLinkpathDest: (linkpath: string) => linkpath === existingFile.path ? existingFile : null,
				},
			} as unknown as App

			const result = await createPositionAttachmentFiles({
				app,
				files: [{ buffer: new Uint8Array([1, 2, 3]).buffer, extension: 'png', originalName: 'existing' }],
				position: { lucr_type: 'position', id: 1 },
				positionFile,
			})

			expect(createCount).toBe(0)
			expect(result.attachmentTokens).toEqual([])
			expect(result.createdAttachments).toEqual([])
		})

		it('creates only one attachment for duplicate images in the same batch', async () => {
			const positionFile = new TFile()
			positionFile.path = 'LucrJournal/positions/POS-00001.md'
			positionFile.basename = 'POS-00001'
			positionFile.extension = 'md'
			const frontmatter: Record<string, unknown> = { lucr_type: 'position' }
			const createdPaths: string[] = []
			const app = {
				vault: {
					createBinary: async (path: string) => {
						createdPaths.push(path)
						const file = new TFile()
						file.path = path
						file.basename = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '')
						file.extension = path.replace(/^.*\./, '')
						return file
					},
					getFiles: () => [],
					getAbstractFileByPath: () => null,
					getResourcePath: (file: TFile) => `app:///${file.path}`,
					readBinary: async () => new ArrayBuffer(0),
					createFolder: async () => {},
				},
				metadataCache: {
					getFileCache: () => ({ frontmatter }),
					getFirstLinkpathDest: () => null,
				},
			} as unknown as App
			const duplicate = new Uint8Array([4, 5, 6]).buffer

			const result = await createPositionAttachmentFiles({
				app,
				files: [
					{ buffer: duplicate, extension: 'png', originalName: 'duplicate' },
					{ buffer: duplicate.slice(0), extension: 'png', originalName: 'duplicate' },
				],
				position: { lucr_type: 'position', id: 1 },
				positionFile,
			})

			expect(createdPaths).toHaveLength(1)
			expect(result.attachmentTokens).toHaveLength(1)
			expect(result.createdAttachments).toHaveLength(1)
		})

		it('reuses an existing vault attachment with the same content', async () => {
			const positionFile = new TFile()
			positionFile.path = 'LucrJournal/positions/POS-00001.md'
			positionFile.basename = 'POS-00001'
			positionFile.extension = 'md'
			const existingFile = new TFile()
			existingFile.path = `${LUCR_TRADE_ATTACHMENTS_DIR}/existing.png`
			existingFile.basename = 'existing'
			existingFile.extension = 'png'
			existingFile.stat = { ...existingFile.stat, size: 3 }
			const frontmatter: Record<string, unknown> = { lucr_type: 'position' }
			let createCount = 0
			const app = {
				vault: {
					createBinary: async () => {
						createCount += 1
						return new TFile()
					},
					getFiles: () => [existingFile],
					getAbstractFileByPath: (path: string) => path === LUCR_TRADE_ATTACHMENTS_DIR ? {} : null,
					getResourcePath: (file: TFile) => `app:///${file.path}`,
					readBinary: async (file: TFile) => file === existingFile
						? new Uint8Array([7, 8, 9]).buffer
						: new ArrayBuffer(0),
					createFolder: async () => {},
				},
				metadataCache: {
					getFileCache: () => ({ frontmatter }),
					getFirstLinkpathDest: () => null,
				},
			} as unknown as App

			const result = await createPositionAttachmentFiles({
				app,
				files: [{ buffer: new Uint8Array([7, 8, 9]).buffer, extension: 'png', originalName: 'existing' }],
				position: { lucr_type: 'position', id: 1 },
				positionFile,
			})

			expect(createCount).toBe(0)
			expect(result.attachmentTokens).toEqual(['[[existing.png]]'])
			expect(result.createdAttachments[0]!.path).toBe(existingFile.path)
			expect(result.createdFileAttachments).toEqual([])
		})
	})
}
