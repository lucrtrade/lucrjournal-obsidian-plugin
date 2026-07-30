import { Notice, Platform, apiVersion } from 'obsidian'

import { APP_URL } from '../constant'
import { getCurrentLocale, t } from '../lang/helpers'
import { createLogger } from '../logger'

import { checkSession, claimSession } from './api'
import { createPkcePair } from './pkce'
import { clearPendingLogin, clearSession, denyJournalAccess, getPendingLogin, getToken, setAccountContext, setPendingLogin, setToken } from './storage'

import type { ClientInfo } from './api'
import type { App } from 'obsidian'

const logger = createLogger('session')
let sessionClaimPending = false

// @story [[lucrjournal/session#^obsidian-device-id]] Uses Obsidian's stable app identity without a generated fallback.
function deviceId(app: App): string {
	const value = (app as App & { appId?: string }).appId
	if (!value) {
		throw new Error('Obsidian appId unavailable')
	}
	return value
}

function clientInfo(app: App, pluginVersion: string): ClientInfo {
	return {
		deviceId: deviceId(app),
		pluginId: 'lucrjournal',
		pluginVersion,
		obsidianVersion: apiVersion,
		platform: Platform.isDesktop ? 'desktop' : 'mobile',
	}
}

export async function startLogin(app: App): Promise<void> {
	try {
		const { state, codeVerifier, codeChallenge } = await createPkcePair()
		const currentDeviceId = deviceId(app)
		// @story [[lucrjournal/session#^login-handoff]] Persists the pending login before opening the browser authorization URL.
		// @story [[lucrjournal/session#^pkce-s256]] Declares the S256 challenge method on the authorization request.
		setPendingLogin(app, { state, codeVerifier })
		const url = `${APP_URL}/obsidian/authorize?state=${state}&plugin=lucrjournal&code_challenge=${codeChallenge}&code_challenge_method=S256&device_id=${currentDeviceId}`
		window.open(url, '_blank')
	} catch (error: unknown) {
		logger.error('session login start failed', { error })
		new Notice(t('SESSION_LOGIN_FAILED'))
	}
}

export type AuthCallbackOutcome = 'active' | 'upgrade' | 'failed'

export function isSessionClaimPending(): boolean {
	return sessionClaimPending
}

export function getJournalUpgradeUrl(): string {
	return `${APP_URL}${getCurrentLocale() === 'zh' ? '/zh/profile/' : '/profile/'}?section=billing`
}

export async function handleAuthCallback(
	app: App,
	pluginVersion: string,
	params: { code?: string; state?: string },
): Promise<AuthCallbackOutcome> {
	const pending = getPendingLogin(app)
	// @story [[lucrjournal/session#^callback-validation]] Rejects callbacks that cannot be bound to the pending login.
	if (pending == null || params.code == null || params.state !== pending.state) {
		// @story [[lucrjournal/session#^auth-logs-redact-credentials]] Logs callback shape without logging credential values.
		logger.error('session auth callback rejected', {
			hasPendingLogin: pending !== null,
			hasCode: params.code !== undefined,
			hasState: params.state !== undefined,
			stateMatches: pending !== null && params.state === pending.state,
		})
		new Notice(t('SESSION_LOGIN_REJECTED'))
		return 'failed'
	}
	sessionClaimPending = true
	// @story [[lucrjournal/session#^claim-with-verifier]] Claims the session with the callback code and stored verifier.
	// @story [[lucrjournal/session#^pending-cleared-after-claim]] Clears one-time login material after every settled claim.
	const result = await claimSession(params.code, pending.codeVerifier, clientInfo(app, pluginVersion)).finally(() => {
		sessionClaimPending = false
		clearPendingLogin(app)
	})
	if (result.kind === 'failed') {
		new Notice(t('SESSION_LOGIN_FAILED'))
		return 'failed'
	}
	if (result.kind === 'entitlement_required') {
		// @story [[lucrjournal/entitlement#^claim-entitlement-gate]] Keeps the claimed identity while denying journal access.
		setToken(app, result.token)
		denyJournalAccess(app, result.context)
		new Notice(t('SESSION_UPGRADE_REQUIRED'))
		return 'upgrade'
	}
	// @story [[lucrjournal/session#^active-claim-stored]] Persists the active token and account context together.
	setToken(app, result.token)
	setAccountContext(app, result.context)
	new Notice(t('SESSION_LOGIN_SUCCESS'))
	return 'active'
}

export type SessionCheckOutcome = 'active' | 'kept' | 'signed_out'

export async function runSessionCheck(app: App): Promise<SessionCheckOutcome> {
	const token = getToken(app)
	// @story [[lucrjournal/session#^empty-token-signed-out]] Avoids a remote check when no secret token exists.
	if (token == null) {
		return 'signed_out'
	}
	const result = await checkSession(token)
	switch (result.kind) {
		case 'active':
			// @story [[lucrjournal/entitlement#^active-check-unlocks]] Refreshes context and removes the upgrade gate for active access.
			setAccountContext(app, result.context)
			return 'active'
		case 'signed_out':
			if (result.reason === 'entitlement_required') {
				// @story [[lucrjournal/entitlement#^entitlement-check-denies]] Denies journal access without deleting the token.
				denyJournalAccess(app, result.context)
				new Notice(t('SESSION_UPGRADE_REQUIRED'))
			} else {
				// @story [[lucrjournal/session#^invalid-session-cleared]] Clears local credentials only for a definite invalid session.
				// @story [[lucrjournal/entitlement#^invalid-check-signs-out]] Clears the complete session for explicit invalidation.
				clearSession(app)
				new Notice(t('SESSION_SIGNED_OUT'))
			}
			return 'signed_out'
		case 'keep':
			// @story [[lucrjournal/entitlement#^ambiguous-check-keeps-state]] Leaves all stored access state untouched for ambiguous results.
			return 'kept'
		default:
			result satisfies never
			throw new Error('Unknown result kind')
	}
}
