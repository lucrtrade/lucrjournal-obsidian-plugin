/// <reference types="vitest/importMeta" />

import { type } from 'arktype'
import { TFile, normalizePath, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { getInitialPlatformIconSrc } from '../../icon/platform-icons'
import { buildRenamedEntryPath, getFileBasename, parseWikilinkHeading, sanitizeObsidianFileName, toNullableTrimmedValue } from '../../utils'
import { cloneFrontmatterRecord, coerceFrontmatterField, coerceLiteral, coerceNullableString, coerceWikilink, normalizeLucrTypeName, type CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import {
	AccountWikilinkType,
	type AccountWikilink,
	PlatformWikilinkType,
} from '../core/constant'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce } from '../core/domain-timestamps'
import { hasNameConflict, suggestUniqueName, syncRenamedDocumentTitle, type CreateEntryContext } from '../core/entry-writer'
import { DomainBase } from '../core/factory'
import {
	defineForm,
	type FormCopyContext,
	type FormCopyTemplate,
	type FormDefinition,
	type FormValues,
	type SelectOption,
} from '../core/form'
import { PlatformDomain } from '../platform'
import { PositionDomain } from '../position'
import { buildSymbolFileBaseName, SymbolDomain, type SymbolEntryValue } from '../symbol'

import type { IconDescriptor } from '../core/icon-descriptor'
import type { DomainPersistedEntry, DomainRuntimeApp } from '../core/type'

const ACCOUNT_DUPLICATE_NAME_ERROR = 'ACCOUNT_DUPLICATE_NAME_ERROR'
const ACCOUNT_NAME_REQUIRED_ERROR = 'ACCOUNT_NAME_REQUIRED_ERROR'
const ACCOUNT_DEFAULT_ICON: IconDescriptor = { kind: 'lucide', value: 'wallet' }

const AccountType = type({
	lucr_type: '"account"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'platform?': PlatformWikilinkType.or('null'),
	'name?': 'string | null',
})
type Account = typeof AccountType.infer

type AccountFormShape = {
	platform: { type: 'combobox' }
	name: { type: 'text' }
}

type AccountFormValue = FormValues<FormDefinition<AccountFormShape>>

const accountFormDefinition = defineForm<AccountFormShape>({
	platform: {
		type: 'combobox',
		label: 'NEW_ACCOUNT_PLATFORM_LABEL',
		placeholder: 'NEW_ACCOUNT_PLATFORM_PLACEHOLDER',
		dynamicOptions: (app: App) => PlatformDomain.availablePlatforms(app),
		emptyStateLabel: buildAccountPlatformEmptyStateLabel,
	},
	name: {
		type: 'text',
		label: 'NEW_ACCOUNT_NAME_LABEL',
		placeholder: buildAccountNamePlaceholder,
	},
} as const)

function buildAccountPlatformEmptyStateLabel(values: AccountFormValue): FormCopyTemplate {
	return {
		key: 'NEW_ACCOUNT_PLATFORM_NO_RESULTS',
		values: {
			query: values.platform.trim().length > 0 ? values.platform : '-',
		},
	}
}

function buildAccountNamePlaceholder(
	values: AccountFormValue,
	context: FormCopyContext,
): FormCopyTemplate {
	const platformName = sanitizeObsidianFileName(values.platform).trim()
	return platformName === ''
		? 'NEW_ACCOUNT_NAME_PLACEHOLDER'
		: {
			key: 'NEW_ACCOUNT_NAME_PLACEHOLDER_WITH_PLATFORM',
			values: {
				suggestion: context.app === undefined
					? platformName
					: suggestAccountDisplayName(context.app, platformName),
			},
		}
}

function buildAccountPayloadWithSuggestion(
	formValue: AccountFormValue,
	suggestedName?: string,
) {
	const platformName = sanitizeObsidianFileName(formValue.platform).trim()
	const platform = platformName === '' ? null : PlatformWikilinkType.assert(`[[${platformName}]]`)
	const explicitName = toNullableTrimmedValue(sanitizeObsidianFileName(formValue.name))
	const fallbackName = toNullableTrimmedValue(sanitizeObsidianFileName(suggestedName ?? ''))
	const name = explicitName ?? fallbackName

	return AccountType.assert({
		lucr_type: 'account',
		platform,
		name,
	})
}

type LinkedSymbolRenamePlan = {
	entry: DomainPersistedEntry<SymbolEntryValue> & {
		file: TFile
	}
	currentWikilink: string
	nextWikilink: ReturnType<typeof SymbolDomain.buildWikilink>
	nextPath: string
}

function buildLinkedSymbolRenamePlan(
	app: App,
	accountFile: TFile,
	nextDisplayName: string,
): LinkedSymbolRenamePlan[] {
	const currentAccountBasename = getFileBasename(accountFile)
	const linkedSymbolEntries = SymbolDomain.totalEntries(app)
		.filter((entry): entry is typeof entry & { file: TFile } => entry.file instanceof TFile)
		.filter((entry) => parseWikilinkHeading(entry.fm.account)?.linkpath === currentAccountBasename)

	const plans = linkedSymbolEntries.map((entry) => {
		const nextBaseName = buildSymbolFileBaseName(nextDisplayName, entry.fm.name)
		return {
			entry,
			currentWikilink: `[[${getFileBasename(entry.file)}]]`,
			nextWikilink: SymbolDomain.buildWikilink(nextDisplayName, entry.fm.name),
			nextPath: normalizePath(`${LUCR_TRADE_ROOT_DIR}/${SymbolDomain.options.persisted.folderName}/${nextBaseName}.md`),
		}
	})

	const currentSymbolPaths = new Set(plans.map((plan) => plan.entry.file.path))
	const nextPaths = new Set<string>()
	for (const plan of plans) {
		if (nextPaths.has(plan.nextPath)) {
			throw new Error(ACCOUNT_DUPLICATE_NAME_ERROR)
		}
		nextPaths.add(plan.nextPath)

		const existingFile = app.vault.getAbstractFileByPath(plan.nextPath)
		if (existingFile !== null && !currentSymbolPaths.has(plan.nextPath)) {
			throw new Error(ACCOUNT_DUPLICATE_NAME_ERROR)
		}
	}

	return plans
}

async function applyLinkedSymbolRenamePlan(
	app: App,
	plans: LinkedSymbolRenamePlan[],
	nextAccountWikilink: AccountWikilink,
) {
	for (const plan of plans) {
		await app.fileManager.processFrontMatter(plan.entry.file, (frontmatter: Record<string, unknown>) => {
			frontmatter.account = nextAccountWikilink
		})

		if (plan.nextPath !== plan.entry.file.path) {
			await app.fileManager.renameFile(plan.entry.file, plan.nextPath)
		}
	}

	if (plans.length === 0) {
		return
	}

	const renameMap = new Map(plans.map((plan) => [plan.currentWikilink, plan.nextWikilink] as const))
	const positionEntries = PositionDomain.totalEntries(app)
		.filter((entry): entry is typeof entry & { file: TFile } => entry.file instanceof TFile)
		.filter((entry) => typeof entry.fm.symbol === 'string' && renameMap.has(entry.fm.symbol))

	for (const entry of positionEntries) {
		const nextSymbolWikilink = renameMap.get(entry.fm.symbol ?? '')
		if (nextSymbolWikilink === undefined) {
			continue
		}
		await PositionDomain.updateFields(app, entry.file, { symbol: nextSymbolWikilink })
	}
}

class AccountDomainDefinition extends DomainBase<'account', typeof AccountType, typeof accountFormDefinition> {
	override readonly name = 'account' as const
	override readonly schema = AccountType
	override readonly options = { persisted: { folderName: 'accounts' } }
	override readonly formDefinition = accountFormDefinition
	override readonly createEntryDescriptor = {
		buildId() {
			return 'ACC-'
		},
		buildContext(app: App, formValue: AccountFormValue) {
			return {
				suggestedName: resolveSuggestedAccountNameForForm(app, formValue),
			}
		},
		buildPayload(formValue: AccountFormValue, ctx: { suggestedName?: string }) {
			return buildAccountPayloadWithSuggestion(formValue, ctx.suggestedName)
		},
		buildBody() {
			return ''
		},
		buildFileName(entry: Account) {
			const displayName = getAccountDisplayName(entry)
			return sanitizeObsidianFileName(`ACC-${displayName}`)
		},
		validate(formValue: AccountFormValue, app: App) {
			const entry = buildAccountPayloadWithSuggestion(
				formValue,
				resolveSuggestedAccountNameForForm(app, formValue),
			)
			const displayName = getAccountDisplayName(entry)
			if (displayName.length === 0) {
				throw new Error(ACCOUNT_NAME_REQUIRED_ERROR)
			}
			assertUniqueAccountDisplayName(app, displayName)
		},
		async dependencies(formValue: AccountFormValue, app: App, ctx: CreateEntryContext) {
			const platformName = sanitizeObsidianFileName(formValue.platform).trim()
			if (platformName.length === 0) {
				return
			}
			if (platformExists(app, platformName)) {
				return
			}
			await PlatformDomain.createEntry(app, { name: platformName }, ctx)
		},
	}

	override coerce(record: CoercibleFrontmatter<typeof AccountType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'account'))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(record, 'name', coerceNullableString)
		coerceFrontmatterField(record, 'platform', coerceWikilink)
		return record
	}

	override toDebugLabel(account: Account) {
		return `${this.name}:${account.name ?? '-'}` 
	}

	toPlatformName(account: Account): string | null {
		return account.platform == null
			? null
			: PlatformDomain.unwrapPlatformWikilink(account.platform)
	}

	toDisplayName(account: Account): string {
		const accountName = account.name?.trim()
		if (accountName != null && accountName !== '') {
			return accountName
		}

		const platformName = this.toPlatformName(account)
		return platformName != null && platformName !== '' ? platformName : 'Account'
	}

	findByDisplayName(app: DomainRuntimeApp, value: string) {
		const normalizedValue = normalizeAccountDisplayName(value)
		if (normalizedValue === '') {
			return undefined
		}

		return this.totalEntries(app).find(({ fm }) =>
			normalizeAccountDisplayName(this.toDisplayName(fm)) === normalizedValue,
		)
	}

	findByWikilink(app: DomainRuntimeApp, accountWikilink: string | null) {
		const linkpath = accountWikilink == null ? null : parseWikilinkHeading(accountWikilink)?.linkpath ?? null
		if (linkpath == null) {
			return undefined
		}

		return this.totalEntries(app).find((entry) =>
			entry.file instanceof TFile && getFileBasename(entry.file) === linkpath,
		)
	}

	hasDisplayName(app: DomainRuntimeApp, value: string): boolean {
		return this.findByDisplayName(app, value) !== undefined
	}

	listPickerOptions(app: DomainRuntimeApp): SelectOption[] {
		return this.totalEntries(app)
			.map(({ fm }) => {
				const displayName = this.toDisplayName(fm)
				return {
					value: displayName,
					label: displayName,
					icon: this.resolveDisplayIcon(app, fm),
				}
			})
			.sort((left, right) => left.label.localeCompare(right.label))
	}

	resolvePickerIcon(app: DomainRuntimeApp, value: string): IconDescriptor {
		const entry = this.findByDisplayName(app, value)
		return entry === undefined ? this.resolveIcon() : this.resolveDisplayIcon(app, entry.fm)
	}

	resolveIcon(_account?: Account): IconDescriptor {
		return ACCOUNT_DEFAULT_ICON
	}

	resolveDisplayIcon(app: DomainRuntimeApp, account: Account): IconDescriptor {
		const platformName = this.toPlatformName(account)
		if (platformName == null) {
			return ACCOUNT_DEFAULT_ICON
		}

		const platformIcon = PlatformDomain.resolveIcon(app, platformName)
		if (platformIcon == null) {
			return ACCOUNT_DEFAULT_ICON
		}

		if (platformIcon.kind !== 'platform') {
			return platformIcon
		}

		return getInitialPlatformIconSrc(platformIcon.value) == null
			? ACCOUNT_DEFAULT_ICON
			: platformIcon
	}

	canSubmitFormValue(formValue: AccountFormValue): boolean {
		return formValue.platform.trim() !== '' || formValue.name.trim() !== ''
	}

	async updateAccountSettings(
		app: App,
		entry: DomainPersistedEntry<Account>,
		nextSettings: { name: string },
	) {
		const trimmed = nextSettings.name.trim()
		if (trimmed.length === 0) {
			throw new Error(ACCOUNT_NAME_REQUIRED_ERROR)
		}

		const nextDisplayName = trimmed
		const nextFileName = sanitizeObsidianFileName(`ACC-${nextDisplayName}`)

		const file = app.vault.getAbstractFileByPath(entry.file.path)
		if (!(file instanceof TFile)) {
			return
		}

		const currentDisplayName = getAccountDisplayName(entry.fm)
		const shouldRename = currentDisplayName !== nextDisplayName
		if (!shouldRename) {
			return
		}

		assertUniqueAccountDisplayName(app, nextDisplayName)

		const nextAccountWikilink = AccountWikilinkType.assert(`[[${nextFileName}]]`)
		const linkedSymbolRenamePlan = buildLinkedSymbolRenamePlan(app, file, nextDisplayName)

		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm.name = trimmed
		})

		const nextPath = buildRenamedEntryPath(file, nextFileName)
		if (nextPath !== null && nextPath !== file.path) {
			const existingFile = app.vault.getAbstractFileByPath(normalizePath(nextPath))
			if (existingFile !== null) {
				throw new Error(ACCOUNT_DUPLICATE_NAME_ERROR)
			}
			await app.fileManager.renameFile(file, nextPath)
		}

		await syncRenamedDocumentTitle(app, file, nextDisplayName)
		await applyLinkedSymbolRenamePlan(
			app,
			linkedSymbolRenamePlan,
			nextAccountWikilink,
		)
	}

	override toCreateEntryErrorMessageKey(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === ACCOUNT_DUPLICATE_NAME_ERROR) {
			return 'NEW_ACCOUNT_NAME_DUPLICATE' as const
		}
		if (message === ACCOUNT_NAME_REQUIRED_ERROR) {
			return 'NEW_ACCOUNT_NAME_REQUIRED' as const
		}
		return null
	}
}

