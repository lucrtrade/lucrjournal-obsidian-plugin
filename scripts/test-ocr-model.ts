import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import * as ort from 'onnxruntime-node'
import {
	Canvas,
	Contours,
	ImageProcessor,
	createCanvas,
	cv,
	loadImage,
	setPlatform,
} from 'ppu-ocv'
import { CanvasProcessor, CanvasToolkit } from 'ppu-ocv/canvas'

import { BaseDetectionService } from '../node_modules/ppu-paddle-ocr/core/base-detection.service.js'
import {
	BasePaddleOcrService,
	DICT_BASE_URL,
	MODEL_BASE_URL,
} from '../node_modules/ppu-paddle-ocr/core/base-paddle-ocr.service.js'
import { BaseRecognitionService } from '../node_modules/ppu-paddle-ocr/core/base-recognition.service.js'

const DEFAULT_MODEL_FILES = {
	detection: 'PP-OCRv5_mobile_det_infer.onnx',
	dictionary: 'ppocrv5_en_dict.txt',
	recognition: 'en_PP-OCRv5_mobile_rec_infer.onnx',
}

const OCR_RECOGNITION_LINE_SEGMENT_MAX_GAP = 120
const DEFAULT_MODELS_DIR = path.join(os.homedir(), '.cache', 'lucrjournal-ocr-models')
// @story [[lucrjournal/tooling#^ocr-snapshot-verification]] Defines the default fixture and exact snapshot directories
const DEFAULT_FIXTURES_DIR = path.resolve('dev/ocr-fixtures/images')
const DEFAULT_SNAPSHOTS_DIR = path.resolve('dev/ocr-fixtures/snapshots')

const {
	extractPositionAttachmentOcrResultFromImageRecognition,
} = await import('../src/attachments/ocr/extract.ts')

registerNodeCanvasPlatform()

const cli = await parseCli(process.argv.slice(2))

if (cli.imagePaths.length === 0) {
	console.error(
		'Usage: bun run ocr:test -- <image-path> [more image paths] [--json] [--models-dir <dir>] [--fixtures-dir <dir>] [--write-snapshots] [--verify-snapshots]',
	)
	process.exit(1)
}

class CanvasNativeNodePlatformProvider {
	pathSeparator = path.sep
	ort = ort
	canvas = {
		createProcessor: (canvas) => new CanvasProcessor(canvas),
		getToolkit: () => CanvasToolkit.getInstance(),
		prepareCanvas: (image) => CanvasProcessor.prepareCanvas(image),
	}
	imageProcessor = {
		Contours,
		ImageProcessor,
		cv,
		prepareCanvas: (image) => CanvasProcessor.prepareCanvas(image),
	}

	createCanvas(width, height) {
		return new Canvas(width, height)
	}

	isCanvas(image) {
		return image instanceof Canvas
	}

	async loadResource(source, defaultUrl) {
		if (source instanceof ArrayBuffer) {
			return source
		}

		const target = typeof source === 'string' ? source : defaultUrl
		if (!target) {
			throw new Error('Missing OCR resource target')
		}

		if (target.startsWith('http://') || target.startsWith('https://')) {
			const response = await fetch(target)
			if (!response.ok) {
				throw new Error(`Failed to fetch OCR resource: ${target}`)
			}

			return response.arrayBuffer()
		}

		const buffer = await fs.readFile(path.resolve(target))
		return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
	}

	async saveDebugImage(canvas, filename, outputDir) {
		await fs.mkdir(outputDir, { recursive: true })
		await CanvasToolkit.getInstance().saveImage({
			canvas,
			filename,
			path: outputDir,
		})
	}
}

function registerNodeCanvasPlatform() {
	setPlatform({
		createCanvas,
		isCanvas: (value) => value instanceof Canvas,
		loadImage: async (source) => {
			const image = await loadImage(source)
			const canvas = createCanvas(image.width, image.height)
			canvas.getContext('2d').drawImage(image, 0, 0)
			return canvas
		},
	})
}

class CanvasNativePaddleOcrService extends BasePaddleOcrService {
	constructor(options) {
		super(new CanvasNativeNodePlatformProvider(), options)
	}

	isInitialized() {
		return this.detectionSession !== null && this.recognitionSession !== null
	}

