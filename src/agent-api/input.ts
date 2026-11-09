/// <reference types="vitest/importMeta" />

import { agentError, formatCandidates } from './errors'

export const LINK_KINDS = ['key_levels', 'confluence', 'market_analysis', 'news'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export type CreatePositionInput = {
	symbol: string
	account: string | null
	platform: string | null
	createAccount: boolean
	side: 'LONG' | 'SHORT' | null
	entry_price: number | null
	stop_loss: number | null
	target_price: number | null
	exit_price: number | null
	lots: number | null
	contract: number | null
	notional_value: number | null
	amount: number | null
	opened_at: string | null
	closed_at: string | null
	confidence: number | null
	playbook: string | null
	template: string | null
	links: Record<LinkKind, string[]>
	notes: string | null
	attachments: string[]
	dryRun: boolean
}

const ALLOWED_FIELDS = [
	'symbol',
	'account',
	'platform',
	'createAccount',
	'side',
	'entry_price',
	'stop_loss',
	'target_price',
	'exit_price',
	'lots',
	'contract',
	'notional_value',
	'amount',
	'opened_at',
	'closed_at',
	'confidence',
	'playbook',
	'template',
	'links',
	'notes',
	'attachments',
	'dryRun',
] as const

const PRICE_FIELDS = ['entry_price', 'stop_loss', 'target_price', 'exit_price'] as const
const POSITIVE_FIELDS = ['lots', 'contract', 'notional_value', 'amount'] as const

const SIDE_ALIASES: Record<string, 'LONG' | 'SHORT'> = {
	long: 'LONG',
	buy: 'LONG',
	short: 'SHORT',
	sell: 'SHORT',
}

export function parseCreatePositionInput(input: unknown): CreatePositionInput {
	const raw = typeof input === 'string' ? decodeBase64Json(input) : input
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw agentError(
			'INVALID_VALUE',
			`createPosition expects a single JSON object, received ${describeValue(raw)}.`,
			'Call createPosition({ symbol: "...", ... }) with one object literal.',
			{ received: raw },
		)
	}

	const record = raw as Record<string, unknown>
	const unknownFields = Object.keys(record).filter((key) => !(ALLOWED_FIELDS as readonly string[]).includes(key))
	if (unknownFields.length > 0) {
		throw agentError(
			'UNKNOWN_FIELD',
			`Unknown field(s): ${formatCandidates(unknownFields)}.`,
			`Remove them. Allowed fields are: ${ALLOWED_FIELDS.join(', ')}. Put free text into \`notes\`.`,
			{ field: unknownFields[0], received: unknownFields, candidates: [...ALLOWED_FIELDS] },
		)
	}

	const prices = Object.fromEntries(PRICE_FIELDS.map((field) => [field, readPositiveNumber(record, field)])) as Record<(typeof PRICE_FIELDS)[number], number | null>
	const sizes = Object.fromEntries(POSITIVE_FIELDS.map((field) => [field, readPositiveNumber(record, field)])) as Record<(typeof POSITIVE_FIELDS)[number], number | null>

	return {
		symbol: readSymbol(record),
		account: readOptionalText(record, 'account'),
		platform: readOptionalText(record, 'platform'),
		createAccount: readBoolean(record, 'createAccount'),
		side: readSide(record),
		...prices,
		...sizes,
		opened_at: readOptionalText(record, 'opened_at'),
		closed_at: readOptionalText(record, 'closed_at'),
		confidence: readConfidence(record),
		playbook: readOptionalText(record, 'playbook'),
		template: readOptionalText(record, 'template'),
		links: readLinks(record),
		notes: readNotes(record),
		attachments: readStringList(record.attachments, 'attachments'),
		dryRun: readBoolean(record, 'dryRun'),
	}
}

/**
 * PowerShell 5.1 strips double quotes from native command arguments, so agents
 * there pass the input as base64-encoded UTF-8 JSON instead of an object literal.
 */
function decodeBase64Json(encoded: string): unknown {
	try {
		const bytes = Uint8Array.from(atob(encoded.trim()), (character) => character.charCodeAt(0))
		return JSON.parse(new TextDecoder().decode(bytes)) as unknown
	} catch (error: unknown) {
		throw agentError(
			'INVALID_VALUE',
			`createPosition received a string that is not base64-encoded UTF-8 JSON (${error instanceof Error ? error.message : 'decode failed'}).`,
			'Pass an object literal, or base64-encode the UTF-8 bytes of the JSON input, e.g. [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)) in PowerShell.',
			{ received: encoded.slice(0, 80) },
		)
	}
}

