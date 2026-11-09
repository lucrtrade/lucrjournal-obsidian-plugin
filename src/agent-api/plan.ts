import { TFile, normalizePath, type App } from 'obsidian'

import {
	applyAttachmentTokensToFrontmatter,
	buildAttachmentTimestamp,
	buildAttachmentToken,
	buildPositionAttachmentFileName,
	buildPositionAttachmentPath,
} from '../attachments/position-attachments'
import { LUCR_TRADE_ROOT_DIR } from '../constant'
import { buildSymbolFileBaseName, PositionDomain, SymbolDomain } from '../domains'
import { buildDomainTimestamps } from '../domains/core/domain-timestamps'
import { hasPersistedEntryBasenameConflict } from '../domains/core/entry-writer'
import { applyPositionBodyAdditions, buildDefaultPositionBody } from '../domains/position/body'
import { enrichSymbolMetadataFromTradingView, resolveCurrentTradingViewRequester } from '../domains/symbol/metadata'
import { resolvePositionSymbolModel } from '../domains/symbol/position-model'
import { getCurrentTimeZoneSetting } from '../settings/plugin-settings'
import { buildIsoDatetimeInTimeZone } from '../utils/relative-time'

import { datetimeToEpoch, normalizeAgentDatetime } from './datetime'
import { AgentApiError, agentError } from './errors'
import { LINK_KINDS, type CreatePositionInput } from './input'
import { loadDesktopModule, type NodeFs } from './node-runtime'
import { createPlanningApp, type VirtualMarkdownFile } from './planning-app'
import {
	assertRiskDirection,
	LINK_KIND_CONFIG,
	resolveAccount,
	resolveLink,
	resolvePlaybook,
	resolveSide,
	resolveSymbol,
	resolveTemplate,
	type ResolvedLink,
} from './resolve'

type PlannedFileKind = 'position' | 'account' | 'platform' | 'symbol' | 'key_level' | 'confluence' | 'market_analysis' | 'news' | 'attachment'

type PlannedFile = {
	action: 'create'
	kind: PlannedFileKind
	path: string
	frontmatter?: Record<string, unknown>
	body?: string
	bodyNote?: string
	source?: string
}

type PlannedAttachment = { source: string; path: string; token: string }

type PositionExecution = {
	accountDisplayName: string
	createAccount: { platformName: string | null; accountPath: string; platformPath: string | null } | null
	symbolName: string
	symbolPath: string
	createSymbol: boolean
	side: 'LONG' | 'SHORT'
	patch: Record<string, unknown>
	playbook: { basename: string; path: string } | null
	template: { name: string; path: string } | null
	links: ResolvedLink[]
	notes: string | null
	attachments: PlannedAttachment[]
	positionPath: string
	expectedFrontmatter: Record<string, unknown>
}

export type PositionPlan = {
	files: PlannedFile[]
	resolved: Record<string, unknown>
	execution: PositionExecution
}

const VERIFIED_FIELDS = [
	'symbol',
	'side',
	'status',
	'entry_price',
	'stop_loss',
	'target_price',
	'exit_price',
	'lots',
	'contract',
	'notional_asset',
	'notional_amount',
	'opened_at',
	'closed_at',
	'confidence',
	'playbook',
	'attachments',
] as const

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const

