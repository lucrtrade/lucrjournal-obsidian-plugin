import { normalizePath, type App, type Plugin } from 'obsidian'
import * as ort from 'onnxruntime-web'
import { PaddleOcrService } from 'ppu-paddle-ocr/web'

import { createLogger } from '../logger'

const logger = createLogger('attachment-ocr')

const ONNX_RUNTIME_ASSET_DIR = 'onnxruntime-web'
const ONNX_RUNTIME_MODULE_FILE = 'ort-wasm-simd-threaded.jsep.mjs'
const ONNX_RUNTIME_WASM_FILE = 'ort-wasm-simd-threaded.jsep.wasm'
const OCR_MODEL_ASSET_DIR = 'ocr/models'
const OCR_RECOGNITION_LINE_SEGMENT_MAX_GAP = 120

type PositionAttachmentOcrRuntimeContext = {
	app: App
	pluginId: string
}

export type PositionAttachmentOcrProgress =
	| {
		asset:
			| 'onnx_runtime_module'
			| 'onnx_runtime_binary'
			| 'detection_model'
			| 'recognition_model'
			| 'dictionary'
		kind: 'asset'
		status: 'cached'
		step: number
		total: number
	}
	| {
		kind: 'initializing'
	}

export type PositionAttachmentOcrRecognition = {
	confidence: number
	lines: PositionAttachmentOcrRecognitionLine[]
	text: string
}

type PositionAttachmentOcrRecognitionLine = {
	box?: {
		height: number
		width: number
		x: number
		y: number
	}
	confidence: number
	text: string
}

type CachedOcrModelResource = {
	asset: Extract<PositionAttachmentOcrProgress, { kind: 'asset' }>['asset']
	fileName: string
}

const OCR_MODEL_RESOURCES = {
	detection: {
		asset: 'detection_model',
		fileName: 'PP-OCRv5_mobile_det_infer.onnx',
	},
	dictionary: {
		asset: 'dictionary',
		fileName: 'ppocrv5_en_dict.txt',
	},
	recognition: {
		asset: 'recognition_model',
		fileName: 'en_PP-OCRv5_mobile_rec_infer.onnx',
	},
} as const satisfies Record<string, CachedOcrModelResource>

const OCR_RUNTIME_ASSET_RESOURCES = [
	{
		asset: 'onnx_runtime_module',
		relativePath: `${ONNX_RUNTIME_ASSET_DIR}/${ONNX_RUNTIME_MODULE_FILE}`,
	},
	{
		asset: 'onnx_runtime_binary',
		relativePath: `${ONNX_RUNTIME_ASSET_DIR}/${ONNX_RUNTIME_WASM_FILE}`,
	},
	{
		asset: OCR_MODEL_RESOURCES.detection.asset,
		relativePath: `${OCR_MODEL_ASSET_DIR}/${OCR_MODEL_RESOURCES.detection.fileName}`,
	},
	{
		asset: OCR_MODEL_RESOURCES.recognition.asset,
		relativePath: `${OCR_MODEL_ASSET_DIR}/${OCR_MODEL_RESOURCES.recognition.fileName}`,
	},
	{
		asset: OCR_MODEL_RESOURCES.dictionary.asset,
		relativePath: `${OCR_MODEL_ASSET_DIR}/${OCR_MODEL_RESOURCES.dictionary.fileName}`,
	},
] as const

let runtimeContext: PositionAttachmentOcrRuntimeContext | null = null
let service: PaddleOcrService | null = null
let servicePromise: Promise<PaddleOcrService> | null = null

export function registerPositionAttachmentOcrRuntime(plugin: Plugin) {
	runtimeContext = {
		app: plugin.app,
		pluginId: plugin.manifest.id,
	}

	return () => {
		runtimeContext = null

		const currentService = service
		const pendingService = servicePromise

		service = null
		servicePromise = null

		if (currentService !== null) {
			void currentService.destroy()
			return
		}

		if (pendingService !== null) {
			void pendingService.then((initializedService) => initializedService.destroy(), () => undefined)
		}
	}
}

export async function recognizePositionAttachmentText(
	buffer: ArrayBuffer,
	options?: {
		onProgress?: (progress: PositionAttachmentOcrProgress) => void
	},
): Promise<PositionAttachmentOcrRecognition> {
	const ocrService = await ensurePositionAttachmentOcrService(options?.onProgress)
	const result = await ocrService.recognize(buffer)
	const lines = toPositionAttachmentOcrRecognitionLines(result.lines)

	return {
		confidence: result.confidence,
		lines,
		text: lines.map((line) => line.text).join('\n'),
	}
}

