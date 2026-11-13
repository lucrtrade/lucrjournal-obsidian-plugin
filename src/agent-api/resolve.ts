/// <reference types="vitest/importMeta" />

import { TFile, normalizePath, type App } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../constant'
import {
	AccountDomain,
	ConfluenceDomain,
	derivePositionAccountWikilink,
	KeyLevelDomain,
	listPositionTemplates,
	MarketAnalysisDomain,
	NewsDomain,
	PlatformDomain,
	PlaybookDomain,
	PositionDomain,
	SymbolDomain,
} from '../domains'
import { SymbolType } from '../domains/core/constant'
import { hasPersistedEntryBasenameConflict } from '../domains/core/entry-writer'
import {
	POSITION_CONFLUENCE_SECTION,
	POSITION_KEY_LEVEL_SECTION,
	POSITION_MARKET_ANALYSIS_SECTION,
	POSITION_NEWS_SECTION,
} from '../domains/position/body'
import { resolveSymbolInfo } from '../domains/symbol/catalog'
import { BuiltinSymbolList } from '../domains/symbol/constants'
import { parseSymbolPair } from '../domains/symbol/pair'
import { PLATFORM_NAMES, PLATFORM_TO_EXCHANGE_ID } from '../platforms'
import { getFileBasename, sanitizeObsidianFileName } from '../utils'

import { agentError, formatCandidates } from './errors'
import { createVirtualTFile } from './planning-app'

import type { LinkKind } from './input'
import type { PositionSymbolType } from '../domains/symbol/position-model'

type AccountEntry = ReturnType<typeof AccountDomain.totalEntries>[number] & { file: TFile }
type SymbolEntry = ReturnType<typeof SymbolDomain.totalEntries>[number]

export type Resolution<T> = { value: T; reason: string }

export type ResolvedAccount = {
	entry: AccountEntry
	displayName: string
	wikilink: string
	platformName: string | null
	creation?: {
		accountPath: string
		accountFrontmatter: Record<string, unknown>
		platformPath: string | null
		platformFrontmatter: Record<string, unknown> | null
	}
}

export type ResolvedSymbol = {
	input: string
	name: string
	type: PositionSymbolType | null
	logo: string | null
	existing: SymbolEntry | null
	reason: string
}

/* ------------------------------------------------------------------------ */
/* Account                                                                   */
/* ------------------------------------------------------------------------ */

export type AccountRequest = {
	account: string | null
	platform: string | null
	createAccount: boolean
}

export function resolveAccount(app: App, request: AccountRequest, rawSymbol: string): Resolution<ResolvedAccount> {
	const accounts = listAccounts(app)
	const names = accounts.map((account) => account.displayName)
	if (request.account !== null) {
		const key = normalizeKey(request.account)
		const matches = accounts.filter((account) => accountKeys(account).includes(key))
		if (matches.length === 1) {
			assertPlatformMatches(matches[0]!, request.platform)
			return { value: matches[0]!, reason: `matched requested account ${JSON.stringify(request.account)}` }
		}
		if (matches.length > 1) {
			throw agentError(
				'ACCOUNT_AMBIGUOUS',
				`Account ${JSON.stringify(request.account)} matches ${matches.length} accounts: ${formatCandidates(matches.map((match) => match.displayName))}.`,
				'Ask the user which account they mean, then retry with `account` set to one of candidates.',
				{ field: 'account', received: request.account, candidates: matches.map((match) => match.displayName) },
			)
		}
		return planAccountCreation(app, request, accounts)
	}

	if (accounts.length === 0) {
		throw agentError(
			'NO_ACCOUNT',
			'This vault has no LucrJournal account yet and the request does not say which exchange or broker the trade was on.',
			'Pass `account` (the exchange or broker name, e.g. "OKX") and it will be created; ask the user only if the conversation gives no hint.',
			{ field: 'account' },
		)
	}

	if (accounts.length === 1) {
		return { value: accounts[0]!, reason: 'only account in the vault' }
	}

	const holders = accounts.filter((account) => findSymbolCandidatesForAccount(app, account, rawSymbol).length > 0)
	if (holders.length === 1) {
		return { value: holders[0]!, reason: `only account that already trades ${JSON.stringify(rawSymbol)}` }
	}

	const assetClass = symbolAssetClass(rawSymbol)
	const pool = (holders.length > 1 ? holders : accounts).filter((account) =>
		assetClass === null || isCryptoAccount(account, SymbolDomain.listForAccount(app, account.wikilink)) === (assetClass === 'crypto'),
	)
	if (holders.length <= 1 && pool.length === 1) {
		return { value: pool[0]!, reason: `only ${assetClass ?? ''} account that fits ${JSON.stringify(rawSymbol)}`.replace('  ', ' ') }
	}
	const recent = findMostRecentPositionAccount(app, pool)
	if (recent !== null) {
		return { value: recent, reason: `account of the most recently opened position${assetClass === null ? '' : ` among ${assetClass} accounts`}` }
	}

	throw agentError(
		'ACCOUNT_REQUIRED',
		`Cannot infer the account: the vault has ${accounts.length} accounts and none of the inference rules picked exactly one${assetClass === null ? '' : ` ${assetClass} account`}.`,
		'Ask the user which account to use, then retry with `account` set to one of candidates.',
		{ field: 'account', candidates: names },
	)
}

