import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const rootPath = fileURLToPath(new URL('../', import.meta.url))
const syncWorkflowPath = fileURLToPath(new URL('../.github/workflows/sync.yml', import.meta.url))

function extractSyncignoreCheck() {
	const workflow = readFileSync(syncWorkflowPath, 'utf8')
	const marker = "                  bun - <<'BUN'\n                  const fs = require('fs')"
	const start = workflow.indexOf(marker)
	expect(start).toBeGreaterThan(-1)
	const bodyStart = start + "                  bun - <<'BUN'\n".length
	const end = workflow.indexOf('\n                  BUN', bodyStart)
	expect(end).toBeGreaterThan(bodyStart)
	return workflow.slice(bodyStart, end).replace(/^                  /gm, '')
}

describe('sync workflow', () => {
	it('fails when .syncignore contains a stale file entry', async () => {
		const root = join(tmpdir(), `lucrjournal-sync-workflow-${Date.now()}-${Math.random()}`)
		mkdirSync(join(root, 'source'), { recursive: true })
		writeFileSync(join(root, 'source/.syncignore'), '/present.ts\n/missing.ts\n')
		writeFileSync(join(root, 'ignored-verbose.z'), [
			'.gitignore',
			'1',
			'/present.ts',
			'present.ts',
			'',
		].join('\0'))

		try {
			const result = spawnSync(process.execPath, ['-'], {
				cwd: root,
				encoding: 'utf8',
				env: {
					...process.env,
					IGNORED_VERBOSE_LIST: join(root, 'ignored-verbose.z'),
				},
				input: extractSyncignoreCheck(),
			})

			expect(result.status).toBe(1)
			expect(result.stderr).toContain('Stale .syncignore entries:')
			expect(result.stderr).toContain('2: /missing.ts')
		} finally {
			rmSync(root, { force: true, recursive: true })
		}
	})
})
