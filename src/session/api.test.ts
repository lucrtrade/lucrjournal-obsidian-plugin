import * as Obsidian from 'obsidian'
import { describe, expect, it, vi } from 'vitest'

import { claimSession, mapCheckResponse, revokeSession } from './api'

const context = {
	profile: { userId: 'u', username: null, displayName: null, avatarUrl: null, email: null },
	entitlements: {
		features: ['journal_basic'],
	},
	plan: null,
	products: [],
} as const

describe('mapCheckResponse', () => {
	it('active', () => {
		expect(mapCheckResponse(200, { status: 'active', ...context }))
			.toEqual({ kind: 'active', context })
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
	it('missing journal_basic -> signed_out', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			entitlements: { features: [] },
		})).toEqual({ kind: 'signed_out' })
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
	it('unknown plan -> keep', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			plan: { key: 'future_plan', status: 'active' },
		})).toEqual({ kind: 'keep' })
	})
	it('unknown subscription status -> keep', () => {
		expect(mapCheckResponse(200, {
			status: 'active',
			...context,
			plan: { key: 'pro', status: 'future_status' },
		})).toEqual({ kind: 'keep' })
	})
	it('revoked', () => {
		expect(mapCheckResponse(401, { status: 'revoked', code: 'revoked' })).toEqual({ kind: 'signed_out' })
	})
	it('account_disabled', () => {
		expect(mapCheckResponse(403, { status: 'account_disabled', code: 'account_disabled' }))
			.toEqual({ kind: 'signed_out' })
	})
	it('invalid_token -> signed_out', () => {
		expect(mapCheckResponse(401, { code: 'invalid_token' })).toEqual({ kind: 'signed_out' })
	})
	it('lucrjournal_entitlement_required -> signed_out', () => {
		expect(mapCheckResponse(403, {
			status: 'entitlement_required',
			code: 'lucrjournal_entitlement_required',
		})).toEqual({ kind: 'signed_out' })
	})
	it('5xx -> keep', () => {
		expect(mapCheckResponse(500, null)).toEqual({ kind: 'keep' })
	})
	it('non-json -> keep', () => {
		expect(mapCheckResponse(200, null)).toEqual({ kind: 'keep' })
	})
})

describe('claimSession', () => {
	it('rejects a claim without journal_basic', async () => {
		vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
			status: 200,
			text: JSON.stringify({
				token: 'lj_token',
				...context,
				entitlements: { features: [] },
			}),
		} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)

		expect(await claimSession('code', 'verifier', {
			pluginId: 'lucrjournal',
			pluginVersion: '0.1.5',
			obsidianVersion: '1.13.1',
			platform: 'desktop',
		})).toBeNull()
	})
})

describe('revokeSession', () => {
	it('posts json so Astro does not treat the cross-site request as a form submission', async () => {
		const requestUrl = vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
			status: 200,
			text: '{}',
		} as Awaited<ReturnType<typeof Obsidian.requestUrl>>)

		await revokeSession('lj_token')

		expect(requestUrl).toHaveBeenCalledWith({
			url: 'https://app.lucrtrade.com/api/obsidian/logout',
			method: 'POST',
			headers: { Authorization: 'Bearer lj_token' },
			contentType: 'application/json',
			body: '{}',
			throw: false,
		})
	})
})
