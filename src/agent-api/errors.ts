/// <reference types="vitest/importMeta" />

/**
 * Agent-facing error contract. Every message and fix is a complete English
 * sentence so an agent can decide its next step without any other docs.
 */
export type AgentErrorCode =
	| 'UNKNOWN_FIELD'
	| 'INVALID_VALUE'
	| 'SYMBOL_REQUIRED'
	| 'SYMBOL_INVALID'
	| 'SYMBOL_AMBIGUOUS'
	| 'NO_ACCOUNT'
	| 'ACCOUNT_NOT_FOUND'
	| 'ACCOUNT_AMBIGUOUS'
	| 'ACCOUNT_REQUIRED'
	| 'RISK_DIRECTION'
	| 'QUANTITY_CONFLICT'
	| 'PLAYBOOK_NOT_FOUND'
	| 'PLAYBOOK_AMBIGUOUS'
	| 'TEMPLATE_NOT_FOUND'
	| 'TEMPLATE_AMBIGUOUS'
	| 'NAME_CONFLICT'
	| 'ATTACHMENT_NOT_FOUND'
	| 'ATTACHMENT_UNSUPPORTED'
	| 'POSITION_NOT_FOUND'
	| 'METADATA_TIMEOUT'
	| 'POST_WRITE_VERIFY_FAILED'
	| 'ROLLBACK_FAILED'
	| 'OPEN_FAILED'
	| 'INTERNAL_ERROR'

export type AgentErrorPayload = {
	code: AgentErrorCode
	message: string
	fix: string
	field?: string
	received?: unknown
	candidates?: unknown[]
	details?: Record<string, unknown>
}

export type AgentFailure = { ok: false; error: AgentErrorPayload }

export class AgentApiError extends Error {
	readonly payload: AgentErrorPayload

	constructor(payload: AgentErrorPayload) {
		super(payload.message)
		this.name = 'AgentApiError'
		this.payload = payload
	}
}

export function agentError(
	code: AgentErrorCode,
	message: string,
	fix: string,
	extra: Omit<AgentErrorPayload, 'code' | 'message' | 'fix'> = {},
): AgentApiError {
	return new AgentApiError({ code, message, fix, ...extra })
}

function toAgentFailure(error: unknown): AgentFailure {
	if (error instanceof AgentApiError) {
		return { ok: false, error: error.payload }
	}

	const message = error instanceof Error ? error.message : String(error)
	return {
		ok: false,
		error: {
			code: 'INTERNAL_ERROR',
			message: `LucrJournal hit an unexpected internal error: ${message}`,
			fix: 'Do not retry blindly. Report this message to the user; run `obsidian dev:errors` and `obsidian dev:console level=error` in the same vault for the stack trace.',
			details: error instanceof Error && typeof error.stack === 'string'
				? { stack: error.stack.split('\n').slice(0, 6).join('\n') }
				: undefined,
		},
	}
}

/** Run an agent API call and convert every outcome into a JSON-safe result; never throws. */
export async function runAgentCall<T extends Record<string, unknown>>(
	call: () => Promise<T>,
): Promise<({ ok: true } & T) | AgentFailure> {
	try {
		const result = await call()
		return toJsonSafe({ ok: true as const, ...result })
	} catch (error: unknown) {
		return toJsonSafe(toAgentFailure(error))
	}
}

function toJsonSafe<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export function formatCandidates(candidates: readonly string[]): string {
	return candidates.length === 0 ? '(none)' : candidates.map((candidate) => JSON.stringify(candidate)).join(', ')
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('runAgentCall', () => {
		it('wraps success results with ok:true', async () => {
			await expect(runAgentCall(async () => ({ data: { path: 'a.md' } }))).resolves.toEqual({
				ok: true,
				data: { path: 'a.md' },
			})
		})

		it('returns structured agent errors without throwing', async () => {
			const result = await runAgentCall(async () => {
				throw agentError('SYMBOL_REQUIRED', 'Missing symbol.', 'Pass `symbol`.', { field: 'symbol' })
			})
			expect(result).toEqual({
				ok: false,
				error: { code: 'SYMBOL_REQUIRED', message: 'Missing symbol.', fix: 'Pass `symbol`.', field: 'symbol' },
			})
		})

		it('maps unexpected exceptions to INTERNAL_ERROR', async () => {
			const result = await runAgentCall(async () => {
				throw new Error('boom')
			})
			expect(result.ok).toBe(false)
			expect(!result.ok && result.error.code).toBe('INTERNAL_ERROR')
			expect(!result.ok && result.error.message).toContain('boom')
		})
	})
}