function readSymbol(record: Record<string, unknown>): string {
	const value = readOptionalText(record, 'symbol')
	if (value === null) {
		throw agentError(
			'SYMBOL_REQUIRED',
			'No `symbol` was provided, so LucrJournal cannot tell which instrument this position is for.',
			'Extract the instrument from the conversation or screenshot (e.g. "sol", "BTC/USDT", "XAUUSD") and pass it raw as `symbol`; ask the user only if there is no hint at all.',
			{ field: 'symbol' },
		)
	}
	return value
}

function readSide(record: Record<string, unknown>): 'LONG' | 'SHORT' | null {
	const value = readOptionalText(record, 'side')
	if (value === null) {
		return null
	}
	const side = SIDE_ALIASES[value.toLowerCase()]
	if (side === undefined) {
		throw agentError(
			'INVALID_VALUE',
			`\`side\` must be LONG or SHORT, received ${JSON.stringify(value)}.`,
			'Pass "LONG" (buy) or "SHORT" (sell), or omit `side` to infer it from stop_loss/target_price.',
			{ field: 'side', received: value, candidates: ['LONG', 'SHORT'] },
		)
	}
	return side
}

function readConfidence(record: Record<string, unknown>): number | null {
	const value = readNumber(record, 'confidence')
	if (value === null) {
		return null
	}
	if (!Number.isInteger(value) || value < 1 || value > 5) {
		throw agentError(
			'INVALID_VALUE',
			`\`confidence\` must be an integer from 1 to 5, received ${value}.`,
			'Pass an integer 1-5 or omit `confidence`.',
			{ field: 'confidence', received: value },
		)
	}
	return value
}

function readLinks(record: Record<string, unknown>): Record<LinkKind, string[]> {
	const empty = { key_levels: [], confluence: [], market_analysis: [], news: [] } as Record<LinkKind, string[]>
	const value = record.links
	if (value === undefined || value === null) {
		return empty
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw agentError(
			'INVALID_VALUE',
			`\`links\` must be an object like { "key_levels": ["name"] }, received ${describeValue(value)}.`,
			`Use an object whose keys are among: ${LINK_KINDS.join(', ')}.`,
			{ field: 'links', received: value },
		)
	}

	const linkRecord = value as Record<string, unknown>
	const unknownKinds = Object.keys(linkRecord).filter((key) => !(LINK_KINDS as readonly string[]).includes(key))
	if (unknownKinds.length > 0) {
		throw agentError(
			'UNKNOWN_FIELD',
			`Unknown link kind(s): ${formatCandidates(unknownKinds)}.`,
			`Use only these keys inside \`links\`: ${LINK_KINDS.join(', ')}.`,
			{ field: `links.${unknownKinds[0]}`, received: unknownKinds, candidates: [...LINK_KINDS] },
		)
	}

	for (const kind of LINK_KINDS) {
		const names = readStringList(linkRecord[kind], `links.${kind}`)
		const seen = new Set<string>()
		for (const name of names) {
			const key = name.toLocaleLowerCase()
			if (seen.has(key)) {
				throw agentError(
					'INVALID_VALUE',
					`\`links.${kind}\` lists ${JSON.stringify(name)} more than once.`,
					'Remove the duplicate entry.',
					{ field: `links.${kind}`, received: names },
				)
			}
			seen.add(key)
		}
		empty[kind] = names
	}
	return empty
}

function readNotes(record: Record<string, unknown>): string | null {
	const value = readOptionalText(record, 'notes')
	if (value === null) {
		return null
	}
	const h1Line = value.split('\n').find((line) => /^#\s/.test(line))
	if (h1Line !== undefined) {
		throw agentError(
			'INVALID_VALUE',
			`\`notes\` contains a top-level heading line ${JSON.stringify(h1Line)}; level-1 headings are reserved for the position's own sections (Notes, News, Key Levels, Confluence, Market Analysis).`,
			'Use "##" or deeper headings (or plain text) inside notes, and pass related analyses through `links` instead.',
			{ field: 'notes', received: h1Line },
		)
	}
	return value
}

function readStringList(value: unknown, field: string): string[] {
	if (value === undefined || value === null) {
		return []
	}
	if (!Array.isArray(value)) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be an array of strings, received ${describeValue(value)}.`,
			`Wrap the value in an array, e.g. ["${typeof value === 'string' ? value : 'name'}"].`,
			{ field, received: value },
		)
	}
	return value.map((item, index) => {
		if (typeof item !== 'string' || item.trim() === '') {
			throw agentError(
				'INVALID_VALUE',
				`\`${field}[${index}]\` must be a non-empty string, received ${describeValue(item)}.`,
				'Remove the empty or non-string entry.',
				{ field: `${field}[${index}]`, received: item },
			)
		}
		return item.trim()
	})
}

