import { describe, expect, it, vi } from 'vitest'

import LucrJournalPlugin from './main'

vi.mock('./session/api', () => ({
	revokeSession: vi.fn(),
}))

describe('LucrJournalPlugin logout', () => {
	it('refreshes settings after clearing the local session', () => {
		let token = 'lj_token'
		const plugin = Object.create(LucrJournalPlugin.prototype) as LucrJournalPlugin
		const refresh = vi.fn()
		Object.assign(plugin, {
			app: {
				secretStorage: {
					getSecret: () => token,
					setSecret: (_id: string, value: string) => {
						token = value
					},
				},
				saveLocalStorage: vi.fn(),
			},
			requestJournalViewsRender: vi.fn(),
			settingsTab: { refresh },
		})

		plugin.logout()

		expect(token).toBe('')
		expect(refresh).toHaveBeenCalledTimes(1)
	})
})
