import { normalizePath, requestUrl, type App, type Plugin } from 'obsidian'
import * as ort from 'onnxruntime-web'
import { PaddleOcrService } from 'ppu-paddle-ocr/web'

import { createLogger } from '../logger'

const logger = createLogger('attachment-ocr')

// @story [[lucrjournal/ocr#^local-ocr-runtime-assets]] Defines the local runtime and model filenames
const ONNX_RUNTIME_ASSET_DIR = 'onnxruntime-web'
const ONNX_RUNTIME_WASM_FILE = 'ort-wasm-simd-threaded.jsep.wasm'
const OCR_MODEL_ASSET_DIR = 'ocr/models'
const OCR_RECOGNITION_LINE_SEGMENT_MAX_GAP = 120
// Must match the onnxruntime-web build inlined into this bundle, or the downloaded .wasm mismatches its glue.
const ONNX_RUNTIME_VERSION = ort.env.versions.web
// ppu-paddle-ocr-models stores the .onnx models in Git LFS: raw.githubusercontent.com returns pointer
// files, so they come from the media host (jsDelivr, which resolves LFS, is the fallback). The dict is
// a plain text file served from raw. Mirrors scripts/sync-ocr-assets.ts.
const OCR_MODEL_BASE_URL = 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main'
const OCR_DICT_BASE_URL = 'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main'
const OCR_MODEL_CDN_URL = 'https://cdn.jsdelivr.net/gh/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models@main'

type PositionAttachmentOcrRuntimeContext = {
	app: App
	pluginId: string
}

