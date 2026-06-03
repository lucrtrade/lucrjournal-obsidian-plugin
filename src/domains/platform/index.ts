import { type } from 'arktype'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { PLATFORM_NAMES, PLATFORM_TO_EXCHANGE_ID } from '../../platforms'
import { sanitizeObsidianFileName } from '../../utils'
import { coerceFrontmatterField, coerceLiteral, coerceNullableString, normalizeLucrTypeName } from '../../utils/frontmatter-coerce'
import { BasenameDomainBase } from '../core/basename-domain'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce } from '../core/domain-timestamps'
import { resolveIconDescriptor } from '../core/icon-descriptor'

import type { CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import type { IconDescriptor } from '../core/icon-descriptor'
import type { DomainRuntimeApp } from '../core/type'
import type { App } from 'obsidian'

type PlatformPresentation = {
	name: string
	icon: IconDescriptor
	source: 'persisted' | 'preset'
	exchangeId: string | null
}

type PlatformPickerOption = {
	value: string
	label: string
	icon: IconDescriptor
}

const PLATFORM_DUPLICATE_NAME_ERROR = 'PLATFORM_DUPLICATE_NAME_ERROR'

const PlatformType = type({
	lucr_type: '"platform"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'icon?': 'string | null',
})

const presetPlatformNames = PLATFORM_NAMES

class PlatformDomainDefinition extends BasenameDomainBase<'platform', typeof PlatformType> {
	override readonly name = 'platform' as const
	override readonly schema = PlatformType
	override readonly options = { persisted: { folderName: 'platforms' } }
	protected override readonly folderName = 'platforms'
	protected override readonly nameRequiredError = 'Platform name is required'

	protected override nameLabel() {
		return 'FORM_PLATFORM_NAME'
	}

	protected override validateNameConflict(value: string, app: DomainRuntimeApp) {
		assertUniquePlatformName(app, this.normalizeName(value))
	}

	override coerce(record: CoercibleFrontmatter<typeof PlatformType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'platform'))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(record, 'icon', coerceNullableString)
		return record
	}

	override toDebugLabel(_platform: typeof PlatformType.infer) {
		return `${this.name}:-` 
	}

	private listAvailablePlatformPresentations(app: DomainRuntimeApp): PlatformPresentation[] {
		const savedPlatforms = listPersistedPlatformPresentations(app)
		const presetPlatforms = presetPlatformNames.map((platformName) => buildPresetPlatformPresentation(platformName))
		const dedupedPlatforms = new Map<string, PlatformPresentation>()

		for (const platform of [...savedPlatforms, ...presetPlatforms]) {
			const dedupeKey = platform.name.trim().toLocaleLowerCase()
			if (!dedupedPlatforms.has(dedupeKey)) {
				dedupedPlatforms.set(dedupeKey, platform)
			}
		}

		return [...dedupedPlatforms.values()]
	}

	availablePlatforms(app: DomainRuntimeApp): PlatformPickerOption[] {
		return this.listAvailablePlatformPresentations(app).map(toPlatformPickerOption)
	}

	resolveIcon(app: DomainRuntimeApp, value: string): IconDescriptor | null {
		const normalizedValue = normalizePlatformLookupKey(value)
		if (normalizedValue.length === 0) {
			return null
		}

		const matchedPlatform = this.listAvailablePlatformPresentations(app)
			.find((platform) => platform.name.trim().toLocaleLowerCase() === normalizedValue)

		return matchedPlatform?.icon ?? { kind: 'platform', value: value.trim() }
	}

	hasPersistedPlatform(app: DomainRuntimeApp, platformName: string): boolean {
		return listPersistedPlatformPresentations(app)
			.some((platform) => platform.name.trim().toLocaleLowerCase() === platformName.trim().toLocaleLowerCase())
	}

	unwrapPlatformWikilink(link: string): string {
		return link.slice(2, -2) 
	}
}

export const PlatformDomain = new PlatformDomainDefinition()

