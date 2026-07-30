/// <reference types="vitest/importMeta" />

import { type } from 'arktype'
import { TFile, type App } from 'obsidian'

import { applyAttachmentTokensToFrontmatter } from '../../attachments/position-attachments'
import { LUCR_TRADE_ROOT_DIR } from '../../constant'
import { getCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import {
	getFileBasename,
	getPersistedEntryDisplayName,
	parseWikilinkHeading,
	sanitizeObsidianFileName,
	toNullableNumberValue,
	toNullableTrimmedValue,
} from '../../utils'
import {
	coerceDatetime,
	coerceFrontmatterField,
	coerceInteger,
	coerceLiteral,
	coerceNullableString,
	coerceNumber,
	coerceStringArray,
	coerceUppercaseString,
	coerceWikilink,
	type CoercibleFrontmatter,
} from '../../utils/frontmatter-coerce'
import { extractSection, extractSections } from '../../utils/markdown-sections'
import { buildIsoDatetimeInTimeZone } from '../../utils/relative-time'
import { AccountDomain } from '../account'
import { ConfluenceDomain, type Confluence } from '../analysis/confluence'
import { KeyLevelDomain, type KeyLevel } from '../analysis/key-level'
import { MarketAnalysisDomain, type MarketAnalysis } from '../analysis/market-analysis'
import {
	AccountWikilinkType,
	type AccountWikilink,
	DatetimeType,
	PlatformWikilinkType,
	type PlatformWikilink,
	SymbolType,
	SymbolWikilinkType,
	type SymbolWikilink,
} from '../core/constant'
import { DOMAIN_TIMESTAMP_FIELDS, applyDomainTimestampCoerce } from '../core/domain-timestamps'
import { PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR } from '../core/entry-writer'
import { DomainBase } from '../core/factory'
import { controlFormValue, defineForm, type FormValues, type SelectOption } from '../core/form'
import { SELECT_OPTION_COLOR_VARS } from '../core/ui'
import { createUuidV7 } from '../core/uuid'
import { NewsDomain, type News } from '../news'
import { PlaybookDomain, type Playbook } from '../playbook'
import { refineSymbolName, SymbolDomain } from '../symbol'
import { toSymbolLogoIconDescriptor } from '../symbol/catalog'
import { deriveAbsoluteFee, emptyFeeModel, type FeeModelValue } from '../symbol/fee-model'
import { resolvePositionSymbolModel } from '../symbol/position-model'
import { getSymbolTypeOptions } from '../symbol/type-options'

import { buildDefaultPositionBody } from './body'
import {
	applyPositionBeforeSaveFormulas,
	calculatePositionProfit,
	calculatePositionRisk,
	normalizePositionAmount,
	normalizePositionNumber,
	resolvePositionEffectiveQuantity,
	resolvePositionFormulaDirection,
	type PositionFormulaInput,
} from './formulas'

import type { CreateEntryContext } from '../core/entry-writer'
import type { DomainPersistedEntry, DomainRuntimeApp } from '../core/type'
import type { PositionNotionalContext, PositionSymbolType } from '../symbol/position-model'

// @story [[lucrjournal/position#^position-side-values]] Restricts persisted trade direction to canonical long and short values
const TradeSideType = type.enumerated('LONG', 'SHORT')
type TradeSide = typeof TradeSideType.infer

// @story [[lucrjournal/position#^position-lifecycle-shape]] Restricts the optional lifecycle discriminator without imposing cross-field requirements
const PositionStatusType = type.enumerated('open', 'close')

// @story [[lucrjournal/position#^position-confidence-values]] Restricts persisted confidence to the five supported integer levels
const PositionConfidenceType = type.enumerated(1, 2, 3, 4, 5)

export type PositionConfidence = typeof PositionConfidenceType.infer
const POSITION_SIDE_OPTIONS = ['LONG', 'SHORT'] as const
export const POSITION_CONFIDENCE_OPTIONS = [1, 2, 3, 4, 5] as const

const POSITION_SYMBOL_REQUIRED_ERROR = 'POSITION_SYMBOL_REQUIRED_ERROR'
const POSITION_ACCOUNT_NOT_FOUND_ERROR = 'POSITION_ACCOUNT_NOT_FOUND_ERROR'
const POSITION_SIDE_READONLY_ERROR = 'POSITION_SIDE_READONLY_ERROR'
const POSITION_RISK_DIRECTION_ERROR = 'POSITION_RISK_DIRECTION_ERROR'

type PositionFormShape = {
	account: { type: 'combobox' }
	side: { type: 'select' }
	symbol: { type: 'symbol_combobox' }
}

type PositionFormState = {
	account: string
	side: string
	symbol: string
}

// @story [[lucrjournal/position#^position-open-schema]] Requires only the position discriminator while preserving undeclared frontmatter
const PositionType = type({
	lucr_type: '"position"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'id?': 'string | number.integer | null',
	'status?': PositionStatusType.or('null'),
	// @story [[lucrjournal/position#^position-link-shapes]] Defines shape-only symbol and playbook references without target validation
	'symbol?': SymbolWikilinkType.or('null'),
	'playbook?': 'string | null',
	'profit?': 'number | null',
	'side?': TradeSideType.or('null'),
	'confidence?': PositionConfidenceType.or('null'),
	'notional_value?': 'number | null',
	// @story [[lucrjournal/position#^position-notional-mode]] Restricts notional mode and its mode-specific amount field
	'notional_asset?': '"native" | "usd" | null',
	'notional_amount?': 'number | null',
	// @story [[lucrjournal/position#^position-quantity-bounds]] Defines positive integer contracts and bounded decimal lots
	'contract?': 'number.integer > 0 | null',
	'lots?': '0.01 <= number <= 20 | null',
	'risk?': 'number | null',
	'entry_price?': 'number | null',
	'exit_price?': 'number | null',
	'fee?': 'number | null',
	'target_price?': 'number | null',
	'stop_loss?': 'number | null',
	// @story [[lucrjournal/position#^position-lifecycle-shape]] Keeps lifecycle timestamps optional and independent from status and exit data
	'opened_at?': DatetimeType.or('null'),
	'closed_at?': DatetimeType.or('null'),
	'attachments?': 'string[] | null',
})

const positionFormDefinition = defineForm<PositionFormShape>({
	account: {
		type: 'combobox',
		label: 'POSITION_ACCOUNT',
		placeholder: 'POSITION_ACCOUNT_PLACEHOLDER',
		dynamicOptions: listPositionAccountOptions,
		emptyStateLabel: 'POSITION_ACCOUNT_NO_RESULTS',
		valueIcon: (value, _values, context) => context.app === undefined
			? undefined
			: AccountDomain.resolvePickerIcon(context.app, value),
		// @story [[lucrjournal/form#^existing-account-boundary]] Blocks position submission when free-form account input does not resolve
		validate: (value, _values, context) => resolvePositionAccountValidationMessage(context.app, value),
	},
	symbol: {
		// @story [[lucrjournal/form#^shared-symbol-combobox]] Uses the shared renderer for the position symbol field
		type: 'symbol_combobox',
		label: 'POSITION_SYMBOL',
		placeholder: 'POSITION_SYMBOL_PLACEHOLDER',
		options: getSymbolTypeOptions(),
		dynamicOptions: listPositionSymbolOptions,
		emptyStateLabel: 'POSITION_SYMBOL_NO_RESULTS',
		controlledValue: controlFormValue<PositionFormState, 'symbol', string>(
			'symbol',
			(_symbol, values, context, currentValue) => {
				const normalizedValue = currentValue.toUpperCase()
				const previousAccount = typeof context.previousValues?.account === 'string'
					? context.previousValues.account
					: undefined
				if (
					context.app === undefined
					|| previousAccount === undefined
					|| previousAccount === values.account
				) {
					return normalizedValue
				}

				const defaultSymbol = resolveDefaultPositionSymbol(context.app, values.account)
				return defaultSymbol === '' ? normalizedValue : defaultSymbol
			},
		),
		validate: (value) => resolvePositionSymbolValidationMessage(value),
		valueIcon: (value, values, context) => context.app === undefined
			? undefined
			: toSymbolLogoIconDescriptor(resolvePositionFormSymbolLogo(context.app, values.account, value)),
	},
	side: {
		type: 'select',
		label: 'POSITION_SIDE',
		defaultValue: 'LONG',
		options: getPositionSideSelectOptions(),
	},
} as const)

// @story [[lucrjournal/position#^position-status-coercion]] Normalizes legacy and canonical lifecycle strings before schema validation
function coercePositionStatus(value: unknown): unknown {
	if (value == null) {
		return null
	}

	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'bigint') {
		return value
	}

	const normalized = String(value).trim().toLocaleLowerCase()
	if (normalized.length === 0) {
		return null
	}

	return normalized === 'closed'
		? 'close'
		: normalized === 'opened'
			? 'open'
			: normalized
}

function getPositionSideSelectOptions(): SelectOption[] {
	return POSITION_SIDE_OPTIONS.map((value) => ({
		value,
		label: value,
		labelKey: value,
		tone: value === 'LONG'
			? {
				background: SELECT_OPTION_COLOR_VARS.fillContrast,
				text: SELECT_OPTION_COLOR_VARS.cInv,
				border: SELECT_OPTION_COLOR_VARS.fillContrast,
			}
			: {
				background: SELECT_OPTION_COLOR_VARS.alpha510,
				text: SELECT_OPTION_COLOR_VARS.cStrongDim,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
	}))
}

function getPositionConfidenceSelectOptions(): SelectOption[] {
	return POSITION_CONFIDENCE_OPTIONS.map((value) => ({
		value: String(value),
		label: String(value),
	}))
}

function listPositionAccountOptions(app: App): SelectOption[] {
	return AccountDomain.listPickerOptions(app)
}

// @story [[lucrjournal/form#^shared-symbol-combobox]] Feeds the position field from the selected account through the shared local source
function listPositionSymbolOptions(app: App, values: PositionFormState): SelectOption[] {
	const accountName = resolveCanonicalPositionAccountName(app, values.account)
	if (accountName.length === 0) {
		return []
	}

	return SymbolDomain.listPickerOptionsForAccountName(app, accountName)
}

// @story [[lucrjournal/position#^position-link-shapes]] Normalizes only symbol values already shaped as wikilinks
function coerceSymbolWikilink(value: unknown): unknown {
	if (value == null) {
		return null
	}

	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'bigint') {
		return value
	}

	const trimmed = String(value).trim()
	if (trimmed === '') {
		return null
	}

	return trimmed.startsWith('[[') && trimmed.endsWith(']]')
		? coerceWikilink(trimmed)
		: value
}

function coerceNotionalAsset(value: unknown): unknown {
	if (value == null) {
		return null
	}
	if (typeof value !== 'string') {
		return value
	}
	const normalized = value.trim().toLocaleLowerCase()
	if (normalized === '') {
		return null
	}
	if (normalized === 'native' || normalized === 'usd') {
		return normalized
	}
	return value
}

class PositionDomainDefinition extends DomainBase<'position', typeof PositionType, typeof positionFormDefinition> {
	override readonly name = 'position' as const
	override readonly schema = PositionType
	override readonly options = { persisted: { folderName: 'positions' } }
	override readonly formDefinition = positionFormDefinition
	override readonly createEntryDescriptor = {
		buildId(entry: Position) {
			return String(entry.id ?? '')
		},
		buildContext(app: App, formValue: FormValues<typeof positionFormDefinition>) {
			const accountName = resolveCanonicalPositionAccountName(app, formValue.account)
			const symbolWikilink = resolvePositionSymbolWikilink(app, accountName, formValue.symbol)
			const positionFeeModel = resolvePositionCreateFeeModel(app, accountName, formValue.symbol)
			return {
				nextId: getNextPositionId(app),
				accountName,
				positionFeeValue: positionFeeModel.fee_value,
				// @story [[lucrjournal/domain-model#^position-uuid-identity]] Assigns a UUID v7 to the persisted position id field
				positionId: createUuidV7(),
				positionOpenedAt: buildIsoDatetimeInTimeZone(new Date(), getCurrentTimeZoneSetting()),
				symbolWikilink: symbolWikilink === '' ? undefined : symbolWikilink,
				symbolType: resolvePositionCreateSymbolType(app, accountName, formValue.symbol),
			}
		},
		buildPayload(formValue: FormValues<typeof positionFormDefinition>, ctx: CreateEntryContext) {
			return buildCreateEntryPayload(
				{
					symbol: ctx.symbolWikilink ?? '',
					opened_at: ctx.positionOpenedAt ?? '',
					side: TradeSideType.assert(formValue.side),
					confidence: null,
					notional_value: '',
					risk: '',
					fee_value: ctx.positionFeeValue == null ? '' : String(ctx.positionFeeValue),
					symbol_type: ctx.symbolType ?? null,
					profit: '0',
				},
				ctx.positionId ?? '',
			)
		},
		buildBody() {
			return buildDefaultPositionBody()
		},
		buildFileName(_entry: Position, ctx: CreateEntryContext) {
			if (typeof ctx.nextId !== 'number') {
				throw new Error('Position requires nextId in context')
			}
			return buildPositionFileId(ctx.nextId)
		},
		// @story [[lucrjournal/position#^position-account-symbol-create]] Requires an existing account and ensures its symbol before position persistence
		// @story [[lucrjournal/form#^existing-account-boundary]] Rejects missing accounts before creating position dependencies
		async dependencies(formValue: FormValues<typeof positionFormDefinition>, app: App, ctx: CreateEntryContext) {
			const accountName = resolveCanonicalPositionAccountName(app, formValue.account)
			if (accountName.length === 0) {
				return
			}

			if (!AccountDomain.hasDisplayName(app, accountName)) {
				throw new Error(POSITION_ACCOUNT_NOT_FOUND_ERROR)
			}

			const accountWikilink = resolveCreatePositionAccountWikilink(app, accountName)
			const platformWikilink = resolveCreatePositionPlatformWikilink(app, accountName)
			if (accountWikilink === '' || platformWikilink === '') {
				return
			}

			await SymbolDomain.ensureEntry(app, {
				account: accountName,
				name: formValue.symbol,
			}, {
				...ctx,
				accountName,
				accountWikilink,
				platformWikilink,
			})
		},
	}

