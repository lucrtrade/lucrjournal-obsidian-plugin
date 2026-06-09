import { describe, expect, it } from 'vitest'

import { mapCheckResponse } from './api'

const minProfile = { userId: 'u', username: null, displayName: null, avatarUrl: null, email: null }

describe('mapCheckResponse', () => {
	it('active', () => {
		expect(mapCheckResponse(200, { status: 'active', profile: minProfile }))
			.toEqual({ kind: 'active', profile: minProfile })
	})
	it('revoked', () => {
		expect(mapCheckResponse(401, { status: 'revoked', code: 'revoked' })).toEqual({ kind: 'revoked' })
	})
	it('account_disabled', () => {
		expect(mapCheckResponse(403, { status: 'account_disabled', code: 'account_disabled' }))
			.toEqual({ kind: 'account_disabled' })
	})
	it('invalid_token -> keep', () => {
		expect(mapCheckResponse(401, { code: 'invalid_token' })).toEqual({ kind: 'keep' })
	})
	it('5xx -> keep', () => {
		expect(mapCheckResponse(500, null)).toEqual({ kind: 'keep' })
	})
	it('non-json -> keep', () => {
		expect(mapCheckResponse(200, null)).toEqual({ kind: 'keep' })
	})
})