function parsePlatformWikilink(input: string): string | null {
	const match = input.match(/^\[\[([^[\]#^|\n]+)\]\]$/)
	return match?.[1] ?? null
}

function isPlatformFrontmatter(frontmatter: unknown): frontmatter is Record<string, unknown> {
	if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
		return false
	}

	return normalizeLucrTypeName((frontmatter as Record<string, unknown>).lucr_type) === 'platform'
}

function listPersistedPlatformPresentations(
	app: DomainRuntimeApp,
): PlatformPresentation[] {
	return app.vault
		.getMarkdownFiles()
		.flatMap((file) => {
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter
			if (!isPlatformFrontmatter(frontmatter)) {
				return []
			}

			const platform = PlatformDomain.refine(frontmatter)
			if (platform === null) {
				return []
			}
			const platformName = sanitizeObsidianFileName((file.basename ?? '').trim())
			if (platformName.length === 0) {
				return []
			}

			return [{
				name: platformName,
				icon: resolveIconDescriptor(platform.icon) ?? { kind: 'platform', value: platformName },
				source: 'persisted' as const,
				exchangeId: resolvePlatformExchangeId(platformName),
			}]
		})
		.sort((left, right) => left.name.localeCompare(right.name))
}

function resolvePresetPlatformName(
	value: string,
): (typeof PLATFORM_NAMES)[number] | null {
	const normalizedName = normalizePlatformLookupKey(value)
	if (normalizedName.length === 0) {
		return null
	}

	return PLATFORM_NAMES
		.find((platformName) => platformName.toLocaleLowerCase() === normalizedName) ?? null
}

function resolvePlatformExchangeId(value: string) {
	const presetPlatformName = resolvePresetPlatformName(value)
	return presetPlatformName === null ? null : PLATFORM_TO_EXCHANGE_ID[presetPlatformName] ?? null
}

function normalizePlatformLookupKey(value: string) {
	return sanitizeObsidianFileName((parsePlatformWikilink(value) ?? value).trim()).toLocaleLowerCase()
}

function buildPresetPlatformPresentation(
	platformName: (typeof PLATFORM_NAMES)[number],
): PlatformPresentation {
	return {
		name: platformName,
		icon: { kind: 'platform', value: platformName },
		source: 'preset',
		exchangeId: PLATFORM_TO_EXCHANGE_ID[platformName] ?? null,
	}
}

function toPlatformPickerOption(platform: PlatformPresentation): PlatformPickerOption {
	return {
		value: platform.name,
		label: platform.name,
		icon: platform.icon,
	}
}

function assertUniquePlatformName(app: DomainRuntimeApp, platformName: string) {
	const normalizedName = platformName.trim().toLocaleLowerCase()
	const existingNames = listPersistedPlatformPresentations(app)
		.map((platform) => platform.name.trim().toLocaleLowerCase())

	if (existingNames.includes(normalizedName)) {
		throw new Error(PLATFORM_DUPLICATE_NAME_ERROR)
	}
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('PlatformDomain.availablePlatforms', () => {
		it('lists saved platforms before preset platforms, removes duplicates, and resolves icon kinds', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Axiom.md`, basename: 'Axiom' },
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`, basename: 'Binance' },
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Desk.md`, basename: 'Desk' },
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Ghost.md`, basename: 'Ghost' },
					],
				},
				metadataCache: {
					getFileCache(file: { path: string }) {
						if (file.path.endsWith('Axiom.md')) {
							return { frontmatter: { lucr_type: 'platform', icon: 'sparkles' } }
						}
						if (file.path.endsWith('Binance.md')) {
							return { frontmatter: { lucr_type: 'platform' } }
						}
						if (file.path.endsWith('Desk.md')) {
							return { frontmatter: { lucr_type: 'platform', icon: '🧪' } }
						}
						if (file.path.endsWith('Ghost.md')) {
							return { frontmatter: { lucr_type: 'platform', icon: 'https://example.com/favicon.png' } }
						}
						return null
					},
				},
			}

			expect(PlatformDomain.availablePlatforms(app)).toEqual([
				{ value: 'Axiom', label: 'Axiom', icon: { kind: 'lucide', value: 'sparkles' } },
				{ value: 'Binance', label: 'Binance', icon: { kind: 'platform', value: 'Binance' } },
				{ value: 'Desk', label: 'Desk', icon: { kind: 'emoji', value: '🧪' } },
				{ value: 'Ghost', label: 'Ghost', icon: { kind: 'url', value: 'https://example.com/favicon.png' } },
				{ value: 'Bybit', label: 'Bybit', icon: { kind: 'platform', value: 'Bybit' } },
				{ value: 'OKX', label: 'OKX', icon: { kind: 'platform', value: 'OKX' } },
				{ value: 'Bitget', label: 'Bitget', icon: { kind: 'platform', value: 'Bitget' } },
				{ value: 'MetaTrader', label: 'MetaTrader', icon: { kind: 'platform', value: 'MetaTrader' } },
				{ value: 'Interactive Brokers', label: 'Interactive Brokers', icon: { kind: 'platform', value: 'Interactive Brokers' } },
			])
		})

		it('skips persisted platforms with uncastable frontmatter instead of throwing', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Broken.md`, basename: 'Broken' },
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Desk.md`, basename: 'Desk' },
					],
				},
				metadataCache: {
					getFileCache(file: { path: string }) {
						if (file.path.endsWith('Broken.md')) {
							return { frontmatter: { lucr_type: 'platform', icon: { bad: true } } }
						}
						if (file.path.endsWith('Desk.md')) {
							return { frontmatter: { lucr_type: 'platform', icon: '🧪' } }
						}
						return null
					},
				},
			}

			expect(() => PlatformDomain.availablePlatforms(app)).not.toThrow()
			expect(PlatformDomain.availablePlatforms(app)[0]).toEqual({
				value: 'Desk',
				label: 'Desk',
				icon: { kind: 'emoji', value: '🧪' },
			})
		})

		it('matches persisted platform lucr_type case-insensitively', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`, basename: 'Binance' },
					],
				},
				metadataCache: {
					getFileCache() {
						return { frontmatter: { lucr_type: 'Platform', icon: '7' } }
					},
				},
			}

			expect(PlatformDomain.availablePlatforms(app)[0]).toEqual({
				value: 'Binance',
				label: 'Binance',
				icon: { kind: 'lucide', value: '7' },
			})
		})

		it('resolves persisted icons first and falls back to platform icon descriptors', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Axiom.md`, basename: 'Axiom' },
					],
				},
				metadataCache: {
					getFileCache() {
						return { frontmatter: { lucr_type: 'platform', icon: 'sparkles' } }
					},
				},
			}

			expect(PlatformDomain.resolveIcon(app, '[[Axiom]]')).toEqual({ kind: 'lucide', value: 'sparkles' })
			expect(PlatformDomain.resolveIcon(app, 'Bybit')).toEqual({ kind: 'platform', value: 'Bybit' })
			expect(PlatformDomain.resolveIcon(app, '   ')).toBeNull()
		})
	})

	describe('PlatformDomain.createEntry', () => {
		it('allows creating a preset platform when the vault does not have its file yet', async () => {
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
			} as unknown as App

			await PlatformDomain.createEntry(app, { name: 'Binance' })

			expect(created).toHaveLength(1)
			expect(created[0]?.path).toBe(`${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`)
			expect(created[0]?.content).toContain('lucr_type: "platform"')
			expect(created[0]?.content).toContain('created: "')
			expect(created[0]?.content).toContain('modified: "')
			expect(created[0]?.content).toMatch(/\n---\n$/)
		})

		it('uses the file basename as the persisted platform name source of truth', async () => {
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
			} as unknown as App

			await PlatformDomain.createEntry(app, { name: 'Axiom' })

			expect(created).toHaveLength(1)
			expect(created[0]?.path).toBe(`${LUCR_TRADE_ROOT_DIR}/platforms/Axiom.md`)
			expect(created[0]?.content).toContain('lucr_type: "platform"')
			expect(created[0]?.content).toContain('created: "')
			expect(created[0]?.content).toContain('modified: "')
			expect(created[0]?.content).toMatch(/\n---\n$/)
		})

		it('rejects duplicate platform names instead of auto-incrementing files', async () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md`, basename: 'Binance' }],
					create: async () => {
						throw new Error('should not create duplicate platform')
					},
				},
				metadataCache: {
					getFileCache: () => ({ frontmatter: { lucr_type: 'platform' } }),
				},
			} as unknown as App

			await expect(PlatformDomain.createEntry(app, { name: 'Binance' }))
				.rejects.toThrow(PLATFORM_DUPLICATE_NAME_ERROR)
		})
	})
}
