import { beforeEach, describe, expect, it } from 'vitest'

import {
	denyJournalAccess,
	getProfile,
	getToken,
	requiresJournalUpgrade,
	setAccountContext,
	setToken,
} from './storage'

import type { App } from 'obsidian'

const secrets = new Map<string, string>()
const localStorage = new Map<string, unknown>()
const app = {
	secretStorage: {
		getSecret: (key: string) => secrets.get(key) ?? '',
		setSecret: (key: string, value: string) => secrets.set(key, value),
	},
	loadLocalStorage: (key: string) => localStorage.get(key),
	saveLocalStorage: (key: string, value: unknown) => localStorage.set(key, value),
} as unknown as App

describe('journal access storage', () => {
	beforeEach(() => {
		secrets.clear()
		localStorage.clear()
	})

	it('distinguishes a missing entitlement from an ordinary signed-out session', () => {
		setToken(app, 'lj_token')
		denyJournalAccess(app, null)
		expect(getToken(app)).toBe('lj_token')
		expect(requiresJournalUpgrade(app)).toBe(true)

		setToken(app, 'next_token')
		expect(requiresJournalUpgrade(app)).toBe(false)
	})

	it('keeps the profile when an entitlement check returns no context', () => {
		setToken(app, 'lj_token')
		setAccountContext(app, {
			profile: {
				userId: 'u1',
				username: 'alice',
				displayName: 'Alice',
				avatarUrl: 'https://img/a.png',
				email: 'alice@example.com',
			},
			entitlements: { features: [] },
			plan: null,
			products: [],
		})

		denyJournalAccess(app, null)

		expect(getProfile(app)).toEqual({
			userId: 'u1',
			username: 'alice',
			displayName: 'Alice',
			avatarUrl: 'https://img/a.png',
			email: 'alice@example.com',
		})
		expect(requiresJournalUpgrade(app)).toBe(true)
	})
})
