import { type } from 'arktype'
import { TFile, normalizePath, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { getFileBasename, sanitizeObsidianFileName } from '../../utils'
import {
	coerceFrontmatterField,
	coerceLiteral,
	coerceNullableString,
	coerceNumber,
	coerceUppercaseString,
	coerceWikilink,
	type CoercibleFrontmatter,
} from '../../utils/frontmatter-coerce'
import { parseWikilinkHeading } from '../../utils/wikilink'
import { AccountDomain } from '../account'
import {
	AccountWikilinkType,
	type PlatformWikilink,
	SymbolType,
	SymbolWikilinkType,
	type SymbolWikilink,
} from '../core/constant'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce } from '../core/domain-timestamps'
import { PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR, assertNoPersistedEntryBasenameConflict } from '../core/entry-writer'
import { DomainBase } from '../core/factory'
import { type FormValues, type SelectOption, defineForm } from '../core/form'

import { resolveSymbolInfo, toSymbolLogoIconDescriptor } from './catalog'
import { coerceFeeModelFields, resolveFeeModel, type FeeModelValue, validateFeeModel } from './fee-model'
import { enrichSymbolMetadataFromTradingView, resolveCurrentTradingViewRequester } from './metadata'
import { normalizePositionSymbolTypeValue, resolvePositionSymbolModel } from './position-model'
import { getSymbolTypeOptions } from './type-options'

import type { CreateEntryContext } from '../core/entry-writer'
import type { DomainPersistedEntry, DomainRuntimeApp } from '../core/type'

const SYMBOL_ACCOUNT_REQUIRED_ERROR = 'SYMBOL_ACCOUNT_REQUIRED_ERROR'
const SYMBOL_ACCOUNT_NOT_FOUND_ERROR = 'SYMBOL_ACCOUNT_NOT_FOUND_ERROR'
const SYMBOL_NAME_INVALID_ERROR = 'SYMBOL_NAME_INVALID_ERROR'

// @story [[lucrjournal/symbol#^symbol-type-domain]] Restricts persisted symbol types to the canonical trading categories
const SymbolAssetType = type.enumerated('Crypto_Perp', 'Crypto_Spot', 'Future', 'CFD')

export type PositionSymbolType = typeof SymbolAssetType.infer

// @story [[lucrjournal/domain-model#^symbol-file-identity]] Requires the semantic account and name fields behind the filename
const SymbolEntryType = type({
	lucr_type: '"symbol"',
	...DOMAIN_TIMESTAMP_FIELDS,
	name: SymbolType,
	account: AccountWikilinkType,
	'type?': SymbolAssetType.or('null'),
	'fee_value?': 'number | null',
	'contract_unit?': 'number > 0 | null',
	'logo?': 'string | null',
})

type SymbolEntry = typeof SymbolEntryType.infer

type SymbolFormShape = {
	account: { type: 'combobox' }
	name: { type: 'symbol_combobox' }
}

const symbolFormDefinition = defineForm<SymbolFormShape>({
	account: {
		type: 'combobox',
		label: 'POSITION_ACCOUNT',
		placeholder: 'POSITION_ACCOUNT_PLACEHOLDER',
		dynamicOptions: listSymbolAccountOptions,
		emptyStateLabel: 'POSITION_ACCOUNT_NO_RESULTS',
		valueIcon: (value, _values, context) => context.app === undefined
			? undefined
			: AccountDomain.resolvePickerIcon(context.app, value),
		// @story [[lucrjournal/form#^existing-account-boundary]] Blocks symbol submission when free-form account input does not resolve
		validate: (value, _values, context) => {
			const normalizedValue = sanitizeObsidianFileName(value).trim()
			if (normalizedValue === '') {
				return 'SYMBOL_ACCOUNT_REQUIRED'
			}
			if (context.app !== undefined && !AccountDomain.hasDisplayName(context.app, normalizedValue)) {
				return 'SYMBOL_ACCOUNT_NOT_FOUND'
			}
			return undefined
		},
	},
	name: {
		// @story [[lucrjournal/form#^shared-symbol-combobox]] Uses the shared renderer for explicit symbol creation
		type: 'symbol_combobox',
		label: 'POSITION_SYMBOL',
		placeholder: 'POSITION_SYMBOL_PLACEHOLDER',
		options: getSymbolTypeOptions(),
		dynamicOptions: listSymbolNameOptions,
		emptyStateLabel: 'POSITION_SYMBOL_NO_RESULTS',
		validate: (value) => resolveSymbolNameValidationMessage(value),
		valueIcon: (value, values, context) => context.app === undefined
			? undefined
			: toSymbolLogoIconDescriptor(resolveSymbolFormLogo(context.app, values.account, value)),
	},
} as const)

