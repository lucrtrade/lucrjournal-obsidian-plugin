import type { AccountContext, AccountProfile } from './account.generated'
import type { App } from 'obsidian'

const TOKEN_SECRET_ID = 'lucrjournal-session'
const ACCOUNT_CONTEXT_KEY = 'lucrjournal-account-context'
const PENDING_KEY = 'lucrjournal-pending-login'
const ACCESS_DENIED_KEY = 'lucrjournal-access-denied'

export type SessionProfile = AccountProfile
export type PendingLogin = { state: string; codeVerifier: string }

export function getToken(app: App): string | null {
	const v = app.secretStorage.getSecret(TOKEN_SECRET_ID)
	return v === '' ? null : v
}

export function setToken(app: App, token: string): void {
	app.secretStorage.setSecret(TOKEN_SECRET_ID, token)
	app.saveLocalStorage(ACCESS_DENIED_KEY, false)
}

export function clearSession(app: App): void {
	app.secretStorage.setSecret(TOKEN_SECRET_ID, '')
	app.saveLocalStorage(ACCOUNT_CONTEXT_KEY, null)
	app.saveLocalStorage(ACCESS_DENIED_KEY, false)
}

export function denyJournalAccess(app: App, context: AccountContext | null): void {
	if (context !== null) {
		app.saveLocalStorage(ACCOUNT_CONTEXT_KEY, context)
	}
	app.saveLocalStorage(ACCESS_DENIED_KEY, true)
}

export function requiresJournalUpgrade(app: App): boolean {
	return getToken(app) !== null && app.loadLocalStorage(ACCESS_DENIED_KEY) === true
}

export function setAccountContext(app: App, context: AccountContext): void {
	app.saveLocalStorage(ACCOUNT_CONTEXT_KEY, context)
	app.saveLocalStorage(ACCESS_DENIED_KEY, false)
}

export function getAccountContext(app: App): AccountContext | null {
	return app.loadLocalStorage(ACCOUNT_CONTEXT_KEY) as AccountContext | null
}

export function getProfile(app: App): SessionProfile | null {
	return getAccountContext(app)?.profile ?? null
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
