import { copyFileSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./check-unused-code.ts', import.meta.url))
const nodeModulesPath = fileURLToPath(new URL('../node_modules', import.meta.url))

function withTempProject(run) {
	const rawRootPath = join(tmpdir(), `lucrjournal-unused-code-${Date.now()}-${Math.random()}`)
	mkdirSync(rawRootPath, { recursive: true })
	const rootPath = realpathSync(rawRootPath)
	mkdirSync(rootPath, { recursive: true })
	mkdirSync(join(rootPath, 'scripts'), { recursive: true })
	mkdirSync(join(rootPath, '.agents/skills/demo/scripts'), { recursive: true })
	mkdirSync(join(rootPath, 'src/lang/locale'), { recursive: true })
	mkdirSync(join(rootPath, 'src/styles'), { recursive: true })
	symlinkSync(nodeModulesPath, join(rootPath, 'node_modules'), 'dir')
	copyFileSync(scriptPath, join(rootPath, 'scripts/check-unused-code.ts'))

	try {
		return run(rootPath)
	} finally {
		rmSync(rootPath, { force: true, recursive: true })
	}
}

function writeProject(rootPath) {
	writeFileSync(join(rootPath, 'tsconfig.json'), JSON.stringify({
		compilerOptions: {
			module: 'ESNext',
			moduleResolution: 'bundler',
			target: 'ES2021',
		},
		include: ['src/**/*.ts'],
	}))
	writeFileSync(join(rootPath, 'src/lang/locale/en.ts'), '')
	writeFileSync(join(rootPath, 'src/styles/main.pcss'), '')
	writeFileSync(join(rootPath, 'src/pair.ts'), [
		'export function parseSymbolPair() {',
		"\treturn 'BTC/USDT'",
		'}',
		'',
		'export function aliasedHelper() {',
		"\treturn 'aliased'",
		'}',
		'',
		'export function normalizeCcxtSymbol() {',
		'\treturn parseSymbolPair()',
		'}',
		'',
	].join('\n'))
	writeFileSync(join(rootPath, 'src/catalog.ts'), [
		'export {',
		'\tnormalizeCcxtSymbol,',
		'\tparseSymbolPair,',
		'\taliasedHelper as publicAliasedHelper,',
		"} from './pair'",
		'',
	].join('\n'))
	writeFileSync(join(rootPath, 'src/consumer.ts'), [
		"import { normalizeCcxtSymbol } from './catalog'",
		'',
		'normalizeCcxtSymbol()',
		'',
	].join('\n'))
}

describe('unused code check', () => {
	it('does not count barrel re-exports as consumers', () =>
		withTempProject((rootPath) => {
			writeProject(rootPath)

			const result = spawnSync(process.execPath, ['scripts/check-unused-code.ts'], {
				cwd: rootPath,
				encoding: 'utf8',
			})

			expect(result.status).toBe(1)
			expect(result.stderr).toContain('unnecessary exports')
			expect(result.stderr).toContain('parseSymbolPair')
			expect(result.stderr).not.toContain('aliasedHelper')
		}))

	it('counts agent skill scripts as external consumers', () =>
		withTempProject((rootPath) => {
			writeProject(rootPath)
			writeFileSync(join(rootPath, '.agents/skills/demo/scripts/reference.ts'), 'parseSymbolPair\n')

			const result = spawnSync(process.execPath, ['scripts/check-unused-code.ts'], {
				cwd: rootPath,
				encoding: 'utf8',
			})

			expect(result.status).toBe(0)
			expect(result.stdout).toContain('unused code check passed.')
		}))
})
