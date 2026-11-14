import { agentError, formatCandidates } from './errors'

export type AgentArgs = Record<string, unknown>

/**
 * Shared input readers for the agent API operations added after
 * `createPosition`: one strict object per call, unknown fields rejected,
 * every failure phrased so an agent can fix the call without other docs.
 */
export function readArgs(operation: string, input: unknown, allowed: readonly string[]): AgentArgs {
	const raw = typeof input === 'string' ? decodeBase64Json(operation, input) : input
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw agentError(
			'INVALID_VALUE',
			`${operation} expects a single JSON object.`,
			`Call ${operation}({ ... }) with one object literal. Allowed fields: ${allowed.join(', ')}.`,
			{ received: raw },
		)
	}
	const record = raw as AgentArgs
	const unknownFields = Object.keys(record).filter((key) => !allowed.includes(key))
	if (unknownFields.length > 0) {
		throw agentError(
			'UNKNOWN_FIELD',
			`Unknown field(s) for ${operation}: ${formatCandidates(unknownFields)}.`,
			`Remove them. Allowed fields are: ${allowed.join(', ')}.`,
			{ field: unknownFields[0], received: unknownFields, candidates: [...allowed] },
		)
	}
	return record
}

export function decodeBase64Json(operation: string, encoded: string): unknown {
	let json: string
	try {
		const bytes = Uint8Array.from(atob(encoded.trim()), (character) => character.charCodeAt(0))
		json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	} catch {
		throw agentError(
			'INVALID_VALUE',
			`${operation} received a string that is not base64-encoded UTF-8 JSON.`,
			'Pass an object literal, or base64-encode the UTF-8 bytes of the JSON input.',
			{ received: encoded.slice(0, 80) },
		)
	}
	try {
		return JSON.parse(json) as unknown
	} catch (error: unknown) {
		// The transport worked; the JSON itself is broken, so re-encoding would not help.
		throw agentError(
			'INVALID_VALUE',
			`${operation} received malformed JSON: ${error instanceof Error ? error.message : String(error)}.`,
			'Fix the JSON syntax (quotes, commas, brackets) and send it again.',
			{ received: json.slice(0, 80) },
		)
	}
}

export function hasArg(args: AgentArgs, field: string): boolean {
	return Object.prototype.hasOwnProperty.call(args, field) && args[field] !== undefined
}

export function readText(args: AgentArgs, field: string): string | null {
	const value = args[field]
	if (value === undefined || value === null) {
		return null
	}
	if (typeof value !== 'string') {
		throw agentError('INVALID_VALUE', `\`${field}\` must be a string.`, `Pass \`${field}\` as a string or omit it.`, { field, received: value })
	}
	const trimmed = value.trim()
	return trimmed === '' ? null : trimmed
}

export function readRequiredText(args: AgentArgs, field: string, hint: string): string {
	const value = readText(args, field)
	if (value === null) {
		throw agentError('INVALID_VALUE', `\`${field}\` is required.`, hint, { field })
	}
	return value
}

export function readBoolean(args: AgentArgs, field: string): boolean {
	const value = args[field]
	if (value === undefined || value === null) {
		return false
	}
	if (typeof value !== 'boolean') {
		throw agentError('INVALID_VALUE', `\`${field}\` must be true or false.`, `Pass \`${field}: true\` or omit it.`, { field, received: value })
	}
	return value
}

export function readNumber(args: AgentArgs, field: string): number | null {
	const value = args[field]
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
			`\`${field}\` must be a plain number.`,
			`Pass \`${field}\` as a JSON number without currency symbols or thousands separators (e.g. 1234.5).`,
			{ field, received: value },
		)
	}
	return numeric
}

export function readPositiveNumber(args: AgentArgs, field: string): number | null {
	const value = readNumber(args, field)
	if (value !== null && value <= 0) {
		throw agentError('INVALID_VALUE', `\`${field}\` must be greater than 0, received ${value}.`, `Pass a positive \`${field}\` or omit it.`, { field, received: value })
	}
	return value
}

export function readStringList(args: AgentArgs, field: string): string[] | null {
	const value = args[field]
	if (value === undefined || value === null) {
		return null
	}
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw agentError('INVALID_VALUE', `\`${field}\` must be an array of strings.`, `Pass e.g. \`${field}: ["a", "b"]\`.`, { field, received: value })
	}
	return (value as string[]).map((item) => item.trim()).filter((item) => item !== '')
}

export function readEnum<const T extends string>(args: AgentArgs, field: string, options: readonly T[]): T | null {
	const value = readText(args, field)
	if (value === null) {
		return null
	}
	const match = options.find((option) => option.toLowerCase() === value.toLowerCase())
	if (match === undefined) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` must be one of ${formatCandidates(options)}, received ${JSON.stringify(value)}.`,
			`Pass one of the candidates as \`${field}\`.`,
			{ field, received: value, candidates: [...options] },
		)
	}
	return match
}

/** Free text destined for a note body: level-1 headings are reserved for the plugin's own sections. */
export function readBodyText(args: AgentArgs, field: string): string | null {
	const value = readText(args, field)
	if (value === null) {
		return null
	}
	const h1Line = value.split('\n').find((line) => /^#\s/.test(line))
	if (h1Line !== undefined) {
		throw agentError(
			'INVALID_VALUE',
			`\`${field}\` contains a top-level heading line ${JSON.stringify(h1Line)}; level-1 headings are reserved for sections LucrJournal manages.`,
			'Use "##" or deeper headings (or plain text).',
			{ field, received: h1Line },
		)
	}
	return value
}
