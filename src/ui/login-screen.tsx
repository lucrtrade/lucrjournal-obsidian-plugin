import { type App } from 'obsidian'
import { type KeyboardEvent } from 'react'

import { t } from '../lang/helpers'
import { startLogin } from '../session/login'

type LoginScreenProps = {
	app: App
}

export function LoginScreen({ app }: LoginScreenProps) {
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