type SymbolCreateFormValue = FormValues<typeof symbolFormDefinition>

function toTrimmedUppercaseSymbol(value: string): string | null {
	const normalizedValue = resolveSymbolInfo(value).name
	return SymbolType.allows(normalizedValue) ? normalizedValue : null
}

function assertNormalizedSymbolName(symbolName: string): string {
	if (!SymbolType.allows(symbolName)) {
		throw new Error(SYMBOL_NAME_INVALID_ERROR)
	}
	return symbolName
}

function toSymbolWikilinkFromBaseName(fileBaseName: string): SymbolWikilink {
	return SymbolWikilinkType.assert(`[[${fileBaseName}]]`)
}

function listSymbolAccountOptions(app: App): SelectOption[] {
	return AccountDomain.listPickerOptions(app)
}

function listSymbolNameOptions(app: App, values: { account: string }): SelectOption[] {
	return listSymbolPickerOptionsForAccountName(app, values.account)
}

// @story [[lucrjournal/symbol-search#^local-journal-symbols]] Lists account-scoped persisted symbols without remote metadata
// @story [[lucrjournal/form#^shared-symbol-combobox]] Supplies the single account-scoped local option source used by both creation paths
function listSymbolPickerOptionsForAccountName(app: DomainRuntimeApp, accountDisplayName: string): SelectOption[] {
	const accountName = sanitizeObsidianFileName(accountDisplayName).trim()
	if (accountName === '') {
		return []
	}

	const accountEntry = AccountDomain.findByDisplayName(app, accountName)
	const accountWikilink = accountEntry === undefined
		? AccountWikilinkType.assert(`[[ACC-${accountName}]]`)
		: AccountWikilinkType.assert(`[[${getFileBasename(accountEntry.file)}]]`)

	return SymbolDomain.listForAccount(app, accountWikilink).map((entry) => ({
		value: entry.fm.name,
		label: entry.fm.name,
		icon: toSymbolLogoIconDescriptor(entry.fm.logo),
		symbolType: entry.fm.type ?? null,
	}))
}

function resolveSymbolFormLogo(app: DomainRuntimeApp, accountDisplayName: string, symbolName: string): string | null {
	const normalizedAccountName = sanitizeObsidianFileName(accountDisplayName).trim()
	const normalizedSymbolName = refineSymbolName(symbolName)
	if (normalizedAccountName === '' || normalizedSymbolName === null) {
		return null
	}

	return findSymbolEntryByAccountAndName(app, normalizedAccountName, normalizedSymbolName)?.fm.logo ?? null
}

// @story [[lucrjournal/symbol#^symbol-type-domain]] Normalizes persisted type strings to canonical values
function normalizeSymbolAssetTypeValue(value: unknown): PositionSymbolType | null {
	if (typeof value !== 'string') {
		return null
	}

	return normalizePositionSymbolTypeValue(value.trim().toLocaleLowerCase())
}

function coerceSymbolAssetType(value: unknown): unknown {
	if (value == null) {
		return null
	}

	return normalizeSymbolAssetTypeValue(value) ?? value
}

function resolveSymbolCreateContext(
	app: App,
	formValue: SymbolCreateFormValue,
): Partial<Pick<CreateEntryContext,
	'accountName'
	| 'accountWikilink'
	| 'platformWikilink'
	| 'symbolLogo'
	| 'symbolName'
	| 'symbolType'
>> {
	const accountDisplayName = sanitizeObsidianFileName(formValue.account).trim()
	if (accountDisplayName === '') {
		throw new Error(SYMBOL_ACCOUNT_REQUIRED_ERROR)
	}

	const symbolInfo = resolveSymbolInfo(formValue.name)
	const accountEntry = AccountDomain.findByDisplayName(app, accountDisplayName)
	// @story [[lucrjournal/form#^existing-account-boundary]] Rejects missing accounts before symbol creation can persist dependencies
	if (accountEntry === undefined) {
		throw new Error(SYMBOL_ACCOUNT_NOT_FOUND_ERROR)
	}

	const accountWikilink = AccountWikilinkType.assert(`[[${getFileBasename(accountEntry.file)}]]`)
	const platformWikilink = accountEntry.fm.platform ?? undefined

	return {
		accountName: AccountDomain.toDisplayName(accountEntry.fm),
		accountWikilink,
		platformWikilink,
		symbolLogo: symbolInfo.logo,
		symbolName: symbolInfo.name,
		symbolType: symbolInfo.type,
	}
}

