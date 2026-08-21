import * as Obsidian from 'obsidian'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkSession, claimSession, mapCheckResponse, revokeSession } from './api'

const context = {
	profile: { userId: 'u', username: null, displayName: null, avatarUrl: null, email: null },
	entitlements: {
		features: ['journal_basic'],
	},
	plan: null,
	subscription: null,
	products: [],
} as const

afterEach(() => {
	vi.restoreAllMocks()
})

describe('mapCheckResponse', () => {
	// @story [[lucrjournal/entitlement#^active-requires-journal]] Covers a valid active journal entitlement.
	it('active', () => {
		expect(mapCheckResponse(200, { status: 'active', ...context }))
			.toEqual({ kind: 'active', context })
	})
	it('active with half_year subscription', () => {
		const halfYearContext = {
			...context,
			plan: { key: 'lucrjournal', status: 'active' },
			subscription: {
				interval: 'half_year',
				currentPeriodEnd: '2026-08-31T00:00:00.000Z',
				cancelAtPeriodEnd: false,
			},
		} as const
		expect(mapCheckResponse(200, { status: 'active', ...halfYearContext }))
			.toEqual({ kind: 'active', context: halfYearContext })
	})
	it('filters unknown features', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			entitlements: {
				...context.entitlements,
				features: ['journal_basic', 'server_future_feature'],
			},
		})).toEqual({ kind: 'active', context })
	})
	// @story [[lucrjournal/entitlement#^active-requires-journal]] Covers denying an active session without journal access.
	it('missing journal_basic -> signed_out', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			entitlements: { features: [] },
		})).toEqual({
			kind: 'signed_out',
			reason: 'entitlement_required',
			context: { ...context, entitlements: { features: [] } },
		})
	})
	it('filters unknown products', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			products: ['indicator_bundle', 'server_future_product'],
		})).toEqual({
			kind: 'active',
			context: { ...context, products: ['indicator_bundle'] },
		})
	})
	// @story [[lucrjournal/entitlement#^explicit-invalid-only]] Covers keeping an unrecognised plan shape.
	it('unknown plan -> keep', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			plan: { key: 'future_plan', status: 'active' },
		})).toEqual({ kind: 'keep' })
	})
	// @story [[lucrjournal/entitlement#^explicit-invalid-only]] Covers keeping an unrecognised subscription status.
	it('unknown subscription status -> keep', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			plan: { key: 'pro', status: 'future_status' },
		})).toEqual({ kind: 'keep' })
	})
	// @story [[lucrjournal/entitlement#^explicit-invalid-only]] Covers explicit revocation as an invalid session.
	it('revoked', () => {
		expect(mapCheckResponse(401, { status: 'revoked', code: 'revoked' }))
			.toEqual({ kind: 'signed_out', reason: 'invalid_session' })
	})
	// @story [[lucrjournal/entitlement#^explicit-invalid-only]] Covers an explicitly disabled account.
	it('account_disabled', () => {
		expect(mapCheckResponse(403, { status: 'account_disabled', code: 'account_disabled' }))
			.toEqual({ kind: 'signed_out', reason: 'invalid_session' })
	})
	// @story [[lucrjournal/entitlement#^explicit-invalid-only]] Covers an explicitly invalid bearer token.
	it('invalid_token -> signed_out', () => {
		expect(mapCheckResponse(401, { code: 'invalid_token' }))
			.toEqual({ kind: 'signed_out', reason: 'invalid_session' })
	})
	// @story [[lucrjournal/entitlement#^active-requires-journal]] Covers the dedicated entitlement denial code.
	it('lucrjournal_entitlement_required -> signed_out', () => {
		expect(mapCheckResponse(200, {
			status: 'entitlement_required',
			code: 'lucrjournal_entitlement_required',
		})).toEqual({ kind: 'signed_out', reason: 'entitlement_required', context: null })
	})
	// @story [[lucrjournal/entitlement#^entitlement-check-denies]] Covers preserving denied account context from the check response.
	it('lucrjournal_entitlement_required keeps account context', () => {
		const deniedContext = {
			...context,
			entitlements: { features: [] },
			plan: { key: 'lucrjournal', status: 'active' },
			subscription: {
				interval: 'month',
				currentPeriodEnd: '2026-08-31T00:00:00.000Z',
				cancelAtPeriodEnd: false,
			},
		} as const
		expect(mapCheckResponse(200, {
			status: 'entitlement_required',
			code: 'lucrjournal_entitlement_required',
			...deniedContext,
		})).toEqual({
			kind: 'signed_out',
			reason: 'entitlement_required',
			context: deniedContext,
		})
	})
	// @story [[lucrjournal/entitlement#^explicit-invalid-only]] Covers keeping state on a server failure.
	it('5xx -> keep', () => {
		expect(mapCheckResponse(500, null)).toEqual({ kind: 'keep' })
	})
	// @story [[lucrjournal/entitlement#^explicit-invalid-only]] Covers keeping state for an unclassifiable response.
	it('non-json -> keep', () => {
		expect(mapCheckResponse(200, null)).toEqual({ kind: 'keep' })
	})
})

