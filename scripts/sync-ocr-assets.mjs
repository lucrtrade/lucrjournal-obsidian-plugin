import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRootPath = fileURLToPath(new URL('..', import.meta.url))
const OCR_ASSET_ROOT = 'assets/ocr'
const ONNX_RUNTIME_ASSET_DIR = 'onnxruntime-web'
const OCR_MODEL_ASSET_DIR = 'models'
const ONNX_RUNTIME_MODULE_FILE = 'ort-wasm-simd-threaded.jsep.mjs'
const ONNX_RUNTIME_WASM_FILE = 'ort-wasm-simd-threaded.jsep.wasm'
const OCR_MODEL_BASE_URL = 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main'
const OCR_DICT_BASE_URL = 'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main'

export function resolveGitHubRepositorySlug(packageJson) {
	const repository = typeof packageJson.repository === 'string'
		? packageJson.repository
		: packageJson.repository?.url

	if (typeof repository !== 'string') {
		throw new Error('Missing package.json repository')
	}

	const match = repository.match(/github\.com[:/]([^/\s]+\/[^/\s#?]+)(?:\.git)?(?:[#?].*)?$/)
	if (match === null || match[1] === undefined) {
		throw new Error(`Unsupported package.json repository: ${repository}`)
	}

	return match[1].replace(/\.git$/, '')
}

export function buildRepositoryRawAssetBaseUrl(packageJson, ref = 'main') {
	return `https://raw.githubusercontent.com/${resolveGitHubRepositorySlug(packageJson)}/${ref}/${OCR_ASSET_ROOT}`
}

export function readPackageOnnxRuntimeVersion(packageJson) {
	const versionRange = packageJson.dependencies?.['onnxruntime-web'] ?? packageJson.devDependencies?.['onnxruntime-web']
	if (typeof versionRange !== 'string') {
		throw new Error('Missing onnxruntime-web dependency')
	}

	const match = versionRange.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
	if (match === null || match[0] === undefined) {
		throw new Error(`Unsupported onnxruntime-web dependency version: ${versionRange}`)
	}

	return match[0]
}

export function buildOcrAssetPlan(packageJson) {
	const onnxRuntimeVersion = readPackageOnnxRuntimeVersion(packageJson)

	return [
		{
			path: `${ONNX_RUNTIME_ASSET_DIR}/${ONNX_RUNTIME_MODULE_FILE}`,
			source: `npm:onnxruntime-web@${onnxRuntimeVersion}/dist/${ONNX_RUNTIME_MODULE_FILE}`,
			sourcePath: `node_modules/onnxruntime-web/dist/${ONNX_RUNTIME_MODULE_FILE}`,
		},
		{
			path: `${ONNX_RUNTIME_ASSET_DIR}/${ONNX_RUNTIME_WASM_FILE}`,
			source: `npm:onnxruntime-web@${onnxRuntimeVersion}/dist/${ONNX_RUNTIME_WASM_FILE}`,
			sourcePath: `node_modules/onnxruntime-web/dist/${ONNX_RUNTIME_WASM_FILE}`,
		},
		{
			path: `${OCR_MODEL_ASSET_DIR}/PP-OCRv5_mobile_det_infer.onnx`,
			source: `${OCR_MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`,
		},
		{
			path: `${OCR_MODEL_ASSET_DIR}/en_PP-OCRv5_mobile_rec_infer.onnx`,
			source: `${OCR_MODEL_BASE_URL}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.onnx`,
		},
		{
			path: `${OCR_MODEL_ASSET_DIR}/ppocrv5_en_dict.txt`,
			source: `${OCR_DICT_BASE_URL}/recognition/multi/en/v5/ppocrv5_en_dict.txt`,
		},
	]
}

export function verifyLocalOcrAssets({ expectedManifest, expectedOnnxRuntimeVersion, rootPath }) {
	const manifestPath = join(rootPath, OCR_ASSET_ROOT, 'manifest.json')
	if (!existsSync(manifestPath)) {
		throw new Error('Missing OCR asset manifest')
	}

	const manifestText = readFileSync(manifestPath, 'utf8')
	const manifest = JSON.parse(manifestText)
	if (manifest.onnxruntimeWebVersion !== expectedOnnxRuntimeVersion) {
		throw new Error('OCR asset manifest onnxruntime-web version mismatch')
	}

	if (!Array.isArray(manifest.files)) {
		throw new Error('OCR asset manifest files must be an array')
	}

	for (const file of manifest.files) {
		const assetPath = join(rootPath, OCR_ASSET_ROOT, file.path)
		if (!existsSync(assetPath)) {
			throw new Error(`Missing OCR asset: ${file.path}`)
		}

		const bytes = readFileSync(assetPath)
		if (bytes.byteLength !== file.size) {
			throw new Error(`OCR asset size mismatch: ${file.path}`)
		}

		const sha256 = sha256Hex(bytes)
		if (sha256 !== file.sha256) {
			throw new Error(`OCR asset hash mismatch: ${file.path}`)
		}
	}

	const expectedPaths = new Set(['manifest.json', ...manifest.files.map((file) => file.path)])
	for (const filePath of listAssetFiles(join(rootPath, OCR_ASSET_ROOT))) {
		if (!expectedPaths.has(filePath)) {
			throw new Error(`Unexpected OCR asset: ${filePath}`)
		}
	}

	if (expectedManifest !== undefined && normalizeJson(manifest) !== normalizeJson(expectedManifest)) {
		throw new Error('OCR asset manifest mismatch. Run npm run ocr:assets.')
	}

	return manifest
}

export async function syncOcrAssets({ check = false, rootPath = projectRootPath } = {}) {
	const packageJson = readPackageJson(rootPath)
	const onnxRuntimeVersion = readPackageOnnxRuntimeVersion(packageJson)

	assertInstalledOnnxRuntimeVersion(rootPath, onnxRuntimeVersion)

	const plan = buildOcrAssetPlan(packageJson)
	const files = []

	for (const asset of plan) {
		const bytes = await readSourceAssetBytes(rootPath, asset)
		const file = {
			path: asset.path,
			sha256: sha256Hex(bytes),
			size: bytes.byteLength,
			source: asset.source,
		}

		files.push(file)

		if (!check) {
			writeAsset(rootPath, asset.path, bytes)
		}
	}

	const manifest = {
		files,
		generatedBy: 'scripts/sync-ocr-assets.mjs',
		onnxruntimeWebVersion: onnxRuntimeVersion,
		repository: resolveGitHubRepositorySlug(packageJson),
	}

	if (check) {
		verifyLocalOcrAssets({
			expectedManifest: manifest,
			expectedOnnxRuntimeVersion: onnxRuntimeVersion,
			rootPath,
		})
		return manifest
	}

	writeManifest(rootPath, manifest)
	return manifest
}

function readPackageJson(rootPath) {
	return JSON.parse(readFileSync(join(rootPath, 'package.json'), 'utf8'))
}

function assertInstalledOnnxRuntimeVersion(rootPath, expectedVersion) {
	const packageJson = JSON.parse(readFileSync(join(rootPath, 'node_modules/onnxruntime-web/package.json'), 'utf8'))
	if (packageJson.version !== expectedVersion) {
		throw new Error(`Installed onnxruntime-web version ${packageJson.version} does not match package.json ${expectedVersion}`)
	}
}

async function readSourceAssetBytes(rootPath, asset) {
	if (asset.sourcePath !== undefined) {
		return readFileSync(join(rootPath, asset.sourcePath))
	}

	const response = await fetch(asset.source)
	if (!response.ok) {
		throw new Error(`Unable to download OCR asset ${asset.source}: ${response.status}`)
	}

	return Buffer.from(await response.arrayBuffer())
}

function writeAsset(rootPath, relativePath, bytes) {
	const assetPath = join(rootPath, OCR_ASSET_ROOT, relativePath)
	mkdirSync(dirname(assetPath), { recursive: true })
	writeFileSync(assetPath, bytes)
}

function writeManifest(rootPath, manifest) {
	const manifestPath = join(rootPath, OCR_ASSET_ROOT, 'manifest.json')
	mkdirSync(dirname(manifestPath), { recursive: true })
	writeFileSync(manifestPath, `${normalizeJson(manifest)}\n`)
}

function sha256Hex(bytes) {
	return createHash('sha256').update(bytes).digest('hex')
}

function normalizeJson(value) {
	return JSON.stringify(value, null, '\t')
}

function listAssetFiles(rootPath, prefix = '') {
	const files = []
	for (const entry of readdirSync(join(rootPath, prefix), { withFileTypes: true })) {
		const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
		if (entry.isDirectory()) {
			files.push(...listAssetFiles(rootPath, relativePath))
			continue
		}

		if (entry.isFile()) {
			files.push(relativePath)
		}
	}

	return files
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2)
	const check = args.includes('--check')
	const unknownArgs = args.filter((arg) => arg !== '--check')
	if (unknownArgs.length > 0) {
		throw new Error(`Unknown arguments: ${unknownArgs.join(', ')}`)
	}

	await syncOcrAssets({ check })
	console.log(check ? 'OCR assets verified.' : 'OCR assets synced.')
}
