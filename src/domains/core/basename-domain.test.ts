import { type } from 'arktype'
import { describe, expect, it } from 'vitest'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'

import { BasenameDomainBase } from './basename-domain'

const DemoType = type({
	lucr_type: '"demo_name"',
})

class DemoNameDomain extends BasenameDomainBase<'demo_name', typeof DemoType> {
	override readonly name = 'demo_name' as const
	override readonly schema = DemoType
	override readonly options = { persisted: { folderName: 'demo' } }
	protected override readonly folderName = 'demo'
	protected override readonly nameRequiredError = 'DEMO_NAME_REQUIRED'

	override toDebugLabel() {
		return this.name
	}
}

const DemoDomain = new DemoNameDomain()

class CustomNameDomain extends DemoNameDomain {
	protected override nameLabel() {
		return 'FORM_PLATFORM_NAME'
	}

	protected override validateNameConflict(_value: string) {
		throw new Error('CUSTOM_CONFLICT')
	}
}

const CustomDomain = new CustomNameDomain()

describe('BasenameDomainBase', () => {
	it('builds basename-driven entries and maps create errors', async () => {
		const created: Array<{ path: string; content: string }> = []
		const app = {
			vault: {
				getMarkdownFiles: () => [],
				create: async (path: string, content: string) => {
					created.push({ path, content })
					return { path }
				},
			},
			metadataCache: {
				getFileCache: () => null,
			},
		}

		const result = await DemoDomain.createEntry(app as never, { name: ' Alpha/Beta ' })

		expect(result.files).toEqual([{ path: `${LUCR_TRADE_ROOT_DIR}/demo/Alpha∕Beta.md` }])
		expect(created[0]?.content).toContain('lucr_type: "demo_name"')
		expect(created[0]?.content).toMatch(/\n---\n$/)
		expect(DemoDomain.toCreateEntryErrorMessageKey(new Error('DEMO_NAME_REQUIRED')))
			.toBe('DASHBOARD_ENTRY_FIELD_NAME_REQUIRED')
	})

	it('allows subclasses to customize name label and conflict checks', async () => {
		expect(CustomDomain.formDefinition.name.label).toBe('FORM_PLATFORM_NAME')
		await expect(CustomDomain.createEntry({} as never, { name: 'Alpha' }))
			.rejects.toThrow('CUSTOM_CONFLICT')
	})

	it('rejects empty and whitespace-only names with the required key', async () => {
		const app = {
			vault: { getMarkdownFiles: () => [], create: async () => ({ path: 'unreached' }) },
			metadataCache: { getFileCache: () => null },
		} as never

		await expect(DemoDomain.createEntry(app, { name: '' }))
			.rejects.toThrow('DEMO_NAME_REQUIRED')
		await expect(DemoDomain.createEntry(app, { name: '   ' }))
			.rejects.toThrow('DEMO_NAME_REQUIRED')
	})

	it('rejects a basename that already exists in any persisted folder', async () => {
		const app = {
			vault: {
				getMarkdownFiles: () => [{
					path: `${LUCR_TRADE_ROOT_DIR}/demo/Alpha.md`,
					basename: 'Alpha',
				}],
				create: async () => ({ path: 'unreached' }),
			},
			metadataCache: { getFileCache: () => null },
		} as never

		await expect(DemoDomain.createEntry(app, { name: 'Alpha' }))
			.rejects.toThrow('PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR')
		expect(DemoDomain.toCreateEntryErrorMessageKey(new Error('PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR')))
			.toBe('DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE')
	})
})