	override coerce(record: CoercibleFrontmatter<typeof PositionType['inferIn']>) {
		coerceFrontmatterField(record, 'lucr_type', (value) => coerceLiteral(value, 'position'))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(record, 'id', coerceNullableString)
		coerceFrontmatterField(record, 'status', coercePositionStatus)
		coerceFrontmatterField(record, 'symbol', coerceSymbolWikilink)
		// @story [[lucrjournal/position#^position-link-shapes]] Normalizes non-empty playbook values without resolving their targets
		coerceFrontmatterField(record, 'playbook', coerceWikilink)
		coerceFrontmatterField(record, 'profit', coerceNumber)
		coerceFrontmatterField(record, 'side', coerceUppercaseString)
		coerceFrontmatterField(record, 'confidence', coerceInteger)
		coerceFrontmatterField(record, 'notional_value', coerceNumber)
		coerceFrontmatterField(record, 'notional_asset', coerceNotionalAsset)
		// @story [[lucrjournal/position#^position-notional-mode]] Retains native amount only while native notional mode is active
		if (record.notional_asset === 'native') {
			coerceFrontmatterField(record, 'notional_amount', coerceNumber)
		} else {
			delete (record as Record<string, unknown>).notional_amount
		}
		coerceFrontmatterField(record, 'contract', coerceInteger)
		coerceFrontmatterField(record, 'lots', coerceNumber)
		coerceFrontmatterField(record, 'risk', coerceNumber)
		coerceFrontmatterField(record, 'entry_price', coerceNumber)
		coerceFrontmatterField(record, 'exit_price', coerceNumber)
		coerceFrontmatterField(record, 'fee', coerceNumber)
		coerceFrontmatterField(record, 'target_price', coerceNumber)
		coerceFrontmatterField(record, 'stop_loss', coerceNumber)
		coerceFrontmatterField(record, 'opened_at', coerceDatetime)
		coerceFrontmatterField(record, 'closed_at', coerceDatetime)
		coerceFrontmatterField(record, 'attachments', coerceStringArray)
		return record
	}

	override toDebugLabel(position: Position) {
		return `${this.name}:${position.symbol ?? '-'}` 
	}

	// @story [[lucrjournal/domain-model#^register-domain-property-types]] Supplies the position lifecycle datetime property types
	override builtinProperties() {
		return {
			closed_at: 'datetime',
			opened_at: 'datetime',
		} as const
	}

	sideOptions(): SelectOption[] {
		return getPositionSideSelectOptions()
	}

	confidenceOptions(): SelectOption[] {
		return getPositionConfidenceSelectOptions()
	}

	buildCreateFormValues(app: App, preferredAccount?: string | null): FormValues<typeof positionFormDefinition> {
		const values = this.buildInitialFormValues({ app })
		const normalizedPreferredAccount = preferredAccount?.trim()
		const nextValues = normalizedPreferredAccount === undefined || normalizedPreferredAccount === ''
			? values
			: {
				...values,
				account: normalizedPreferredAccount,
			}
		return {
			...nextValues,
			symbol: resolveDefaultPositionSymbol(app, nextValues.account),
		}
	}

	canSubmitFormValue(formValue: FormValues<typeof positionFormDefinition>): boolean {
		return formValue.account.trim() !== '' && formValue.side.trim() !== '' && formValue.symbol.trim() !== ''
	}

	override toCreateEntryErrorMessageKey(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === POSITION_SYMBOL_REQUIRED_ERROR) {
			return 'POSITION_SYMBOL_REQUIRED' as const
		}
		if (message === POSITION_ACCOUNT_NOT_FOUND_ERROR) {
			return 'SYMBOL_ACCOUNT_NOT_FOUND' as const
		}
		if (message === PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE' as const
		}
		return null
	}

	listContextGroups(app: App, file: TFile): Promise<PositionContextGroup[]> {
		return listPositionContextGroups(app, file)
	}

	async lazyRenderTableContent(app: App, positionEntries: DomainPersistedEntry<Position>[]) {
		const persistedPositionEntries = positionEntries.filter(
			(entry): entry is DomainPersistedEntry<Position> & { file: TFile } =>
				entry.file instanceof TFile,
		)
		const linkedEntriesByPath = buildLinkedEntriesByPath(app)
		const contents = await Promise.all(
			persistedPositionEntries.map(async (entry) => [
				entry.file.path,
				await readPositionTableLazyContent(app, entry.file, linkedEntriesByPath),
			] as const),
		)
		return new Map(contents)
	}

	// @story [[lucrjournal/position#^position-closed-projection]] Treats either lifecycle close marker as closed
	isClosed(position: Position): boolean {
		return position.status === 'close' || position.closed_at != null
	}

	calculateRisk(position: PositionFormulaInput): number | null {
		return calculatePositionRisk(position)
	}

	calculatePlannedRr(position: PositionFormulaInput): number | null {
		return calculatePositionPlannedRr(position)
	}

	calculateRealRr(position: PositionFormulaInput): number | null {
		return calculatePositionRealRr(position)
	}

	// @story [[lucrjournal/ocr#^apply-reviewed-ocr]] Validates and writes reviewed fields and evidence tokens in one frontmatter mutation
	async updateFieldsAndAppendAttachments(
		app: App,
		file: TFile,
		patch: PositionUpdatePatch,
		attachmentTokens: string[],
	): Promise<Position> {
		let nextValue: Position | null = null
		const normalizedPatch = this.normalizePatch(patch) as PositionUpdatePatch

		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			const previousRecord = isFrontmatterRecord(frontmatter) ? { ...frontmatter } : {}
			const nextRecord = {
				...previousRecord,
				...normalizedPatch,
			}
			if (attachmentTokens.length > 0) {
				applyAttachmentTokensToFrontmatter(nextRecord, attachmentTokens)
			}

			const coercedRecord = this.applyCoerce(nextRecord)
			if (isFrontmatterRecord(coercedRecord)) {
				assignFrontmatterRecord(nextRecord, coercedRecord)
			}

			this.beforeSave?.({
				app,
				file,
				previousRecord,
				record: nextRecord,
				patch: normalizedPatch,
			})

			const refined = this.refine(nextRecord)
			if (refined === null) {
				throw new Error('Invalid position frontmatter after update')
			}

			replaceFrontmatterRecord(frontmatter as Record<string, unknown>, nextRecord)
			nextValue = refined
		})

		if (nextValue === null) {
			throw new Error('position update did not produce a value')
		}

		return nextValue
	}

	override beforeSave({
		app,
		previousRecord,
		record,
		patch,
	}: {
		app: App
		file: TFile
		previousRecord: Record<string, unknown>
		record: Record<string, unknown>
		patch: PositionUpdatePatch
	}) {
		applyDerivedPositionFields(app, record, patch, previousRecord)
	}

	override normalizePatch(patch: Record<string, unknown>): Record<string, unknown> {
		return normalizePositionUpdatePatch(patch)
	}
}

export const PositionDomain = new PositionDomainDefinition()

export type Position = typeof PositionType.infer
export type PositionUpdatePatch = Partial<Pick<Position,
	'status'
	| 'symbol'
	| 'confidence'
	| 'notional_value'
	| 'notional_asset'
	| 'notional_amount'
	| 'contract'
	| 'lots'
	| 'risk'
	| 'entry_price'
	| 'exit_price'
	| 'fee'
	| 'target_price'
	| 'stop_loss'
	| 'opened_at'
	| 'closed_at'
	| 'profit'
>>
export type PositionContextLinkedEntry<Entry> = {
	id: string;
	linkpath: string;
	sectionStart: number;
	file: TFile;
	entry: DomainPersistedEntry<Entry>;
	contextBody: string;
}
export type PositionSectionKind = 'news' | 'key_level' | 'confluence' | 'market_analysis'
type PositionTableLinkedKind = 'playbook' | PositionSectionKind
type PositionTableLinkedEntry = {
	kind: PositionTableLinkedKind;
	file: TFile;
	linkpath: string;
	label: string;
}
export type PositionTableLazyContent = {
	playbook: PositionTableLinkedEntry | null;
	news: PositionTableLinkedEntry[];
	keyLevels: PositionTableLinkedEntry[];
	confluence: PositionTableLinkedEntry[];
	marketAnalyses: PositionTableLinkedEntry[];
}

type PositionContextSectionGroup<Entry> = {
	kind: PositionSectionKind;
	linkedEntries: PositionContextLinkedEntry<Entry>[];
	availableEntries: DomainPersistedEntry<Entry>[];
	sectionTitle: string;
	hasSection: boolean;
	hasContent: boolean;
}
export type PositionContextNewsGroup = PositionContextSectionGroup<News> & { kind: 'news' }
export type PositionContextKeyLevelGroup = PositionContextSectionGroup<KeyLevel> & { kind: 'key_level' }
export type PositionContextConfluenceGroup = PositionContextSectionGroup<Confluence> & { kind: 'confluence' }
export type PositionContextMarketAnalysisGroup = PositionContextSectionGroup<MarketAnalysis> & { kind: 'market_analysis' }
export type PositionContextPlaybookGroup = {
	kind: 'playbook';
	playbookEntry: PositionContextLinkedEntry<Playbook> | null;
	availablePlaybookEntries: DomainPersistedEntry<Playbook>[];
}
type PositionContextGroup =
	| PositionContextNewsGroup
	| PositionContextKeyLevelGroup
	| PositionContextConfluenceGroup
	| PositionContextMarketAnalysisGroup
	| PositionContextPlaybookGroup

type PositionLinkedEntriesByPath = {
	news: Map<string, DomainPersistedEntry<News> & { file: TFile }>;
	keyLevel: Map<string, DomainPersistedEntry<KeyLevel> & { file: TFile }>;
	confluence: Map<string, DomainPersistedEntry<Confluence> & { file: TFile }>;
	marketAnalysis: Map<string, DomainPersistedEntry<MarketAnalysis> & { file: TFile }>;
	playbook: Map<string, DomainPersistedEntry<Playbook> & { file: TFile }>;
}

async function listPositionContextGroups(
	app: App,
	file: TFile,
): Promise<PositionContextGroup[]> {
	const linkedEntriesByPath = buildLinkedEntriesByPath(app)
	const playbookEntries = [...linkedEntriesByPath.playbook.values()]
	const content = await app.vault.read(file)
	const playbookEntry = collectPlaybookEntry(app, file, content, linkedEntriesByPath.playbook)

	return [
		{
			kind: 'playbook',
			playbookEntry,
			availablePlaybookEntries: sortContextPlaybookEntries(playbookEntries),
		},
		buildPositionContextSectionGroup(app, file, content, 'News', linkedEntriesByPath.news, 'news'),
		buildPositionContextSectionGroup(app, file, content, 'Key Levels', linkedEntriesByPath.keyLevel, 'key_level'),
		buildPositionContextSectionGroup(app, file, content, 'Confluence', linkedEntriesByPath.confluence, 'confluence'),
		buildPositionContextSectionGroup(app, file, content, 'Market Analysis', linkedEntriesByPath.marketAnalysis, 'market_analysis'),
	]
}

function buildLinkedEntriesByPath(app: App): PositionLinkedEntriesByPath {
	return {
		news: toPersistedEntryMap(NewsDomain.totalEntries(app)),
		keyLevel: toPersistedEntryMap(KeyLevelDomain.totalEntries(app)),
		confluence: toPersistedEntryMap(ConfluenceDomain.totalEntries(app)),
		marketAnalysis: toPersistedEntryMap(MarketAnalysisDomain.totalEntries(app)),
		playbook: toPersistedEntryMap(PlaybookDomain.totalEntries(app)),
	}
}