/**
 * The requested account does not exist: plan creating it (and its platform note)
 * the same way the New account form does. Names that look like a typo of an
 * existing account are rejected unless `createAccount` confirms them.
 */
function planAccountCreation(app: App, request: AccountRequest, accounts: ResolvedAccount[]): Resolution<ResolvedAccount> {
	const requested = request.account ?? ''
	const displayName = toPresetPlatformName(sanitizeObsidianFileName(requested).trim())
	if (displayName === '') {
		throw agentError('INVALID_VALUE', `\`account\` ${JSON.stringify(requested)} is empty after removing characters not allowed in file names.`, 'Pass the exchange or broker name, e.g. "OKX".', { field: 'account', received: requested })
	}

	const lookalikes = accounts.filter((account) => accountKeys(account).some((key) => isLikelyTypo(normalizeKey(displayName), key)))
	if (lookalikes.length > 0 && !request.createAccount) {
		const candidates = lookalikes.map((account) => account.displayName)
		throw agentError(
			'ACCOUNT_NOT_FOUND',
			`Account ${JSON.stringify(requested)} does not exist, and it looks like a misspelling of ${formatCandidates(candidates)}.`,
			'If the user meant one of candidates, retry with that exact name. If it really is a new account, retry with `createAccount: true` and it will be created.',
			{ field: 'account', received: requested, candidates },
		)
	}

	const platformName = request.platform === null
		? (isPresetPlatformName(displayName) ? displayName : null)
		: toPresetPlatformName(sanitizeObsidianFileName(request.platform).trim())
	const accountBasename = sanitizeObsidianFileName(`ACC-${displayName}`)
	const accountPath = normalizePath(`${LUCR_TRADE_ROOT_DIR}/${AccountDomain.options.persisted.folderName}/${accountBasename}.md`)
	if (hasPersistedEntryBasenameConflict(app, AccountDomain.options.persisted.folderName, accountBasename)) {
		throw agentError(
			'NAME_CONFLICT',
			`Cannot create account ${JSON.stringify(displayName)}: a LucrJournal note named ${JSON.stringify(accountBasename)} already exists but is not a valid account.`,
			'Ask the user to fix or remove that note in Obsidian, then retry.',
			{ field: 'account', received: requested },
		)
	}

	const createPlatform = platformName !== null && !PlatformDomain.hasPersistedPlatform(app, platformName)
	const accountFrontmatter = {
		lucr_type: 'account',
		platform: platformName === null ? null : `[[${platformName}]]`,
		name: displayName,
	}
	const accountFile = createVirtualTFile(accountPath)
	return {
		value: {
			entry: { file: accountFile, fm: AccountDomain.refine(accountFrontmatter)! },
			displayName,
			wikilink: `[[${accountBasename}]]`,
			platformName,
			creation: {
				accountPath,
				accountFrontmatter,
				platformPath: createPlatform ? normalizePath(`${LUCR_TRADE_ROOT_DIR}/${PlatformDomain.options.persisted.folderName}/${sanitizeObsidianFileName(platformName)}.md`) : null,
				platformFrontmatter: createPlatform ? { lucr_type: 'platform' } : null,
			},
		},
		reason: `account ${JSON.stringify(displayName)} did not exist; it will be created${platformName === null ? ' without a platform' : ` on platform ${platformName}`}`,
	}
}