export type PositionAttachmentOcrProgress =
	| {
		asset:
			| 'onnx_runtime_binary'
			| 'detection_model'
			| 'recognition_model'
			| 'dictionary'
		kind: 'asset'
		status: 'cached' | 'downloading'
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
		asset: 'onnx_runtime_binary' as const,
		downloadUrls: [
			`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/${ONNX_RUNTIME_WASM_FILE}`,
			`https://unpkg.com/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/${ONNX_RUNTIME_WASM_FILE}`,
		],
		relativePath: `${ONNX_RUNTIME_ASSET_DIR}/${ONNX_RUNTIME_WASM_FILE}`,
	},
	{
		asset: OCR_MODEL_RESOURCES.detection.asset,
		downloadUrls: [
			`${OCR_MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`,
			`${OCR_MODEL_CDN_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`,
		],
		relativePath: `${OCR_MODEL_ASSET_DIR}/${OCR_MODEL_RESOURCES.detection.fileName}`,
	},
	{
		asset: OCR_MODEL_RESOURCES.recognition.asset,
		downloadUrls: [
			`${OCR_MODEL_BASE_URL}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.onnx`,
			`${OCR_MODEL_CDN_URL}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.onnx`,
		],
		relativePath: `${OCR_MODEL_ASSET_DIR}/${OCR_MODEL_RESOURCES.recognition.fileName}`,
	},
	{
		asset: OCR_MODEL_RESOURCES.dictionary.asset,
		downloadUrls: [
			`${OCR_DICT_BASE_URL}/recognition/multi/en/v5/ppocrv5_en_dict.txt`,
			`${OCR_MODEL_CDN_URL}/recognition/multi/en/v5/ppocrv5_en_dict.txt`,
		],
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
	const [runtimeBinary] = OCR_RUNTIME_ASSET_RESOURCES
	const wasmBinaryPath = await ensurePluginAssetAvailable(
		context,
		runtimeBinary.relativePath,
		runtimeBinary.downloadUrls,
		runtimeBinary.asset,
		1,
		OCR_RUNTIME_ASSET_RESOURCES.length,
		onProgress,
	)

	// onnxruntime-web ships two copies of the emscripten glue: the browser-only build inlined into this
	// bundle, and dist/ort-wasm-simd-threaded.jsep.mjs which still carries a Node `import("worker_threads")`
	// branch. Setting wasmPaths.mjs forces the standalone file, which the Electron renderer's ESM loader
	// cannot resolve. Passing only wasmBinary on a single-threaded runtime keeps ORT on the inlined glue
	// (importWasmModule: `isWasmOverridden && !isMultiThreaded`).
	ort.env.wasm.numThreads = 1
	ort.env.wasm.wasmBinary = await context.app.vault.adapter.readBinary(wasmBinaryPath)
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
		runtimeAsset.downloadUrls,
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

async function downloadAssetBinary(urls: readonly string[]): Promise<ArrayBuffer> {
	let lastError: unknown = null
	for (const url of urls) {
		try {
			const response = await requestUrl({ url })
			if (response.status >= 200 && response.status < 300) {
				return response.arrayBuffer
			}
		} catch (error: unknown) {
			lastError = error
		}
	}
	throw new Error(`Failed to download OCR asset from ${urls.join(', ')}: ${String(lastError)}`)
}

// @story [[lucrjournal/ocr#^local-ocr-runtime-assets]] Uses local asset or downloads from upstream when absent
async function ensurePluginAssetAvailable(
	context: PositionAttachmentOcrRuntimeContext,
	relativePath: string,
	downloadUrls: readonly string[],
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

	onProgress?.({
		asset,
		kind: 'asset',
		status: 'downloading',
		step,
		total,
	})

	const lastSlash = targetPath.lastIndexOf('/')
	if (lastSlash !== -1) {
		const parentDir = targetPath.slice(0, lastSlash)
		if (!(await context.app.vault.adapter.exists(parentDir))) {
			await context.app.vault.adapter.mkdir(parentDir)
		}
	}

	const bytes = await downloadAssetBinary(downloadUrls)
	await context.app.vault.adapter.writeBinary(targetPath, bytes)

	return targetPath
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
	const { beforeEach, describe, expect, it, vi } = import.meta.vitest

	describe('ensurePluginAssetAvailable', () => {
		beforeEach(() => {
			vi.restoreAllMocks()
		})

		// @story [[lucrjournal/ocr#^local-ocr-runtime-assets]] Downloads missing OCR runtime assets when absent locally
		it('downloads and caches missing OCR runtime assets', async () => {
			const Obsidian = await import('obsidian')
			const requestUrlSpy = vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
				arrayBuffer: new ArrayBuffer(8),
				status: 200,
			} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)
			const writes: Array<{ path: string; data: ArrayBuffer }> = []
			const app = {
				vault: {
					configDir: 'vault-config',
					adapter: {
						exists: async () => false,
						mkdir: async () => undefined,
						writeBinary: async (path: string, data: ArrayBuffer) => {
							writes.push({ path, data })
						},
					},
				},
			}

			const result = await ensurePluginAssetAvailable(
				{ app: app as never, pluginId: 'lucrjournal' },
				'ocr/models/model.onnx',
				['https://example.com/model.onnx'],
				'detection_model',
				1,
				1,
			)

			expect(result).toBe('vault-config/plugins/lucrjournal/ocr/models/model.onnx')
			expect(requestUrlSpy).toHaveBeenCalledWith({ url: 'https://example.com/model.onnx' })
			expect(writes).toHaveLength(1)
			expect(writes[0]?.path).toBe('vault-config/plugins/lucrjournal/ocr/models/model.onnx')
		})

		it('uses cached local asset without downloading when present', async () => {
			const Obsidian = await import('obsidian')
			const requestUrlSpy = vi.spyOn(Obsidian, 'requestUrl')
			const app = {
				vault: {
					configDir: 'vault-config',
					adapter: {
						exists: async () => true,
					},
				},
			}

			const result = await ensurePluginAssetAvailable(
				{ app: app as never, pluginId: 'lucrjournal' },
				'ocr/models/model.onnx',
				['https://example.com/model.onnx'],
				'detection_model',
				1,
				1,
			)

			expect(result).toBe('vault-config/plugins/lucrjournal/ocr/models/model.onnx')
			expect(requestUrlSpy).not.toHaveBeenCalled()
		})
	})
}