function toPersistedEntryMap<Entry>(entries: DomainPersistedEntry<Entry>[]) {
	return new Map(
		entries
			.filter((entry): entry is DomainPersistedEntry<Entry> & { file: TFile } => entry.file instanceof TFile)
			.map((entry) => [entry.file.path, entry] as const),
	)
}

// @story [[lucrjournal/position-body#^position-linked-context-reading]] Reads one canonical H1 into its typed linked context group
function buildPositionContextSectionGroup<Entry>(
	app: App,
	file: TFile,
	content: string,
	sectionTitle: string,
	entriesByPath: Map<string, DomainPersistedEntry<Entry> & { file: TFile }>,
	kind: PositionSectionKind,
): PositionContextGroup {
	const section = extractSection(content, sectionTitle)
	return {
		kind,
		sectionTitle,
		linkedEntries: collectSectionLinkedEntries(app, file, section.body, entriesByPath, kind),
		availableEntries: sortContextEntries([...entriesByPath.values()]),
		hasSection: section.found,
		hasContent: section.body.trim().length > 0,
	} as PositionContextGroup
}

type PositionCreateFormValue = {
	symbol: SymbolWikilink | '';
	opened_at?: string;
	side: TradeSide;
	confidence: PositionConfidence | null;
	notional_value: string;
	risk: string;
	fee_value: string;
	symbol_type: string | null;
	profit: string;
}

// @story [[lucrjournal/position#^position-created-open]] Builds the normal creation defaults for a newly opened position
function buildCreateEntryPayload(
	formValue: PositionCreateFormValue,
	id: string,
) {
	if (id.trim() === '') {
		throw new Error('Position id is required')
	}

	if (formValue.symbol === '') {
		throw new Error(POSITION_SYMBOL_REQUIRED_ERROR)
	}

	return PositionType.assert({
		lucr_type: 'position',
		id,
		status: 'open',
		symbol: formValue.symbol,
		notional_value: toNullableNumberValue(formValue.notional_value),
		opened_at: toNullableTrimmedValue(formValue.opened_at ?? ''),
		side: formValue.side,
		confidence: formValue.confidence,
		risk: normalizePositionAmount(toNullableNumberValue(formValue.risk)),
		fee: deriveAbsoluteFee({
			type: formValue.symbol_type,
			fee_value: toNullableNumberValue(formValue.fee_value),
			notional_value: toNullableNumberValue(formValue.notional_value),
		}),
		profit: normalizePositionAmount(toNullableNumberValue(formValue.profit)),
	})
}

function resolveCreatePositionPlatformWikilink(app: App, value: string): PlatformWikilink | '' {
	const accountEntry = AccountDomain.findByDisplayName(app, value)
	if (accountEntry?.fm.platform != null) {
		return accountEntry.fm.platform
	}

	const platformName = sanitizeObsidianFileName(value).trim()
	return platformName === '' ? '' : PlatformWikilinkType.assert(`[[${platformName}]]`)
}

function applyDerivedPositionFields(
	app: App,
	record: Record<string, unknown>,
	patch: PositionUpdatePatch,
	previousRecord: Record<string, unknown>,
) {
	assertPositionRiskDirection(record, patch)
	applyPositionBeforeSaveFormulas({
		previousRecord,
		record,
		patch,
		symbolContext: resolvePositionSymbolContext(app, record),
		resolveDerivedFee: (nextRecord) => resolvePositionDerivedFee(app, nextRecord),
	})
}

function isFrontmatterRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assignFrontmatterRecord(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
) {
	for (const key of Object.keys(target)) {
		delete target[key]
	}
	Object.assign(target, source)
}

function replaceFrontmatterRecord(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
) {
	for (const key of Object.keys(target)) {
		if (!Object.prototype.hasOwnProperty.call(source, key)) {
			delete target[key]
		}
	}
	Object.assign(target, source)
}

// @story [[lucrjournal/position#^position-side-immutable]] Rejects every post-creation side patch before mutation
function normalizePositionUpdatePatch(patch: PositionUpdatePatch): PositionUpdatePatch {
	const nextPatch = { ...patch }
	if (hasPatchField(nextPatch, 'side')) {
		throw new Error(POSITION_SIDE_READONLY_ERROR)
	}
	if (nextPatch.notional_asset === 'usd') {
		delete nextPatch.notional_amount
	}
	return nextPatch
}

// @story [[lucrjournal/position#^position-risk-order]] Rejects price pairs that contradict the persisted trade direction
function assertPositionRiskDirection(
	record: Record<string, unknown>,
	patch: PositionUpdatePatch,
) {
	if (
		!hasPatchField(patch, 'entry_price')
		&& !hasPatchField(patch, 'stop_loss')
		&& !hasPatchField(patch, 'target_price')
	) {
		return
	}

	const direction = resolvePositionFormulaDirection(record.side)
	if (direction === null) {
		return
	}

	const entryPrice = normalizePositionNumber(record.entry_price)
	const stopLoss = normalizePositionNumber(record.stop_loss)
	const targetPrice = normalizePositionNumber(record.target_price)

	if (stopLoss !== null && targetPrice !== null && (targetPrice - stopLoss) * direction <= 0) {
		throw new Error(POSITION_RISK_DIRECTION_ERROR)
	}
	if (entryPrice !== null && stopLoss !== null && (entryPrice - stopLoss) * direction <= 0) {
		throw new Error(POSITION_RISK_DIRECTION_ERROR)
	}
	if (entryPrice !== null && targetPrice !== null && (targetPrice - entryPrice) * direction <= 0) {
		throw new Error(POSITION_RISK_DIRECTION_ERROR)
	}
}

function hasPatchField(
	patch: Record<string, unknown>,
	field: string,
) {
	return Object.prototype.hasOwnProperty.call(patch, field)
}

function resolvePositionSymbolContext(
	app: App,
	record: Record<string, unknown>,
): PositionNotionalContext {
	const symbolWikilink = typeof record.symbol === 'string' ? record.symbol : null
	const symbolEntry = symbolWikilink === null
		? null
		: SymbolDomain.resolveEntry(app, symbolWikilink)
	const symbolType = symbolEntry?.fm.type ?? null
	const contractUnit = symbolEntry === null
		? null
		: resolvePositionSymbolModel(symbolType).resolveContractUnit(symbolEntry.fm.name, symbolEntry.fm.contract_unit)
	return { symbolType, contractUnit }
}

// @story [[lucrjournal/position#^position-derived-account-platform]] Derives the current account only through the resolved symbol entry
export function derivePositionAccountWikilink(app: DomainRuntimeApp, position: Position): AccountWikilink | null {
	const symbolEntry = SymbolDomain.resolveEntry(app, position)
	return symbolEntry?.fm.account ?? null
}

// @story [[lucrjournal/position#^position-derived-account-platform]] Derives the current platform only through the resolved symbol entry
export function derivePositionPlatformWikilink(app: DomainRuntimeApp, position: Position): PlatformWikilink | null {
	const symbolEntry = SymbolDomain.resolveEntry(app, position)
	return symbolEntry === null ? null : SymbolDomain.resolvePlatformWikilink(app, symbolEntry.fm)
}

// @story [[lucrjournal/position-formulas#^position-derived-fee]] Reads the current linked symbol fee model for position writeback
function resolvePositionDerivedFee(
	app: App,
	record: Record<string, unknown>,
): number | null {
	const symbolEntry = SymbolDomain.resolveEntry(app, typeof record.symbol === 'string' ? record.symbol : null)
	const feeModel = symbolEntry === null ? emptyFeeModel() : SymbolDomain.toFeeModel(symbolEntry.fm)
	return deriveAbsoluteFee({
		type: symbolEntry?.fm.type ?? null,
		fee_value: feeModel.fee_value,
		notional_value: record.notional_value,
		contract: record.contract,
		lots: record.lots,
	})
}

function resolvePositionCreateSymbolType(
	app: App,
	accountDisplayName: string,
	symbolName: string,
): string | null {
	const normalizedAccountDisplayName = sanitizeObsidianFileName(accountDisplayName).trim()
	const normalizedSymbolName = refineSymbolName(symbolName)
	if (normalizedAccountDisplayName === '' || normalizedSymbolName === null) {
		return null
	}

	return SymbolDomain.findByAccountAndName(app, normalizedAccountDisplayName, normalizedSymbolName)?.fm.type ?? null
}

// @story [[lucrjournal/position-formulas#^planned-risk-reward]] Divides positive directional target reward by recomputed risk
function calculatePositionPlannedRr(position: PositionFormulaInput): number | null {
	const risk = calculatePositionRisk(position)
	const quantity = resolvePositionEffectiveQuantity(position)
	const direction = resolvePositionFormulaDirection(position.side)
	const entryPrice = normalizePositionNumber(position.entry_price)
	const targetPrice = normalizePositionNumber(position.target_price)
	if (risk === null || quantity === null || direction === null || entryPrice === null || targetPrice === null) {
		return null
	}

	const reward = (targetPrice - entryPrice) * direction * quantity
	return reward > 0 ? normalizePositionAmount(reward / risk) : null
}

// @story [[lucrjournal/position-formulas#^real-risk-reward]] Divides directional realized move by recomputed risk without fees
function calculatePositionRealRr(position: PositionFormulaInput): number | null {
	const risk = calculatePositionRisk(position)
	const quantity = resolvePositionEffectiveQuantity(position)
	const direction = resolvePositionFormulaDirection(position.side)
	const entryPrice = normalizePositionNumber(position.entry_price)
	const exitPrice = normalizePositionNumber(position.exit_price)
	if (risk === null || quantity === null || direction === null || entryPrice === null || exitPrice === null) {
		return null
	}

	return normalizePositionAmount(((exitPrice - entryPrice) * direction * quantity) / risk)
}

function resolveCreatePositionAccountWikilink(app: App, value: string): AccountWikilink | '' {
	const accountEntry = AccountDomain.findByDisplayName(app, value)
	if (accountEntry !== undefined) {
		return AccountWikilinkType.assert(`[[${getFileBasename(accountEntry.file)}]]`)
	}

	const accountName = sanitizeObsidianFileName(value).trim()
	return accountName === '' ? '' : AccountWikilinkType.assert(`[[ACC-${accountName}]]`)
}

function resolvePositionSymbolWikilink(app: App, accountDisplayName: string, symbolName: string): SymbolWikilink | '' {
	const normalizedAccountDisplayName = sanitizeObsidianFileName(accountDisplayName).trim()
	const normalizedSymbolName = refineSymbolName(symbolName)
	if (normalizedAccountDisplayName === '' || normalizedSymbolName === null) {
		return ''
	}

	const existingEntry = SymbolDomain.findByAccountAndName(app, normalizedAccountDisplayName, normalizedSymbolName)
	if (existingEntry !== null) {
		return SymbolWikilinkType.assert(`[[${getFileBasename(existingEntry.file)}]]`)
	}

	return SymbolDomain.buildWikilink(normalizedAccountDisplayName, normalizedSymbolName)
}

function resolvePositionCreateFeeModel(
	app: App,
	accountDisplayName: string,
	symbolName: string,
): FeeModelValue {
	const normalizedAccountDisplayName = sanitizeObsidianFileName(accountDisplayName).trim()
	const normalizedSymbolName = refineSymbolName(symbolName)
	if (normalizedAccountDisplayName === '' || normalizedSymbolName === null) {
		return emptyFeeModel()
	}

	const symbolEntry = SymbolDomain.findByAccountAndName(app, normalizedAccountDisplayName, normalizedSymbolName)
	return symbolEntry === null ? emptyFeeModel() : SymbolDomain.toFeeModel(symbolEntry.fm)
}

function resolvePositionFormSymbolLogo(app: App, accountDisplayName: string, symbolName: string): string | null {
	const normalizedAccountDisplayName = sanitizeObsidianFileName(accountDisplayName).trim()
	const normalizedSymbolName = refineSymbolName(symbolName)
	if (normalizedAccountDisplayName === '' || normalizedSymbolName === null) {
		return null
	}

	return SymbolDomain.findByAccountAndName(app, normalizedAccountDisplayName, normalizedSymbolName)?.fm.logo ?? null
}

function resolvePositionSymbolValidationMessage(value: string) {
	const normalizedValue = value.trim().toUpperCase()
	if (normalizedValue.length === 0) {
		return undefined
	}

	return SymbolType.allows(normalizedValue)
		? undefined
		: 'POSITION_SYMBOL_INVALID'
}

function resolvePositionAccountValidationMessage(app: App | undefined, value: string) {
	const normalizedValue = sanitizeObsidianFileName(value).trim()
	if (normalizedValue === '') {
		return 'SYMBOL_ACCOUNT_REQUIRED'
	}
	if (app !== undefined && !AccountDomain.hasDisplayName(app, normalizedValue)) {
		return 'SYMBOL_ACCOUNT_NOT_FOUND'
	}
	return undefined
}