export const AccountDomain = new AccountDomainDefinition()

function getAccountDisplayName(account: { name?: string | null; platform?: string | null }) {
	const accountName = account.name?.trim()
	if (accountName != null && accountName !== '') {
		return accountName
	}

	if (account.platform == null) {
		return ''
	}

	return PlatformDomain.unwrapPlatformWikilink(account.platform).trim()
}

function assertUniqueAccountDisplayName(app: App, displayName: string) {
	if (hasNameConflict(displayName, listPersistedAccountDisplayNames(app))) {
		throw new Error(ACCOUNT_DUPLICATE_NAME_ERROR)
	}
}

function normalizeAccountDisplayName(value: string) {
	return sanitizeObsidianFileName(value).trim().toLocaleLowerCase()
}

function listPersistedAccountDisplayNames(app: DomainRuntimeApp): string[] {
	return app.vault
		.getMarkdownFiles()
		.flatMap((file) => {
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter
			const account = refinePersistedAccount(frontmatter)
			return account === null ? [] : [getAccountDisplayName(account)]
		})
		.filter((name) => name.length > 0)
}

function suggestAccountDisplayName(app: DomainRuntimeApp, baseName: string): string {
	return suggestUniqueName(baseName, listPersistedAccountDisplayNames(app))
}

