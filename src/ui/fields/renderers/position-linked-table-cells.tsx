import { t } from '../../../lang/helpers'

import type { PositionTableLazyContent } from '../../../domains'
import type { LinkActivationEvent } from '../../../views/link-activation'
import type { MouseEvent } from 'react'

function PositionLazyPlaceholder() {
	return (
		<div className="lj:px-1">
			<span className="lj:inline-flex lj:h-5 lj:w-20 lj:animate-pulse lj:rounded-full lj:bg-lj-alpha-5" />
		</div>
	)
}

export function PositionPlaybooksCell({
	content,
	onSelectPlaybook,
}: {
	content: PositionTableLazyContent | undefined
	onSelectPlaybook?: (filePath: string, event?: LinkActivationEvent) => void
}) {
	if (content === undefined) {
		return <PositionLazyPlaceholder /> 
	}
	if (content.playbook === null) {
		return <span className="lj:text-lj-c-muted-faint">-</span> 
	}
	const { playbook } = content

	const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation()
		onSelectPlaybook?.(playbook.file.path, event)
	}

	return (
		<div className="lj:flex lj:min-w-0 lj:px-1">
			<button
				type="button"
				onClick={handleClick}
				className="lj:min-w-0 lj:max-w-full lj:appearance-none lj:border-0 lj:bg-transparent lj:p-0 lj:text-left lj:text-[11px] lj:font-medium lj:text-lj-c-secondary lj:underline-offset-2 lj:transition-colors lj:hover:text-lj-c-strong lj:hover:underline lj:focus-visible:rounded-sm lj:focus-visible:outline-none lj:focus-visible:ring-2 lj:focus-visible:ring-lj-alpha-15"
			>
				<span className="lj:block lj:truncate">{playbook.label}</span>
			</button>
		</div>
	)
}

export function PositionLinkedGroupsCell({ content }: { content: PositionTableLazyContent | undefined }) {
	if (content === undefined) {
		return <PositionLazyPlaceholder /> 
	}
	const groups = [
		{ label: t('TAB_NEWS'), values: content.news },
		{ label: t('TAB_KEY_LEVEL'), values: content.keyLevels },
		{ label: t('TAB_CONFLUENCE'), values: content.confluence },
		{ label: t('TAB_MARKET_ANALYSIS'), values: content.marketAnalyses },
	].filter((group) => group.values.length > 0)

	if (groups.length === 0) {
		return <span className="lj:text-lj-c-muted-faint">-</span> 
	}

	return (
		<div className="lj:flex lj:flex-col lj:gap-1 lj:px-1">
			{groups.map((group) => (
				<div key={group.label} className="lj:flex lj:min-w-0 lj:items-start lj:gap-2">
					<span className="lj:shrink-0 lj:text-[10px] lj:uppercase lj:tracking-wide lj:text-lj-c-hint">{group.label}</span>
					<span className="lj:min-w-0 lj:flex-1 lj:truncate lj:text-lj-c-secondary">{group.values.map((value) => value.label).join(', ')}</span>
				</div>
			))}
		</div>
	)
}