function resolveDefaultPositionSymbol(app: App, account: string) {
	const uniqueSymbols = listPositionSymbolOptions(app, {
		account,
		side: 'LONG',
		symbol: '',
	})

	return uniqueSymbols.length === 1 ? uniqueSymbols[0]!.value : ''
}

function resolveCanonicalPositionAccountName(app: App, value: string): string {
	const accountName = sanitizeObsidianFileName(value).trim()
	if (accountName === '') {
		return ''
	}

	const matchedAccount = AccountDomain.findByDisplayName(app, accountName)
	return matchedAccount === undefined ? accountName : AccountDomain.toDisplayName(matchedAccount.fm)
}

// @story [[lucrjournal/domain-model#^position-sequence-allocation]] Allocates from every matching markdown basename in the vault
function getNextPositionId(app: App): number {
	return (
		app.vault.getMarkdownFiles().reduce(
			(maxId, file) => Math.max(maxId, parsePositionFileSequence(getFileBasename(file))),
			0,
		) + 1
	)
}

function parsePositionFileSequence(fileBaseName: string): number {
	const matchedSequence = /^POS-(\d+)$/.exec(fileBaseName.trim())
	return matchedSequence === null ? 0 : Number.parseInt(matchedSequence[1]!, 10)
}

// @story [[lucrjournal/domain-model#^position-file-sequence]] Formats the allocated sequence as the persisted position basename
function buildPositionFileId(id: number | null | undefined): string {
	if (typeof id !== 'number') {
		throw new Error('Position id must be a number to build a file id')
	}

	return `POS-${id.toString().padStart(5, '0')}`
}

function sortContextEntries<Entry>(
	entries: DomainPersistedEntry<Entry>[],
) {
	return [...entries].sort((left, right) => getPersistedEntryDisplayName(left).localeCompare(getPersistedEntryDisplayName(right)))
}

function sortContextPlaybookEntries(
	playbookEntries: DomainPersistedEntry<Playbook>[],
) {
	return [...playbookEntries].sort((left, right) => getPersistedEntryDisplayName(left).localeCompare(getPersistedEntryDisplayName(right)))
}

async function readPositionTableLazyContent(
	app: App,
	positionFile: TFile,
	linkedEntriesByPath: PositionLinkedEntriesByPath,
): Promise<PositionTableLazyContent> {
	const content = await app.vault.read(positionFile)

	return {
		playbook: toTableLinkedEntry(
			collectPlaybookEntry(app, positionFile, content, linkedEntriesByPath.playbook),
			'playbook',
		),
		news: collectTableSectionLinkedEntries(app, positionFile, content, 'News', linkedEntriesByPath.news, 'news'),
		keyLevels: collectTableSectionLinkedEntries(app, positionFile, content, 'Key Levels', linkedEntriesByPath.keyLevel, 'key_level'),
		confluence: collectTableSectionLinkedEntries(app, positionFile, content, 'Confluence', linkedEntriesByPath.confluence, 'confluence'),
		marketAnalyses: collectTableSectionLinkedEntries(app, positionFile, content, 'Market Analysis', linkedEntriesByPath.marketAnalysis, 'market_analysis'),
	}
}

function collectTableSectionLinkedEntries<Entry>(
	app: App,
	positionFile: TFile,
	content: string,
	sectionTitle: string,
	entriesByPath: Map<string, DomainPersistedEntry<Entry> & { file: TFile }>,
	kind: PositionSectionKind,
) {
	return collectSectionLinkedEntries(
		app,
		positionFile,
		extractSection(content, sectionTitle).body,
		entriesByPath,
		kind,
	).flatMap((entry) => {
		const linkedEntry = toTableLinkedEntry(entry, kind)
		return linkedEntry === null ? [] : [linkedEntry]
	})
}

function toTableLinkedEntry<Entry>(
	entry: PositionContextLinkedEntry<Entry> | null,
	kind: PositionTableLinkedKind,
): PositionTableLinkedEntry | null {
	if (entry === null) {
		return null
	}

	return {
		kind,
		file: entry.file,
		linkpath: entry.linkpath,
		label: getPersistedEntryDisplayName(entry.entry),
	}
}

// @story [[lucrjournal/position-body#^position-linked-context-reading]] Resolves source-order H2 wikilinks to typed TFile-backed entries
// @story [[lucrjournal/position-body#^unresolved-position-context]] Omits malformed unresolved and wrong-domain headings without rewriting markdown
function collectSectionLinkedEntries<Entry>(
	app: App,
	positionFile: TFile,
	sectionBody: string,
	entriesByPath: Map<string, DomainPersistedEntry<Entry> & { file: TFile }>,
	kind: PositionSectionKind,
): PositionContextLinkedEntry<Entry>[] {
	return extractSections(sectionBody, 2).flatMap((section) => {
		const linkedHeading = parseWikilinkHeading(section.title)
		if (linkedHeading === null) {
			return []
		}

		const linkedFile = app.metadataCache.getFirstLinkpathDest(linkedHeading.linkpath, positionFile.path)
		if (!(linkedFile instanceof TFile)) {
			return []
		}

		const entry = entriesByPath.get(linkedFile.path)
		if (entry === undefined) {
			return []
		}

		return [{
			id: `${kind}:${linkedFile.path}:${section.start}`,
			linkpath: linkedHeading.linkpath,
			sectionStart: section.start,
			file: linkedFile,
			entry,
			contextBody: section.body,
		}]
	})
}