function resolveSuggestedAccountNameForForm(
	app: DomainRuntimeApp,
	formValue: AccountFormValue,
): string | undefined {
	if (sanitizeObsidianFileName(formValue.name).trim().length > 0) {
		return undefined
	}

	const platformName = sanitizeObsidianFileName(formValue.platform).trim()
	return platformName.length === 0 ? undefined : suggestAccountDisplayName(app, platformName)
}

function platformExists(app: App, platformName: string): boolean {
	return PlatformDomain.hasPersistedPlatform(app, platformName)
}

function refinePersistedAccount(frontmatter: unknown): Account | null {
	if (!isAccountFrontmatter(frontmatter)) {
		return null
	}

	const record = cloneFrontmatterRecord<Account>(frontmatter)
	if (record === null) {
		return null
	}
	coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'account'))
	coerceFrontmatterField(record, 'name', coerceNullableString)
	coerceFrontmatterField(record, 'platform', coerceWikilink)
	return AccountType.allows(record) ? AccountType.assert(record) : null
}

function isAccountFrontmatter(frontmatter: unknown): frontmatter is Record<string, unknown> {
	if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
		return false
	}

	return normalizeLucrTypeName((frontmatter as Record<string, unknown>).lucr_type) === 'account'
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('AccountDomain display helpers', () => {
		it('derives platform name and display name from account entry', () => {
			const researchSpot = AccountType.assert({
				lucr_type: 'account',
				name: 'Research_Spot',
				platform: '[[OKX]]',
			})

			const fallbackAccount = AccountType.assert({
				lucr_type: 'account',
				name: null,
				platform: '[[Binance]]',
			})

			expect(AccountDomain.toPlatformName(researchSpot)).toBe('OKX')
			expect(AccountDomain.toDisplayName(researchSpot)).toBe('Research_Spot')
			expect(AccountDomain.toDisplayName(fallbackAccount)).toBe('Binance')
		})

		it('allows accounts without platform and falls back to generic display name', () => {
			const customAccount = AccountType.assert({
				lucr_type: 'account',
				name: null,
				platform: null,
			})

			expect(AccountDomain.toPlatformName(customAccount)).toBe(null)
			expect(AccountDomain.toDisplayName(customAccount)).toBe('Account')
		})

		it('uses wallet as the default account icon even when platform exists', () => {
			const platformBackedAccount = AccountType.assert({
				lucr_type: 'account',
				name: 'Research',
				platform: '[[Binance]]',
			})

			expect(AccountDomain.resolveIcon(platformBackedAccount)).toEqual({
				kind: 'lucide',
				value: 'wallet',
			})
		})

		it('prefers real platform icons for account display when available', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [],
				},
				metadataCache: {
					getFileCache: () => null,
				},
			}

			const platformBackedAccount = AccountType.assert({
				lucr_type: 'account',
				name: 'Research',
				platform: '[[Binance]]',
			})

			expect(AccountDomain.resolveDisplayIcon(app, platformBackedAccount)).toEqual({
				kind: 'platform',
				value: 'Binance',
			})
		})

		it('falls back to wallet when the linked platform has no real icon', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [],
				},
				metadataCache: {
					getFileCache: () => null,
				},
			}

			const unknownPlatformAccount = AccountType.assert({
				lucr_type: 'account',
				name: 'Research',
				platform: '[[dasdasdadssad]]',
			})

			expect(AccountDomain.resolveDisplayIcon(app, unknownPlatformAccount)).toEqual({
				kind: 'lucide',
				value: 'wallet',
			})
		})

		it('centralizes account lookup and picker options', () => {
			const file = Object.assign(new TFile(), {
				path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`,
				basename: 'ACC-Research',
			})
			const app = {
				vault: {
					getMarkdownFiles: () => [file],
				},
				metadataCache: {
					getFileCache: () => ({
						frontmatter: {
							lucr_type: 'account',
							name: 'Research',
							platform: '[[Binance]]',
						},
					}),
				},
			} as unknown as App

			const entry = AccountDomain.findByDisplayName(app, ' research ')

			expect(entry?.file).toBe(file)
			expect(AccountDomain.hasDisplayName(app, 'RESEARCH')).toBe(true)
			expect(AccountDomain.listPickerOptions(app)).toEqual([
				{
					value: 'Research',
					label: 'Research',
					icon: { kind: 'platform', value: 'Binance' },
				},
			])
		})
	})

	describe('account create helpers', () => {
		it('uses platform name as the effective display name when account name is empty', () => {
			const entry = AccountType.assert({
				lucr_type: 'account',
				name: null,
				platform: '[[OKX]]',
			})

			expect(getAccountDisplayName(entry)).toBe('OKX')
			expect(sanitizeObsidianFileName(`ACC-${getAccountDisplayName(entry)}`)).toBe('ACC-OKX')
		})

		it('sanitizes generated file names with Obsidian-safe characters', () => {
			expect(sanitizeObsidianFileName('ACC-Alpha/Beta:Desk')).toBe('ACC-Alpha∕Beta꞉Desk')
		})

		it('suggests the next available account display name from persisted accounts', () => {
			const runtime = {
				vault: {
					getMarkdownFiles: () => [{ path: 'ACC-Binance.md' }, { path: 'ACC-Binance_1.md' }],
				},
				metadataCache: {
					getFileCache(file: { path: string }) {
						if (file.path === 'ACC-Binance.md') {
							return { frontmatter: { lucr_type: 'account', name: 'Binance' } }
						}
						if (file.path === 'ACC-Binance_1.md') {
							return { frontmatter: { lucr_type: 'account', name: 'Binance_1' } }
						}
						return null
					},
				},
			}

			expect(suggestAccountDisplayName(runtime, 'Binance')).toBe('Binance_2')
		})

		it('uses the suggested unique name as the actual account name when input name is empty', () => {
			const entry = buildAccountPayloadWithSuggestion(
				{ platform: 'Binance', name: '' },
				'Binance_2',
			)

			expect(entry.name).toBe('Binance_2')
			expect(getAccountDisplayName(entry)).toBe('Binance_2')
		})

		it('persists accounts without fee fields', () => {
			const entry = buildAccountPayloadWithSuggestion({
				platform: 'Binance',
				name: 'Desk',
			})

			expect(entry).toEqual({
				lucr_type: 'account',
				platform: '[[Binance]]',
				name: 'Desk',
			})
		})

		it('keeps account form synchronization limited to retained fields', () => {
			expect(AccountDomain.synchronizeFormValues({
				platform: 'Bybit',
				name: '',
			})).toEqual({
				platform: 'Bybit',
				name: '',
			})
		})

		it('persists accounts without a type field', () => {
			const entry = buildAccountPayloadWithSuggestion({
				platform: 'Bybit',
				name: 'Desk',
			})

			expect(entry).toEqual({
				lucr_type: 'account',
				platform: '[[Bybit]]',
				name: 'Desk',
			})
		})

		it('returns all created files when account creation cascades to a new platform', async () => {
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

			const result = await AccountDomain.createEntry(app, {
				platform: 'Binance',
				name: '',
			})

			expect(result.files).toEqual([
				{ path: `${LUCR_TRADE_ROOT_DIR}/platforms/Binance.md` },
				{ path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Binance.md` },
			])
			expect(created).toHaveLength(2)
			expect(created[0]?.content).toMatch(/\n---\n$/)
			expect(created[1]?.content).toMatch(/\n---\n$/)
			expect(created[1]?.content).not.toContain('\nfee_value:')
		})
	})
}