function toPresetPlatformName(name: string): string {
	return PLATFORM_NAMES.find((platform) => normalizeKey(platform) === normalizeKey(name)) ?? name
}

function isPresetPlatformName(name: string): boolean {
	return (PLATFORM_NAMES as readonly string[]).includes(name)
}

function isLikelyTypo(candidate: string, existing: string): boolean {
	if (candidate === existing || Math.min(candidate.length, existing.length) < 4) {
		return false
	}
	return editDistance(candidate, existing) <= 2
}

function editDistance(left: string, right: string): number {
	let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
	for (let row = 1; row <= left.length; row += 1) {
		const current = [row]
		for (let column = 1; column <= right.length; column += 1) {
			const cost = left[row - 1] === right[column - 1] ? 0 : 1
			current.push(Math.min(current[column - 1]! + 1, previous[column]! + 1, previous[column - 1]! + cost))
		}
		previous = current
	}
	return previous[right.length]!
}

function assertPlatformMatches(account: ResolvedAccount, platform: string | null) {
	if (platform === null) {
		return
	}
	const requested = toPresetPlatformName(sanitizeObsidianFileName(platform).trim())
	if (normalizeKey(requested) === normalizeKey(account.platformName ?? '')) {
		return
	}
	throw agentError(
		'INVALID_VALUE',
		`Account ${JSON.stringify(account.displayName)} already exists ${account.platformName === null ? 'without a platform' : `on platform ${account.platformName}`}, so \`platform\` ${JSON.stringify(requested)} does not apply.`,
		`Drop \`platform\` to record into the existing account, or use a different \`account\` name to create a new account on ${requested}.`,
		{ field: 'platform', received: platform, candidates: account.platformName === null ? [] : [account.platformName] },
	)
}

/** Crypto vs exchange-traded instrument, used to keep account inference within the right kind of account. */
function symbolAssetClass(rawSymbol: string): 'crypto' | 'traditional' | null {
	const parsed = parseSymbolIntent(cleanSymbolInput(rawSymbol))
	if (parsed.kind === 'full') {
		const symbolType = resolveSymbolInfo(parsed.symbol).type
		if (symbolType === null) {
			return null
		}
		return symbolType.startsWith('Crypto_') ? 'crypto' : 'traditional'
	}
	const traditional = BuiltinSymbolList.some((symbol) => !symbol.type.startsWith('Crypto_') && symbolBase(symbol.symbol_name) === parsed.base)
	return traditional ? 'traditional' : 'crypto'
}

function listAccounts(app: App): ResolvedAccount[] {
	return AccountDomain.totalEntries(app)
		.filter((entry): entry is AccountEntry => entry.file instanceof TFile)
		.map((entry) => ({
			entry,
			displayName: AccountDomain.toDisplayName(entry.fm),
			wikilink: `[[${getFileBasename(entry.file)}]]`,
			platformName: AccountDomain.toPlatformName(entry.fm),
		}))
}

function accountKeys(account: ResolvedAccount): string[] {
	return [account.displayName, account.platformName ?? '', getFileBasename(account.entry.file)]
		.filter((value) => value !== '')
		.map(normalizeKey)
}

function findMostRecentPositionAccount(app: App, accounts: ResolvedAccount[]): ResolvedAccount | null {
	const byWikilink = new Map(accounts.map((account) => [account.wikilink, account]))
	const positions = PositionDomain.totalEntries(app)
		.map((entry) => ({
			openedAt: Date.parse(entry.fm.opened_at ?? entry.fm.created ?? ''),
			account: derivePositionAccountWikilink(app, entry.fm),
		}))
		.filter((entry) => Number.isFinite(entry.openedAt) && entry.account !== null && byWikilink.has(entry.account))
		.sort((left, right) => right.openedAt - left.openedAt)
	const latest = positions[0]
	return latest?.account == null ? null : byWikilink.get(latest.account) ?? null
}

