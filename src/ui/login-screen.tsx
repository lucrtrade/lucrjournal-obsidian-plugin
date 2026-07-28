import { type App } from 'obsidian'
import { type KeyboardEvent, useState } from 'react'

import { t } from '../lang/helpers'
import { getJournalUpgradeUrl, isSessionClaimPending, startLogin } from '../session/login'
import { getProfile, requiresJournalUpgrade } from '../session/storage'

type LoginScreenProps = {
	app: App
}

type SessionGateScreenProps = LoginScreenProps & {
	onRecheck: () => Promise<void>
}

export function SessionGateScreen({ app, onRecheck }: SessionGateScreenProps) {
	if (isSessionClaimPending()) {
		return <ClaimLoadingScreen />
	}

	if (requiresJournalUpgrade(app)) {
		return <UpgradeScreen app={app} onRecheck={onRecheck} />
	}

	return <LoginScreen app={app} />
}

function ClaimLoadingScreen() {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="lj-login-screen"
			data-lj-screen="claim-loading"
		>
			<div className="lj-login-card lj-claim-card">
				<h2 className="lj-login-title">
					{t('SESSION_CLAIM_LOADING_TITLE')}
				</h2>
				<p className="lj-upgrade-description">
					{t('SESSION_CLAIM_LOADING_DESCRIPTION')}
				</p>
				<progress
					aria-label={t('SESSION_CLAIM_LOADING_TITLE')}
					className="lj-claim-progress"
				/>
			</div>
		</div>
	)
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

function UpgradeScreen({ app, onRecheck }: SessionGateScreenProps) {
	const profile = getProfile(app)
	const initial = profile?.email?.trim().charAt(0)
	const [checking, setChecking] = useState(false)
	const recheck = async () => {
		setChecking(true)
		try {
			await onRecheck()
		} finally {
			setChecking(false)
		}
	}

	return (
		<div
			className="lj-login-screen"
			data-lj-screen="upgrade"
		>
			<div className="lj-login-card lj-upgrade-card">
				<div className="lj-upgrade-account">
					<span
						className="lj-upgrade-avatar"
						data-lj-account="avatar"
					>
						{profile?.avatarUrl
							? <img alt="" src={profile.avatarUrl} />
							: initial ? initial.toUpperCase() : '?'}
					</span>
					{profile?.email
						? (
							<span
								className="lj-upgrade-email"
								data-lj-account="email"
							>
								{profile.email}
							</span>
						)
						: null}
				</div>
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
						href={getJournalUpgradeUrl()}
						rel="noreferrer"
						target="_blank"
					>
						{t('SESSION_UPGRADE_BUTTON')}
					</a>
					<button
						className="lj-upgrade-recheck"
						data-lj-action="recheck"
						disabled={checking}
						onClick={() => void recheck()}
						type="button"
					>
						{checking ? t('SESSION_UPGRADE_RECHECKING') : t('SESSION_UPGRADE_RECHECK')}
					</button>
				</div>
			</div>
		</div>
	)
}
