import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import { handleAuthCallback, isSessionClaimPending, runSessionCheck, startLogin } from './login'
import * as pkce from './pkce'
import * as storage from './storage'

import type { AccountContext } from './account.generated'
import type { App } from 'obsidian'

vi.mock('./api')
vi.mock('./pkce')
vi.mock('./storage')
vi.mock('obsidian', () => ({
	Notice: vi.fn(),
	Platform: { isDesktop: true },
	apiVersion: '1.13.1',
	moment: { locale: () => 'en' },
}))

const app = { appId: '5bbbb19dfa9f730f' } as unknown as App
const context: AccountContext = {
	profile: {
		userId: 'u1',
		username: null,
		displayName: null,
		avatarUrl: null,
		email: 'alice@example.com',
	},
	entitlements: { features: ['journal_basic'] },
	plan: null,
	subscription: null,
	products: [],
}

describe('runSessionCheck', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.unstubAllGlobals()
	})

	// @story [[lucrjournal/session#^obsidian-device-id]] Covers forwarding the Obsidian app id to authorization.
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
			'https://app.lucrtrade.com/obsidian/authorize?state=state_1&plugin=lucrjournal&code_challenge=challenge_1&code_challenge_method=S256&device_id=5bbbb19dfa9f730f',
			'_blank',
		)
	})

	// @story [[lucrjournal/session#^callback-validation]] Covers refusing a callback with the wrong state.
	// @story [[lucrjournal/session#^auth-logs-redact-credentials]] Covers redaction of callback credentials.
	it('logs a mismatched auth callback through console.error without logging its values', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.mocked(storage.getPendingLogin).mockReturnValue({
			state: 'expected_state',
			codeVerifier: 'secret_verifier',
		})

		expect(await handleAuthCallback(app, '0.1.7', {
			code: 'secret_code',
			state: 'wrong_state',
		})).toBe('failed')
		expect(api.claimSession).not.toHaveBeenCalled()
		expect(error.mock.calls[0]?.[0]).toContain('session auth callback rejected')
		expect(error.mock.calls[0]?.[5]).toEqual({
			hasPendingLogin: true,
			hasCode: true,
			hasState: true,
			stateMatches: false,
		})
		expect(JSON.stringify(error.mock.calls)).not.toContain('secret_code')
		expect(JSON.stringify(error.mock.calls)).not.toContain('secret_verifier')
		expect(JSON.stringify(error.mock.calls)).not.toContain('wrong_state')
	})

	// @story [[lucrjournal/entitlement#^claim-entitlement-gate]] Covers retaining the claimed token behind the upgrade gate.
	it('renders the upgrade gate when the claimed account lacks journal_basic', async () => {
		const deniedContext: AccountContext = {
			...context,
			entitlements: { features: [] },
		}
		vi.mocked(storage.getPendingLogin).mockReturnValue({
			state: 'expected_state',
			codeVerifier: 'verifier',
		})
		vi.mocked(api.claimSession).mockResolvedValue({
			kind: 'entitlement_required',
			token: 'lj_token',
			context: deniedContext,
		})

		expect(await handleAuthCallback(app, '0.1.7', {
			code: 'code',
			state: 'expected_state',
		})).toBe('upgrade')
		expect(storage.setToken).toHaveBeenCalledWith(app, 'lj_token')
		expect(storage.denyJournalAccess).toHaveBeenCalledWith(app, deniedContext)
	})

	// @story [[lucrjournal/session#^active-claim-stored]] Covers storing an active claimed session.
	it('stores an active claimed session', async () => {
		vi.mocked(storage.getPendingLogin).mockReturnValue({
			state: 'expected_state',
			codeVerifier: 'verifier',
		})
		vi.mocked(api.claimSession).mockResolvedValue({
			kind: 'active',
			token: 'lj_token',
			context,
		})

		expect(await handleAuthCallback(app, '0.1.7', {
			code: 'code',
			state: 'expected_state',
		})).toBe('active')
		expect(storage.setToken).toHaveBeenCalledWith(app, 'lj_token')
		expect(storage.setAccountContext).toHaveBeenCalledWith(app, context)
	})

	// @story [[lucrjournal/session#^claim-with-verifier]] Covers starting a claim from a validated callback.
	// @story [[lucrjournal/session#^pending-cleared-after-claim]] Covers leaving pending state after the claim settles.
	it('exposes loading only while claim is pending', async () => {
		let resolveClaim!: (result: api.ClaimResult) => void
		vi.mocked(storage.getPendingLogin).mockReturnValue({
			state: 'expected_state',
			codeVerifier: 'verifier',
		})
		vi.mocked(api.claimSession).mockReturnValue(new Promise((resolve) => {
			resolveClaim = resolve
		}))

		const callback = handleAuthCallback(app, '0.1.7', {
			code: 'code',
			state: 'expected_state',
		})
		expect(isSessionClaimPending()).toBe(true)

		resolveClaim({ kind: 'failed' })
		await callback
		expect(isSessionClaimPending()).toBe(false)
	})

	// @story [[lucrjournal/session#^empty-token-signed-out]] Covers the no-token fast path.
	it('signs out when the token is absent', async () => {
		vi.mocked(storage.getToken).mockReturnValue(null)
		expect(await runSessionCheck(app)).toBe('signed_out')
		expect(api.checkSession).not.toHaveBeenCalled()
	})

	// @story [[lucrjournal/session#^invalid-session-cleared]] Covers clearing a revoked session.
	// @story [[lucrjournal/entitlement#^invalid-check-signs-out]] Covers signing out an explicitly revoked session.
	it('signs out when the session is revoked', async () => {
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({ kind: 'signed_out', reason: 'invalid_session' })
		expect(await runSessionCheck(app)).toBe('signed_out')
		expect(storage.clearSession).toHaveBeenCalledTimes(1)
	})

	// @story [[lucrjournal/entitlement#^entitlement-check-denies]] Covers retaining the token when journal access is removed.
	it('switches to the upgrade gate when journal_basic is removed', async () => {
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({
			kind: 'signed_out',
			reason: 'entitlement_required',
			context: null,
		})
		expect(await runSessionCheck(app)).toBe('signed_out')
		expect(storage.denyJournalAccess).toHaveBeenCalledWith(app, null)
		expect(storage.clearSession).not.toHaveBeenCalled()
	})

	// @story [[lucrjournal/entitlement#^ambiguous-check-keeps-state]] Covers preserving credentials for an ambiguous check.
	it('keeps the session silently on a network/ambiguous result', async () => {
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({ kind: 'keep' })
		expect(await runSessionCheck(app)).toBe('kept')
		expect(storage.clearSession).not.toHaveBeenCalled()
	})

	// @story [[lucrjournal/entitlement#^active-check-unlocks]] Covers refreshing cached account context for active access.
	it('refreshes the cached account context while active', async () => {
		vi.mocked(storage.getToken).mockReturnValue('lj_token')
		vi.mocked(api.checkSession).mockResolvedValue({ kind: 'active', context })
		expect(await runSessionCheck(app)).toBe('active')
		expect(storage.setAccountContext).toHaveBeenCalledWith(app, context)
		expect(storage.clearSession).not.toHaveBeenCalled()
	})
})