/* ------------------------------------------------------------------------ */
/* Symbol                                                                    */
/* ------------------------------------------------------------------------ */

const PERP_SUFFIX_PATTERN = /^([A-Z0-9]+)[.\-_](PERP|P)$/

export function resolveSymbol(app: App, account: ResolvedAccount, rawSymbol: string, side: 'LONG' | 'SHORT'): ResolvedSymbol {
	const cleaned = cleanSymbolInput(rawSymbol)
	const accountSymbols = SymbolDomain.listForAccount(app, account.wikilink)
	const parsed = parseSymbolIntent(cleaned)

	if (parsed.kind === 'full') {
		const info = resolveSymbolInfo(parsed.symbol)
		assertValidSymbolName(info.name, rawSymbol)
		const existing = accountSymbols.find((entry) => entry.fm.name === info.name) ?? null
		return {
			input: rawSymbol,
			name: info.name,
			type: existing?.fm.type ?? info.type,
			logo: existing?.fm.logo ?? info.logo,
			existing,
			reason: existing === null
				? `normalized ${JSON.stringify(rawSymbol)} to ${info.name}; not in account ${account.displayName}, will be created`
				: `normalized ${JSON.stringify(rawSymbol)} to existing symbol ${info.name}`,
		}
	}

	// A crypto short cannot be spot, so a bare base asset on a short means the perpetual.
	const shortNeedsPerp = side === 'SHORT' && isCryptoAccount(account, accountSymbols)
	const perpOnly = parsed.perp || shortNeedsPerp
	const sameBase = accountSymbols.filter((entry) => symbolBase(entry.fm.name) === parsed.base)
	const preferred = perpOnly
		? sameBase.filter((entry) => entry.fm.name.endsWith('.P'))
		: sameBase
	if (preferred.length === 1) {
		const existing = preferred[0]!
		return {
			input: rawSymbol,
			name: existing.fm.name,
			type: existing.fm.type ?? null,
			logo: existing.fm.logo ?? null,
			existing,
			reason: `aligned ${JSON.stringify(rawSymbol)} to the only ${parsed.base} ${perpOnly ? 'perpetual ' : ''}symbol in account ${account.displayName}${shortNeedsPerp && !parsed.perp ? ' (a short needs a perpetual)' : ''}`,
		}
	}
	if (preferred.length > 1) {
		const candidates = preferred.map((entry) => entry.fm.name)
		throw agentError(
			'SYMBOL_AMBIGUOUS',
			`${JSON.stringify(rawSymbol)} matches ${candidates.length} symbols in account ${account.displayName}: ${formatCandidates(candidates)}.`,
			'If the conversation says spot vs perpetual (or the quote currency), retry with that exact symbol from candidates; otherwise ask the user which one.',
			{ field: 'symbol', received: rawSymbol, candidates },
		)
	}

	if (shortNeedsPerp && !parsed.perp) {
		assertShortFitsConvention(account, accountSymbols, parsed.base, rawSymbol)
	}
	const name = buildSymbolForBase(account, accountSymbols, parsed.base, parsed.perp ? 'the perpetual suffix in the input' : shortNeedsPerp ? 'a short needs a perpetual' : null)
	assertValidSymbolName(name.symbol, rawSymbol)
	const info = resolveSymbolInfo(name.symbol)
	return {
		input: rawSymbol,
		name: info.name,
		type: info.type,
		logo: info.logo,
		existing: null,
		reason: `${name.reason}; will be created in account ${account.displayName}`,
	}
}

function findSymbolCandidatesForAccount(app: App, account: ResolvedAccount, rawSymbol: string): SymbolEntry[] {
	const parsed = parseSymbolIntent(cleanSymbolInput(rawSymbol))
	const accountSymbols = SymbolDomain.listForAccount(app, account.wikilink)
	if (parsed.kind === 'full') {
		const name = resolveSymbolInfo(parsed.symbol).name
		return accountSymbols.filter((entry) => entry.fm.name === name)
	}
	return accountSymbols.filter((entry) => symbolBase(entry.fm.name) === parsed.base)
}