export async function preparePositionAttachmentOcrRuntime(options?: {
	onProgress?: (progress: PositionAttachmentOcrProgress) => void
}) {
	await ensurePositionAttachmentOcrService(options?.onProgress)
}

async function ensurePositionAttachmentOcrService(onProgress?: (progress: PositionAttachmentOcrProgress) => void) {
	if (service !== null) {
		return service
	}

	if (servicePromise !== null) {
		return await servicePromise
	}

	const currentRuntimeContext = getPositionAttachmentOcrRuntimeContext()
	servicePromise = createPositionAttachmentOcrService(currentRuntimeContext, onProgress)

	try {
		service = await servicePromise
		return service
	} catch (error: unknown) {
		servicePromise = null
		throw error
	}
}

async function createPositionAttachmentOcrService(
	context: PositionAttachmentOcrRuntimeContext,
	onProgress?: (progress: PositionAttachmentOcrProgress) => void,
) {
	await configureOnnxRuntimeWasm(context, onProgress)

	const detection = await loadCachedOcrModelResource(context, OCR_MODEL_RESOURCES.detection, onProgress)
	const recognition = await loadCachedOcrModelResource(context, OCR_MODEL_RESOURCES.recognition, onProgress)
	const charactersDictionary = await loadCachedOcrModelResource(context, OCR_MODEL_RESOURCES.dictionary, onProgress)

	onProgress?.({
		kind: 'initializing',
	})

	const nextService = new PaddleOcrService({
		detection: {
			maxSideLength: 2048,
		},
		model: {
			charactersDictionary,
			detection,
			recognition,
		},
		processing: {
			engine: 'canvas-native',
		},
		recognition: {
			charactersDictionary: [],
			strategy: 'per-box',
		},
		session: {
			executionProviders: ['wasm'],
			graphOptimizationLevel: 'all',
		},
	})

	await nextService.initialize()

	logger.debug('initialized attachment OCR runtime', {
		pluginId: context.pluginId,
	})

	return nextService
}

async function configureOnnxRuntimeWasm(
	context: PositionAttachmentOcrRuntimeContext,
	onProgress?: (progress: PositionAttachmentOcrProgress) => void,
) {
	const runtimeAssets = OCR_RUNTIME_ASSET_RESOURCES.slice(0, 2)
	for (const [index, asset] of runtimeAssets.entries()) {
		await ensurePluginAssetAvailable(
			context,
			asset.relativePath,
			asset.asset,
			index + 1,
			OCR_RUNTIME_ASSET_RESOURCES.length,
			onProgress,
		)
	}

	const wasmModulePath = buildPluginRuntimePath(context.app, context.pluginId, `${ONNX_RUNTIME_ASSET_DIR}/${ONNX_RUNTIME_MODULE_FILE}`)
	const wasmBinaryPath = buildPluginRuntimePath(context.app, context.pluginId, `${ONNX_RUNTIME_ASSET_DIR}/${ONNX_RUNTIME_WASM_FILE}`)

	ort.env.wasm.numThreads = 1
	ort.env.wasm.wasmPaths = {
		mjs: context.app.vault.adapter.getResourcePath(wasmModulePath),
		wasm: context.app.vault.adapter.getResourcePath(wasmBinaryPath),
	}
}

async function loadCachedOcrModelResource(
	context: PositionAttachmentOcrRuntimeContext,
	resource: CachedOcrModelResource,
	onProgress?: (progress: PositionAttachmentOcrProgress) => void,
): Promise<ArrayBuffer> {
	const assetPath = buildPluginRuntimePath(
		context.app,
		context.pluginId,
		`${OCR_MODEL_ASSET_DIR}/${resource.fileName}`,
	)
	const runtimeAsset = OCR_RUNTIME_ASSET_RESOURCES.find((asset) => asset.asset === resource.asset)
	if (runtimeAsset === undefined) {
		throw new Error('Unknown OCR model runtime asset')
	}

	await ensurePluginAssetAvailable(
		context,
		runtimeAsset.relativePath,
		resource.asset,
		OCR_RUNTIME_ASSET_RESOURCES.findIndex((asset) => asset.asset === resource.asset) + 1,
		OCR_RUNTIME_ASSET_RESOURCES.length,
		onProgress,
	)

	logger.debug('loading cached OCR model resource', {
		fileName: resource.fileName,
		pluginId: context.pluginId,
	})

	return await context.app.vault.adapter.readBinary(assetPath)
}

