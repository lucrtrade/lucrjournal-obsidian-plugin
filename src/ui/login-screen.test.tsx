import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setCurrentLocaleSetting } from '../lang/helpers'
import * as login from '../session/login'
import * as storage from '../session/storage'

import { SessionGateScreen } from './login-screen'

import type { App } from 'obsidian'

vi.mock('../session/login')
vi.mock('../session/storage')

const app = {} as App
const onRecheck = vi.fn(async () => {})

describe('SessionGateScreen', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setCurrentLocaleSetting('en')
		vi.mocked(login.getJournalUpgradeUrl).mockReturnValue('https://app.lucrtrade.com/profile/?section=billing')
	})

	it('renders the sign-in action for a signed-out account', () => {
		vi.mocked(login.isSessionClaimPending).mockReturnValue(false)
		vi.mocked(storage.requiresJournalUpgrade).mockReturnValue(false)

		const markup = renderToStaticMarkup(<SessionGateScreen app={app} onRecheck={onRecheck} />)

		expect(markup).toContain('data-lj-screen="login"')
		expect(markup).toContain('data-lj-action="login"')
	})

	// @story [[lucrjournal/entitlement#^upgrade-gate-actions]] Covers account identity, billing handoff, and recheck on the upgrade gate.
	it('renders upgrade and subtle recheck actions when journal_basic is missing', () => {
		vi.mocked(login.isSessionClaimPending).mockReturnValue(false)
		vi.mocked(storage.requiresJournalUpgrade).mockReturnValue(true)
		vi.mocked(storage.getProfile).mockReturnValue({
			userId: 'u1',
			username: 'alice',
			displayName: 'Alice',
			avatarUrl: 'https://img/a.png',
			email: 'alice@example.com',
		})

		const markup = renderToStaticMarkup(<SessionGateScreen app={app} onRecheck={onRecheck} />)

		expect(markup).toContain('data-lj-screen="upgrade"')
		expect(markup).toContain('data-lj-account="avatar"')
		expect(markup).toContain('src="https://img/a.png"')
		expect(markup).toContain('data-lj-account="email"')
		expect(markup).toContain('alice@example.com')
		expect(markup).toContain('data-lj-action="upgrade"')
		expect(markup).toContain('href="https://app.lucrtrade.com/profile/?section=billing"')
		expect(markup).toContain('data-lj-action="recheck"')
		// renderToStaticMarkup escapes the apostrophe, so match past it.
		expect(markup).toContain('upgraded — check again')
	})

	// @story [[lucrjournal/session#^claim-loading]] Covers the visible busy state during callback claim.
	it('renders loading while the callback claim is pending', () => {
		vi.mocked(login.isSessionClaimPending).mockReturnValue(true)

		const markup = renderToStaticMarkup(<SessionGateScreen app={app} onRecheck={onRecheck} />)

		expect(markup).toContain('data-lj-screen="claim-loading"')
		expect(markup).toContain('aria-busy="true"')
	})
})
