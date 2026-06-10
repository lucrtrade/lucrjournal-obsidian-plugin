import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import { runSessionCheck } from './login'
import * as storage from './storage'

import type { App } from 'obsidian'

vi.mock('./api')
vi.mock('./storage')

const app = {} as unknown as App

describe('runSessionCheck', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('signs out when the token is absent', async () => {
		vi.mocked(storage.getToken).mockReturnValue(null)
		expect(await runSessionCheck(app)).toBe('signed_out')
		expect(api.checkSession).not.toHaveBeenCalled()
	})

	it('signs out when the session is revoked', async () => {
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({ kind: 'revoked' })
		expect(await runSessionCheck(app)).toBe('signed_out')
		expect(storage.clearSession).toHaveBeenCalledTimes(1)
	})

	it('signs out when the account is disabled', async () => {
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({ kind: 'account_disabled' })
		expect(await runSessionCheck(app)).toBe('signed_out')
		expect(storage.clearSession).toHaveBeenCalledTimes(1)
	})

	it('keeps the session silently on a network/ambiguous result', async () => {
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({ kind: 'keep' })
		expect(await runSessionCheck(app)).toBe('kept')
		expect(storage.clearSession).not.toHaveBeenCalled()
	})

	it('refreshes the cached profile while active', async () => {
		const profile = {
			userId: 'u1',
			username: null,
			displayName: null,
			avatarUrl: null,
			email: 'alice@example.com',
		}
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({ kind: 'active', profile })
		expect(await runSessionCheck(app)).toBe('active')
		expect(storage.setProfile).toHaveBeenCalledWith(app, profile)
		expect(storage.clearSession).not.toHaveBeenCalled()
	})
})
