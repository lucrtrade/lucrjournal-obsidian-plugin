import { AccountDomain, type IconDescriptor } from '../domains'
import { getFileBasename } from '../utils'

import { IconView } from './primitives/icon-view'
import { ObsidianIcon } from './primitives/obsidian-icon'

import type { App } from 'obsidian'

const ACCOUNT_FALLBACK_ICON = AccountDomain.resolveIcon()

function resolveAccountInlinePresentation(
	app: App,
	value: string | null | undefined,
): { label: string; icon: IconDescriptor } | null {
	if (value == null) {
		return null
	}

	const linkpath = parseAccountLinkpath(value)
	const matchedAccount = AccountDomain.totalEntries(app)
		.find(({ file }) => getFileBasename(file) === linkpath)

	if (matchedAccount !== undefined) {
		return {
			label: AccountDomain.toDisplayName(matchedAccount.fm),
			icon: AccountDomain.resolveDisplayIcon(app, matchedAccount.fm),
		}
	}

	return {
		label: linkpath,
		icon: ACCOUNT_FALLBACK_ICON,
	}
}

export function AccountInlineValue({
	app,
	value,
	className = '',
	iconClassName = 'lj:size-3.5',
	fallbackIconClassName = 'lj:size-3 lj:shrink-0 lj:text-lj-c-hint',
}: {
	app: App
	value: string | null | undefined
	className?: string
	iconClassName?: string
	fallbackIconClassName?: string
}) {
	const presentation = resolveAccountInlinePresentation(app, value)

	return (
		<div className={`lj:flex lj:min-w-0 lj:items-center lj:gap-2 lj:text-lj-c-tertiary ${className}`.trim()}>
			{presentation == null
				? <ObsidianIcon name="wallet" className={fallbackIconClassName} />
				: <IconView icon={presentation.icon} className={iconClassName} />}
			<span className="lj:min-w-0 lj:flex-1 lj:truncate">{presentation?.label ?? '-'}</span>
		</div>
	)
}

function parseAccountLinkpath(value: string): string {
	const match = /^\[\[([^|\]]+)(?:\|[^\]]*)?\]\]$/.exec(value.trim())
	return match?.[1]?.trim() ?? value.trim()
}
