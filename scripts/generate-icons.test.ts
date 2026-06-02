import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const generatedIconsPath = fileURLToPath(new URL('../src/generated-icons/', import.meta.url))

const collectSvgFiles = (directory) =>
	readdirSync(directory, {
		withFileTypes: true,
	}).flatMap((entry) => {
		const file = join(directory, entry.name)
		if (entry.isDirectory()) {
			return collectSvgFiles(file)
		}

		return entry.isFile() && entry.name.endsWith('.svg') ? [file] : []
	})

describe('generated icons', () => {
	it('do not embed LucrJournal cache metadata comments in SVG files', () => {
		const files = collectSvgFiles(generatedIconsPath)
		const offenders = files.filter((file) => readFileSync(file, 'utf8').includes('<!-- lucrjournal-icon:'))

		expect(offenders).toEqual([])
	})
})
