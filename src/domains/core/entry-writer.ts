/// <reference types="vitest/importMeta" />

import { Notice, TFile, normalizePath, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { t } from '../../lang/helpers'
import { createLogger } from '../../logger'
import { getFileBasename, sanitizeObsidianFileName } from '../../utils'
import { replaceTopLevelHeading } from '../../utils/markdown-sections'

import { buildDomainTimestamps } from './domain-timestamps'

import type { AccountWikilink, PlatformWikilink } from './constant'
import type { SymbolWikilink } from './constant'
import type { DomainDefinitionOptions } from './type'
import type { TAbstractFile } from 'obsidian'

const logger = createLogger('entry-writer')

type UniqueCandidateOptions = {
	hasConflict: (candidate: string) => boolean
	formatCandidate: (baseValue: string, index: number) => string
	startIndex?: number
	maxAttempts?: number
}

/**
 * Descriptor that each domain provides to declare how entries are created.
 * Pure data + pure functions — no side effects.
 */
// @story [[lucrjournal/domain-model#^domain-descriptor-contract]] Declares the pure functions and optional stages of entry creation
export type CreateEntryDescriptor<FormValue, Entry> = {
	/** Build a stable entry ID from a schema-validated entry (pure) */
	buildId: (entry: Entry) => string
	/** Transform form value into a schema-validated domain entry (pure) */
	buildPayload: (formValue: FormValue, ctx: CreateEntryContext) => Entry | Promise<Entry>
	/** Build the markdown body after the frontmatter fence (pure) */
	buildBody: (entry: Entry, ctx: CreateEntryContext, formValue: FormValue) => string | Promise<string>
	/** Build the file basename without .md and without folder path (pure) */
	buildFileName: (entry: Entry, ctx: CreateEntryContext, formValue: FormValue) => string
	/** File name conflict strategy: 'increment' appends -2, -3, etc.; 'reject' throws (default: 'reject') */
	conflictStrategy?: 'increment' | 'reject'
	/** Validation before entry creation (e.g. uniqueness checks). Throw to abort. */
	validate?: (formValue: FormValue, app: App) => void
	/** Cascade-create sub-dependencies before this entry is written */
	dependencies?: (formValue: FormValue, app: App, ctx: CreateEntryContext) => Promise<void>
	/** Build the context (e.g. nextId) before the pipeline runs. */
	buildContext?: (app: App, formValue: FormValue) => CreateEntryContext
}

export type CreateEntryContext = {
	/** Precomputed sequential ID for domains whose entry/file identity depends on a next-number allocator. */
	nextId?: number
	/** Precomputed human-readable name suggestion used by domains that derive payload fields from existing vault state. */
	suggestedName?: string
	/** Domain-specific canonical name resolved before payload/dependency creation. */
	accountName?: string
	/** Domain-specific canonical symbol name resolved before payload/dependency creation. */
	symbolName?: string
	/** Domain-specific symbol type resolved before payload creation. */
	symbolType?: string | null
	/** Domain-specific symbol logo resolved before payload creation. */
	symbolLogo?: string | null
	/** Domain-specific symbol fee value resolved for the position payload after dependency creation. */
	positionFeeValue?: number | null
	/** Domain-specific persisted uuid resolved before payload creation. */
	positionId?: string
	/** Domain-specific timestamp resolved before payload creation. */
	positionOpenedAt?: string
	/** Resolved platform wikilink used by downstream payload builders. */
	platformWikilink?: PlatformWikilink
	/** Resolved account wikilink used by downstream payload builders. */
	accountWikilink?: AccountWikilink
	/** Resolved symbol wikilink used by downstream payload builders. */
	symbolWikilink?: SymbolWikilink
	/** Optional persisted template file path chosen before create-entry execution. */
	templateFilePath?: string
	/** Optional display name for the selected template. */
	templateName?: string
	/** Optional confluence visibility used when creating private playbook confluence entries. */
	confluencePublic?: boolean
	/** Final resolved file basename without extension, including any conflict-resolution suffix. */
	fileBaseName?: string
	/** Final resolved markdown file path that will be written into the vault. */
	filePath?: string
	/** Shared creation batch used to aggregate cascaded file writes into a single notice. */
	creationBatch?: CreateEntryBatch
}

export const PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR = 'PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR'

type CreateEntryResult<Entry> = {
	entry: Entry
	file: { path: string }
	files: Array<{ path: string }>
}

type CreateEntryBatch = {
	files: Array<{ path: string }>
}

/**
 * Execute the create-entry pipeline for any persisted domain.
 *
 * 1. Cascade sub-dependencies
 * 2. Validate
 * 3. Build payload
 * 4. Resolve file path (with conflict handling)
 * 5. Serialize markdown
 * 6. Write file
 */
// @story [[lucrjournal/domain-model#^create-entry-pipeline]] Executes dependency, validation, payload, body, serialization, and write stages in order
export async function executeCreateEntry<FormValue, Entry extends Record<string, unknown>>(
	domain: { name: string; options: DomainDefinitionOptions },
	descriptor: CreateEntryDescriptor<FormValue, Entry>,
	app: App,
	formValue: FormValue,
	ctx: CreateEntryContext = {},
): Promise<CreateEntryResult<Entry>> {
	const creationBatch = ctx.creationBatch ?? { files: [] }
	const isRootCreation = ctx.creationBatch === undefined
	const pipelineCtx = { ...ctx, creationBatch }

	await descriptor.dependencies?.(formValue, app, pipelineCtx).catch((error: unknown) => {
		logger.error('dependencies failed', { domain: domain.name, error })
		throw error
	})
	descriptor.validate?.(formValue, app)

	const mergedCtx = { ...pipelineCtx, ...descriptor.buildContext?.(app, formValue) }
	const entry = await descriptor.buildPayload(formValue, mergedCtx)
	const folderPath = getPersistedFolderPath(domain.name, domain.options)
	const baseName = descriptor.buildFileName(entry, mergedCtx, formValue)
	const strategy = descriptor.conflictStrategy ?? 'reject'
	const filePath = resolveFilePath(app, folderPath, baseName, strategy)
	const finalCtx = {
		...mergedCtx,
		fileBaseName: filePath.split('/').pop()?.replace(/\.md$/, '') ?? baseName,
		filePath,
	}
	const body = await resolveCreateEntryBody(app, descriptor, entry, finalCtx, formValue)
	// @story [[lucrjournal/domain-model#^initial-domain-timestamps]] Adds one shared timestamp pair before applying the refined payload
	const markdown = serializeEntryMarkdown({
		...buildDomainTimestamps(),
		...entry,
	}, body)
	const file = await app.vault.create(filePath, markdown).catch((error: unknown) => {
		logger.error('vault.create failed', { domain: domain.name, filePath, error })
		throw error
	})
	creationBatch.files.push({ path: file.path })

	if (isRootCreation) {
		showCreateEntryNotice(formatCreateEntryNotice(creationBatch.files))
	}

	return { entry, file, files: [...creationBatch.files] }
}

// @story [[lucrjournal/position#^position-template-body-create]] Replaces only the normal body source after payload and file identity resolution
async function resolveCreateEntryBody<FormValue, Entry extends Record<string, unknown>>(
	app: App,
	descriptor: CreateEntryDescriptor<FormValue, Entry>,
	entry: Entry,
	ctx: CreateEntryContext,
	formValue: FormValue,
): Promise<string> {
	if (ctx.templateFilePath === undefined) {
		return await descriptor.buildBody(entry, ctx, formValue)
	}

	const templateFile = app.vault.getAbstractFileByPath(ctx.templateFilePath)
	if (!isReadableMarkdownFile(templateFile)) {
		throw new Error(`Template file not found: ${ctx.templateFilePath}`)
	}

	const templateContent = templateFile instanceof TFile
		? await app.vault.read(templateFile)
		: await app.vault.read(templateFile as Parameters<typeof app.vault.read>[0])
	const templateBody = stripMarkdownFrontmatter(templateContent)
	return await expandTemplateBody(app, templateFile, templateBody, ctx)
}

function stripMarkdownFrontmatter(markdown: string): string {
	if (!markdown.startsWith('---\n')) {
		return markdown
	}

	const fenceEnd = markdown.indexOf('\n---\n', 4)
	if (fenceEnd === -1) {
		return markdown
	}

	return markdown.slice(fenceEnd + 5)
}

// @story [[lucrjournal/position#^position-template-expansion]] Expands through Templater when available and falls back to raw body on failure
async function expandTemplateBody(
	app: App,
	tfile: TFile | TAbstractFile,
	templateBody: string,
	_ctx: CreateEntryContext,
): Promise<string> {
	const templaterPlugin = (app as App & {
		plugins?: {
			getPlugin?: (id: string) => {
				templater?: {
					parse_template: (
						context: { target_file: unknown; run_mode: number },
						template: string,
					) => string | Promise<string>
				}
			} | null
		}
	}).plugins?.getPlugin?.('templater-obsidian')

	const templater = templaterPlugin?.templater

	logger.debug('expandTemplateBody', { parseTemplate: templater, templateBody })

	if (templater === undefined) {
		return templateBody
	}

	try {
		return await templater.parse_template(
			{ target_file: tfile, run_mode: 4 },
			templateBody,
		)
	} catch (e) {
		logger.error('expandTemplateBody', e)
		return templateBody
	}
}

function isReadableMarkdownFile(file: unknown): file is TFile | { path: string } {
	return file instanceof TFile
		|| (typeof file === 'object'
			&& file !== null
			&& typeof Reflect.get(file, 'path') === 'string')
}

function getPersistedFolderPath(domainName: string, options: DomainDefinitionOptions): string {
	const persisted = options.persisted
	if (persisted === null) {
		throw new Error(`${domainName}: domain must be persisted before creating entries`)
	}

	return `${LUCR_TRADE_ROOT_DIR}/${persisted.folderName}`
}

// @story [[lucrjournal/domain-model#^global-basename-identity]] Enforces basename uniqueness across every persisted folder under the root
export function hasPersistedEntryBasenameConflict(app: App, folderName: string, rawName: string): boolean {
	const _folderName = folderName
	void _folderName

	const candidateBaseName = sanitizeObsidianFileName(rawName).trim().toLocaleLowerCase()
	if (candidateBaseName.length === 0) {
		return false
	}

	const rootPrefix = `${normalizePath(LUCR_TRADE_ROOT_DIR)}/`
	return app.vault.getMarkdownFiles().some((file) => (
		file.path.startsWith(rootPrefix)
		&& getFileBasename(file).trim().toLocaleLowerCase() === candidateBaseName
	))
}

export function assertNoPersistedEntryBasenameConflict(app: App, folderName: string, rawName: string) {
	if (hasPersistedEntryBasenameConflict(app, folderName, rawName)) {
		throw new Error(PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR)
	}
}

function resolveFilePath(
	app: App,
	folderPath: string,
	baseName: string,
	strategy: 'increment' | 'reject',
): string {
	const candidatePath = normalizePath(`${folderPath}/${baseName}.md`)

	if (strategy === 'reject') {
		return candidatePath
	}

	const existingPaths = new Set(
		app.vault.getMarkdownFiles().map((file) => file.path),
	)

	if (!existingPaths.has(candidatePath)) {
		return candidatePath
	}

	const nextBaseName = resolveUniqueCandidate(baseName, {
		hasConflict: (candidate) => existingPaths.has(normalizePath(`${folderPath}/${candidate}.md`)),
		formatCandidate: (candidateBaseName, index) => `${candidateBaseName}-${index}`,
		startIndex: 2,
	})

	return normalizePath(`${folderPath}/${nextBaseName}.md`)
}

type SuggestUniqueNameOptions = {
	separator?: string
	startIndex?: number
	maxAttempts?: number
}

export function suggestUniqueName(
	baseName: string,
	existingNames: Iterable<string>,
	options: SuggestUniqueNameOptions = {},
): string {
	const normalizedBaseName = baseName.trim()
	if (normalizedBaseName.length === 0) {
		return ''
	}

	const normalizedExistingNames = new Set(
		[...existingNames]
			.map((name) => name.trim().toLocaleLowerCase())
			.filter((name) => name.length > 0),
	)
	const separator = options.separator ?? '_'

	return resolveUniqueCandidate(normalizedBaseName, {
		hasConflict: (candidate) => normalizedExistingNames.has(candidate.trim().toLocaleLowerCase()),
		formatCandidate: (candidateBaseName, index) => `${candidateBaseName}${separator}${index}`,
		startIndex: options.startIndex ?? 1,
		maxAttempts: options.maxAttempts,
	})
}

export function hasNameConflict(
	candidateName: string,
	existingNames: Iterable<string>,
): boolean {
	const normalizedCandidateName = candidateName.trim().toLocaleLowerCase()
	if (normalizedCandidateName.length === 0) {
		return false
	}

	return [...existingNames]
		.map((name) => name.trim().toLocaleLowerCase())
		.some((name) => name === normalizedCandidateName)
}

function resolveUniqueCandidate(baseValue: string, options: UniqueCandidateOptions): string {
	if (!options.hasConflict(baseValue)) {
		return baseValue
	}

	const startIndex = options.startIndex ?? 1
	const maxAttempts = options.maxAttempts ?? 1000
	for (let index = startIndex; index < maxAttempts; index += 1) {
		const nextCandidate = options.formatCandidate(baseValue, index)
		if (!options.hasConflict(nextCandidate)) {
			return nextCandidate
		}
	}

	throw new Error(`Unable to resolve a unique candidate for ${baseValue}`)
}

function serializeEntryMarkdown(frontmatter: Record<string, unknown>, body: string): string {
	return `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`
}

// @story [[lucrjournal/domain-model#^frontmatter-serialization]] Omits absent values and preserves the supported scalar and JSON representations
function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
	return Object.entries(frontmatter)
		.filter(([, value]) => value !== null && value !== undefined)
		.map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`)
		.join('\n')
}

function serializeFrontmatterValue(value: unknown): string {
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value)
	}

	if (typeof value === 'string') {
		return JSON.stringify(value)
	}

	return JSON.stringify(value)
}

function formatCreateEntryNotice(files: Array<{ path: string }>): string {
	const names = files.map(({ path }) => path.split('/').pop() ?? path)
	if (names.length === 0) {
		throw new Error('Create-entry notice requires at least one file')
	}

	if (names.length === 1) {
		return t('ENTRY_CREATE_NOTICE_SINGLE', { name: names[0]! })
	}

	return t('ENTRY_CREATE_NOTICE_MULTIPLE', {
		count: names.length,
		names: names.join(', '),
	})
}

function showCreateEntryNotice(message: string): void {
	if (typeof Notice !== 'function') {
		return
	}

	new Notice(message)
}

// @story [[lucrjournal/fields#^entry-title-writeback]] Synchronizes the renamed document top-level heading after its file move
export async function syncRenamedDocumentTitle(app: App, file: TFile, nextTitle: string) {
	const currentContent = await app.vault.read(file)
	const nextContent = replaceTopLevelHeading(currentContent, nextTitle)

	if (nextContent !== currentContent) {
		await app.vault.modify(file, nextContent)
	}
}

if (import.meta.vitest) {
	const { describe, expect, it, vi } = import.meta.vitest

	describe('serializeFrontmatter', () => {
		// @story [[lucrjournal/domain-model#^frontmatter-serialization]] Covers omitted values and scalar serialization
		it('filters null/undefined and serializes remaining fields', () => {
			expect(serializeFrontmatter({
				lucr_type: 'test',
				name: 'hello',
				icon: null,
				count: 42,
				active: true,
			})).toBe('lucr_type: "test"\nname: "hello"\ncount: 42\nactive: true')
		})

		// @story [[lucrjournal/domain-model#^frontmatter-serialization]] Covers JSON serialization of structured values
		it('serializes arrays and objects as JSON', () => {
			expect(serializeFrontmatter({
				lucr_type: 'test',
				tags: ['a', 'b'],
			})).toBe('lucr_type: "test"\ntags: ["a","b"]')
		})
	})

	describe('serializeEntryMarkdown', () => {
		it('wraps frontmatter in fences and appends body', () => {
			expect(serializeEntryMarkdown({ lucr_type: 'test' }, '\n# Title\n')).toBe(
				'---\nlucr_type: "test"\n---\n\n# Title\n',
			)
		})

		it('serializes created and modified datetime fields', () => {
			expect(serializeEntryMarkdown({
				created: '2026-04-08T12:00:00+08:00',
				modified: '2026-04-08T12:00:00+08:00',
				lucr_type: 'test',
			}, '\n# Title\n')).toContain(
				'created: "2026-04-08T12:00:00+08:00"\nmodified: "2026-04-08T12:00:00+08:00"',
			)
		})
	})

	describe('stripMarkdownFrontmatter', () => {
		it('returns the markdown body without the frontmatter fence', () => {
			expect(stripMarkdownFrontmatter('---\nlucr_type: "template"\n---\n\n# Notes\n')).toBe('\n# Notes\n')
		})
	})

	describe('resolveFilePath', () => {
		it('returns candidate path when strategy is reject', () => {
			const app = { vault: { getMarkdownFiles: () => [] } } as unknown as App
			expect(resolveFilePath(app, `${LUCR_TRADE_ROOT_DIR}/accounts`, 'ACC-Test', 'reject'))
				.toBe(`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Test.md`)
		})

		it('increments suffix when file already exists', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/news/CPI.md` },
						{ path: `${LUCR_TRADE_ROOT_DIR}/news/CPI-2.md` },
					],
				},
			} as unknown as App
			expect(resolveFilePath(app, `${LUCR_TRADE_ROOT_DIR}/news`, 'CPI', 'increment'))
				.toBe(`${LUCR_TRADE_ROOT_DIR}/news/CPI-3.md`)
		})
	})

	describe('hasPersistedEntryBasenameConflict', () => {
		// @story [[lucrjournal/domain-model#^global-basename-identity]] Covers cross-folder basename conflicts under the persisted root
		it('rejects duplicate basenames across persisted folders', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/playbooks/FOMC.md`, basename: 'FOMC' },
						{ path: `${LUCR_TRADE_ROOT_DIR}/news/NFP.md`, basename: 'NFP' },
						{ path: 'Inbox/FOMC.md', basename: 'FOMC' },
					],
				},
			} as unknown as App

			expect(hasPersistedEntryBasenameConflict(app, 'news', 'FOMC')).toBe(true)
			expect(hasPersistedEntryBasenameConflict(app, 'analyses', 'NFP')).toBe(true)
			expect(hasPersistedEntryBasenameConflict(app, 'news', 'CPI')).toBe(false)
		})
	})

	describe('formatCreateEntryNotice', () => {
		it('formats a single created file notice', () => {
			expect(formatCreateEntryNotice([{ path: 'LucrTrade/platforms/Binance.md' }]))
				.toBe('Created Binance.md.')
		})

		it('formats a summary notice for multiple created files', () => {
			expect(formatCreateEntryNotice([
				{ path: 'LucrTrade/platforms/Binance.md' },
				{ path: 'LucrTrade/accounts/ACC-Desk.md' },
			])).toBe('Created 2 files: Binance.md, ACC-Desk.md.')
		})
	})

	describe('suggestUniqueName', () => {
		it('returns the base name when it is unused', () => {
			expect(suggestUniqueName('Binance', ['OKX', 'Bybit'])).toBe('Binance')
		})

		it('increments underscore suffixes from 1 when the base name already exists', () => {
			expect(suggestUniqueName('Binance', ['Binance', 'Binance_1'])).toBe('Binance_2')
		})

		it('checks conflicts case-insensitively', () => {
			expect(hasNameConflict('Binance', ['binance'])).toBe(true)
		})
	})

	describe('resolveCreateEntryBody', () => {
		it('uses a selected template body and expands it with templater when available', async () => {
			const parseTemplate = vi.fn(async (_context: unknown, template: string) => template.replace('{{name}}', 'Expanded'))
			const app = {
				vault: {
					getAbstractFileByPath: (path: string) => path === 'LucrTrade/templates/TPL-00001.md'
						? { path, basename: 'TPL-00001' }
						: null,
					read: async () => '---\nlucr_type: "template"\n---\n# {{name}}\n',
				},
				plugins: {
					getPlugin: () => ({
						templater: {
							parse_template: parseTemplate,
						},
					}),
				},
			} as unknown as App

			const body = await resolveCreateEntryBody(
				app,
				{
					buildId: () => 'demo',
					buildPayload: () => ({ lucr_type: 'demo' }),
					buildBody: () => '\n# fallback\n',
					buildFileName: () => 'demo',
				},
				{ lucr_type: 'demo' },
				{
					templateFilePath: 'LucrTrade/templates/TPL-00001.md',
					filePath: 'LucrTrade/positions/POS-00001.md',
					fileBaseName: 'POS-00001',
				},
				{},
			)

			expect(body).toBe('# Expanded\n')
			expect(parseTemplate).toHaveBeenCalledOnce()
		})
	})

	describe('executeCreateEntry', () => {
		// @story [[lucrjournal/domain-model#^create-entry-pipeline]] Covers payload serialization and the final vault write
		it('serializes a persisted entry and writes it into the domain folder', async () => {
			const created: Array<{ path: string; content: string }> = []
			const app = {
				vault: {
					create: async (path: string, content: string) => {
						created.push({ path, content })
						return { path }
					},
					getMarkdownFiles: () => [],
				},
			} as unknown as App

			const result = await executeCreateEntry(
				{ name: 'demo', options: { persisted: { folderName: 'demo' } } },
				{
					buildBody: () => '\n# Alpha\n',
					buildFileName: () => 'Alpha',
					buildId: () => 'Alpha',
					buildPayload: () => ({ lucr_type: 'demo', name: 'Alpha' }),
				},
				app,
				{},
			)

			expect(result).toMatchObject({
				entry: { lucr_type: 'demo', name: 'Alpha' },
				file: { path: `${LUCR_TRADE_ROOT_DIR}/demo/Alpha.md` },
				files: [{ path: `${LUCR_TRADE_ROOT_DIR}/demo/Alpha.md` }],
			})
			expect(created[0]?.content).toContain('lucr_type: "demo"\nname: "Alpha"')
			expect(created[0]?.content).toContain('\n# Alpha\n')
		})

		it('appends an incrementing suffix when conflictStrategy is increment', async () => {
			const writtenPaths: string[] = []
			const app = {
				vault: {
					create: async (path: string) => {
						writtenPaths.push(path)
						return { path }
					},
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/demo/Alpha.md` },
						{ path: `${LUCR_TRADE_ROOT_DIR}/demo/Alpha-2.md` },
					],
				},
			} as unknown as App

			const result = await executeCreateEntry(
				{ name: 'demo', options: { persisted: { folderName: 'demo' } } },
				{
					buildBody: () => '\n# Alpha\n',
					buildFileName: () => 'Alpha',
					buildId: () => 'Alpha',
					buildPayload: () => ({ lucr_type: 'demo' }),
					conflictStrategy: 'increment',
				},
				app,
				{},
			)

			expect(result.file.path).toBe(`${LUCR_TRADE_ROOT_DIR}/demo/Alpha-3.md`)
			expect(writtenPaths).toEqual([`${LUCR_TRADE_ROOT_DIR}/demo/Alpha-3.md`])
		})

		// @story [[lucrjournal/domain-model#^create-entry-pipeline]] Covers validation abort before the parent write
		it('aborts before writing when validate throws', async () => {
			const app = {
				vault: {
					create: vi.fn(async () => ({ path: 'unreached' })),
					getMarkdownFiles: () => [],
				},
			} as unknown as App

			await expect(
				executeCreateEntry(
					{ name: 'demo', options: { persisted: { folderName: 'demo' } } },
					{
						buildBody: () => '\n# Alpha\n',
						buildFileName: () => 'Alpha',
						buildId: () => 'Alpha',
						buildPayload: () => ({ lucr_type: 'demo' }),
						validate: () => {
							throw new Error('VALIDATION_FAILED')
						},
					},
					app,
					{},
				),
			).rejects.toThrow('VALIDATION_FAILED')

			expect((app.vault.create as unknown as { mock: { calls: unknown[] } }).mock.calls).toEqual([])
		})

		// @story [[lucrjournal/domain-model#^create-entry-pipeline]] Covers dependency ordering and root batch aggregation
		it('aggregates cascaded dependency files into the root creation batch', async () => {
			const createdPaths: string[] = []
			const app = {
				vault: {
					create: async (path: string) => {
						createdPaths.push(path)
						return { path }
					},
					getMarkdownFiles: () => [],
				},
			} as unknown as App

			const result = await executeCreateEntry(
				{ name: 'parent', options: { persisted: { folderName: 'parent' } } },
				{
					buildBody: () => '\n# Parent\n',
					buildFileName: () => 'Parent',
					buildId: () => 'Parent',
					buildPayload: () => ({ lucr_type: 'parent' }),
					dependencies: async (_formValue, dependencyApp, ctx) => {
						await executeCreateEntry(
							{ name: 'child', options: { persisted: { folderName: 'child' } } },
							{
								buildBody: () => '\n# Child\n',
								buildFileName: () => 'Child',
								buildId: () => 'Child',
								buildPayload: () => ({ lucr_type: 'child' }),
							},
							dependencyApp,
							{},
							{ creationBatch: ctx.creationBatch },
						)
					},
				},
				app,
				{},
			)

			expect(createdPaths).toEqual([
				`${LUCR_TRADE_ROOT_DIR}/child/Child.md`,
				`${LUCR_TRADE_ROOT_DIR}/parent/Parent.md`,
			])
			expect(result.files.map((file) => file.path)).toEqual([
				`${LUCR_TRADE_ROOT_DIR}/child/Child.md`,
				`${LUCR_TRADE_ROOT_DIR}/parent/Parent.md`,
			])
		})
	})
}
