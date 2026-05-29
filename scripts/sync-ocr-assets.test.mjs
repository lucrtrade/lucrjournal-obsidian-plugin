import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
	buildOcrAssetPlan,
	buildRepositoryRawAssetBaseUrl,
	readPackageOnnxRuntimeVersion,
	resolveGitHubRepositorySlug,
	verifyLocalOcrAssets,
} from './sync-ocr-assets.mjs'

function withTempRoot(run) {
	const rootPath = join(tmpdir(), `lucrjournal-ocr-assets-${Date.now()}-${Math.random()}`)
	mkdirSync(rootPath, { recursive: true })

	try {
		return run(rootPath)
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
})