export async function planPosition(app: App, input: CreatePositionInput, now: Date = new Date()): Promise<PositionPlan> {
	const timeZone = getCurrentTimeZoneSetting()
	const { side, account, symbol, openedAt, closedAt, playbook, template, links, attachments } = resolvePlanInputs(app, input, now, timeZone)

	const plannedFiles: PlannedFile[] = []
	const virtualFiles: VirtualMarkdownFile[] = []
	const plannedBasenames = new Map<string, string>()
	const reserveBasename = (basename: string, path: string, field: string) => {
		const key = basename.toLocaleLowerCase()
		const previous = plannedBasenames.get(key)
		if (previous !== undefined) {
			throw agentError(
				'NAME_CONFLICT',
				`Two new notes would get the same file name ${JSON.stringify(basename)} (${previous} and ${path}); LucrJournal file names must be unique.`,
				'Give one of the entries a more specific name.',
				{ field, received: basename },
			)
		}
		plannedBasenames.set(key, path)
	}

	const accountCreation = account.value.creation ?? null
	if (accountCreation !== null) {
		if (accountCreation.platformPath !== null && accountCreation.platformFrontmatter !== null) {
			const frontmatter = { ...buildDomainTimestamps(now), ...accountCreation.platformFrontmatter }
			reserveBasename(account.value.platformName ?? '', accountCreation.platformPath, 'platform')
			plannedFiles.push({ action: 'create', kind: 'platform', path: accountCreation.platformPath, frontmatter })
			virtualFiles.push({ path: accountCreation.platformPath, frontmatter })
		}
		const frontmatter = { ...buildDomainTimestamps(now), ...accountCreation.accountFrontmatter }
		reserveBasename(account.value.wikilink.slice(2, -2), accountCreation.accountPath, 'account')
		plannedFiles.push({ action: 'create', kind: 'account', path: accountCreation.accountPath, frontmatter })
		virtualFiles.push({ path: accountCreation.accountPath, frontmatter })
	}

	let symbolType = symbol.type
	let symbolLogo = symbol.logo
	const symbolBasename = buildSymbolFileBaseName(account.value.displayName, symbol.name)
	const symbolPath = symbol.existing?.file.path ?? normalizePath(`${LUCR_TRADE_ROOT_DIR}/${SymbolDomain.options.persisted.folderName}/${symbolBasename}.md`)
	if (symbol.existing === null) {
		if (hasPersistedEntryBasenameConflict(app, SymbolDomain.options.persisted.folderName, symbolBasename)) {
			throw agentError(
				'NAME_CONFLICT',
				`Cannot create symbol ${symbol.name}: a LucrJournal note named ${JSON.stringify(symbolBasename)} already exists but is not a valid symbol of account ${account.value.displayName}.`,
				`Open ${symbolPath} in Obsidian and fix or remove it, then retry.`,
				{ field: 'symbol', received: input.symbol },
			)
		}
		if (symbolLogo === null) {
			const enriched = await enrichSymbolMetadataFromTradingView(symbol.name, symbolType, resolveCurrentTradingViewRequester()).catch(() => null)
			if (enriched !== null) {
				symbolLogo = enriched.logo
				symbolType = enriched.type
			}
		}
		const frontmatter = {
			...buildDomainTimestamps(now),
			lucr_type: 'symbol',
			name: symbol.name,
			account: account.value.wikilink,
			type: symbolType,
			fee_value: null,
			contract_unit: null,
			logo: symbolLogo,
		}
		reserveBasename(symbolBasename, symbolPath, 'symbol')
		plannedFiles.push({ action: 'create', kind: 'symbol', path: symbolPath, frontmatter })
		virtualFiles.push({ path: symbolPath, frontmatter })
	}

	const quantityPatch = resolveQuantityPatch(input, symbol.name, symbolType)

	for (const link of links.filter((candidate) => candidate.create)) {
		reserveBasename(link.basename, link.path, `links.${link.kind}`)
		const frontmatter = { ...buildDomainTimestamps(now), ...link.frontmatter }
		plannedFiles.push({ action: 'create', kind: LINK_KIND_CONFIG[link.kind].entityKind, path: link.path, frontmatter })
		virtualFiles.push({ path: link.path, frontmatter })
	}

	for (const attachment of attachments) {
		plannedFiles.push({ action: 'create', kind: 'attachment', path: attachment.path, source: attachment.source })
	}

	const planningApp = createPlanningApp(app, virtualFiles)
	const formValue = { account: account.value.displayName, side: side.value, symbol: symbol.name }
	const descriptor = PositionDomain.createEntryDescriptor
	const ctx = descriptor.buildContext(planningApp, formValue)
	const payload = descriptor.buildPayload(formValue, ctx)
	const positionBasename = descriptor.buildFileName(payload, ctx)
	const positionPath = normalizePath(`${LUCR_TRADE_ROOT_DIR}/${PositionDomain.options.persisted.folderName}/${positionBasename}.md`)
	if (app.vault.getAbstractFileByPath(positionPath) !== null) {
		throw agentError(
			'NAME_CONFLICT',
			`The next position file ${positionPath} already exists.`,
			'Retry once; if it fails again, ask the user to check the positions folder for a non-position note named like POS-xxxxx.',
			{ details: { positionPath } },
		)
	}

	const patch: Record<string, unknown> = {
		opened_at: openedAt,
		...pickDefined({
			entry_price: input.entry_price,
			stop_loss: input.stop_loss,
			target_price: input.target_price,
			exit_price: input.exit_price,
			confidence: input.confidence,
			closed_at: closedAt,
		}),
		...quantityPatch,
	}
	if (input.exit_price !== null || closedAt !== null) {
		patch.status = 'close'
	}

	const baseRecord: Record<string, unknown> = dropNullish({ ...buildDomainTimestamps(now), ...payload })
	if (attachments.length > 0) {
		applyAttachmentTokensToFrontmatter(baseRecord, attachments.map((attachment) => attachment.token))
	}
	const preview = previewPositionFrontmatter(planningApp, baseRecord, patch)
	if (playbook !== null) {
		preview.playbook = `[[${playbook.basename}]]`
	}
	// The written file keeps the payload keys even when their value is empty (`profit:`, `risk:`),
	// so the preview must keep the same key set instead of dropping nulls.
	const positionFrontmatter: Record<string, unknown> = { ...preview }

	const baseBody = template === null ? buildDefaultPositionBody() : stripFrontmatter(await readTemplate(app, template.path))
	const body = applyPositionBodyAdditions(baseBody, {
		notes: input.notes,
		links: links.map((link) => ({ sectionTitle: LINK_KIND_CONFIG[link.kind].sectionTitle, basename: link.basename })),
	})
	// Templater runs when the file is written; executing it during a dry run could open its prompts.
	const bodyNote = templaterBodyNote(app, template !== null, baseBody)
	plannedFiles.push(buildPlannedPosition({ path: positionPath, frontmatter: positionFrontmatter, body, bodyNote }))

	const expectedFrontmatter = Object.fromEntries(
		VERIFIED_FIELDS.map((field) => [field, positionFrontmatter[field] ?? null]),
	)

	return {
		files: plannedFiles,
		resolved: {
			account: { value: account.value.displayName, created: accountCreation !== null, reason: account.reason },
			symbol: { input: symbol.input, value: symbol.name, type: symbolType, created: symbol.existing === null, reason: symbol.reason },
			side,
			opened_at: { value: openedAt, reason: input.opened_at === null ? 'current time' : 'given' },
			...(playbook === null ? {} : { playbook: playbook.basename }),
			...(template === null ? {} : { template: template.name }),
			links: links.map((link) => ({ kind: link.kind, name: link.basename, created: link.create })),
		},
		execution: {
			accountDisplayName: account.value.displayName,
			createAccount: accountCreation === null
				? null
				: { platformName: account.value.platformName, accountPath: accountCreation.accountPath, platformPath: accountCreation.platformPath },
			symbolName: symbol.name,
			symbolPath,
			createSymbol: symbol.existing === null,
			side: side.value,
			patch,
			playbook,
			template,
			links,
			notes: input.notes,
			attachments,
			positionPath,
			expectedFrontmatter,
		},
	}
}