// @story [[lucrjournal/position-body#^position-playbook-context]] Resolves playbook frontmatter and exposes the Confluence H1 body as its context
function collectPlaybookEntry(
	app: App,
	positionFile: TFile,
	content: string,
	playbookEntriesByPath: Map<string, DomainPersistedEntry<Playbook> & { file: TFile }>,
): PositionContextLinkedEntry<Playbook> | null {
	const playbookLink = typeof PositionDomain.coerce(app.metadataCache.getFileCache(positionFile)?.frontmatter ?? {}).playbook === 'string'
		? PositionDomain.coerce(app.metadataCache.getFileCache(positionFile)?.frontmatter ?? {}).playbook
		: null
	if (playbookLink == null) {
		return null
	}

	const linkedHeading = parseWikilinkHeading(playbookLink)
	if (linkedHeading === null) {
		return null
	}

	const linkedFile = app.metadataCache.getFirstLinkpathDest(linkedHeading.linkpath, positionFile.path)
	if (!(linkedFile instanceof TFile)) {
		return null
	}

	const entry = playbookEntriesByPath.get(linkedFile.path)
	if (entry === undefined) {
		return null
	}

	return {
		id: `playbook:${linkedFile.path}:frontmatter`,
		linkpath: linkedHeading.linkpath,
		sectionStart: -1,
		file: linkedFile,
		entry,
		contextBody: extractSection(content, 'Confluence').body,
	} satisfies PositionContextLinkedEntry<Playbook>
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	const createMockFile = (path: string) => Object.assign(new TFile(), {
		path,
		basename: path.split('/').pop()?.replace(/\.md$/, '') ?? path,
		parent: { path: path.split('/').slice(0, -1).join('/') },
	})

	describe('PositionType', () => {
		// @story [[lucrjournal/position#^position-open-schema]] Covers preservation of fields outside the declared position schema
		it('allows unknown fields and preserves them in the parsed output', () => {
			const position = PositionType.assert({
				lucr_type: 'position',
				symbol: '[[SBL-Research-BTC∕USDT]]',
				accountLabel: 'Main Account',
				events: ['CPI'],
			}) as Position & { accountLabel: string; events: string[] }

			expect(position.accountLabel).toBe('Main Account')
			expect(position.events).toEqual(['CPI'])
		})

		// @story [[lucrjournal/position#^position-open-schema]] Covers the discriminator-only minimum record
		it('requires lucr_type and allows every other known field to be omitted or null', () => {
			expect(PositionType.allows({ lucr_type: 'position' })).toBe(true)
			expect(
				PositionType.allows({
					lucr_type: 'position',
					id: null,
					status: null,
					symbol: null,
					profit: null,
					side: null,
					confidence: null,
					notional_value: null,
					notional_asset: null,
					contract: null,
					lots: null,
					risk: null,
					entry_price: null,
					exit_price: null,
					fee: null,
					target_price: null,
					stop_loss: null,
					opened_at: null,
					closed_at: null,
				}),
			).toBe(true)

			expect(
				PositionType.allows({ lucr_type: 'position', unknown: null }),
			).toBe(true)
		})

		// @story [[lucrjournal/position#^position-confidence-values]] Covers the bounded confidence enum
		it('still validates known field formats when a value is present', () => {
			expect(
				PositionType.allows({
					lucr_type: 'position',
					symbol: '[[SBL-Research-BTC∕USDT]]',
					confidence: 5,
					status: 'open',
					opened_at: '2026-03-20T16:31:05+08:00',
				}),
			).toBe(true)
			expect(
				PositionType.allows({ lucr_type: 'position', symbol: '[[SBL-Research-TSLA]]' }),
			).toBe(true)
			expect(
				PositionType.allows({ lucr_type: 'position', symbol: 'btc/usdt' }),
			).toBe(false)
			expect(
				PositionType.allows({ lucr_type: 'position', confidence: 6 }),
			).toBe(false)
			expect(
				PositionType.allows({ lucr_type: 'position', status: 'closed' }),
			).toBe(false)
			expect(
				PositionType.allows({
					lucr_type: 'position',
					opened_at: '2026-03-20 16:31',
				}),
			).toBe(false)
		})

		// @story [[lucrjournal/position#^position-notional-mode]] Covers canonical notional modes
		// @story [[lucrjournal/position#^position-quantity-bounds]] Covers accepted and rejected position quantity shapes
		it('accepts new symbol-type-specific source fields', () => {
			expect(PositionType.allows({
				lucr_type: 'position',
				notional_asset: 'native',
				contract: 2,
				lots: 0.1,
			})).toBe(true)

			expect(PositionType.allows({
				lucr_type: 'position',
				notional_asset: 'usd',
			})).toBe(true)

			expect(PositionType.allows({
				lucr_type: 'position',
				notional_asset: 'invalid',
			})).toBe(false)

			expect(PositionType.allows({
				lucr_type: 'position',
				contract: 0,
			})).toBe(false)

			expect(PositionType.allows({
				lucr_type: 'position',
				contract: -1,
			})).toBe(false)

			expect(PositionType.allows({
				lucr_type: 'position',
				contract: 1.5,
			})).toBe(false)

			expect(PositionType.allows({
				lucr_type: 'position',
				lots: 0,
			})).toBe(false)

			expect(PositionType.allows({
				lucr_type: 'position',
				lots: -0.1,
			})).toBe(false)
		})

		// @story [[lucrjournal/position#^position-notional-mode]] Covers removal of amount outside native mode
		it('coerces blank-string source fields to null', () => {
			expect(PositionDomain.refine({
				lucr_type: 'position',
				notional_asset: '',
				contract: '',
				lots: '',
			})).toEqual(expect.objectContaining({
				notional_asset: null,
				contract: null,
				lots: null,
			}))

			expect(PositionDomain.refine({
				lucr_type: 'position',
				notional_amount: '',
			})).not.toHaveProperty('notional_amount')

			expect(PositionDomain.refine({
				lucr_type: 'position',
				notional_asset: 'native',
				notional_amount: '',
			})).toEqual(expect.objectContaining({
				notional_amount: null,
			}))
		})

		it('coerces numeric strings on source fields', () => {
			expect(PositionDomain.refine({
				lucr_type: 'position',
				contract: '2',
				lots: '0.1',
			})).toEqual(expect.objectContaining({
				contract: 2,
				lots: 0.1,
			}))

			expect(PositionDomain.refine({
				lucr_type: 'position',
				notional_amount: '0.5',
			})).not.toHaveProperty('notional_amount')

			expect(PositionDomain.refine({
				lucr_type: 'position',
				notional_asset: 'native',
				notional_amount: '0.5',
			})).toEqual(expect.objectContaining({
				notional_amount: 0.5,
			}))
		})

		// @story [[lucrjournal/position#^position-quantity-bounds]] Covers strict positive integer contracts
		it('rejects non-positive or decimal contract values', () => {
			expect(PositionDomain.refine({
				lucr_type: 'position',
				contract: '0',
			})).toBeNull()

			expect(PositionDomain.refine({
				lucr_type: 'position',
				contract: '-2',
			})).toBeNull()

			expect(PositionDomain.refine({
				lucr_type: 'position',
				contract: '1.5',
			})).toBeNull()
		})

		// @story [[lucrjournal/position#^position-quantity-bounds]] Covers inclusive lot bounds
		it('rejects non-positive lots values while keeping decimal lots valid', () => {
			expect(PositionDomain.refine({
				lucr_type: 'position',
				lots: '0',
			})).toBeNull()

			expect(PositionDomain.refine({
				lucr_type: 'position',
				lots: '-0.1',
			})).toBeNull()

			expect(PositionDomain.refine({
				lucr_type: 'position',
				lots: '0.009',
			})).toBeNull()

			expect(PositionDomain.refine({
				lucr_type: 'position',
				lots: '20.01',
			})).toBeNull()

			expect(PositionDomain.refine({
				lucr_type: 'position',
				lots: '0.1',
			})).toEqual(expect.objectContaining({
				lots: 0.1,
			}))
		})

		it('coerces common frontmatter string forms into normalized values', () => {
			expect(PositionDomain.refine({
				lucr_type: 'position',
				id: '7',
				status: 'Closed',
				symbol: '[[SBL-Main Account-BTC∕USDT]]',
				platform: 'Binance',
				account: '[[ACC-Main Account|Alias]]',
				profit: '12.5',
				side: 'long',
				confidence: '4',
				notional_value: 0.35,
				risk: '120',
				opened_at: '2026-03-20 16:31+08:00',
				attachments: ' chart.png ',
			})).toEqual({
				lucr_type: 'position',
				account: '[[ACC-Main Account|Alias]]',
				id: '7',
				platform: 'Binance',
				status: 'close',
				symbol: '[[SBL-Main Account-BTC∕USDT]]',
				profit: 12.5,
				side: 'LONG',
				confidence: 4,
				notional_value: 0.35,
				risk: 120,
				opened_at: '2026-03-20T16:31:00+08:00',
				attachments: ['chart.png'],
			})

			expect(PositionDomain.refine({
				lucr_type: 'position',
				symbol: ' tsla ',
			})).toBeNull()
		})

		it('leaves removed account/platform fields untouched on coerce', () => {
			const record = {
				lucr_type: 'position',
				account: '[[ACC-Main]]',
				platform: '[[Binance]]',
				symbol: '[[SBL-Main-BTCUSDT]]',
			}
			PositionDomain.coerce(record as never)
			expect(record.account).toBe('[[ACC-Main]]')
			expect(record.platform).toBe('[[Binance]]')
		})
	})

	describe('buildCreateEntryPayload', () => {
		it('maps form values into a persisted position payload', () => {
			expect(
				buildCreateEntryPayload(
					{
						symbol: SymbolDomain.buildWikilink('Binance', 'BTCUSDT.P'),
						notional_value: '0.35',
						opened_at: '2026-03-27T12:00:00+08:00',
						side: 'LONG',
						confidence: 4,
						risk: '120',
						fee_value: '',
						symbol_type: 'Crypto_Perp',
						profit: '-45.5',
					},
					'550e8400-e29b-41d4-a716-446655440000',
				),
			).toEqual({
				lucr_type: 'position',
				id: '550e8400-e29b-41d4-a716-446655440000',
				status: 'open',
				symbol: '[[SBL-Binance-BTCUSDT.P]]',
				notional_value: 0.35,
				opened_at: '2026-03-27T12:00:00+08:00',
				side: 'LONG',
				confidence: 4,
				risk: 120,
				fee: null,
				profit: -45.5,
			})
		})

		it('maps blank text fields to null', () => {
			expect(
				buildCreateEntryPayload(
					{
						symbol: SymbolDomain.buildWikilink('Binance', 'BTCUSDT.P'),
						notional_value: '',
						opened_at: '2026-03-27T12:00:00+08:00',
						side: 'LONG',
						confidence: 3,
						risk: '',
						fee_value: '',
						symbol_type: 'Crypto_Perp',
						profit: '',
					},
					'550e8400-e29b-41d4-a716-446655440001',
				),
			).toEqual({
				lucr_type: 'position',
				id: '550e8400-e29b-41d4-a716-446655440001',
				status: 'open',
				symbol: '[[SBL-Binance-BTCUSDT.P]]',
				notional_value: null,
				opened_at: '2026-03-27T12:00:00+08:00',
				side: 'LONG',
				confidence: 3,
				risk: null,
				fee: null,
				profit: null,
			})
		})

		it('rejects missing required symbol value before persistence', () => {
			expect(() =>
				buildCreateEntryPayload(
					{
						symbol: '',
						notional_value: '',
						opened_at: '2026-03-27T12:00:00+08:00',
						side: 'LONG',
						confidence: 4,
						risk: '',
						fee_value: '',
						symbol_type: 'Crypto_Spot',
						profit: '',
					},
					'550e8400-e29b-41d4-a716-446655440002',
				),
			).toThrow(POSITION_SYMBOL_REQUIRED_ERROR)
		})
	})

	describe('PositionDomain create form', () => {
		// @story [[lucrjournal/domain-model#^position-uuid-identity]] Covers UUID v7 assignment in the position creation context
		it('uses uuid v7 for the default persisted position id', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [],
				},
				metadataCache: {
					getFileCache: () => null,
				},
			} as unknown as App

			const ctx = PositionDomain.createEntryDescriptor.buildContext(app, {
				account: '',
				side: 'LONG',
				symbol: '',
			})

			expect(ctx.positionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
		})

		it('defaults symbol when the selected account has exactly one persisted symbol', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md` },
						{ path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md` },
					],
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => file.path.endsWith('/symbols/SBL-Research-BTCUSDT.md')
						? {
							frontmatter: {
								lucr_type: 'symbol',
								symbol: 'BTCUSDT',
								name: 'BTCUSDT',
								account: '[[ACC-Research]]',
								platform: '[[Binance]]',
							},
						}
						: {
							frontmatter: {
								lucr_type: 'account',
								name: 'Research',
								platform: null,
							},
						},
				},
			} as unknown as App

			expect(PositionDomain.buildCreateFormValues(app, 'Research')).toEqual({
				account: 'Research',
				side: 'LONG',
				symbol: 'BTCUSDT',
			})
		})

		it('prefills account from dashboard selection and keeps symbol empty before account-specific history exists', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [],
				},
				metadataCache: {
					getFileCache: () => null,
				},
			} as unknown as App

			expect(PositionDomain.buildCreateFormValues(app, 'Research')).toEqual({
				account: 'Research',
				side: 'LONG',
				symbol: '',
			})
		})

		it('does not re-apply default symbol when synchronizing without previous account context', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md` },
						{ path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md` },
					],
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => file.path.endsWith('/symbols/SBL-Research-BTCUSDT.md')
						? {
							frontmatter: {
								lucr_type: 'symbol',
								name: 'BTC/USDT',
								account: '[[ACC-Research]]',
								platform: '[[Binance]]',
							},
						}
						: {
							frontmatter: {
								lucr_type: 'account',
								name: 'Research',
								platform: null,
							},
						},
				},
			} as unknown as App

			expect(
				PositionDomain.synchronizeFormValues(
					{ account: 'Research', side: 'LONG', symbol: '' },
					{ app },
				),
			).toEqual({
				account: 'Research',
				side: 'LONG',
				symbol: '',
			})
		})

		it('applies default symbol when account actually changes', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [
						{ path: `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md` },
						{ path: `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md` },
					],
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => file.path.endsWith('/symbols/SBL-Research-BTCUSDT.md')
						? {
							frontmatter: {
								lucr_type: 'symbol',
								name: 'BTCUSDT',
								account: '[[ACC-Research]]',
								platform: '[[Binance]]',
							},
						}
						: {
							frontmatter: {
								lucr_type: 'account',
								name: 'Research',
								platform: null,
							},
						},
				},
			} as unknown as App

			expect(
				PositionDomain.synchronizeFormValues(
					{ account: 'Research', side: 'LONG', symbol: '' },
					{
						app,
						previousValues: { account: '', side: 'LONG', symbol: '' },
					},
				),
			).toEqual({
				account: 'Research',
				side: 'LONG',
				symbol: 'BTCUSDT',
			})
		})

		// @story [[lucrjournal/form#^existing-account-boundary]] Covers position form validation against persisted accounts
		it('requires the create form account to match an existing account', () => {
			const app = {
				vault: {
					getMarkdownFiles: () => [],
				},
				metadataCache: {
					getFileCache: () => null,
				},
			} as unknown as App

			expect(PositionDomain.formDefinition.account.validate?.('Research', {
				account: 'Research',
				side: 'LONG',
				symbol: 'BTCUSDT.P',
			}, { app })).toBe('SYMBOL_ACCOUNT_NOT_FOUND')
		})

		// @story [[lucrjournal/position#^position-account-symbol-create]] Covers rejection before creating dependencies for a missing account
		// @story [[lucrjournal/form#^existing-account-boundary]] Covers position rejection without implicit dependency creation
		it('rejects missing account instead of creating account dependencies', async () => {
			const created: Array<{ path: string; content: string }> = []
			const files: TFile[] = []
			const app = {
				vault: {
					getMarkdownFiles: () => files,
					getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
					create: async (path: string, content: string) => {
						created.push({ path, content })
						const file = createMockFile(path)
						files.push(file)
						return file
					},
				},
				metadataCache: {
					getFileCache: () => null,
				},
			} as unknown as App

			await expect(PositionDomain.createEntry(app, {
				account: 'Research',
				side: 'SHORT',
				symbol: 'BTCUSDT.P',
			})).rejects.toThrow('POSITION_ACCOUNT_NOT_FOUND_ERROR')

			expect(created).toHaveLength(0)
		})

		// @story [[lucrjournal/position#^position-account-symbol-create]] Covers account-scoped symbol creation before position persistence
		it('does not use removed account frontmatter fields when creating a new position', async () => {
			const created: Array<{ path: string; content: string }> = []
			const files = [
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`),
			]
			const app = {
				vault: {
					getMarkdownFiles: () => files,
					getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
					create: async (path: string, content: string) => {
						created.push({ path, content })
						const file = createMockFile(path)
						files.push(file)
						return file
					},
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => file.path.endsWith('/accounts/ACC-Research.md')
						? {
							frontmatter: {
								lucr_type: 'account',
								name: 'Research',
								platform: '[[Binance]]',
							},
						}
						: null,
				},
			} as unknown as App

			await PositionDomain.createEntry(app, {
				account: 'Research',
				side: 'LONG',
				symbol: 'BTCUSDT.P',
			})

			expect(created).toHaveLength(2)
			expect(created[0]?.content).toContain('type: "Crypto_Perp"')
			expect(created[0]?.content).not.toContain('\nfee_value:')
			expect(created[1]?.content).not.toContain('fee: 1.25')
			expect(created[1]?.content).not.toContain('fee: 2.5')
			expect(created[1]?.content).toContain('symbol: "[[SBL-Research-BTCUSDT.P]]"')
		})

		it('keeps new position fee empty when persisted symbol fee_value needs position size', async () => {
			const created: Array<{ path: string; content: string }> = []
			const files = [
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`),
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.P.md`),
			]
			const app = {
				vault: {
					getMarkdownFiles: () => files,
					getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
					create: async (path: string, content: string) => {
						created.push({ path, content })
						const file = createMockFile(path)
						files.push(file)
						return file
					},
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => {
						if (file.path.endsWith('/accounts/ACC-Research.md')) {
							return {
								frontmatter: {
									lucr_type: 'account',
									name: 'Research',
									platform: '[[Binance]]',
								},
							}
						}

						if (file.path.endsWith('/symbols/SBL-Research-BTCUSDT.P.md')) {
							return {
								frontmatter: {
									lucr_type: 'symbol',
									name: 'BTCUSDT.P',
									account: '[[ACC-Research]]',
									platform: '[[Binance]]',
									type: 'Crypto_Perp',
									fee_value: 0.4,
								},
							}
						}

						return null
					},
				},
			} as unknown as App

			await PositionDomain.createEntry(app, {
				account: 'Research',
				side: 'LONG',
				symbol: 'BTCUSDT.P',
			})

			expect(created).toHaveLength(1)
			expect(created[0]?.content).not.toContain('fee: 0.4')
			expect(created[0]?.content).toContain('symbol: "[[SBL-Research-BTCUSDT.P]]"')
		})

		it('keeps new position fee empty when persisted symbol fee model is empty', async () => {
			const created: Array<{ path: string; content: string }> = []
			const files = [
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`),
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTC∕USDT.md`),
			]
			const app = {
				vault: {
					getMarkdownFiles: () => files,
					getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
					create: async (path: string, content: string) => {
						created.push({ path, content })
						const file = createMockFile(path)
						files.push(file)
						return file
					},
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => {
						if (file.path.endsWith('/accounts/ACC-Research.md')) {
							return {
								frontmatter: {
									lucr_type: 'account',
									name: 'Research',
									platform: '[[Binance]]',
								},
							}
						}

						if (file.path.endsWith('/symbols/SBL-Research-BTC∕USDT.md')) {
							return {
								frontmatter: {
									lucr_type: 'symbol',
									name: 'BTC/USDT',
									account: '[[ACC-Research]]',
									platform: '[[Binance]]',
									type: 'Crypto_Spot',
									fee_value: null,
								},
							}
						}

						return null
					},
				},
			} as unknown as App

			await PositionDomain.createEntry(app, {
				account: 'Research',
				side: 'LONG',
				symbol: 'BTC/USDT',
			})

			expect(created).toHaveLength(1)
			expect(created[0]?.content).not.toContain('fee: 1.25')
		})

		it('rejects missing account even when a same-name platform exists', async () => {
			const created: Array<{ path: string; content: string }> = []
			const files = [
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/platforms/Research.md`),
			]
			const app = {
				vault: {
					getMarkdownFiles: () => files,
					getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
					create: async (path: string, content: string) => {
						created.push({ path, content })
						const file = createMockFile(path)
						files.push(file)
						return file
					},
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => file.path.endsWith('/platforms/Research.md')
						? { frontmatter: { lucr_type: 'platform' } }
						: null,
				},
			} as unknown as App

			await expect(PositionDomain.createEntry(app, {
				account: 'Research',
				side: 'LONG',
				symbol: 'BTCUSDT.P',
			})).rejects.toThrow('POSITION_ACCOUNT_NOT_FOUND_ERROR')

			expect(created).toHaveLength(0)
		})

		it('maps dependency basename conflicts to a visible submit error', async () => {
			const files = [
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`),
				createMockFile(`${LUCR_TRADE_ROOT_DIR}/news/SBL-Research-BTCUSDT.P.md`),
			]
			const app = {
				vault: {
					getMarkdownFiles: () => files,
					getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
					create: async () => {
						throw new Error('unexpected create')
					},
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => {
						if (file.path.endsWith('/accounts/ACC-Research.md')) {
							return {
								frontmatter: {
									lucr_type: 'account',
									name: 'Research',
									platform: '[[Binance]]',
								},
							}
						}

						if (file.path.endsWith('/news/SBL-Research-BTCUSDT.P.md')) {
							return { frontmatter: { lucr_type: 'news' } }
						}

						return null
					},
				},
			} as unknown as App
			let error: unknown = null

			try {
				await PositionDomain.createEntry(app, {
					account: 'Research',
					side: 'LONG',
					symbol: 'BTCUSDT.P',
				})
			} catch (caught) {
				error = caught
			}

			expect(error).toBeInstanceOf(Error)
			expect((error as Error).message).toBe('PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR')
			expect(PositionDomain.toCreateEntryErrorMessageKey(error)).toBe('DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE')
		})
	})

	describe('PositionDomain.isClosed', () => {
		// @story [[lucrjournal/position#^position-closed-projection]] Covers the explicit close discriminator
		it('treats explicit close status as closed', () => {
			expect(PositionDomain.isClosed({
				lucr_type: 'position',
				status: 'close',
			})).toBe(true)
		})

		// @story [[lucrjournal/position#^position-closed-projection]] Covers timestamp precedence over a stale open discriminator
		it('treats legacy positions with closed_at but stale open status as closed', () => {
			expect(PositionDomain.isClosed({
				lucr_type: 'position',
				status: 'open',
				closed_at: '2026-03-27T12:30:00+08:00',
			} as Position)).toBe(true)
		})

		// @story [[lucrjournal/position#^position-closed-projection]] Covers the open result without either close marker
		it('keeps positions without close markers open', () => {
			expect(PositionDomain.isClosed({
				lucr_type: 'position',
				status: 'open',
				closed_at: null,
			})).toBe(false)
		})
	})

	describe('PositionDomain derived metrics', () => {
		// @story [[lucrjournal/position-formulas#^formula-side-direction]] Covers the positive long direction
		// @story [[lucrjournal/position-formulas#^position-profit-formula]] Covers long price profit with an absolute fee
		// @story [[lucrjournal/position-formulas#^position-risk-formula]] Covers positive long stop-loss exposure
		// @story [[lucrjournal/position-formulas#^planned-risk-reward]] Covers long target reward divided by recomputed risk
		// @story [[lucrjournal/position-formulas#^real-risk-reward]] Covers long realized move divided by recomputed risk
		it('calculates profit and risk for long positions', () => {
			const position = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				target_price: 130,
				notional_value: 2,
				fee: 0.001,
			} as Position

			// persisted fee is the absolute amount consumed by profit math
			expect(calculatePositionProfit(position)).toBe(0.399)
			expect(PositionDomain.calculateRisk(position)).toBe(0.1)
			expect(PositionDomain.calculatePlannedRr(position)).toBe(6)
			expect(PositionDomain.calculateRealRr(position)).toBe(4)
		})

		// @story [[lucrjournal/position-formulas#^formula-side-direction]] Covers the negative short direction
		// @story [[lucrjournal/position-formulas#^position-profit-formula]] Covers short price profit with an absolute fee
		// @story [[lucrjournal/position-formulas#^position-risk-formula]] Covers positive short stop-loss exposure
		// @story [[lucrjournal/position-formulas#^planned-risk-reward]] Covers short target reward divided by recomputed risk
		// @story [[lucrjournal/position-formulas#^real-risk-reward]] Covers short realized move divided by recomputed risk
		it('calculates profit and ratios for short positions', () => {
			const position = {
				lucr_type: 'position',
				side: 'SHORT',
				entry_price: 100,
				exit_price: 90,
				stop_loss: 105,
				target_price: 85,
				notional_value: 3,
				fee: 0.002,
			} as Position

			expect(calculatePositionProfit(position)).toBe(0.298)
			expect(PositionDomain.calculateRisk(position)).toBe(0.15)
			expect(PositionDomain.calculatePlannedRr(position)).toBe(3)
			expect(PositionDomain.calculateRealRr(position)).toBe(2)
		})

		// @story [[lucrjournal/position-formulas#^position-risk-formula]] Covers rejection of non-positive directional risk
		// @story [[lucrjournal/position-formulas#^planned-risk-reward]] Covers the null result when recomputed risk is invalid
		it('returns null when the stop loss is on the wrong side', () => {
			const position = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				stop_loss: 110,
				target_price: 120,
				notional_value: 1,
			} as Position

			expect(PositionDomain.calculateRisk(position)).toBeNull()
			expect(PositionDomain.calculatePlannedRr(position)).toBeNull()
		})

		// @story [[lucrjournal/position-formulas#^real-risk-reward]] Covers preservation of a negative realized ratio
		it('allows negative real R:R when the realized move loses more than risk', () => {
			const position = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 92,
				stop_loss: 95,
				notional_value: 1,
			} as Position

			expect(PositionDomain.calculateRealRr(position)).toBe(-1.6)
		})

		// @story [[lucrjournal/position-formulas#^derived-amount-precision]] Covers final rounding of derived profit and risk
		it('rounds derived amounts to suppress floating point artifacts', () => {
			const impreciseExitPrice = Number.parseFloat('1.0372639999999999')
			const position = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 1,
				exit_price: impreciseExitPrice,
				stop_loss: 0.981368,
				notional_value: 1,
				fee: 0,
			} as Position

			expect(calculatePositionProfit(position)).toBe(0.037264)
			expect(PositionDomain.calculateRisk(position)).toBe(0.018632)
		})
	})

	describe('PositionDomain.updateFields', () => {
		it('updates fields and attachments in one frontmatter mutation', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`
			file.basename = 'POS-00001'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				stop_loss: 95,
				target_price: 130,
				notional_value: 2,
				attachments: ['[[LucrJournal/attachments/existing.png|existing]]'],
				chart_screenshots: ['[[legacy.png|legacy]]'],
			}
			let mutationCount = 0
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						mutationCount += 1
						updater(frontmatter)
					},
				},
			} as unknown as App

			const updated = await PositionDomain.updateFieldsAndAppendAttachments(app, file, {
				entry_price: 101,
				stop_loss: 90,
				target_price: 120,
			}, ['[[LucrJournal/attachments/POS-00001-1.png|2026-05-24T00:00:00.000Z]]'])

			expect(mutationCount).toBe(1)
			expect(frontmatter.entry_price).toBe(101)
			expect(frontmatter.attachments).toEqual([
				'[[LucrJournal/attachments/existing.png|existing]]',
				'[[LucrJournal/attachments/POS-00001-1.png|2026-05-24T00:00:00.000Z]]',
			])
			expect(frontmatter.chart_screenshots).toBeUndefined()
			expect(updated.attachments).toEqual(frontmatter.attachments)
		})

		it('does not append attachments when field validation fails', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00008.md`
			file.basename = 'POS-00008'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				stop_loss: 95,
				target_price: 130,
				notional_value: 2,
				attachments: ['[[LucrJournal/attachments/existing.png|existing]]'],
				chart_screenshots: ['[[legacy.png|legacy]]'],
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			await expect(PositionDomain.updateFieldsAndAppendAttachments(app, file, {
				target_price: 90,
			}, ['[[LucrJournal/attachments/POS-00008-1.png|2026-05-24T00:00:00.000Z]]']))
				.rejects.toThrow('POSITION_RISK_DIRECTION_ERROR')

			expect(frontmatter.target_price).toBe(130)
			expect(frontmatter.attachments).toEqual(['[[LucrJournal/attachments/existing.png|existing]]'])
			expect(frontmatter.chart_screenshots).toEqual(['[[legacy.png|legacy]]'])
		})

		it('recomputes profit and risk when source fields change', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`
			file.basename = 'POS-00001'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 2,
				profit: 0,
				risk: 0,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, file, {
				exit_price: 125,
				stop_loss: 96,
			})

			expect(frontmatter.profit).toBe(0.5)
			expect(frontmatter.risk).toBe(0.08)
			expect(updated.profit).toBe(0.5)
			expect(updated.risk).toBe(0.08)
		})

		it('rounds recomputed derived amounts before persisting them', async () => {
			const impreciseExitPrice = Number.parseFloat('1.0372639999999999')
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00006.md`
			file.basename = 'POS-00006'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 1,
				exit_price: 1,
				stop_loss: 0.99,
				notional_value: 1,
				profit: 0,
				risk: 0,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, file, {
				exit_price: impreciseExitPrice,
				stop_loss: 0.981368,
			})

			expect(frontmatter.profit).toBe(0.037264)
			expect(frontmatter.risk).toBe(0.018632)
			expect(updated.profit).toBe(0.037264)
			expect(updated.risk).toBe(0.018632)
		})

		it('preserves removed account/platform fields during unrelated writeback', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00009.md`
			file.basename = 'POS-00009'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				account: '[[ACC-Legacy]]',
				platform: '[[Binance]]',
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, file, {
				confidence: 3,
			})

			expect(frontmatter.account).toBe('[[ACC-Legacy]]')
			expect(frontmatter.platform).toBe('[[Binance]]')
			expect(updated.confidence).toBe(3)
		})

		it('clears derived values when dependent inputs become incomplete', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00002.md`
			file.basename = 'POS-00002'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 2,
				profit: 40,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			await PositionDomain.updateFields(app, file, {
				notional_value: null,
			})

			expect(frontmatter.profit).toBeNull()
			expect(frontmatter.risk).toBeNull()
		})

		// @story [[lucrjournal/position-formulas#^manual-derived-overrides]] Covers direct persisted profit and risk overrides
		it('keeps manual derived edits when source fields are untouched', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00003.md`
			file.basename = 'POS-00003'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 2,
				profit: 40,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			await PositionDomain.updateFields(app, file, {
				profit: 99,
				risk: 12,
			})

			expect(frontmatter.profit).toBe(99)
			expect(frontmatter.risk).toBe(12)
		})

		it('allows manual fee clear and zero', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00004.md`
			file.basename = 'POS-00004'
			file.extension = 'md'
			let frontmatter: Record<string, unknown>
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (fm: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			for (const fee of [null, 0]) {
				frontmatter = {
					lucr_type: 'position',
					side: 'LONG',
					entry_price: 100,
					exit_price: 110,
					notional_value: 1000,
					fee: 1,
					profit: 99,
				}

				await PositionDomain.updateFields(app, file, { fee })

				expect(frontmatter.fee).toBe(fee)
				expect(frontmatter.profit).toBe(100)
			}
		})

		// @story [[lucrjournal/position-formulas#^position-derived-fee]] Covers latest linked symbol fee resolution and profit cascade
		it('recomputes fee from the latest linked symbol fee model when fee dependencies change', async () => {
			const positionFile = new TFile()
			positionFile.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00010.md`
			positionFile.basename = 'POS-00010'
			positionFile.extension = 'md'
			const symbolFile = new TFile()
			symbolFile.path = `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTC∕USDT.md`
			symbolFile.basename = 'SBL-Research-BTC∕USDT'
			symbolFile.extension = 'md'
			const accountFile = new TFile()
			accountFile.path = `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`
			accountFile.basename = 'ACC-Research'
			accountFile.extension = 'md'
			const positionFrontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				symbol: '[[SBL-Research-BTC∕USDT]]',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 200,
				fee: 0,
				profit: 0,
				risk: 0,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(positionFrontmatter)
					},
				},
				metadataCache: {
					getFileCache: (file: TFile) => {
						if (file === positionFile) {
							return { frontmatter: positionFrontmatter }
						}
						if (file === symbolFile) {
							return {
								frontmatter: {
									lucr_type: 'symbol',
									name: 'BTC/USDT',
									account: '[[ACC-Research]]',
									platform: '[[Binance]]',
									type: 'Crypto_Spot',
									fee_value: 1,
								},
							}
						}
						if (file === accountFile) {
							return {
								frontmatter: {
									lucr_type: 'account',
									name: 'Research',
									platform: '[[Binance]]',
								},
							}
						}
						return null
					},
				},
				vault: {
					getMarkdownFiles: () => [positionFile, symbolFile, accountFile],
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, positionFile, {
				notional_value: 300,
			})

			expect(positionFrontmatter.fee).toBe(3)
			expect(positionFrontmatter.profit).toBe(57)
			expect(positionFrontmatter.risk).toBe(15)
			expect(updated.fee).toBe(3)
		})

		it('keeps manual fee when symbol fee model is empty', async () => {
			const positionFile = new TFile()
			positionFile.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00012.md`
			positionFile.basename = 'POS-00012'
			positionFile.extension = 'md'
			const symbolFile = new TFile()
			symbolFile.path = `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTC∕USDT.md`
			symbolFile.basename = 'SBL-Research-BTC∕USDT'
			symbolFile.extension = 'md'
			const accountFile = new TFile()
			accountFile.path = `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`
			accountFile.basename = 'ACC-Research'
			accountFile.extension = 'md'
			const positionFrontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				symbol: '[[SBL-Research-BTC∕USDT]]',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 200,
				fee: 2,
				profit: 38,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(positionFrontmatter)
					},
				},
				metadataCache: {
					getFileCache: (file: TFile) => {
						if (file === positionFile) {
							return { frontmatter: positionFrontmatter }
						}
						if (file === symbolFile) {
							return {
								frontmatter: {
									lucr_type: 'symbol',
									name: 'BTC/USDT',
									account: '[[ACC-Research]]',
									platform: '[[Binance]]',
									type: 'Crypto_Spot',
									fee_value: null,
								},
							}
						}
						if (file === accountFile) {
							return {
								frontmatter: {
									lucr_type: 'account',
									name: 'Research',
									platform: '[[Binance]]',
								},
							}
						}
						return null
					},
				},
				vault: {
					getMarkdownFiles: () => [positionFile, symbolFile, accountFile],
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, positionFile, {
				notional_value: 300,
			})

			expect(positionFrontmatter.fee).toBe(2)
			expect(positionFrontmatter.profit).toBe(58)
			expect(positionFrontmatter.risk).toBe(15)
			expect(updated.fee).toBe(2)
		})

		it('keeps manual fee overrides until a dependency recompute overwrites them', async () => {
			const positionFile = new TFile()
			positionFile.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00011.md`
			positionFile.basename = 'POS-00011'
			positionFile.extension = 'md'
			const symbolFile = new TFile()
			symbolFile.path = `${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTC∕USDT.md`
			symbolFile.basename = 'SBL-Research-BTC∕USDT'
			symbolFile.extension = 'md'
			const accountFile = new TFile()
			accountFile.path = `${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`
			accountFile.basename = 'ACC-Research'
			accountFile.extension = 'md'
			const positionFrontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				symbol: '[[SBL-Research-BTC∕USDT]]',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 200,
				fee: 2,
				profit: 38,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(positionFrontmatter)
					},
				},
				metadataCache: {
					getFileCache: (file: TFile) => {
						if (file === positionFile) {
							return { frontmatter: positionFrontmatter }
						}
						if (file === symbolFile) {
							return {
								frontmatter: {
									lucr_type: 'symbol',
									name: 'BTC/USDT',
									account: '[[ACC-Research]]',
									platform: '[[Binance]]',
									type: 'Crypto_Spot',
									fee_value: 1,
								},
							}
						}
						if (file === accountFile) {
							return {
								frontmatter: {
									lucr_type: 'account',
									name: 'Research',
									platform: '[[Binance]]',
								},
							}
						}
						return null
					},
				},
				vault: {
					getMarkdownFiles: () => [positionFile, symbolFile, accountFile],
				},
			} as unknown as App

			await PositionDomain.updateFields(app, positionFile, {
				fee: 5,
			})
			expect(positionFrontmatter.fee).toBe(5)
			expect(positionFrontmatter.profit).toBe(35)

			await PositionDomain.updateFields(app, positionFile, {
				notional_value: 300,
			})
			expect(positionFrontmatter.fee).toBe(3)
			expect(positionFrontmatter.profit).toBe(57)
		})

		it('rounds manual profit edits to the shared amount precision', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00007.md`
			file.basename = 'POS-00007'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 2,
				profit: 40,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, file, {
				profit: 37.26399999999999,
			})

			expect(frontmatter.profit).toBe(37.264)
			expect(updated.profit).toBe(37.264)
		})

		it('reopens positions by clearing closed_at when status becomes open', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00004.md`
			file.basename = 'POS-00004'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				status: 'close',
				closed_at: '2026-04-17T10:00:00+08:00',
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			await PositionDomain.updateFields(app, file, {
				status: 'open',
			})

			expect(frontmatter.status).toBe('open')
			expect(frontmatter.closed_at).toBeNull()
		})

		it('closes positions when exit price is filled', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00010.md`
			file.basename = 'POS-00010'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				status: 'open',
				side: 'LONG',
				entry_price: 100,
				exit_price: null,
				notional_value: 2,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, file, {
				exit_price: 120,
			})

			expect(frontmatter.status).toBe('close')
			expect(updated.status).toBe('close')
		})

		// @story [[lucrjournal/position#^position-side-immutable]] Covers rejection without mutating persisted direction or metrics
		it('rejects side updates after creation', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00005.md`
			file.basename = 'POS-00005'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				notional_value: 2,
				profit: 40,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			await expect(PositionDomain.updateFields(app, file, {
				side: 'SHORT',
			} as PositionUpdatePatch)).rejects.toThrow('POSITION_SIDE_READONLY_ERROR')

			expect(frontmatter.side).toBe('LONG')
			expect(frontmatter.profit).toBe(40)
			expect(frontmatter.risk).toBe(10)
		})

		it('rejects target price updates that contradict fixed long direction', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00008.md`
			file.basename = 'POS-00008'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				exit_price: 120,
				stop_loss: 95,
				target_price: 130,
				notional_value: 2,
				profit: 40,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			await expect(PositionDomain.updateFields(app, file, {
				target_price: 90,
			})).rejects.toThrow('POSITION_RISK_DIRECTION_ERROR')

			expect(frontmatter.side).toBe('LONG')
			expect(frontmatter.target_price).toBe(130)
			expect(frontmatter.profit).toBe(40)
			expect(frontmatter.risk).toBe(10)
		})

		it('rejects stop loss updates that contradict fixed short direction', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00011.md`
			file.basename = 'POS-00011'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'SHORT',
				entry_price: 100,
				exit_price: 90,
				stop_loss: 105,
				target_price: 85,
				notional_value: 2,
				profit: 20,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			await expect(PositionDomain.updateFields(app, file, {
				stop_loss: 95,
			})).rejects.toThrow('POSITION_RISK_DIRECTION_ERROR')

			expect(frontmatter.side).toBe('SHORT')
			expect(frontmatter.stop_loss).toBe(105)
			expect(frontmatter.profit).toBe(20)
			expect(frontmatter.risk).toBe(10)
		})

		it('does not override side when stop loss and target price are incomplete', async () => {
			const file = new TFile()
			file.path = `${LUCR_TRADE_ROOT_DIR}/positions/POS-00009.md`
			file.basename = 'POS-00009'
			file.extension = 'md'
			const frontmatter: Record<string, unknown> = {
				lucr_type: 'position',
				side: 'SHORT',
				entry_price: 100,
				exit_price: 90,
				stop_loss: 105,
				target_price: null,
				notional_value: 2,
				profit: 20,
				risk: 10,
			}
			const app = {
				fileManager: {
					processFrontMatter: async (_file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => {
						updater(frontmatter)
					},
				},
			} as unknown as App

			const updated = await PositionDomain.updateFields(app, file, {
				stop_loss: 104,
			})

			expect(frontmatter.side).toBe('SHORT')
			expect(frontmatter.risk).toBe(0.08)
			expect(updated.side).toBe('SHORT')
			expect(updated.risk).toBe(0.08)
		})
	})

	describe('PositionDomain.updateFields notional_value derivation', () => {
		function makeApp(overrides: {
			positionFm: Record<string, unknown>
			symbolFm: {
				name: string
				type: PositionSymbolType | null
				contract_unit?: number | null
				fee_value?: number | null
			} | null
		}) {
			const positionFile = createMockFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-1.md`)
			const persistedFm = { ...overrides.positionFm }
			const symbolBaseName = overrides.symbolFm == null
				? null
				: SymbolDomain.buildWikilink('Acc', overrides.symbolFm.name).slice(2, -2)
			const symbolFile = overrides.symbolFm == null
				? null
				: createMockFile(`${LUCR_TRADE_ROOT_DIR}/symbols/${symbolBaseName}.md`)

			return {
				app: {
					fileManager: {
						processFrontMatter: async (_file: TFile, mutate: (fm: Record<string, unknown>) => void) => {
							mutate(persistedFm)
						},
					},
					metadataCache: {
						getFileCache: (file: TFile) => {
							if (file === positionFile) {
								return { frontmatter: persistedFm }
							}
							if (symbolFile != null && file === symbolFile) {
								return {
									frontmatter: {
										lucr_type: 'symbol',
										account: '[[ACC-Acc]]',
										platform: '[[Binance]]',
										...overrides.symbolFm,
									},
								}
							}
							return null
						},
						getFirstLinkpathDest: () => symbolFile,
					},
					vault: {
						getMarkdownFiles: () => symbolFile == null ? [positionFile] : [positionFile, symbolFile],
					},
				} as unknown as App,
				positionFile,
				persistedFm,
			}
		}

		it('derives notional_value from integer contract for futures', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-ES]]',
					entry_price: 4500,
					side: 'LONG',
				},
				symbolFm: { name: 'ES', type: 'Future' },
			})

			await PositionDomain.updateFields(app, positionFile, { contract: 2 })

			expect(persistedFm.notional_value).toBe(450000)
		})

		it('does not derive future notional_value from lots', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-ES]]',
					entry_price: 4500,
					side: 'LONG',
				},
				symbolFm: { name: 'ES', type: 'Future' },
			})

			await PositionDomain.updateFields(app, positionFile, { lots: 2 })

			expect(persistedFm.notional_value).toBeUndefined()
		})

		it('ignores future frontmatter contract_unit overrides', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-ES]]',
					entry_price: 4500,
					side: 'LONG',
				},
				symbolFm: { name: 'ES', type: 'Future', contract_unit: 50000 },
			})

			await PositionDomain.updateFields(app, positionFile, { contract: 2 })

			expect(persistedFm.notional_value).toBe(450000)
		})

		it('uses cfd frontmatter contract_unit override for notional_value', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-EURUSD]]',
					entry_price: 1.1,
					side: 'LONG',
				},
				symbolFm: { name: 'EURUSD', type: 'CFD', contract_unit: 50000 },
			})

			await PositionDomain.updateFields(app, positionFile, { lots: 0.1 })

			expect(persistedFm.notional_value).toBe(5500)
		})

		it('does not derive when patch only contains notional_value', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-ES]]',
					entry_price: 4500,
					side: 'LONG',
					contract: 2,
				},
				symbolFm: { name: 'ES', type: 'Future' },
			})

			await PositionDomain.updateFields(app, positionFile, { notional_value: 99999 })

			expect(persistedFm.notional_value).toBe(99999)
		})

		it('derives crypto/native notional_value from native amount and keeps notional_amount', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 100,
					side: 'LONG',
					notional_asset: 'native',
					notional_amount: 0.5,
					notional_value: 50,
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { entry_price: 150 })

			expect(persistedFm.notional_value).toBe(75)
			expect(persistedFm.notional_amount).toBe(0.5)
		})

		it('crypto/usd does not overwrite notional_value', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 100,
					side: 'LONG',
					notional_asset: 'usd',
					notional_value: 200,
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { entry_price: 150 })

			expect(persistedFm.notional_value).toBe(200)
			expect(persistedFm).not.toHaveProperty('notional_amount')
		})

		it('updates crypto/usd notional_value directly', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 20000,
					side: 'LONG',
					notional_asset: 'usd',
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { notional_value: 300 })

			expect(persistedFm.notional_value).toBe(300)
			expect(persistedFm).not.toHaveProperty('notional_amount')
		})

		// @story [[lucrjournal/position-formulas#^native-notional-conversion]] Covers USD to native amount conversion without changing notional value
		it('preserves notional_value when crypto asset switches to native', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 20000,
					side: 'LONG',
					notional_asset: 'usd',
					notional_value: 300,
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { notional_asset: 'native' })

			expect(persistedFm.notional_asset).toBe('native')
			expect(persistedFm.notional_value).toBe(300)
			expect(persistedFm.notional_amount).toBe(0.015)
		})

		// @story [[lucrjournal/position-formulas#^native-notional-conversion]] Covers native amount removal when returning to USD mode
		it('preserves notional_value when crypto asset switches to usd', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 20000,
					side: 'LONG',
					notional_asset: 'native',
					notional_amount: 0.015,
					notional_value: 300,
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { notional_asset: 'usd' })

			expect(persistedFm.notional_asset).toBe('usd')
			expect(persistedFm.notional_value).toBe(300)
			expect(persistedFm).not.toHaveProperty('notional_amount')
		})

		it('does not backfill legacy amount from direct usd notional_value edits', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 20000,
					side: 'LONG',
					notional_asset: 'usd',
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { notional_value: 300 })

			expect(persistedFm.notional_value).toBe(300)
			expect(persistedFm).not.toHaveProperty('notional_amount')
		})

		// @story [[lucrjournal/position-formulas#^native-notional-conversion]] Covers native amount backfill after a direct notional edit
		it('backfills native notional_amount from direct native notional_value edits', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 20000,
					side: 'LONG',
					notional_asset: 'native',
					notional_amount: null,
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { notional_value: 300 })

			expect(persistedFm.notional_value).toBe(300)
			expect(persistedFm.notional_amount).toBe(0.015)
		})

		it('null symbol type derives native notional_amount like crypto fallback', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					notional_asset: 'native',
					entry_price: 100,
					side: 'LONG',
				},
				symbolFm: null,
			})

			await PositionDomain.updateFields(app, positionFile, { notional_value: 50 })

			expect(persistedFm.notional_value).toBe(50)
			expect(persistedFm.notional_amount).toBe(0.5)
		})

		it('null symbol type keeps usd notional_value direct like crypto', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					entry_price: 20000,
					side: 'LONG',
					notional_asset: 'usd',
				},
				symbolFm: null,
			})

			await PositionDomain.updateFields(app, positionFile, { notional_value: 300 })

			expect(persistedFm.notional_value).toBe(300)
			expect(persistedFm).not.toHaveProperty('notional_amount')
		})

		it('derived notional_value cascades into risk, profit, and fee', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-ES]]',
					entry_price: 4500,
					exit_price: 4600,
					stop_loss: 4480,
					side: 'LONG',
				},
				symbolFm: { name: 'ES', type: 'Future', fee_value: 0.0001 },
			})

			await PositionDomain.updateFields(app, positionFile, { contract: 1 })

			expect(persistedFm.notional_value).toBe(225000)
			expect(typeof persistedFm.risk).toBe('number')
			expect(typeof persistedFm.profit).toBe('number')
			expect(typeof persistedFm.fee).toBe('number')
		})

		it('future fee can derive from contract without entry_price', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-ES]]',
				},
				symbolFm: { name: 'ES', type: 'Future', fee_value: 2.5 },
			})

			await PositionDomain.updateFields(app, positionFile, { contract: 3 })

			expect(persistedFm.fee).toBe(7.5)
		})

		it('cfd fee can derive from lots without entry_price', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-EURUSD]]',
				},
				symbolFm: { name: 'EURUSD', type: 'CFD', fee_value: 4 },
			})

			await PositionDomain.updateFields(app, positionFile, { lots: 0.25 })

			expect(persistedFm.fee).toBe(1)
		})

		it('keeps existing fee when dependency recompute has no valid fee model', async () => {
			const { app, positionFile, persistedFm } = makeApp({
				positionFm: {
					lucr_type: 'position',
					symbol: '[[SBL-Acc-BTC∕USDT]]',
					entry_price: 100,
					exit_price: 110,
					side: 'LONG',
					notional_asset: 'usd',
					fee: 1,
				},
				symbolFm: { name: 'BTC/USDT', type: 'Crypto_Spot' },
			})

			await PositionDomain.updateFields(app, positionFile, { notional_value: 1000 })

			expect(persistedFm.notional_value).toBe(1000)
			expect(persistedFm.fee).toBe(1)
			expect(persistedFm.profit).toBe(99)
		})
	})

	describe('buildPositionFileId', () => {
		// @story [[lucrjournal/domain-model#^position-file-sequence]] Covers five-digit padding of position basenames
		it('formats persisted file ids with zero padding', () => {
			expect(buildPositionFileId(1)).toBe('POS-00001')
			expect(buildPositionFileId(42)).toBe('POS-00042')
		})
	})

	describe('listPositionContextGroups', () => {
		function createMockTFile(path: string): TFile {
			const file = new TFile()
			file.path = path
			file.basename = path.split('/').pop()!.replace(/\.md$/, '')
			file.extension = 'md'
			return file
		}

		// @story [[lucrjournal/position-body#^position-linked-context-reading]] Covers all typed H1 and H2 linked context groups
		// @story [[lucrjournal/position-body#^position-playbook-context]] Covers playbook frontmatter resolution alongside body context
		it('parses fixed top-level sections and the frontmatter playbook link', async () => {
			const frontmatterByPath = {
				[`${LUCR_TRADE_ROOT_DIR}/news/news1.md`]: {
					lucr_type: 'news',
				},
				[`${LUCR_TRADE_ROOT_DIR}/analyses/keylevel2.md`]: {
					lucr_type: 'key_level',
				},
				[`${LUCR_TRADE_ROOT_DIR}/analyses/confluence1.md`]: {
					lucr_type: 'confluence',
				},
				[`${LUCR_TRADE_ROOT_DIR}/analyses/marketanalysis1.md`]: {
					lucr_type: 'market_analysis',
				},
				[`${LUCR_TRADE_ROOT_DIR}/playbooks/PBK-00001.md`]: {
					lucr_type: 'playbook',
				},
			} as const
			const files = Object.keys(frontmatterByPath).map(createMockTFile)
			const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
			const app = {
				vault: {
					getMarkdownFiles: () => [...files, positionFile],
					read: async () =>
						[
							'# Notes',
							'',
							'note',
							'',
							'# News',
							'',
							'## [[news1]]',
							'',
							'alpha',
							'',
							'# Key Levels',
							'',
							'## [[keylevel2]]',
							'',
							'beta',
							'',
							'# Confluence',
							'',
							'## [[confluence1]]',
							'',
							'gamma',
							'',
							'# Market Analysis',
							'',
							'## [[marketanalysis1]]',
							'',
							'delta',
						].join('\n'),
				},
				metadataCache: {
					getFileCache: (file: TFile) => ({
						frontmatter:
							file.path === positionFile.path
								? { lucr_type: 'position', playbook: '[[PBK-00001]]' }
								: frontmatterByPath[file.path as keyof typeof frontmatterByPath],
					}),
					getFirstLinkpathDest: (linkpath: string) =>
						files.find((file) => file.basename === linkpath) as TFile | null,
				},
			} as unknown as App

			const result = await listPositionContextGroups(app, positionFile)
			const playbookGroup = result.find((group) => group.kind === 'playbook')
			const newsGroup = result.find((group) => group.kind === 'news')
			const keyLevelGroup = result.find((group) => group.kind === 'key_level')
			const confluenceGroup = result.find((group) => group.kind === 'confluence')
			const marketAnalysisGroup = result.find((group) => group.kind === 'market_analysis')

			expect(playbookGroup?.kind === 'playbook' ? playbookGroup.playbookEntry?.file.basename : null).toBe('PBK-00001')
			expect(newsGroup?.kind === 'news' ? newsGroup.linkedEntries.map((entry) => entry.file.basename) : []).toEqual(['news1'])
			expect(keyLevelGroup?.kind === 'key_level' ? keyLevelGroup.linkedEntries.map((entry) => entry.file.basename) : []).toEqual(['keylevel2'])
			expect(confluenceGroup?.kind === 'confluence' ? confluenceGroup.linkedEntries.map((entry) => entry.file.basename) : []).toEqual(['confluence1'])
			expect(marketAnalysisGroup?.kind === 'market_analysis' ? marketAnalysisGroup.linkedEntries.map((entry) => entry.file.basename) : []).toEqual(['marketanalysis1'])
		})
	})

	describe('PositionDomain table helpers', () => {
		function createMockTFile(path: string): TFile {
			const file = new TFile()
			file.path = path
			file.basename = path.split('/').pop()!.replace(/\.md$/, '')
			file.extension = 'md'
			return file
		}

		it('lazy renders linked playbook and scoped analyses for paginated rows', async () => {
			const playbookFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/playbooks/PBK-00001.md`)
			const newsFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/news/news1.md`)
			const keyLevelFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/analyses/keylevel1.md`)
			const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
			const files = [playbookFile, newsFile, keyLevelFile, positionFile]
			const app = {
				vault: {
					getMarkdownFiles: () => files,
					read: async () =>
						[
							'# Notes',
							'',
							'# News',
							'',
							'## [[news1]]',
							'',
							'# Key Levels',
							'',
							'## [[keylevel1]]',
							'',
							'# Confluence',
							'',
							'# Market Analysis',
							'',
						].join('\n'),
				},
				metadataCache: {
					resolvedLinks: {},
					getFileCache: (file: TFile) => ({
						frontmatter: {
							[positionFile.path]: { lucr_type: 'position', id: 1, playbook: '[[PBK-00001]]' },
							[playbookFile.path]: { lucr_type: 'playbook' },
							[newsFile.path]: { lucr_type: 'news' },
							[keyLevelFile.path]: { lucr_type: 'key_level' },
						}[file.path],
					}),
					getFirstLinkpathDest: (linkpath: string) =>
						files.find((file) => file.basename === linkpath) as TFile | null,
				},
			} as unknown as App

			const contents = await PositionDomain.lazyRenderTableContent(app, [
				{
					file: positionFile,
					fm: { lucr_type: 'position', id: 1 },
				},
			])

			expect(contents.get(positionFile.path)).toEqual({
				playbook: {
					kind: 'playbook',
					file: playbookFile,
					label: 'PBK-00001',
					linkpath: 'PBK-00001',
				},
				news: [{
					kind: 'news',
					file: newsFile,
					label: 'news1',
					linkpath: 'news1',
				}],
				keyLevels: [{
					kind: 'key_level',
					file: keyLevelFile,
					label: 'keylevel1',
					linkpath: 'keylevel1',
				}],
				confluence: [],
				marketAnalyses: [],
			})
		})
	})

	describe('derivePositionAccountWikilink', () => {
		const symbolFile = createMockFile(`${LUCR_TRADE_ROOT_DIR}/symbols/SBL-Research-BTCUSDT.md`)
		const accountFile = createMockFile(`${LUCR_TRADE_ROOT_DIR}/accounts/ACC-Research.md`)
		const app = {
			vault: { getMarkdownFiles: () => [symbolFile, accountFile] },
			metadataCache: {
				getFileCache: (file: TFile) => file.path.endsWith('/SBL-Research-BTCUSDT.md')
					? {
						frontmatter: {
							lucr_type: 'symbol',
							name: 'BTCUSDT',
							account: '[[ACC-Research]]',
						},
					}
					: file.path.endsWith('/ACC-Research.md')
						? {
							frontmatter: {
								lucr_type: 'account',
								name: 'Research',
								platform: '[[Binance]]',
							},
						}
						: null,
			},
		} as unknown as App

		// @story [[lucrjournal/position#^position-derived-account-platform]] Covers account derivation from the resolved symbol
		it('derives account wikilink from linked symbol entry', () => {
			expect(derivePositionAccountWikilink(app, { lucr_type: 'position', symbol: '[[SBL-Research-BTCUSDT]]' } as Position)).toBe('[[ACC-Research]]')
		})

		// @story [[lucrjournal/position#^position-derived-account-platform]] Covers platform derivation from the resolved symbol
		it('derives platform wikilink from linked symbol entry', () => {
			expect(derivePositionPlatformWikilink(app, { lucr_type: 'position', symbol: '[[SBL-Research-BTCUSDT]]' } as Position)).toBe('[[Binance]]')
		})

		it('returns null when symbol is missing', () => {
			expect(derivePositionAccountWikilink(app, { lucr_type: 'position' })).toBeNull()
			expect(derivePositionPlatformWikilink(app, { lucr_type: 'position' })).toBeNull()
		})

		// @story [[lucrjournal/position#^position-derived-account-platform]] Covers null relations for an unresolved symbol
		it('returns null when symbol entry cannot be resolved', () => {
			const emptyApp = { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null } } as unknown as App
			expect(derivePositionAccountWikilink(emptyApp, { lucr_type: 'position', symbol: '[[SBL-Unknown-XYZ]]' } as Position)).toBeNull()
		})
	})
}
