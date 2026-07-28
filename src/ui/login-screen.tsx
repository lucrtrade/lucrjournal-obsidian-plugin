import { type App } from 'obsidian'
import { type KeyboardEvent } from 'react'

import { APP_URL } from '../constant'
import { getCurrentLocale, t } from '../lang/helpers'
import { startLogin } from '../session/login'
import { requiresJournalUpgrade } from '../session/storage'

type LoginScreenProps = {
	app: App
}

export function SessionGateScreen({ app }: LoginScreenProps) {
	if (requiresJournalUpgrade(app)) {
		return <UpgradeScreen app={app} />
	}

	return <LoginScreen app={app} />
}

function LoginScreen({ app }: LoginScreenProps) {
	const login = () => {
		void startLogin(app)
	}
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return
		}
		event.preventDefault()
		login()
	}

	return (
		<div
			className="lj-login-screen"
			data-lj-screen="login"
		>
			<div
				aria-label={t('SESSION_LOGIN_BUTTON')}
				className="lj-login-card"
				data-lj-action="login"
				onClick={login}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
			>
				<h2 className="lj-login-title">
					{t('SESSION_LOGIN_TITLE')}
				</h2>
				<div
					aria-hidden="true"
					className="lj-login-button"
				>
					<span>{t('SESSION_LOGIN_BUTTON')}</span>
				</div>
			</div>
		</div>
	)
}

function UpgradeScreen({ app }: LoginScreenProps) {
	const billingPath = getCurrentLocale() === 'zh' ? '/zh/profile/' : '/profile/'

	return (
		<div
			className="lj-login-screen"
			data-lj-screen="upgrade"
		>
			<div className="lj-login-card lj-upgrade-card">
				<h2 className="lj-login-title">
					{t('SESSION_UPGRADE_TITLE')}
				</h2>
				<p className="lj-upgrade-description">
					{t('SESSION_UPGRADE_DESCRIPTION')}
				</p>
				<div className="lj-upgrade-actions">
					<a
						className="lj-login-button"
						data-lj-action="upgrade"
						href={`${APP_URL}${billingPath}?section=billing`}
						rel="noreferrer"
						target="_blank"
					>
						{t('SESSION_UPGRADE_BUTTON')}
					</a>
					<button
						className="lj-upgrade-recheck"
						data-lj-action="recheck"
						onClick={() => void startLogin(app)}
						type="button"
					>
						{t('SESSION_UPGRADE_RECHECK')}
					</button>
				</div>
			</div>
		</div>
	)
}