	async initialize() {
		if (this.isInitialized()) {
			return
		}

		const detectionModelBuffer = await this.platform.loadResource(
			this.options.model?.detection,
			`${MODEL_BASE_URL}/detection/${DEFAULT_MODEL_FILES.detection}`,
		)
		this.detectionSession = await ort.InferenceSession.create(
			new Uint8Array(detectionModelBuffer),
			this.options.session,
		)
		this.options.model.detection = detectionModelBuffer

		const recognitionModelBuffer = await this.platform.loadResource(
			this.options.model?.recognition,
			`${MODEL_BASE_URL}/recognition/multi/en/v5/${DEFAULT_MODEL_FILES.recognition}`,
		)
		this.recognitionSession = await ort.InferenceSession.create(
			new Uint8Array(recognitionModelBuffer),
			this.options.session,
		)
		this.options.model.recognition = recognitionModelBuffer

		const dictionaryBuffer = await this.platform.loadResource(
			this.options.model?.charactersDictionary,
			`${DICT_BASE_URL}/recognition/multi/en/v5/${DEFAULT_MODEL_FILES.dictionary}`,
		)
		const dictionaryContent = Buffer.from(dictionaryBuffer).toString('utf-8')
		const charactersDictionary = normalizeCharactersDictionary(dictionaryContent)

		if (charactersDictionary.length === 0) {
			throw new Error('OCR dictionary is empty')
		}

		this.options.model.charactersDictionary = dictionaryBuffer
		this.options.recognition.charactersDictionary = charactersDictionary
		this.detector = new BaseDetectionService(
			this.platform,
			this.detectionSession,
			this.options.detection,
			this.options.debugging,
			'canvas-native',
		)
		this.recognitor = new BaseRecognitionService(
			this.platform,
			this.recognitionSession,
			this.options.recognition,
			this.options.debugging,
			'canvas-native',
		)
		this.options.model.detection = undefined
		this.options.model.recognition = undefined
	}

	async destroy() {
		await this.detectionSession?.release()
		await this.recognitionSession?.release()
		this.detectionSession = null
		this.recognitionSession = null
		this.detector = null
		this.recognitor = null
	}
}

async function parseCli(args) {
	const imagePaths = []
	let json = false
	let modelsDir
	let fixturesDir
	let snapshotDir = DEFAULT_SNAPSHOTS_DIR
	let verifySnapshots = false
	let writeSnapshots = false

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index]
		if (value === '--json') {
			json = true
			continue
		}

		if (value === '--models-dir') {
			modelsDir = args[index + 1]
			index += 1
			continue
		}

		if (value === '--fixtures-dir') {
			fixturesDir = args[index + 1]
			index += 1
			continue
		}

		if (value === '--snapshot-dir') {
			snapshotDir = path.resolve(args[index + 1])
			index += 1
			continue
		}

		if (value === '--write-snapshots') {
			writeSnapshots = true
			continue
		}

		if (value === '--verify-snapshots') {
			verifySnapshots = true
			continue
		}

		imagePaths.push(value)
	}

	const resolvedFixturesDir = path.resolve(fixturesDir ?? DEFAULT_FIXTURES_DIR)
	if (writeSnapshots && verifySnapshots) {
		throw new Error('Cannot combine --write-snapshots with --verify-snapshots')
	}

	return {
		fixturesDir: resolvedFixturesDir,
		imagePaths: imagePaths.length > 0 ? imagePaths.map((imagePath) => path.resolve(imagePath)) : await listFixtureImages(resolvedFixturesDir),
		json,
		modelsDir,
		snapshotDir,
		verifySnapshots,
		writeSnapshots,
	}
}

async function resolveModelSource(modelsDirArg) {
	const candidateDirs = [
		modelsDirArg,
		process.env.LUCRJOURNAL_OCR_MODELS_DIR,
		DEFAULT_MODELS_DIR,
		path.join(os.homedir(), '.cache', 'ppu-paddle-ocr'),
		...(await findObsidianPluginModelDirs()),
	].filter((value) => typeof value === 'string' && value.length > 0)

	for (const candidateDir of candidateDirs) {
		const localModel = await tryBuildLocalModelSource(candidateDir)
		if (localModel !== undefined) {
			return {
				kind: 'local',
				model: localModel,
			}
		}
	}

	const preferredModelsDir = path.resolve(candidateDirs[0] ?? DEFAULT_MODELS_DIR)
	return {
		kind: 'local',
		model: await downloadModelSource(preferredModelsDir),
	}
}

