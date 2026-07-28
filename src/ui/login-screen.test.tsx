import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setCurrentLocaleSetting } from '../lang/helpers'
import * as storage from '../session/storage'

import { SessionGateScreen } from './login-screen'

import type { App } from 'obsidian'

vi.mock('../session/login')
vi.mock('../session/storage')

const app = {} as App

describe('SessionGateScreen', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setCurrentLocaleSetting('en')
	})

	it('renders the sign-in action for a signed-out account', () => {
		vi.mocked(storage.requiresJournalUpgrade).mockReturnValue(false)

		const markup = renderToStaticMarkup(<SessionGateScreen app={app} />)

		expect(markup).toContain('data-lj-screen="login"')
		expect(markup).toContain('data-lj-action="login"')
	})

	it('renders upgrade and subtle recheck actions when journal_basic is missing', () => {
		vi.mocked(storage.requiresJournalUpgrade).mockReturnValue(true)

		const markup = renderToStaticMarkup(<SessionGateScreen app={app} />)

		expect(markup).toContain('data-lj-screen="upgrade"')
		expect(markup).toContain('data-lj-action="upgrade"')
		expect(markup).toContain('href="https://app.lucrtrade.com/profile/?section=billing"')
		expect(markup).toContain('data-lj-action="recheck"')
		expect(markup).toContain('Check again')
	})
})
