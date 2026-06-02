import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./update-bundle-size.ts', import.meta.url))

function withTempProject(run) {
	const rawRootPath = join(tmpdir(), `lucrjournal-bundle-size-${Date.now()}-${Math.random()}`)
	mkdirSync(rawRootPath, { recursive: true })
	const rootPath = realpathSync(rawRootPath)

	try {
		return run(rootPath)
	} finally {
		rmSync(rootPath, { force: true, recursive: true })
	}
}

describe('bundle size record', () => {
	it('builds production artifacts before writing deterministic sizes', () =>
		withTempProject((rootPath) => {
			writeFileSync(join(rootPath, 'package.json'), JSON.stringify({
				type: 'module',
				scripts: {
					'build:bundle:prod': 'bun build-prod.ts',
				},
			}))
			writeFileSync(join(rootPath, 'build-prod.ts'), [
				"import { writeFileSync } from 'node:fs'",
				"writeFileSync('main.js', 'a'.repeat(1536))",
				"writeFileSync('styles.css', 'b'.repeat(10))",
				'',
			].join('\n'))

			const result = spawnSync(process.execPath, [scriptPath], {
				cwd: rootPath,
				encoding: 'utf8',
			})

			expect(result.status).toBe(0)
			expect(result.stderr).toBe('')
			expect(JSON.parse(readFileSync(join(rootPath, 'bundle-size.json'), 'utf8'))).toEqual({
				build: 'production',
				files: [
					{ path: 'main.js', bytes: 1536, size: '1.50 KiB' },
					{ path: 'styles.css', bytes: 10, size: '10 B' },
				],
				total: { bytes: 1546, size: '1.51 KiB' },
			})
		}))
})