function cleanSymbolInput(rawSymbol: string): string {
	return rawSymbol.trim().toUpperCase().replace(/\s+/g, '')
}

type SymbolIntent =
	| { kind: 'full'; symbol: string }
	| { kind: 'base'; base: string; perp: boolean }

function parseSymbolIntent(cleaned: string): SymbolIntent {
	const perpMatch = PERP_SUFFIX_PATTERN.exec(cleaned)
	if (perpMatch !== null && resolveSymbolInfo(perpMatch[1]!).type === null) {
		return { kind: 'base', base: perpMatch[1]!, perp: true }
	}
	const info = resolveSymbolInfo(cleaned)
	if (info.type !== null || info.logo !== null || !/^[A-Z0-9]+$/.test(cleaned)) {
		return { kind: 'full', symbol: cleaned }
	}
	return { kind: 'base', base: cleaned, perp: false }
}

function symbolBase(symbolName: string): string | null {
	return resolveSymbolInfo(symbolName).asset
}

function buildSymbolForBase(
	account: ResolvedAccount,
	accountSymbols: SymbolEntry[],
	base: string,
	forcePerpReason: string | null,
): { symbol: string; reason: string } {
	const forcePerp = forcePerpReason !== null
	if (!isCryptoAccount(account, accountSymbols)) {
		const builtin = BuiltinSymbolList
			.filter((symbol) => !symbol.type.startsWith('Crypto_') && symbolBase(symbol.symbol_name) === base)
			.map((symbol) => symbol.symbol_name)
		const usdQuoted = builtin.filter((symbol) => symbol === `${base}USD`)
		const pick = builtin.length === 1 ? builtin[0] : usdQuoted.length === 1 ? usdQuoted[0] : undefined
		if (pick !== undefined) {
			return { symbol: pick, reason: `expanded ${base} to builtin symbol ${pick}` }
		}
		if (builtin.length > 1) {
			throw agentError(
				'SYMBOL_AMBIGUOUS',
				`${JSON.stringify(base)} matches several builtin symbols: ${formatCandidates(builtin)}.`,
				'Retry with the exact symbol from candidates if the conversation makes it clear; otherwise ask the user.',
				{ field: 'symbol', received: base, candidates: builtin },
			)
		}
		return { symbol: base, reason: `kept ${base} as-is for non-crypto account ${account.displayName}` }
	}

	const { cryptoSymbols, quote, perpCount } = cryptoConvention(accountSymbols)
	const perp = forcePerp || cryptoSymbols.length === 0 || perpCount * 2 >= cryptoSymbols.length
	const symbol = `${base}${quote}${perp ? '.P' : ''}`
	const convention = cryptoSymbols.length === 0
		? `default crypto convention (${quote} quote, perpetual)`
		: `account ${account.displayName} convention (${quote} quote, ${perp ? 'perpetual' : 'spot'})`
	return { symbol, reason: `expanded ${base} to ${symbol} ${forcePerpReason === null ? `using ${convention}` : `because ${forcePerpReason}`}` }
}

function cryptoConvention(accountSymbols: SymbolEntry[]) {
	const cryptoSymbols = accountSymbols.filter((entry) => entry.fm.type?.startsWith('Crypto_') === true)
	const quote = mostCommon(cryptoSymbols.map((entry) => resolveSymbolQuote(entry.fm.name)).filter((value): value is string => value !== null)) ?? 'USDT'
	const perpCount = cryptoSymbols.filter((entry) => entry.fm.name.endsWith('.P')).length
	return { cryptoSymbols, quote, perpCount }
}

/**
 * A short usually means a perpetual, but an account that only ever traded spot may be
 * shorting on margin: that is a real ambiguity, so ask instead of inventing a perpetual.
 */
