import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
	buildOcrAssetPlan,
	buildRepositoryRawAssetBaseUrl,
	readPackageOnnxRuntimeVersion,
	resolveGitHubRepositorySlug,
	syncOcrAssets,
	verifyLocalOcrAssets,
} from './sync-ocr-assets.ts'

function withTempRoot(run) {
	const rootPath = join(tmpdir(), `lucrjournal-ocr-assets-${Date.now()}-${Math.random()}`)
	mkdirSync(rootPath, { recursive: true })

	try {
		return run(rootPath)
	} finally {
		rmSync(rootPath, { force: true, recursive: true })
	}
}

async function withTempRootAsync(run) {
	const rootPath = join(tmpdir(), `lucrjournal-ocr-assets-${Date.now()}-${Math.random()}`)
	mkdirSync(rootPath, { recursive: true })

	try {
		return await run(rootPath)
	} finally {
		rmSync(rootPath, { force: true, recursive: true })
	}
}

describe('sync OCR assets', () => {
	it('builds repository raw asset base from package repository', () => {
		const packageJson = {
			repository: 'https://github.com/lucrtrade/lucrjournal-obsidian-plugin',
		}

		expect(resolveGitHubRepositorySlug(packageJson)).toBe('lucrtrade/lucrjournal-obsidian-plugin')
		expect(buildRepositoryRawAssetBaseUrl(packageJson)).toBe(
			'https://raw.githubusercontent.com/lucrtrade/lucrjournal-obsidian-plugin/main/assets/ocr',
		)
	})

	// @story [[lucrjournal/ocr#^sync-ocr-assets]] Covers package-version-bound runtime sources
	it('uses the package onnxruntime-web version for runtime assets', () => {
		const packageJson = {
			dependencies: {
				'onnxruntime-web': '^1.25.1',
			},
		}
		const assets = buildOcrAssetPlan(packageJson)

		expect(readPackageOnnxRuntimeVersion(packageJson)).toBe('1.25.1')
		expect(assets[0].source).toBe('npm:onnxruntime-web@1.25.1/dist/ort-wasm-simd-threaded.jsep.mjs')
		expect(assets[1].source).toBe('npm:onnxruntime-web@1.25.1/dist/ort-wasm-simd-threaded.jsep.wasm')
	})

	// @story [[lucrjournal/ocr#^verify-ocr-assets]] Covers fail-closed SHA-256 verification
	it('throws when committed asset content does not match the manifest', () =>
		withTempRoot((rootPath) => {
			mkdirSync(join(rootPath, 'assets/ocr/onnxruntime-web'), { recursive: true })
			writeFileSync(join(rootPath, 'assets/ocr/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs'), 'changed')
			writeFileSync(join(rootPath, 'assets/ocr/manifest.json'), JSON.stringify({
				files: [
					{
						path: 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs',
						sha256: '1111111111111111111111111111111111111111111111111111111111111111',
						size: 7,
					},
				],
				onnxruntimeWebVersion: '1.25.1',
			}))

			expect(() =>
				verifyLocalOcrAssets({
					expectedOnnxRuntimeVersion: '1.25.1',
					rootPath,
				}),
			).toThrow('OCR asset hash mismatch')
		}))

	// @story [[lucrjournal/ocr#^verify-ocr-assets]] Covers rejecting files outside the manifest
	it('throws when committed assets contain files outside the manifest', () =>
		withTempRoot((rootPath) => {
			mkdirSync(join(rootPath, 'assets/ocr/models'), { recursive: true })
			writeFileSync(join(rootPath, 'assets/ocr/models/orphan.onnx'), 'orphan')
			writeFileSync(join(rootPath, 'assets/ocr/manifest.json'), JSON.stringify({
				files: [],
				onnxruntimeWebVersion: '1.25.1',
			}))

			expect(() =>
				verifyLocalOcrAssets({
					expectedOnnxRuntimeVersion: '1.25.1',
					rootPath,
				}),
			).toThrow('Unexpected OCR asset')
		}))

	// @story [[lucrjournal/ocr#^verify-ocr-assets]] Covers a complete local check without network access
	it('checks committed OCR assets without network access', async () =>
		await withTempRootAsync(async (rootPath) => {
			writeFileSync(join(rootPath, 'package.json'), JSON.stringify({
				dependencies: {
					'onnxruntime-web': '^1.25.1',
				},
				repository: 'https://github.com/lucrtrade/lucrjournal-obsidian-plugin',
			}))
			mkdirSync(join(rootPath, 'node_modules/onnxruntime-web/dist'), { recursive: true })
			writeFileSync(join(rootPath, 'node_modules/onnxruntime-web/package.json'), JSON.stringify({ version: '1.25.1' }))

			const assets = buildOcrAssetPlan({
				dependencies: {
					'onnxruntime-web': '^1.25.1',
				},
			})
			const fileBytes = new Map(assets.map((asset, index) => [asset.path, `asset-${index}`]))
			for (const [path, content] of fileBytes) {
				mkdirSync(join(rootPath, 'assets/ocr', path, '..'), { recursive: true })
				writeFileSync(join(rootPath, 'assets/ocr', path), content)
			}
			for (const asset of assets) {
				if (asset.sourcePath !== undefined) {
					mkdirSync(join(rootPath, asset.sourcePath, '..'), { recursive: true })
					writeFileSync(join(rootPath, asset.sourcePath), fileBytes.get(asset.path))
				}
			}
			writeFileSync(join(rootPath, 'assets/ocr/manifest.json'), `${JSON.stringify({
				files: assets.map((asset) => {
					const content = fileBytes.get(asset.path)
					return {
						path: asset.path,
						sha256: createHash('sha256').update(content).digest('hex'),
						size: Buffer.byteLength(content),
						source: asset.source,
					}
				}),
				generatedBy: 'scripts/sync-ocr-assets.ts',
				onnxruntimeWebVersion: '1.25.1',
				repository: 'lucrtrade/lucrjournal-obsidian-plugin',
			}, null, '\t')}\n`)

			const originalFetch = globalThis.fetch
			globalThis.fetch = () => {
				throw new Error('network disabled')
			}

			try {
				await expect(syncOcrAssets({ check: true, rootPath })).resolves.toBeDefined()
			} finally {
				globalThis.fetch = originalFetch
			}
		}))
})