// @story [[lucrjournal/domain-model#^symbol-file-identity]] Persists canonical account and symbol values in frontmatter
function buildSymbolPayload(
	formValue: SymbolCreateFormValue,
	ctx: CreateEntryContext,
): SymbolEntry {
	let name = ctx.symbolName
	let symbolType = ctx.symbolType ?? null
	let logo = ctx.symbolLogo ?? null
	if (name === undefined || ctx.symbolType === undefined || ctx.symbolLogo === undefined) {
		const symbolInfo = resolveSymbolInfo(formValue.name)
		name = name ?? symbolInfo.name
		symbolType = symbolType ?? symbolInfo.type
		logo = logo ?? symbolInfo.logo
	}
	name = assertNormalizedSymbolName(name)
	if (ctx.accountWikilink === undefined) {
		throw new Error(SYMBOL_ACCOUNT_NOT_FOUND_ERROR)
	}

	return SymbolEntryType.assert({
		lucr_type: 'symbol',
		name,
		account: AccountWikilinkType.assert(ctx.accountWikilink),
		type: symbolType === null ? null : SymbolAssetType.assert(symbolType),
		fee_value: null,
		contract_unit: null,
		logo,
	})
}

// @story [[lucrjournal/symbol-search#^metadata-failure-isolated]] Leaves creation on locally resolved metadata when enrichment is absent
async function enrichSymbolCreateContext(ctx: CreateEntryContext): Promise<void> {
	if (ctx.symbolLogo != null || ctx.symbolName === undefined) {
		return
	}

	const enriched = await enrichSymbolMetadataFromTradingView(
		ctx.symbolName,
		normalizeSymbolAssetTypeValue(ctx.symbolType),
		resolveCurrentTradingViewRequester(),
	)
	if (enriched === null) {
		return
	}

	ctx.symbolLogo = enriched.logo
	ctx.symbolType = enriched.type
}

function extractSymbolWikilinkValue(positionOrWikilink: { symbol?: string | null | undefined } | string | null | undefined): string | null {
	if (typeof positionOrWikilink === 'string') {
		return SymbolWikilinkType.allows(positionOrWikilink) ? positionOrWikilink : null
	}

	if (positionOrWikilink == null || typeof positionOrWikilink !== 'object') {
		return null
	}

	return typeof positionOrWikilink.symbol === 'string' && SymbolWikilinkType.allows(positionOrWikilink.symbol)
		? positionOrWikilink.symbol
		: null
}

function extractLinkpathFromSymbolWikilink(positionOrWikilink: { symbol?: string | null | undefined } | string | null | undefined): string | null {
	const symbolWikilink = extractSymbolWikilinkValue(positionOrWikilink)
	return symbolWikilink === null ? null : (parseWikilinkHeading(symbolWikilink)?.linkpath ?? null)
}

function findSymbolEntryByFileBasename(app: DomainRuntimeApp, fileBasename: string): DomainPersistedEntry<SymbolEntry> | null {
	const matchedFile = app.vault
		.getMarkdownFiles()
		.find((file) => getFileBasename(file).trim() === fileBasename)
	if (matchedFile === undefined) {
		return null
	}

	const refinedEntry = SymbolDomain.refine(app.metadataCache.getFileCache(matchedFile)?.frontmatter ?? null)
	return refinedEntry === null ? null : { file: matchedFile, fm: refinedEntry }
}

function findSymbolEntryByAccountAndName(
	app: DomainRuntimeApp,
	accountDisplayName: string,
	symbolName: string,
): DomainPersistedEntry<SymbolEntry> | null {
	const fileBaseName = buildSymbolFileBaseName(accountDisplayName, symbolName)
	const matchedByPath = findSymbolEntryByFileBasename(app, fileBaseName)
	if (matchedByPath !== null) {
		return matchedByPath
	}

	const accountWikilink = AccountWikilinkType.assert(`[[ACC-${sanitizeObsidianFileName(accountDisplayName).trim()}]]`)
	const normalizedSymbolName = normalizeSymbolName(symbolName)
	return SymbolDomain.totalEntries(app).find((entry) =>
		entry.fm.account === accountWikilink && entry.fm.name === normalizedSymbolName,
	) ?? null
}

function resolveSymbolNameValidationMessage(value: string) {
	const normalizedValue = value.trim().toUpperCase()
	if (normalizedValue.length === 0) {
		return 'POSITION_SYMBOL_REQUIRED'
	}

	return SymbolType.allows(normalizedValue)
		? undefined
		: 'POSITION_SYMBOL_INVALID'
}