async function downloadModelSource(modelsDir) {
	await fs.mkdir(modelsDir, { recursive: true })

	const resources = [
		{
			fileName: DEFAULT_MODEL_FILES.detection,
			targetPath: path.join(modelsDir, DEFAULT_MODEL_FILES.detection),
			url: `${MODEL_BASE_URL}/detection/${DEFAULT_MODEL_FILES.detection}`,
		},
		{
			fileName: DEFAULT_MODEL_FILES.recognition,
			targetPath: path.join(modelsDir, DEFAULT_MODEL_FILES.recognition),
			url: `${MODEL_BASE_URL}/recognition/multi/en/v5/${DEFAULT_MODEL_FILES.recognition}`,
		},
		{
			fileName: DEFAULT_MODEL_FILES.dictionary,
			targetPath: path.join(modelsDir, DEFAULT_MODEL_FILES.dictionary),
			url: `${DICT_BASE_URL}/recognition/multi/en/v5/${DEFAULT_MODEL_FILES.dictionary}`,
		},
	]

	for (const resource of resources) {
		if (await fileExists(resource.targetPath)) {
			continue
		}

		const response = await fetch(resource.url)
		if (!response.ok) {
			throw new Error(`Failed to download OCR model resource: ${resource.fileName}`)
		}

		await fs.writeFile(resource.targetPath, Buffer.from(await response.arrayBuffer()))
	}

	return {
		detection: path.join(modelsDir, DEFAULT_MODEL_FILES.detection),
		recognition: path.join(modelsDir, DEFAULT_MODEL_FILES.recognition),
		charactersDictionary: path.join(modelsDir, DEFAULT_MODEL_FILES.dictionary),
	}
}

async function tryBuildLocalModelSource(candidateDir) {
	const resolvedDir = path.resolve(candidateDir)
	const detection = path.join(resolvedDir, DEFAULT_MODEL_FILES.detection)
	const recognition = path.join(resolvedDir, DEFAULT_MODEL_FILES.recognition)
	const charactersDictionary = path.join(resolvedDir, DEFAULT_MODEL_FILES.dictionary)

	if (!(await fileExists(detection)) || !(await fileExists(recognition)) || !(await fileExists(charactersDictionary))) {
		return undefined
	}

	return {
		detection,
		recognition,
		charactersDictionary,
	}
}

async function findObsidianPluginModelDirs() {
	const obsidianRoot = path.join(os.homedir(), 'Library', 'Application Support', 'obsidian')
	const matches = []

	if (!(await fileExists(obsidianRoot))) {
		return matches
	}

	for (const vaultName of await fs.readdir(obsidianRoot)) {
		const modelsDir = path.join(
			obsidianRoot,
			vaultName,
			'.obsidian',
			'plugins',
			'lucrjournal',
			'ocr',
			'models',
		)

		if (await fileExists(modelsDir)) {
			matches.push(modelsDir)
		}
	}

	return matches
}

async function fileExists(targetPath) {
	try {
		await fs.access(targetPath)
		return true
	} catch {
		return false
	}
}

async function listFixtureImages(fixturesDir) {
	if (!(await fileExists(fixturesDir))) {
		return []
	}

	const entries = await fs.readdir(fixturesDir, { withFileTypes: true })

	return entries
		.filter((entry) => entry.isFile() && /\.(?:png|jpe?g|webp)$/iu.test(entry.name))
		.map((entry) => path.join(fixturesDir, entry.name))
		.sort()
}

function toPositionAttachmentRecognition(rawResult) {
	const lines = toPositionAttachmentRecognitionLines(rawResult.lines)

	return {
		confidence: rawResult.confidence,
		lines,
		text: lines.map((line) => line.text).join('\n'),
	}
}

function toPositionAttachmentRecognitionLines(lines) {
	return lines
		.flatMap((line) => splitPositionAttachmentRecognitionLine(line))
}

function splitPositionAttachmentRecognitionLine(line) {
	const segments = []
	let segment = []

	for (const item of line) {
		const text = item.text.trim()
		if (text.length === 0) {
			continue
		}

		const previous = segment.at(-1)
		if (
			previous !== undefined
			&& item.box.x - (previous.box.x + previous.box.width) > OCR_RECOGNITION_LINE_SEGMENT_MAX_GAP
		) {
			segments.push(buildPositionAttachmentRecognitionLine(segment))
			segment = []
		}

		segment.push({
			...item,
			text,
		})
	}

	if (segment.length > 0) {
		segments.push(buildPositionAttachmentRecognitionLine(segment))
	}

	return segments
}