function readOptionalText(record: Record<string, unknown>, field: string): string | null {
	const value = record[field]
	if (value === undefined || value === null) {
		return null
	}
	if (typeof value !== 'string') {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be a string, received ${describeValue(value)}.`,
			`Pass \`${field}\` as a string or omit it.`,
			{ field, received: value },
		)
	}
	const trimmed = value.trim()
	return trimmed === '' ? null : trimmed
}

function readBoolean(record: Record<string, unknown>, field: string): boolean {
	const value = record[field]
	if (value === undefined || value === null) {
		return false
	}
	if (typeof value !== 'boolean') {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be true or false, received ${describeValue(value)}.`,
			`Pass \`${field}: true\` or omit it.`,
			{ field, received: value },
		)
	}
	return value
}

function readNumber(record: Record<string, unknown>, field: string): number | null {
	const value = record[field]
	if (value === undefined || value === null || value === '') {
		return null
	}
	const numeric = typeof value === 'number'
		? value
		: typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)
			? Number(value)
			: Number.NaN
	if (!Number.isFinite(numeric)) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be a plain number, received ${describeValue(value)}.`,
			`Pass \`${field}\` as a JSON number without currency symbols or thousands separators (e.g. 1234.5).`,
			{ field, received: value },
		)
	}
	return numeric
}

function readPositiveNumber(record: Record<string, unknown>, field: string): number | null {
	const value = readNumber(record, field)
	if (value !== null && value <= 0) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be greater than 0, received ${value}.`,
			`Pass a positive \`${field}\` or omit it.`,
			{ field, received: value },
		)
	}
	return value
}

function describeValue(value: unknown): string {
	if (value === null) {
		return 'null'
	}
	if (Array.isArray(value)) {
		return `an array ${JSON.stringify(value).slice(0, 80)}`
	}
	return `${typeof value} ${JSON.stringify(value)?.slice(0, 80) ?? typeof value}`
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	const codeOf = (fn: () => unknown) => {
		try {
			fn()
		} catch (error: unknown) {
			return (error as { payload?: { code?: string; field?: string } }).payload
		}
		return null
	}

	describe('parseCreatePositionInput', () => {
		it('normalizes a full input', () => {
			const input = parseCreatePositionInput({
				symbol: ' sol ',
				side: 'buy',
				entry_price: '142.5',
				stop_loss: 138,
				links: { key_levels: [' Range high '] },
				notes: 'line1\n## sub\nline3',
				dryRun: true,
			})
			expect(input).toMatchObject({
				symbol: 'sol',
				side: 'LONG',
				entry_price: 142.5,
				stop_loss: 138,
				account: null,
				links: { key_levels: ['Range high'], confluence: [], market_analysis: [], news: [] },
				dryRun: true,
			})
		})

		it('accepts base64-encoded UTF-8 JSON (PowerShell transport)', () => {
			const json = JSON.stringify({ symbol: 'sol', notes: '\u4E2D\u6587 "quoted" it\'s' })
			const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
			expect(parseCreatePositionInput(encoded)).toMatchObject({ symbol: 'sol', notes: '\u4E2D\u6587 "quoted" it\'s' })
			expect(codeOf(() => parseCreatePositionInput('not base64 json'))).toMatchObject({ code: 'INVALID_VALUE' })
		})

		it('rejects unknown fields, bad values and reserved headings', () => {
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', foo: 1 }))).toMatchObject({ code: 'UNKNOWN_FIELD', field: 'foo' })
			expect(codeOf(() => parseCreatePositionInput({ side: 'LONG' }))).toMatchObject({ code: 'SYMBOL_REQUIRED' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', side: 'up' }))).toMatchObject({ code: 'INVALID_VALUE', field: 'side' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', entry_price: '1,000' }))).toMatchObject({ code: 'INVALID_VALUE', field: 'entry_price' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', lots: -1 }))).toMatchObject({ code: 'INVALID_VALUE', field: 'lots' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', confidence: 7 }))).toMatchObject({ code: 'INVALID_VALUE', field: 'confidence' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', links: { levels: [] } }))).toMatchObject({ code: 'UNKNOWN_FIELD', field: 'links.levels' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', links: { news: 'CPI' } }))).toMatchObject({ code: 'INVALID_VALUE', field: 'links.news' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', links: { news: ['CPI', 'cpi'] } }))).toMatchObject({ code: 'INVALID_VALUE', field: 'links.news' })
			expect(codeOf(() => parseCreatePositionInput({ symbol: 'BTC', notes: 'ok\n# Title' }))).toMatchObject({ code: 'INVALID_VALUE', field: 'notes' })
			expect(codeOf(() => parseCreatePositionInput([]))).toMatchObject({ code: 'INVALID_VALUE' })
		})
	})
}
