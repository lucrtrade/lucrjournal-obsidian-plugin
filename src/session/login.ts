import { Notice, Platform, apiVersion } from 'obsidian'

import { APP_URL } from '../constant'
import { t } from '../lang/helpers'

import { checkSession, claimSession, logoutSession } from './api'
import { createPkcePair } from './pkce'
import { clearPendingLogin, clearSession, getPendingLogin, getToken, setPendingLogin, setProfile, setToken } from './storage'

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
	const callback = `/obsidian/authorize?state=${state}&plugin=lucrjournal&code_challenge=${codeChallenge}&code_challenge_method=S256`
	const url = `${APP_URL}/login?next=${encodeURIComponent(callback)}`
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
	setProfile(app, result.profile)
	new Notice(t('SESSION_LOGIN_SUCCESS'))
	return true
}

export async function runSessionCheck(app: App): Promise<void> {
	const token = getToken(app)
	if (token == null) {
		return
	}
	const result = await checkSession(token)
	switch (result.kind) {
		case 'active':
			setProfile(app, result.profile)
			break
		case 'revoked':
		case 'account_disabled':
			clearSession(app)
			new Notice(t('SESSION_SIGNED_OUT'))
			await startLogin(app)
			break
		case 'keep':
			break
		default:
			result satisfies never
			throw new Error('Unknown result kind')
	}
}

export async function logout(app: App): Promise<void> {
	const token = getToken(app)
	if (token != null) {
		await logoutSession(token)
	}
	clearSession(app)
	new Notice(t('SESSION_SIGNED_OUT'))
}

export async function switchAccount(app: App): Promise<void> {
	await logout(app)
	await startLogin(app)
}