function assertShortFitsConvention(account: ResolvedAccount, accountSymbols: SymbolEntry[], base: string, rawSymbol: string) {
	const { cryptoSymbols, quote, perpCount } = cryptoConvention(accountSymbols)
	if (cryptoSymbols.length === 0 || perpCount > 0) {
		return
	}
	const candidates = [`${base}${quote}`, `${base}${quote}.P`]
	throw agentError(
		'SYMBOL_AMBIGUOUS',
		`${JSON.stringify(rawSymbol)} is a short, but account ${account.displayName} has only traded spot so far, so it is unclear whether this is a spot margin short or a perpetual.`,
		'If the conversation says margin/spot or perpetual/contract, retry with that symbol from candidates; otherwise ask the user which one.',
		{ field: 'symbol', received: rawSymbol, candidates },
	)
}

const CRYPTO_PLATFORMS_WITHOUT_EXCHANGE_ID = ['bitget']

function isCryptoAccount(account: ResolvedAccount, accountSymbols: SymbolEntry[]): boolean {
	if (account.platformName !== null) {
		const known = [...Object.keys(PLATFORM_TO_EXCHANGE_ID), ...CRYPTO_PLATFORMS_WITHOUT_EXCHANGE_ID]
			.some((name) => normalizeKey(name) === normalizeKey(account.platformName ?? ''))
		if (known) {
			return true
		}
		if (['metatrader', 'interactivebrokers'].includes(normalizeKey(account.platformName))) {
			return false
		}
	}
	const typed = accountSymbols.filter((entry) => entry.fm.type != null)
	if (typed.length === 0) {
		return true
	}
	return typed.filter((entry) => entry.fm.type?.startsWith('Crypto_') === true).length * 2 >= typed.length
}

function resolveSymbolQuote(symbolName: string): string | null {
	const info = resolveSymbolInfo(symbolName)
	if (info.asset === null) {
		return null
	}
	const pair = parseSymbolPair(symbolName)
	return pair !== null && pair.base === info.asset ? pair.quote : null
}

function assertValidSymbolName(name: string, rawSymbol: string) {
	if (!SymbolType.allows(name)) {
		throw agentError(
			'SYMBOL_INVALID',
			`${JSON.stringify(rawSymbol)} cannot be turned into a valid LucrJournal symbol (got ${JSON.stringify(name)}); symbols look like BTCUSDT, BTCUSDT.P, XAUUSD, ES or BTC/USDT.`,
			'Pass the ticker shown on the chart or exchange (letters/digits, optional /QUOTE or .P suffix).',
			{ field: 'symbol', received: rawSymbol },
		)
	}
}

function mostCommon(values: string[]): string | null {
	const counts = new Map<string, number>()
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1)
	}
	let best: string | null = null
	let bestCount = 0
	for (const [value, count] of counts) {
		if (count > bestCount) {
			best = value
			bestCount = count
		}
	}
	return best
}

/* ------------------------------------------------------------------------ */
/* Side                                                                      */
/* ------------------------------------------------------------------------ */

export function resolveSide(input: {
	side: 'LONG' | 'SHORT' | null
	entry_price: number | null
	stop_loss: number | null
	target_price: number | null
}): Resolution<'LONG' | 'SHORT'> {
	if (input.side !== null) {
		return { value: input.side, reason: 'given' }
	}
	const { entry_price: entry, stop_loss: stop, target_price: target } = input
	if (entry !== null && stop !== null && entry !== stop) {
		return { value: entry > stop ? 'LONG' : 'SHORT', reason: `stop_loss ${stop} is ${entry > stop ? 'below' : 'above'} entry_price ${entry}` }
	}
	if (entry !== null && target !== null && entry !== target) {
		return { value: target > entry ? 'LONG' : 'SHORT', reason: `target_price ${target} is ${target > entry ? 'above' : 'below'} entry_price ${entry}` }
	}
	if (stop !== null && target !== null && stop !== target) {
		return { value: target > stop ? 'LONG' : 'SHORT', reason: `target_price ${target} is ${target > stop ? 'above' : 'below'} stop_loss ${stop}` }
	}
	return { value: 'LONG', reason: 'no direction or prices given; defaulted to LONG like the New position form' }
}

