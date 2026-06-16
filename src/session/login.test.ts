import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import { runSessionCheck, startLogin } from './login'
import * as pkce from './pkce'
import * as storage from './storage'

import type { App } from 'obsidian'

vi.mock('./api')
vi.mock('./pkce')
vi.mock('./storage')

const app = {} as unknown as App

describe('runSessionCheck', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.unstubAllGlobals()
	})

	it('opens authorize directly so an existing web session can be reused', async () => {
		const open = vi.fn()
		vi.stubGlobal('window', { open })
		vi.mocked(pkce.createPkcePair).mockResolvedValue({
			state: 'state_1',
			codeVerifier: 'verifier_1',
			codeChallenge: 'challenge_1',
		})

		await startLogin(app)

		expect(storage.setPendingLogin).toHaveBeenCalledWith(app, {
			state: 'state_1',
			codeVerifier: 'verifier_1',
		})
		expect(open).toHaveBeenCalledWith(
			'https://app.lucrtrade.com/obsidian/authorize?state=state_1&plugin=lucrjournal&code_challenge=challenge_1&code_challenge_method=S256',
			'_blank',
		)
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