describe('checkSession', () => {
	// @story [[lucrjournal/session#^auth-errors-always-visible]] Covers visible logging for session request failures.
	// @story [[lucrjournal/session#^auth-logs-redact-credentials]] Covers bearer token redaction from session check logs.
	// @story [[lucrjournal/entitlement#^ambiguous-check-keeps-state]] Covers preserving access state on a network failure.
	it('logs request errors through console.error while keeping the session', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		const requestError = new Error('network down')
		vi.spyOn(Obsidian, 'requestUrl').mockRejectedValue(requestError)

		expect(await checkSession('lj_token')).toEqual({ kind: 'keep' })
		expect(error.mock.calls[0]?.[0]).toContain('session check request failed')
		expect(error.mock.calls[0]?.[5]).toEqual({
			endpoint: 'https://app.lucrtrade.com/api/obsidian/session/',
			error: requestError,
		})
		expect(JSON.stringify(error.mock.calls)).not.toContain('lj_token')
	})
})

describe('claimSession', () => {
	// @story [[lucrjournal/entitlement#^claim-entitlement-gate]] Covers returning the token and context when journal access is missing.
	// @story [[lucrjournal/session#^canonical-auth-transport]] Covers the canonical claim transport.
	it('logs a claim without journal_basic through console.error', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		const request = vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
			status: 200,
			text: JSON.stringify({
				token: 'lj_token',
				...context,
				entitlements: { features: [] },
			}),
		} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)

		expect(await claimSession('code', 'verifier', {
			deviceId: '5bbbb19dfa9f730f',
			pluginId: 'lucrjournal',
			pluginVersion: '0.1.5',
			obsidianVersion: '1.13.1',
			platform: 'desktop',
		})).toEqual({
			kind: 'entitlement_required',
			token: 'lj_token',
			context: { ...context, entitlements: { features: [] } },
		})
		expect(request).toHaveBeenCalledWith(expect.objectContaining({
			url: 'https://app.lucrtrade.com/api/obsidian/session/claim/',
			method: 'POST',
			throw: false,
		}))
		expect(error).toHaveBeenCalledTimes(1)
		expect(error.mock.calls[0]?.[0]).toContain('session claim missing journal access')
		expect(error.mock.calls[0]?.[5]).toEqual({
			endpoint: 'https://app.lucrtrade.com/api/obsidian/session/claim/',
			status: 200,
			features: [],
			plan: null,
			products: [],
		})
	})

	// @story [[lucrjournal/session#^auth-logs-redact-credentials]] Covers OAuth credential redaction from claim rejection logs.
	it('logs the server rejection without exposing claim credentials', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
			status: 403,
			text: JSON.stringify({ code: 'lucrjournal_entitlement_required' }),
		} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)

		expect(await claimSession('secret_code', 'secret_verifier', {
			deviceId: '5bbbb19dfa9f730f',
			pluginId: 'lucrjournal',
			pluginVersion: '0.1.7',
			obsidianVersion: '1.13.1',
			platform: 'desktop',
		})).toEqual({ kind: 'failed' })
		expect(error.mock.calls[0]?.[0]).toContain('session claim rejected')
		expect(error.mock.calls[0]?.[5]).toEqual({
			endpoint: 'https://app.lucrtrade.com/api/obsidian/session/claim/',
			status: 403,
			code: 'lucrjournal_entitlement_required',
			bodyKeys: ['code'],
			responseLength: 43,
		})
		expect(JSON.stringify(error.mock.calls)).not.toContain('secret_code')
		expect(JSON.stringify(error.mock.calls)).not.toContain('secret_verifier')
	})

	// @story [[lucrjournal/session#^auth-errors-always-visible]] Covers visible logging for claim request failures.
	it('logs request errors through console.error', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		const requestError = new Error('network down')
		vi.spyOn(Obsidian, 'requestUrl').mockRejectedValue(requestError)

		expect(await claimSession('code', 'verifier', {
			deviceId: '5bbbb19dfa9f730f',
			pluginId: 'lucrjournal',
			pluginVersion: '0.1.7',
			obsidianVersion: '1.13.1',
			platform: 'desktop',
		})).toEqual({ kind: 'failed' })
		expect(error.mock.calls[0]?.[0]).toContain('session claim request failed')
		expect(error.mock.calls[0]?.[5]).toEqual({
			endpoint: 'https://app.lucrtrade.com/api/obsidian/session/claim/',
			error: requestError,
		})
	})
})

describe('revokeSession', () => {
	// @story [[lucrjournal/session#^canonical-auth-transport]] Covers the canonical logout transport.
	it('posts json so Astro does not treat the cross-site request as a form submission', async () => {
		const request = vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
			status: 200,
			text: '{}',
		} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)

		await revokeSession('lj_token')

		expect(request).toHaveBeenCalledWith({
			url: 'https://app.lucrtrade.com/api/obsidian/logout/',
			method: 'POST',
			headers: { Authorization: 'Bearer lj_token' },
			contentType: 'application/json',
			body: '{}',
			throw: false,
		})
	})

	// @story [[lucrjournal/session#^auth-logs-redact-credentials]] Covers bearer token redaction from revoke rejection logs.
	it('logs a server rejection through console.error', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
			status: 503,
			text: JSON.stringify({ code: 'auth_unavailable' }),
		} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)

		await revokeSession('lj_token')

		expect(error.mock.calls[0]?.[0]).toContain('session revoke rejected')
		expect(error.mock.calls[0]?.[5]).toEqual({
			endpoint: 'https://app.lucrtrade.com/api/obsidian/logout/',
			status: 503,
			code: 'auth_unavailable',
			bodyKeys: ['code'],
			responseLength: 27,
		})
		expect(JSON.stringify(error.mock.calls)).not.toContain('lj_token')
	})
})