export function assertRiskDirection(side: 'LONG' | 'SHORT', prices: { entry_price: number | null; stop_loss: number | null; target_price: number | null }) {
	const direction = side === 'LONG' ? 1 : -1
	const pairs: Array<[string, number | null, string, number | null]> = [
		['stop_loss', prices.stop_loss, 'entry_price', prices.entry_price],
		['entry_price', prices.entry_price, 'target_price', prices.target_price],
		['stop_loss', prices.stop_loss, 'target_price', prices.target_price],
	]
	for (const [lowField, low, highField, high] of pairs) {
		if (low !== null && high !== null && (high - low) * direction <= 0) {
			const expected = side === 'LONG' ? 'stop_loss < entry_price < target_price' : 'target_price < entry_price < stop_loss'
			throw agentError(
				'RISK_DIRECTION',
				`For a ${side} position ${lowField}=${low} and ${highField}=${high} are on the wrong side of each other (expected ${expected}).`,
				'Re-check the side and the prices from the source; if the user really meant the other direction, change `side`, otherwise fix the swapped price.',
				{ field: lowField, received: { side, ...prices } },
			)
		}
	}
}

/* ------------------------------------------------------------------------ */
/* Playbook / template                                                       */
/* ------------------------------------------------------------------------ */

export function resolvePlaybook(app: App, requested: string): { basename: string; path: string } {
	const entries = PlaybookDomain.totalEntries(app).filter((entry): entry is typeof entry & { file: TFile } => entry.file instanceof TFile)
	const matches = entries.filter((entry) => normalizeKey(getFileBasename(entry.file)) === normalizeKey(requested))
	const names = entries.map((entry) => getFileBasename(entry.file))
	if (matches.length === 1) {
		return { basename: getFileBasename(matches[0]!.file), path: matches[0]!.file.path }
	}
	throw agentError(
		matches.length > 1 ? 'PLAYBOOK_AMBIGUOUS' : 'PLAYBOOK_NOT_FOUND',
		`Playbook ${JSON.stringify(requested)} ${matches.length > 1 ? 'matches several playbooks' : 'does not exist'}. Existing playbooks: ${formatCandidates(names)}.`,
		'Retry with an exact name from candidates if one clearly matches; otherwise drop `playbook`, or create it first with createPlaybook when the user asked for a new one.',
		{ field: 'playbook', received: requested, candidates: names },
	)
}

export function resolveTemplate(app: App, requested: string): { name: string; path: string } {
	const templates = listPositionTemplates(app)
	const key = normalizeKey(requested)
	const matches = templates.filter((template) =>
		normalizeKey(template.name ?? '') === key || normalizeKey(template.filePath.split('/').pop()?.replace(/\.md$/, '') ?? '') === key,
	)
	const names = templates.map((template) => template.name ?? template.filePath.split('/').pop()?.replace(/\.md$/, '') ?? template.filePath)
	if (matches.length === 1) {
		const match = matches[0]!
		return { name: match.name ?? match.filePath, path: match.filePath }
	}
	throw agentError(
		matches.length > 1 ? 'TEMPLATE_AMBIGUOUS' : 'TEMPLATE_NOT_FOUND',
		`Position template ${JSON.stringify(requested)} ${matches.length > 1 ? 'matches several templates' : 'does not exist'}. Existing position templates: ${formatCandidates(names)}.`,
		'Retry with an exact name from candidates, or drop `template` to use the default body. Create one with createTemplate only when the user asked for a new template.',
		{ field: 'template', received: requested, candidates: names },
	)
}

/* ------------------------------------------------------------------------ */
/* Linked analyses / news                                                    */
/* ------------------------------------------------------------------------ */

type LinkDomain =
	| typeof KeyLevelDomain
	| typeof ConfluenceDomain
	| typeof MarketAnalysisDomain
	| typeof NewsDomain

export const LINK_KIND_CONFIG: Record<LinkKind, { domain: LinkDomain; sectionTitle: string; entityKind: 'key_level' | 'confluence' | 'market_analysis' | 'news' }> = {
	key_levels: { domain: KeyLevelDomain, sectionTitle: POSITION_KEY_LEVEL_SECTION, entityKind: 'key_level' },
	confluence: { domain: ConfluenceDomain, sectionTitle: POSITION_CONFLUENCE_SECTION, entityKind: 'confluence' },
	market_analysis: { domain: MarketAnalysisDomain, sectionTitle: POSITION_MARKET_ANALYSIS_SECTION, entityKind: 'market_analysis' },
	news: { domain: NewsDomain, sectionTitle: POSITION_NEWS_SECTION, entityKind: 'news' },
}