/** Resolve every input up front, collecting independent failures into one error. */
function resolvePlanInputs(app: App, input: CreatePositionInput, now: Date, timeZone: string) {
	const errors = new AgentErrorCollector()
	const side = resolveSide(input)
	errors.run(() => assertRiskDirection(side.value, input), undefined)
	const target = errors.run(() => {
		const resolvedAccount = resolveAccount(app, { account: input.account, platform: input.platform, createAccount: input.createAccount }, input.symbol)
		return { account: resolvedAccount, symbol: resolveSymbol(app, resolvedAccount.value, input.symbol, side.value) }
	}, null)
	const openedAt = errors.run(() => input.opened_at === null
		? buildIsoDatetimeInTimeZone(now, timeZone)
		: normalizeAgentDatetime(input.opened_at, 'opened_at', timeZone), null)
	const closedAt = errors.run(() => input.closed_at === null ? null : normalizeAgentDatetime(input.closed_at, 'closed_at', timeZone), null)
	if (openedAt !== null && closedAt !== null && datetimeToEpoch(closedAt) < datetimeToEpoch(openedAt)) {
		errors.add(agentError(
			'INVALID_VALUE',
			`\`closed_at\` (${closedAt}) is earlier than \`opened_at\` (${openedAt}).`,
			'Swap or correct the two times.',
			{ field: 'closed_at', received: { opened_at: openedAt, closed_at: closedAt } },
		))
	}
	const playbook = input.playbook === null ? null : errors.run(() => resolvePlaybook(app, input.playbook!), null)
	const template = input.template === null ? null : errors.run(() => resolveTemplate(app, input.template!), null)
	const links = LINK_KINDS.flatMap((kind) => input.links[kind].flatMap((name) => {
		const link = errors.run(() => resolveLink(app, kind, name), null)
		return link === null ? [] : [link]
	}))
	const attachments = errors.run(() => planAttachments(app, input.attachments, now), [])
	errors.throwIfAny()
	if (target === null || openedAt === null) {
		throw new Error('planPosition: unreachable state after error collection')
	}
	return { side, account: target.account, symbol: target.symbol, openedAt, closedAt, playbook, template, links, attachments }
}