function getPositionAttachmentOcrRuntimeContext() {
	if (runtimeContext === null) {
		throw new Error('Attachment OCR runtime is not registered')
	}

	return runtimeContext
}

function buildPluginRuntimePath(app: App, pluginId: string, relativePath: string) {
	return normalizePath(`${app.vault.configDir}/plugins/${pluginId}/${relativePath}`)
}

async function ensurePluginAssetAvailable(
	context: PositionAttachmentOcrRuntimeContext,
	relativePath: string,
	asset: Extract<PositionAttachmentOcrProgress, { kind: 'asset' }>['asset'],
	step: number,
	total: number,
	onProgress?: (progress: PositionAttachmentOcrProgress) => void,
) {
	const targetPath = buildPluginRuntimePath(context.app, context.pluginId, relativePath)

	if (await context.app.vault.adapter.exists(targetPath)) {
		onProgress?.({
			asset,
			kind: 'asset',
			status: 'cached',
			step,
			total,
		})
		return targetPath
	}

	throw new Error(`Missing OCR runtime asset: ${relativePath}`)
}

function toPositionAttachmentOcrRecognitionLines(lines: Array<Array<{
	box: {
		height: number
		width: number
		x: number
		y: number
	}
	confidence: number
	text: string
}>>) {
	return lines
		.flatMap((line) => splitPositionAttachmentOcrRecognitionLine(line))
}

function splitPositionAttachmentOcrRecognitionLine(line: Array<{
	box: {
		height: number
		width: number
		x: number
		y: number
	}
	confidence: number
	text: string
}>) {
	const segments = []
	let segment: typeof line = []

	for (const item of line) {
		const text = item.text.trim()
		if (text.length === 0) {
			continue
		}

		const previous = segment[segment.length - 1]
		if (
			previous !== undefined
			&& item.box.x - (previous.box.x + previous.box.width) > OCR_RECOGNITION_LINE_SEGMENT_MAX_GAP
		) {
			segments.push(buildPositionAttachmentOcrRecognitionLine(segment))
			segment = []
		}

		segment.push({
			...item,
			text,
		})
	}

	if (segment.length > 0) {
		segments.push(buildPositionAttachmentOcrRecognitionLine(segment))
	}

	return segments
}

function buildPositionAttachmentOcrRecognitionLine(segment: Array<{
	box: {
		height: number
		width: number
		x: number
		y: number
	}
	confidence: number
	text: string
}>) {
	const minX = Math.min(...segment.map((item) => item.box.x))
	const minY = Math.min(...segment.map((item) => item.box.y))
	const maxX = Math.max(...segment.map((item) => item.box.x + item.box.width))
	const maxY = Math.max(...segment.map((item) => item.box.y + item.box.height))

	return {
		box: {
			height: maxY - minY,
			width: maxX - minX,
			x: minX,
			y: minY,
		},
		confidence: segment.reduce((sum, item) => sum + item.confidence, 0) / segment.length,
		text: segment.map((item) => item.text).join(' '),
	}
}

if (import.meta.vitest) {
	const { describe, expect, it, vi } = import.meta.vitest

	describe('ensurePluginAssetAvailable', () => {
		it('does not download missing OCR runtime assets', async () => {
			const Obsidian = await import('obsidian')
			const requestUrlSpy = vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
				arrayBuffer: new ArrayBuffer(0),
			} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)
			const writes: string[] = []
			const app = {
				vault: {
					configDir: 'vault-config',
					adapter: {
						exists: async () => false,
						mkdir: async () => undefined,
						writeBinary: async (path: string) => writes.push(path),
					},
				},
			}

			await expect(ensurePluginAssetAvailable(
				{ app: app as never, pluginId: 'lucrjournal' },
				'ocr/models/model.onnx',
				'detection_model',
				1,
				1,
			)).rejects.toThrow('Missing OCR runtime asset')
			expect(requestUrlSpy).not.toHaveBeenCalled()
			expect(writes).toEqual([])
		})
	})
}