class SymbolDomainDefinition extends DomainBase<'symbol', typeof SymbolEntryType, typeof symbolFormDefinition> {
	override readonly name = 'symbol' as const
	override readonly schema = SymbolEntryType
	override readonly options = { persisted: { folderName: 'symbols' } }
	override readonly formDefinition = symbolFormDefinition
	override readonly createEntryDescriptor = {
		buildId(entry: SymbolEntry) {
			return entry.name
		},
		buildContext(app: App, formValue: SymbolCreateFormValue) {
			return resolveSymbolCreateContext(app, formValue)
		},
		async buildPayload(formValue: SymbolCreateFormValue, ctx: CreateEntryContext) {
			await enrichSymbolCreateContext(ctx)
			return buildSymbolPayload(formValue, ctx)
		},
		// @story [[lucrjournal/domain-model#^symbol-file-identity]] Leaves symbol documents without a duplicate title
		buildBody() {
			return ''
		},
		// @story [[lucrjournal/domain-model#^symbol-file-identity]] Combines canonical account and symbol values into the file basename
		buildFileName(entry: SymbolEntry, ctx: CreateEntryContext, formValue: SymbolCreateFormValue) {
			return buildSymbolFileBaseName(ctx.accountName ?? formValue.account, entry.name)
		},
		validate(formValue: SymbolCreateFormValue, app: App) {
			const context = resolveSymbolCreateContext(app, formValue)
			const accountDisplayName = context.accountName ?? sanitizeObsidianFileName(formValue.account).trim()
			// @story [[lucrjournal/symbol#^duplicate-symbol-scope]] Rejects a duplicate canonical symbol basename before creation
			assertNoPersistedEntryBasenameConflict(
				app,
				'symbols',
				buildSymbolFileBaseName(accountDisplayName, context.symbolName ?? formValue.name),
			)
		},
	}

	// @story [[lucrjournal/domain-model#^register-domain-property-types]] Supplies the symbol metadata property types
	override builtinProperties() {
		return {
			...super.builtinProperties(),
			type: 'text',
			fee_value: 'number',
			contract_unit: 'number',
			logo: 'text',
		} as const
	}

