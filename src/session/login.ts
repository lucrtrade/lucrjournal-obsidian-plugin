import { Notice, Platform, apiVersion } from 'obsidian'

import { APP_URL } from '../constant'
import { t } from '../lang/helpers'

import { checkSession, claimSession } from './api'
import { createPkcePair } from './pkce'
import { clearPendingLogin, clearSession, getPendingLogin, getToken, setAccountContext, setPendingLogin, setToken } from './storage'

import type { ClientInfo } from './api'
import type { App } from 'obsidian'

function clientInfo(pluginVersion: string): ClientInfo {
	return {
		pluginId: 'lucrjournal',
		pluginVersion,
		obsidianVersion: apiVersion,
		platform: Platform.isDesktop ? 'desktop' : 'mobile',
	}
}

export async function startLogin(app: App): Promise<void> {
	const { state, codeVerifier, codeChallenge } = await createPkcePair()
	setPendingLogin(app, { state, codeVerifier })
	const url = `${APP_URL}/obsidian/authorize?state=${state}&plugin=lucrjournal&code_challenge=${codeChallenge}&code_challenge_method=S256`
	window.open(url, '_blank')
}

export async function handleAuthCallback(
	app: App,
	pluginVersion: string,
	params: { code?: string; state?: string },
): Promise<boolean> {
	const pending = getPendingLogin(app)
	if (pending == null || params.code == null || params.state !== pending.state) {
		new Notice(t('SESSION_LOGIN_REJECTED'))
		return false
	}
	const result = await claimSession(params.code, pending.codeVerifier, clientInfo(pluginVersion))
	clearPendingLogin(app)
	if (result == null) {
		new Notice(t('SESSION_LOGIN_FAILED'))
		return false
	}
	setToken(app, result.token)
	setAccountContext(app, result.context)
	new Notice(t('SESSION_LOGIN_SUCCESS'))
	return true
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
			clearSession(app)
			new Notice(t('SESSION_SIGNED_OUT'))
			return 'signed_out'
		case 'keep':
			return 'kept'
		default:
			result satisfies never
			throw new Error('Unknown result kind')
	}
}
