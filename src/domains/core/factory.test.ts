import { type } from 'arktype'
import { TFile, type App } from 'obsidian'
import { describe, expect, it } from 'vitest'

import { coerceFrontmatterField, coerceLiteral, coerceNullableString, type CoercibleFrontmatter } from '../../utils/frontmatter-coerce'

import { DomainBase } from './factory'

import type { FormDefinition } from './form'
import type { DomainRuntimeApp, DomainRuntimeFile } from './type'

const DemoEntryType = type({
	lucr_type: '"demo"',
	name: 'string',
})

const demoFormDefinition = {
	name: { type: 'text', label: 'Name', required: true },
} as const satisfies FormDefinition

class DemoDomainDefinition extends DomainBase<'demo', typeof DemoEntryType, typeof demoFormDefinition> {
	override readonly name = 'demo' as const
	override readonly schema = DemoEntryType
	override readonly options = { persisted: null }
	override readonly formDefinition = demoFormDefinition
	override readonly createEntryDescriptor = {
		buildId(entry: typeof DemoEntryType.infer) {
			return entry.name 
		},
		buildPayload(formValue: { name: string }) {
			return DemoEntryType.assert({ lucr_type: 'demo', name: formValue.name })
		},
		buildBody() {
			return '\n# Demo\n' 
		},
		buildFileName(entry: typeof DemoEntryType.infer) {
			return entry.name 
		},
	}
	override coerce(record: CoercibleFrontmatter<typeof DemoEntryType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'demo'))
		coerceFrontmatterField(record, 'name', coerceNullableString)
		return record
	}
	override toDebugLabel(entry: typeof DemoEntryType.infer) {
		return `demo:${entry.name}` 
	}

	override normalizePatch(patch: Record<string, unknown>) {
		const nextPatch = { ...patch }
		delete nextPatch.ignored
		return nextPatch
	}

	override beforeSave({
		record,
		patch,
	}: {
		app: App
		file: TFile
		previousRecord: Record<string, unknown>
		record: Record<string, unknown>
		patch: Record<string, unknown>
	}) {
		if (patch.name === '') {
			delete record.name
			record.note = 'cleared'
		}
		if (patch.name === 'Beta') {
			delete record.legacy
		}
	}
}
const DemoDomain = new DemoDomainDefinition()

describe('DomainBase', () => {
	// @story [[lucrjournal/domain-model#^read-domain-entries]] Covers type routing and schema-refined reads
	it('collects matching cached frontmatter entries and validates them', () => {
		const runtime = createRuntime([
			{ path: 'demo-1.md', frontmatter: { lucr_type: 'demo', name: 'Alpha' } },
			{ path: 'other.md', frontmatter: { lucr_type: 'other', name: 'Beta' } },
			{ path: 'no-frontmatter.md' },
		])

		expect(DemoDomain.totalEntries(runtime)).toEqual([
			{
				file: { path: 'demo-1.md' },
				fm: { lucr_type: 'demo', name: 'Alpha' },
			},
		])
	})

	// @story [[lucrjournal/domain-model#^read-domain-entries]] Covers lenient discriminator matching before refinement
	it('matches lucr_type leniently and keeps casted values', () => {
		const runtime = createRuntime([
			{ path: 'demo-1.md', frontmatter: { lucr_type: 'Demo', name: 123 } },
		])

		expect(DemoDomain.totalEntries(runtime)).toEqual([
			{
				file: { path: 'demo-1.md' },
				fm: { lucr_type: 'demo', name: '123' },
			},
		])
	})

	// @story [[lucrjournal/domain-model#^read-domain-entries]] Covers rejection of invalid matching frontmatter
	it('skips matching cached frontmatter entries that fail schema validation', () => {
		const runtime = createRuntime([
			{ path: 'broken.md', frontmatter: { lucr_type: 'demo', name: { bad: true } } },
		])

		expect(DemoDomain.totalEntries(runtime)).toEqual([])
	})

	// @story [[lucrjournal/domain-model#^update-domain-entry]] Covers normalized patching, hooks, validation failure, and persisted deletion
	it('runs beforeSave during frontmatter patch updates and persists deletions', async () => {
		const file = Object.assign(new TFile(), { path: 'demo-1.md', basename: 'demo-1' })
		let frontmatter: Record<string, unknown> = {
			lucr_type: 'demo',
			name: 'Alpha',
			legacy: true,
		}
		const app = {
			fileManager: {
				processFrontMatter: async (_file: TFile, updater: (nextFrontmatter: Record<string, unknown>) => void) => {
					updater(frontmatter)
				},
			},
		} as App

		await expect(DemoDomain.updateFields(app, file, { name: '' })).rejects.toThrow('Invalid demo frontmatter after update')
		expect(frontmatter).toEqual({
			lucr_type: 'demo',
			name: 'Alpha',
			legacy: true,
		})

		const updated = await DemoDomain.updateFields(app, file, { name: 'Beta', ignored: true })
		expect(updated).toEqual({
			lucr_type: 'demo',
			name: 'Beta',
		})
		expect(frontmatter).toEqual({
			lucr_type: 'demo',
			name: 'Beta',
		})
	})
})

function createRuntime(
	entries: Array<{ path: string; frontmatter?: unknown }>,
): DomainRuntimeApp {
	const files: DomainRuntimeFile[] = entries.map(({ path }) => ({ path }))
	const cacheByFile = new Map<DomainRuntimeFile, { frontmatter?: unknown } | null>(
		files.map((file, index) => {
			const frontmatter = entries[index]?.frontmatter

			if (frontmatter === undefined) {
				return [file, {}]
			}

			return [file, { frontmatter }]
		}),
	)

	return {
		vault: {
			getMarkdownFiles: () => files,
		},
		metadataCache: {
			getFileCache: (file) => cacheByFile.get(file) ?? null,
		},
	}
}
