/// <reference types="vitest/importMeta" />

import { type } from 'arktype'
import { normalizePath, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import {
	coerceFrontmatterField,
	coerceLiteral,
	coerceLowercaseString,
	coerceNullableString,
	normalizeLucrTypeName,
} from '../../utils/frontmatter-coerce'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce, buildDomainTimestamps } from '../core/domain-timestamps'
import { DomainBase } from '../core/factory'

import type { CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import type { FormDefinition } from '../core/form'
import type { DomainRuntimeApp } from '../core/type'

const TemplateType = type({
	lucr_type: '"template"',
	...DOMAIN_TIMESTAMP_FIELDS,
	tpl_type: '"position" | "playbook" | "analysis"',
	'name?': 'string | null',
	'description?': 'string | null',
})

const templateFormDefinition = {} as const satisfies FormDefinition

class TemplateDomainDefinition extends DomainBase<'template', typeof TemplateType, typeof templateFormDefinition> {
	override readonly name = 'template' as const
	override readonly schema = TemplateType
	override readonly options = { persisted: { folderName: 'templates' } }
	override readonly formDefinition = templateFormDefinition
	override readonly createEntryDescriptor = {
		buildId(template: Template) {
			return toTemplateDisplayName(template.name) ?? `${template.tpl_type}-template`
		},
		// @story [[lucrjournal/position#^position-template-generic-rejected]] Rejects generic factory creation before any template write
		buildPayload(): never {
			throw new Error('Template entries are created via createPositionTemplate()') 
		},
		// @story [[lucrjournal/position#^position-template-generic-rejected]] Rejects direct generic body construction for templates
		buildBody(): never {
			throw new Error('Template entries are created via createPositionTemplate()') 
		},
		// @story [[lucrjournal/position#^position-template-generic-rejected]] Rejects direct generic filename construction for templates
		buildFileName(): never {
			throw new Error('Template entries are created via createPositionTemplate()') 
		},
	}
	override coerce(record: CoercibleFrontmatter<typeof TemplateType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'template'))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(record, 'tpl_type', coerceLowercaseString)
		coerceFrontmatterField(record, 'name', coerceNullableString)
		coerceFrontmatterField(record, 'description', coerceNullableString)
		return record
	}
	override toDebugLabel(template: Template) {
		return `${this.name}:${template.name ?? '-'}` 
	}
}
export const TemplateDomain = new TemplateDomainDefinition()

type Template = typeof TemplateType.infer
export type PositionTemplateSummary = {
	filePath: string
	name: string | null
	description: string | null
}

// @story [[lucrjournal/position#^position-template-manual-create]] Creates the next manually serialized position template file
export async function createPositionTemplate(app: App, name?: string | null): Promise<PositionTemplateSummary> {
	const folder = getPersistedFolderPath()
	if (!app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder)
	}

	const existingIds = app.vault.getMarkdownFiles()
		.filter((f) => f.path.startsWith(`${folder}/TPL-`))
		.map((f) => {
			const match = f.path.match(/TPL-(\d+)\.md$/)
			return match?.[1] != null ? parseInt(match[1], 10) : 0
		})
	const nextId = String(Math.max(0, ...existingIds) + 1).padStart(5, '0')
	const filePath = normalizePath(`${folder}/TPL-${nextId}.md`)
	const templateName = toTemplateDisplayName(name)
	const timestamps = buildDomainTimestamps()
	const content = `---\nlucr_type: template\ncreated: ${JSON.stringify(timestamps.created)}\nmodified: ${JSON.stringify(timestamps.modified)}\ntpl_type: position\nname: ${templateName === null ? 'null' : JSON.stringify(templateName)}\ndescription: null\n---\n`
	await app.vault.create(filePath, content)
	return {
		filePath,
		name: templateName,
		description: null,
	}
}

// @story [[lucrjournal/position#^position-template-listing]] Lists only valid position templates with normalized sorted summaries
export function listPositionTemplates(app: DomainRuntimeApp): PositionTemplateSummary[] {
	return app.vault
		.getMarkdownFiles()
		.flatMap((file) => {
			const template = readTemplateFrontmatter(app, file)

			if (template === null || !isPositionTemplate(template)) {
				return []
			}

			return [{
				filePath: file.path,
				name: toTemplateDisplayName(template.name),
				description: toNullableTrimmedValue(template.description),
			}]
		})
		.sort(comparePositionTemplateSummary)
}

function getPersistedFolderPath(): string {
	const persisted = TemplateDomain.options.persisted
	return `${LUCR_TRADE_ROOT_DIR}/${persisted.folderName}`
}

