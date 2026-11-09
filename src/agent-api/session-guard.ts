import { getToken, requiresJournalUpgrade } from '../session/storage'

import { agentError } from './errors'

import type { App } from 'obsidian'

/**
 * Every LucrJournal view is gated behind the account session, so an agent that
 * writes a position while signed out would produce files the user cannot see.
 * Fail before writing instead of reporting a success nobody can open.
 */
export function assertAgentSession(app: App): void {
	if (getToken(app) === null) {
		throw agentError(
			'JOURNAL_LOCKED',
			'LucrJournal is not signed in in this vault, so every journal view shows the sign-in screen instead of the record; nothing was written.',
			'Ask the user to open LucrJournal in Obsidian and sign in, then retry the same call.',
		)
	}

	if (requiresJournalUpgrade(app)) {
		throw agentError(
			'JOURNAL_LOCKED',
			'This LucrJournal account is signed in but its journal access is denied (subscription expired or removed), so the position view would show the upgrade screen; nothing was written.',
			'Ask the user to restore their LucrJournal access in Obsidian, then retry the same call.',
		)
	}
}
