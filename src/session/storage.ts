import type { App } from 'obsidian'

const TOKEN_SECRET_ID = 'lucrjournal-session'
const PROFILE_KEY = 'lucrjournal-session-profile'
const PENDING_KEY = 'lucrjournal-pending-login'

export type SessionProfile = {
	userId: string
	username: string | null
	displayName: string | null
	avatarUrl: string | null
}
export type PendingLogin = { state: string; codeVerifier: string }

export function getToken(app: App): string | null {
	const v = app.secretStorage.getSecret(TOKEN_SECRET_ID)
	return v === '' ? null : v
}

export function setToken(app: App, token: string): void {
	app.secretStorage.setSecret(TOKEN_SECRET_ID, token)
}

export function clearSession(app: App): void {
	app.secretStorage.setSecret(TOKEN_SECRET_ID, '')
	app.saveLocalStorage(PROFILE_KEY, null)
}

export function setProfile(app: App, profile: SessionProfile): void {
	app.saveLocalStorage(PROFILE_KEY, profile)
}

export function getPendingLogin(app: App): PendingLogin | null {
	return app.loadLocalStorage(PENDING_KEY) as PendingLogin | null
}

export function setPendingLogin(app: App, pending: PendingLogin): void {
	app.saveLocalStorage(PENDING_KEY, pending)
}

export function clearPendingLogin(app: App): void {
	app.saveLocalStorage(PENDING_KEY, null)
}