function buildPositionAttachmentRecognitionLine(segment) {
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

function summarizeOutputs(outputs) {
	return outputs.map((output) => ({
		imagePath: output.imagePath,
		modelSource: output.modelSource,
		parsedResult: output.parsedResult,
		recognitionText: output.recognition.text,
		recognitionLines: output.recognition.lines,
	}))
}

function buildSnapshotPayload(output) {
	return {
		...output,
		imagePath: path.relative(process.cwd(), output.imagePath),
		recognition: {
			lines: output.recognition.lines.map((line) => ({
				box: line.box,
				text: line.text,
			})),
			text: output.recognition.text,
		},
	}
}

async function writeSnapshots(outputs, snapshotDir) {
	await fs.mkdir(snapshotDir, { recursive: true })

	for (const output of outputs) {
		const snapshotFilePath = path.join(
			snapshotDir,
			`${path.parse(output.imagePath).name}.snapshot.json`,
		)
		const snapshotPayload = buildSnapshotPayload(output)

		await fs.writeFile(
			snapshotFilePath,
			`${JSON.stringify(snapshotPayload, null, 2)}\n`,
			'utf8',
		)
	}
}

// @story [[lucrjournal/tooling#^ocr-snapshot-verification]] Fails on every missing or byte-different OCR snapshot
async function verifySnapshots(outputs, snapshotDir) {
	const failures = []

	for (const output of outputs) {
		const snapshotFilePath = path.join(
			snapshotDir,
			`${path.parse(output.imagePath).name}.snapshot.json`,
		)

		if (!(await fileExists(snapshotFilePath))) {
			failures.push(`missing snapshot: ${path.relative(process.cwd(), snapshotFilePath)}`)
			continue
		}

		const expectedSnapshot = await fs.readFile(snapshotFilePath, 'utf8')
		const actualSnapshot = `${JSON.stringify(buildSnapshotPayload(output), null, 2)}\n`
		if (expectedSnapshot !== actualSnapshot) {
			failures.push(`snapshot mismatch: ${path.relative(process.cwd(), snapshotFilePath)}`)
		}
	}

	if (failures.length > 0) {
		throw new Error(`OCR snapshot verification failed.\n${failures.join('\n')}`)
	}
}

function formatFatalError(error) {
	if (error instanceof Error) {
		return [
			'OCR test runner failed.',
			`message: ${error.message}`,
			error.stack ? `stack: ${error.stack}` : undefined,
		].filter(Boolean).join('\n')
	}

	return `OCR test runner failed.\nmessage: ${String(error)}`
}

function normalizeCharactersDictionary(dictionaryContent) {
	const lines = dictionaryContent
		.split(/\r?\n/u)

	if (lines.at(-1) === '') {
		lines.pop()
	}

	if (lines[0] !== '') {
		lines.unshift('')
	}

	if (lines.at(-1) !== ' ') {
		lines.push(' ')
	}

	return lines
}

try {
	const modelSource = await resolveModelSource(cli.modelsDir)
	const service = new CanvasNativePaddleOcrService({
		detection: {
			maxSideLength: 2048,
		},
		model: modelSource.model,
		processing: {
			engine: 'canvas-native',
		},
		recognition: {
			strategy: 'per-box',
		},
	})

	await service.initialize()

	try {
		const outputs = []

		for (const imagePath of cli.imagePaths) {
			await fs.access(imagePath)

			const imageBuffer = await fs.readFile(imagePath)
			const imageArrayBuffer = imageBuffer.buffer.slice(
				imageBuffer.byteOffset,
				imageBuffer.byteOffset + imageBuffer.byteLength,
			)
			const rawResult = await service.recognize(imagePath)
			const recognition = toPositionAttachmentRecognition(rawResult)
			const parsedResult = await extractPositionAttachmentOcrResultFromImageRecognition(
				imageArrayBuffer,
				recognition,
			)

			outputs.push({
				imagePath,
				modelSource: modelSource.kind,
				parsedResult,
				recognition,
			})
		}

		if (cli.writeSnapshots) {
			await writeSnapshots(outputs, cli.snapshotDir)
		}

		if (cli.verifySnapshots) {
			await verifySnapshots(outputs, cli.snapshotDir)
		}

		console.log(JSON.stringify(cli.json ? outputs : summarizeOutputs(outputs), null, 2))
	} finally {
		// @story [[lucrjournal/tooling#^ocr-snapshot-verification]] Releases both inference sessions after every runner outcome
		await service.destroy()
	}
} catch (error) {
	console.error(formatFatalError(error))
	process.exit(1)
}