function previewPositionFrontmatter(app: App, record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
	try {
		return PositionDomain.previewPatch(app, record, patch).record
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		throw agentError(
			'INVALID_VALUE',
			`The position fields were rejected by LucrJournal validation: ${message}.`,
			'Check the numeric fields (prices, lots/contract/amount, confidence) against the source and retry with corrected values.',
			{ received: patch },
		)
	}
}

function resolveQuantityPatch(input: CreatePositionInput, symbolName: string, symbolType: string | null): Record<string, unknown> {
	const model = resolvePositionSymbolModel(symbolType as Parameters<typeof resolvePositionSymbolModel>[0])
	const config = model.quantityFieldConfig
	const typeLabel = symbolType ?? 'unknown (treated as crypto)'
	const given = (['lots', 'contract', 'notional_value', 'amount'] as const).filter((field) => input[field] !== null)

	if (config === null) {
		const invalid = given.filter((field) => field === 'lots' || field === 'contract')
		if (invalid.length > 0 || given.length > 1) {
			throw agentError(
				'QUANTITY_CONFLICT',
				`Symbol ${symbolName} (${typeLabel}) is sized by notional, but the input gave ${given.join(' + ')}.`,
				'For crypto pass exactly one of `amount` (coin quantity, e.g. 0.5 BTC) or `notional_value` (position size in USD); drop lots/contract.',
				{ field: invalid[0] ?? given[0], received: Object.fromEntries(given.map((field) => [field, input[field]])) },
			)
		}
		if (input.amount !== null) {
			return { notional_asset: 'native', notional_amount: input.amount }
		}
		return input.notional_value === null ? {} : { notional_asset: 'usd', notional_value: input.notional_value }
	}

	const invalid = given.filter((field) => field !== config.field)
	if (invalid.length > 0) {
		throw agentError(
			'QUANTITY_CONFLICT',
			`Symbol ${symbolName} (${typeLabel}) is sized by \`${config.field}\`, but the input gave ${invalid.join(' + ')}.`,
			`Pass the size as \`${config.field}\` (${config.min} to ${config.max}${config.integerOnly ? ', whole numbers' : ''}) and drop ${invalid.join(', ')}.`,
			{ field: invalid[0], received: Object.fromEntries(given.map((field) => [field, input[field]])) },
		)
	}
	const value = input[config.field]
	if (value === null) {
		return {}
	}
	const decimalsOk = config.integerOnly ? Number.isInteger(value) : Math.abs(Math.round(value / config.step) * config.step - value) < 1e-9
	if (value < config.min || value > config.max || !decimalsOk) {
		throw agentError(
			'INVALID_VALUE',
			`\`${config.field}\` for ${symbolName} must be between ${config.min} and ${config.max}${config.integerOnly ? ' and a whole number' : ` in steps of ${config.step}`}, received ${value}.`,
			`Re-check the size from the source and pass a valid \`${config.field}\`, or omit it.`,
			{ field: config.field, received: value },
		)
	}
	return { [config.field]: value }
}

