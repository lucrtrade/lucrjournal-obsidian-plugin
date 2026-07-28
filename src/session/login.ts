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

function clientInfo(pluginVersion: string): ClientInfo {
	return {
		pluginId: 'lucrjournal',
		pluginVersion,
		obsidianVersion: apiVersion,
		platform: Platform.isDesktop ? 'desktop' : 'mobile',
	}
}

export async function startLogin(app: App): Promise<void> {
	try {
		const { state, codeVerifier, codeChallenge } = await createPkcePair()
		setPendingLogin(app, { state, codeVerifier })
		const url = `${APP_URL}/obsidian/authorize?state=${state}&plugin=lucrjournal&code_challenge=${codeChallenge}&code_challenge_method=S256`
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
	if (pending == null || params.code == null || params.state !== pending.state) {
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
	const result = await claimSession(params.code, pending.codeVerifier, clientInfo(pluginVersion)).finally(() => {
		sessionClaimPending = false
		clearPendingLogin(app)
	})
	if (result.kind === 'failed') {
		new Notice(t('SESSION_LOGIN_FAILED'))
		return 'failed'
	}
	if (result.kind === 'entitlement_required') {
		setToken(app, result.token)
		denyJournalAccess(app, result.context)
		new Notice(t('SESSION_UPGRADE_REQUIRED'))
		return 'upgrade'
	}
	setToken(app, result.token)
	setAccountContext(app, result.context)
	new Notice(t('SESSION_LOGIN_SUCCESS'))
	return 'active'
}

export type SessionCheckOutcome = 'active' | 'kept' | 'signed_out'

export async function runSessionCheck(app: App): Promise<SessionCheckOutcome> {
	const token = getToken(app)
	if (token == null) {
		return 'signed_out'
	}
	const result = await checkSession(token)
	switch (result.kind) {
		case 'active':
			setAccountContext(app, result.context)
			return 'active'
		case 'signed_out':
			if (result.reason === 'entitlement_required') {
				denyJournalAccess(app, null)
				new Notice(t('SESSION_UPGRADE_REQUIRED'))
			} else {
				clearSession(app)
				new Notice(t('SESSION_SIGNED_OUT'))
			}
			return 'signed_out'
		case 'keep':
			return 'kept'
		default:
			result satisfies never
			throw new Error('Unknown result kind')
	}
}