export type ResolvedLink = {
	kind: LinkKind
	name: string
	basename: string
	path: string
	create: boolean
	frontmatter: Record<string, unknown> | null
}

/**
 * A link may be given as a vault path or file name from listEntries
 * (`LucrJournal/news/CPI beat.md`, `CPI beat.md`); both name the note's title.
 * A LucrJournal path that does not exist is an error instead of a new note
 * titled after the path.
 */
function linkTitle(app: App, name: string, field: string): string {
	const trimmed = name.trim()
	if (trimmed.includes('/')) {
		const path = normalizePath(/\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`)
		const file = app.vault.getAbstractFileByPath(path)
		if (file instanceof TFile) {
			return getFileBasename(file)
		}
		if (path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`)) {
			throw agentError('ENTRY_NOT_FOUND', `${field} entry ${JSON.stringify(name)} looks like a vault path, but no note exists there.`, 'Pass the title of the note (e.g. "CPI beat") to link or create it, or a path from listEntries.', { field, received: name })
		}
	}
	return trimmed.replace(/\.md$/i, '')
}

export function resolveLink(app: App, kind: LinkKind, name: string): ResolvedLink {
	const config = LINK_KIND_CONFIG[kind]
	const field = `links.${kind}`
	const basename = sanitizeObsidianFileName(linkTitle(app, name, field)).trim()
	if (basename === '') {
		throw agentError('INVALID_VALUE', `${field} entry ${JSON.stringify(name)} is empty after removing characters that are not allowed in file names.`, 'Use a readable name made of letters, digits and spaces.', { field, received: name })
	}

	const existing = config.domain.totalEntries(app)
		.filter((entry): entry is typeof entry & { file: TFile } => entry.file instanceof TFile)
		.find((entry) => getFileBasename(entry.file).toLocaleLowerCase() === basename.toLocaleLowerCase())
	if (existing !== undefined) {
		return { kind, name, basename: getFileBasename(existing.file), path: existing.file.path, create: false, frontmatter: null }
	}

	const folderName = config.domain.options.persisted.folderName
	if (hasPersistedEntryBasenameConflict(app, folderName, basename)) {
		const conflicting = app.vault.getMarkdownFiles().find((file) =>
			file.path.startsWith(`${LUCR_TRADE_ROOT_DIR}/`) && getFileBasename(file).toLocaleLowerCase() === basename.toLocaleLowerCase(),
		)
		throw agentError(
			'NAME_CONFLICT',
			`Cannot create ${config.entityKind} ${JSON.stringify(basename)}: another LucrJournal note already uses that file name (${conflicting?.path ?? 'unknown path'}), and LucrJournal file names must be unique.`,
			'Use a more specific name for this entry (e.g. add the timeframe or date), or link the existing note under its own kind.',
			{ field, received: name, details: { conflictingPath: conflicting?.path ?? null } },
		)
	}

	const descriptor = config.domain.createEntryDescriptor as unknown as {
		buildPayload: (formValue: Record<string, string>, ctx: Record<string, unknown>) => Record<string, unknown>
		buildFileName: (entry: Record<string, unknown>, ctx: Record<string, unknown>, formValue: Record<string, string>) => string
	}
	const formValue: Record<string, string> = kind === 'news' ? { name: basename, source: '' } : { name: basename, description: '' }
	const payload = descriptor.buildPayload(formValue, {})
	const fileBaseName = descriptor.buildFileName(payload, {}, formValue)
	return {
		kind,
		name,
		basename: fileBaseName,
		path: normalizePath(`${LUCR_TRADE_ROOT_DIR}/${folderName}/${fileBaseName}.md`),
		create: true,
		frontmatter: payload,
	}
}

function normalizeKey(value: string): string {
	return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s_-]+/g, '')
}