function planAttachments(app: App, sources: string[], now: Date): PlannedAttachment[] {
	if (sources.length === 0) {
		return []
	}
	const fs = loadDesktopModule<NodeFs>('fs')
	if (fs === null) {
		throw agentError(
			'ATTACHMENT_UNSUPPORTED',
			'Attachments can only be imported on Obsidian desktop.',
			'Drop `attachments` and tell the user to paste the screenshot into the position view instead.',
			{ field: 'attachments' },
		)
	}

	const usedPaths = new Set<string>()
	return sources.map((source, index) => {
		const field = `attachments[${index}]`
		if (!source.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(source)) {
			throw agentError('INVALID_VALUE', `${field} must be an absolute file path, received ${JSON.stringify(source)}.`, 'Pass the absolute path of the image file on this computer.', { field, received: source })
		}
		if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
			throw agentError('ATTACHMENT_NOT_FOUND', `${field} file ${JSON.stringify(source)} does not exist or is not a file.`, 'Check the path (it must be readable by Obsidian on this computer) or drop the attachment.', { field, received: source })
		}
		const fileName = source.split(/[\\/]/).pop() ?? source
		const dotIndex = fileName.lastIndexOf('.')
		const extension = dotIndex === -1 ? '' : fileName.slice(dotIndex + 1).toLowerCase()
		if (!(IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
			throw agentError('ATTACHMENT_UNSUPPORTED', `${field} ${JSON.stringify(fileName)} is not a supported image (${IMAGE_EXTENSIONS.join(', ')}).`, 'Only attach chart/screenshot images; put other information into `notes`.', { field, received: source })
		}
		const baseName = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex)
		const timestamp = buildAttachmentTimestamp(now.getTime())
		let path = buildPositionAttachmentPath(buildPositionAttachmentFileName(timestamp, extension, baseName), now.getTime())
		for (let suffix = 2; usedPaths.has(path) || app.vault.getAbstractFileByPath(path) !== null; suffix += 1) {
			path = buildPositionAttachmentPath(buildPositionAttachmentFileName(timestamp, extension, `${baseName}-${suffix}`), now.getTime())
		}
		usedPaths.add(path)
		return { source, path, token: buildAttachmentToken(path, '') }
	})
}

async function readTemplate(app: App, path: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(path)
	if (!(file instanceof TFile)) {
		throw agentError('TEMPLATE_NOT_FOUND', `Template file ${path} disappeared while planning.`, 'Retry once; if it persists, drop `template`.', { field: 'template', received: path })
	}
	return await app.vault.read(file)
}

function buildPlannedPosition(input: {
	path: string
	frontmatter: Record<string, unknown>
	body: string
	bodyNote: string | undefined
}): PlannedFile {
	return {
		action: 'create',
		kind: 'position',
		path: input.path,
		frontmatter: input.frontmatter,
		body: input.body,
		...(input.bodyNote === undefined ? {} : { bodyNote: input.bodyNote }),
	}
}

function templaterBodyNote(app: App, usesTemplate: boolean, body: string): string | undefined {
	return usesTemplate && body.includes('<%') && isTemplaterEnabled(app)
		? 'Body shows the raw template: Templater expands its <% %> expressions when the file is written.'
		: undefined
}

function isTemplaterEnabled(app: App): boolean {
	const plugins = (app as App & { plugins?: { enabledPlugins?: Set<string> } }).plugins
	return plugins?.enabledPlugins?.has('templater-obsidian') === true
}

function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith('---\n')) {
		return markdown
	}
	const fenceEnd = markdown.indexOf('\n---\n', 4)
	return fenceEnd === -1 ? markdown : markdown.slice(fenceEnd + 5)
}

function pickDefined(values: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null && value !== undefined))
}

function dropNullish(record: Record<string, unknown>): Record<string, unknown> {
	return pickDefined(record)
}

/**
 * Collect independent validation failures so the agent can fix (or ask about)
 * all of them in one round instead of discovering them one call at a time.
 */
class AgentErrorCollector {
	private readonly errors: AgentApiError[] = []

	run<T>(check: () => T, fallback: T): T {
		try {
			return check()
		} catch (error: unknown) {
			if (!(error instanceof AgentApiError)) {
				throw error
			}
			this.errors.push(error)
			return fallback
		}
	}

	add(error: AgentApiError) {
		this.errors.push(error)
	}

	throwIfAny() {
		const [first, ...rest] = this.errors
		if (first === undefined) {
			return
		}
		if (rest.length === 0) {
			throw first
		}
		throw new AgentApiError({
			...first.payload,
			message: `${first.payload.message} Also: ${rest.map((error) => error.payload.message).join(' ')}`,
			details: { ...first.payload.details, additionalErrors: rest.map((error) => error.payload) },
		})
	}
}