	override toCreateEntryErrorMessageKey(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === SYMBOL_ACCOUNT_REQUIRED_ERROR) {
			return 'SYMBOL_ACCOUNT_REQUIRED' as const
		}
		if (message === SYMBOL_ACCOUNT_NOT_FOUND_ERROR) {
			return 'SYMBOL_ACCOUNT_NOT_FOUND' as const
		}
		if (message === SYMBOL_NAME_INVALID_ERROR) {
			return 'POSITION_SYMBOL_INVALID' as const
		}
		if (message === 'FEE_VALUE_INVALID_ERROR') {
			return 'SYMBOL_FEE_VALUE_INVALID' as const
		}
		if (message === PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR) {
			return 'NEW_SYMBOL_NAME_DUPLICATE' as const
		}
		return null
	}

	override coerce(record: CoercibleFrontmatter<typeof SymbolEntryType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'symbol'))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(record, 'name', coerceUppercaseString)
		if (typeof record.name === 'string') {
			record.name = resolveSymbolInfo(record.name).name
		}
		coerceFrontmatterField(record, 'account', coerceWikilink)
		coerceFrontmatterField(record, 'type', coerceSymbolAssetType)
		coerceFeeModelFields(record)
		coerceFrontmatterField(record, 'contract_unit', coerceNumber)
		coerceFrontmatterField(record, 'logo', coerceNullableString)
		record.contract_unit = resolvePositionSymbolModel(normalizeSymbolAssetTypeValue(record.type))
			.normalizeContractUnitOverride(record.contract_unit)
		return record
	}

	override toDebugLabel(entry: SymbolEntry) {
		return `${this.name}:${entry.name}`
	}

	typeOptions(): SelectOption[] {
		return getSymbolTypeOptions()
	}

	resolveEntry(
		app: DomainRuntimeApp,
		positionOrWikilink: { symbol?: string | null | undefined } | string | null | undefined,
	): DomainPersistedEntry<SymbolEntry> | null {
		const linkpath = extractLinkpathFromSymbolWikilink(positionOrWikilink)
		return linkpath === null ? null : findSymbolEntryByFileBasename(app, linkpath)
	}

	resolveName(
		app: DomainRuntimeApp,
		positionOrWikilink: { symbol?: string | null | undefined } | string | null | undefined,
	): string | null {
		return this.resolveEntry(app, positionOrWikilink)?.fm.name ?? null
	}

	resolveLogo(
		app: DomainRuntimeApp,
		positionOrWikilink: { symbol?: string | null | undefined } | string | null | undefined,
	): string | null {
		return this.resolveEntry(app, positionOrWikilink)?.fm.logo ?? null
	}

	resolvePlatformWikilink(app: DomainRuntimeApp, symbol: SymbolEntry): PlatformWikilink | null {
		const accountEntry = AccountDomain.findByWikilink(app, symbol.account)
		return accountEntry?.fm.platform ?? null
	}

	buildWikilink(accountDisplayName: string, symbolName: string): SymbolWikilink {
		return toSymbolWikilinkFromBaseName(buildSymbolFileBaseName(accountDisplayName, symbolName))
	}

	findByAccountAndName(
		app: DomainRuntimeApp,
		accountDisplayName: string,
		symbolName: string,
	): DomainPersistedEntry<SymbolEntry> | null {
		return findSymbolEntryByAccountAndName(app, accountDisplayName, symbolName)
	}

	listForAccount(app: DomainRuntimeApp, accountWikilink: string): DomainPersistedEntry<SymbolEntry>[] {
		return this.totalEntries(app)
			.filter((entry) => entry.fm.account === accountWikilink)
			.sort((left, right) => left.fm.name.localeCompare(right.fm.name))
	}

	listPickerOptionsForAccountName(app: DomainRuntimeApp, accountDisplayName: string): SelectOption[] {
		return listSymbolPickerOptionsForAccountName(app, accountDisplayName)
	}

	toFeeModel(symbol: SymbolEntry): FeeModelValue {
		return resolveFeeModel(symbol)
	}

	override beforeSave({ record }: { record: Record<string, unknown> }) {
		validateFeeModel(record)
	}

	// @story [[lucrjournal/symbol#^ensure-existing-symbol]] Reuses canonical or legacy account-scoped symbol identity
	async ensureEntry(
		app: App,
		formValue: SymbolCreateFormValue,
		ctx?: CreateEntryContext,
	): Promise<{
		entry: DomainPersistedEntry<SymbolEntry>
		created: boolean
		wikilink: SymbolWikilink
	}> {
		const accountDisplayName = sanitizeObsidianFileName(formValue.account).trim()
		const fileBaseName = buildSymbolFileBaseName(accountDisplayName, formValue.name)
		const existingEntry = findSymbolEntryByAccountAndName(app, accountDisplayName, formValue.name)
		if (existingEntry !== null) {
			return {
				entry: existingEntry,
				created: false,
				wikilink: toSymbolWikilinkFromBaseName(getFileBasename(existingEntry.file)),
			}
		}

		const result = await this.createEntry(app, formValue, ctx)
		const createdFile = app.vault.getAbstractFileByPath(
			normalizePath(`${LUCR_TRADE_ROOT_DIR}/${this.options.persisted.folderName}/${fileBaseName}.md`),
		)
		if (!(createdFile instanceof TFile)) {
			throw new Error(`Created symbol file missing: ${fileBaseName}`)
		}

		return {
			entry: {
				file: createdFile,
				fm: result.entry,
			},
			created: true,
			wikilink: toSymbolWikilinkFromBaseName(fileBaseName),
		}
	}
}

export const SymbolDomain = new SymbolDomainDefinition()

export type SymbolEntryValue = SymbolEntry

// @story [[lucrjournal/domain-model#^symbol-file-identity]] Defines the persisted symbol filename shape
export function buildSymbolFileBaseName(accountDisplayName: string, symbolName: string): string {
	const normalizedSymbolName = normalizeSymbolName(symbolName)
	return sanitizeObsidianFileName(`SBL-${accountDisplayName}-${normalizedSymbolName}`)
}

function normalizeSymbolName(symbolName: string): string {
	const normalizedSymbolName = toTrimmedUppercaseSymbol(symbolName)
	if (normalizedSymbolName === null) {
		throw new Error(SYMBOL_NAME_INVALID_ERROR)
	}
	return normalizedSymbolName
}

export function refineSymbolName(symbolName: unknown): string | null {
	return typeof symbolName === 'string' ? toTrimmedUppercaseSymbol(symbolName) : null
}

export function resolveSymbolName(
	app: DomainRuntimeApp,
	positionOrWikilink: { symbol?: string | null | undefined } | string | null | undefined,
): string | null {
	return SymbolDomain.resolveName(app, positionOrWikilink)
}

export function resolveSymbolLogo(
	app: DomainRuntimeApp,
	positionOrWikilink: { symbol?: string | null | undefined } | string | null | undefined,
): string | null {
	return SymbolDomain.resolveLogo(app, positionOrWikilink)
}
