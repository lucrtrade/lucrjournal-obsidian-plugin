import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const rootPath = fileURLToPath(new URL('../', import.meta.url))
const mainPath = fileURLToPath(new URL('../main.js', import.meta.url))
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const defaultLucrchartUrl = 'https://lucrchart.lucrtrade.com/'
const originalMain = existsSync(mainPath) ? readFileSync(mainPath, 'utf8') : null
const originalPackage = readFileSync(packagePath, 'utf8')

function restoreMain() {
	if (originalMain === null) {
		rmSync(mainPath, { force: true })
		return
	}

	writeFileSync(mainPath, originalMain)
}

describe('esbuild config', () => {
	afterEach(() => {
		restoreMain()
		writeFileSync(packagePath, originalPackage)
	})

	it('uses default LucrChart URL without env override', () => {
		const result = spawnSync(process.execPath, ['esbuild.config.ts', 'development', 'build'], {
			cwd: rootPath,
			encoding: 'utf8',
			env: {
				...process.env,
				LUCRCHART_URL: undefined,
			},
		})

		expect(result.status).toBe(0)
		expect(readFileSync(mainPath, 'utf8').includes(defaultLucrchartUrl)).toBe(true)
	})

	it('uses LUCRCHART_URL env override for development bundle', () => {
		const url = 'http://127.0.0.1:5173/'
		const result = spawnSync(process.execPath, ['esbuild.config.ts', 'development', 'build'], {
			cwd: rootPath,
			encoding: 'utf8',
			env: {
				...process.env,
				LUCRCHART_URL: url,
			},
		})

		expect(result.status).toBe(0)
		expect(readFileSync(mainPath, 'utf8').includes(url)).toBe(true)
	})

	it('keeps production bundle on default LucrChart URL', () => {
		const url = 'http://127.0.0.1:5173/'
		const result = spawnSync(process.execPath, ['esbuild.config.ts', 'production', 'build'], {
			cwd: rootPath,
			encoding: 'utf8',
			env: {
				...process.env,
				LUCRCHART_URL: url,
			},
		})
		const bundle = readFileSync(mainPath, 'utf8')

		expect(result.status).toBe(0)
		expect(bundle.includes(url)).toBe(false)
		expect(bundle.includes(defaultLucrchartUrl)).toBe(true)
	})

	it('appends package chart_version to LucrChart iframe URL', () => {
		const packageJson = JSON.parse(originalPackage)
		packageJson.chart_version = '1.123'
		writeFileSync(packagePath, `${JSON.stringify(packageJson, null, '\t')}\n`)

		const result = spawnSync(process.execPath, ['esbuild.config.ts', 'development', 'build'], {
			cwd: rootPath,
			encoding: 'utf8',
			env: {
				...process.env,
				LUCRCHART_URL: undefined,
			},
		})

		expect(result.status).toBe(0)
		expect(readFileSync(mainPath, 'utf8').includes(`${defaultLucrchartUrl.replace(/\/$/, '')}/lc/1.123`)).toBe(true)
	})
})