function readTemplateFrontmatter(
	app: DomainRuntimeApp,
	file: ReturnType<DomainRuntimeApp['vault']['getMarkdownFiles']>[number],
): Template | null {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter

	if (!isTemplateFrontmatter(frontmatter)) {
		return null
	}

	return TemplateDomain.refine(frontmatter)
}

function isPositionTemplate(template: Template): template is Template & { tpl_type: 'position' } {
	return template.tpl_type === 'position'
}

function isTemplateFrontmatter(frontmatter: unknown): frontmatter is Record<string, unknown> {
	if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
		return false
	}

	return normalizeLucrTypeName(Reflect.get(frontmatter, 'lucr_type')) === TemplateDomain.name
}

function toTemplateDisplayName(name: string | null | undefined): string | null {
	const trimmed = name?.trim() ?? ''

	return trimmed.length > 0 ? trimmed : null
}

function toNullableTrimmedValue(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? ''

	return trimmed.length > 0 ? trimmed : null
}

function comparePositionTemplateSummary(
	left: PositionTemplateSummary,
	right: PositionTemplateSummary,
): number {
	if (left.name === null && right.name === null) {
		return 0
	}

	if (left.name === null) {
		return 1
	}

	if (right.name === null) {
		return -1
	}

	return left.name.localeCompare(right.name)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	function createTemplateRuntimeApp(
		frontmatters: unknown[],
	): DomainRuntimeApp {
		const files = frontmatters.map((_, index) => ({
			path: `${LUCR_TRADE_ROOT_DIR}/templates/TPL-${String(index + 1).padStart(5, '0')}.md`,
		}))
		const frontmatterByPath = new Map(
			files.map((file, index) => [file.path, frontmatters[index]] as const),
		)

		return {
			vault: {
				getMarkdownFiles() {
					return files
				},
			},
			metadataCache: {
				getFileCache(file) {
					return {
						frontmatter: frontmatterByPath.get(file.path),
					}
				},
			},
		}
	}

	describe('TemplateType', () => {
		it('allows optional description metadata on templates', () => {
			expect(TemplateType.allows({
				lucr_type: 'template',
				tpl_type: 'position',
				name: 'Breakout',
				description: 'CPI reclaim breakout template',
			})).toBe(true)
		})

		it('coerces template metadata into normalized persisted shapes', () => {
			expect(TemplateDomain.refine({
				lucr_type: 'template',
				tpl_type: ' Position ',
				name: 123,
				description: 456,
			})).toEqual({
				lucr_type: 'template',
				tpl_type: 'position',
				name: '123',
				description: '456',
			})
		})
	})

	describe('listPositionTemplates', () => {
		// @story [[lucrjournal/position#^position-template-listing]] Covers type filtering metadata normalization ordering and null names
		it('filters position templates and normalizes display metadata', () => {
			const app = createTemplateRuntimeApp([
				{
					lucr_type: 'template',
					tpl_type: 'playbook',
					name: 'Playbook Template',
					description: 'Ignore me',
				},
				{
					lucr_type: 'template',
					tpl_type: 'position',
					name: '  Reversal  ',
					description: '  BTC flush reclaim  ',
				},
				{
					lucr_type: 'template',
					tpl_type: 'position',
					name: 'Breakout',
					description: null,
				},
				{
					lucr_type: 'template',
					tpl_type: 'position',
					name: '   ',
					description: '   ',
				},
			])

			expect(listPositionTemplates(app)).toEqual([
				{
					filePath: `${LUCR_TRADE_ROOT_DIR}/templates/TPL-00003.md`,
					name: 'Breakout',
					description: null,
				},
				{
					filePath: `${LUCR_TRADE_ROOT_DIR}/templates/TPL-00002.md`,
					name: 'Reversal',
					description: 'BTC flush reclaim',
				},
				{
					filePath: `${LUCR_TRADE_ROOT_DIR}/templates/TPL-00004.md`,
					name: null,
					description: null,
				},
			])
		})

		// @story [[lucrjournal/position#^position-template-listing]] Covers omission of invalid template records
		it('skips uncastable template frontmatter instead of throwing', () => {
			const app = createTemplateRuntimeApp([
				{
					lucr_type: 'template',
					tpl_type: 'position',
					name: 'Breakout',
					description: 'BTC',
				},
				{
					lucr_type: 'template',
					tpl_type: 'position',
					name: 'Broken',
					description: { bad: true },
				},
			])

			expect(() => listPositionTemplates(app)).not.toThrow()
			expect(listPositionTemplates(app)).toEqual([
				{
					filePath: `${LUCR_TRADE_ROOT_DIR}/templates/TPL-00001.md`,
					name: 'Breakout',
					description: 'BTC',
				},
			])
		})
	})
}
