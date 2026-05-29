import { ObsidianIcon } from './obsidian-icon'

type DashboardEmptyStateProps = {
	icon: string
	title?: string
	description: string
	actionLabel: string
	onAction: () => void
}

export const DASHBOARD_EMPTY_STATE_ACTION_CLASS_NAME = 'lj:inline-flex lj:h-11 lj:appearance-none lj:items-center lj:justify-center lj:gap-2 lj:rounded-xl lj:border-0 lj:bg-lj-c-strong lj:px-6 lj:text-sm lj:font-medium lj:text-lj-c-inv lj:shadow-none lj:transition-[opacity,transform] lj:hover:opacity-95 lj:hover:-translate-y-px'

export function DashboardEmptyState({
	icon,
	title,
	description,
	actionLabel,
	onAction,
}: DashboardEmptyStateProps) {
	return (
		<div className="lj:flex lj:flex-1 lj:w-full lj:items-center lj:justify-center">
			<div className="lj-dashboard-meta-tab-shadow lj:flex lj:w-full lj:max-w-2xl lj:flex-col lj:items-center lj:justify-center lj:rounded-[32px] lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-empty lj:px-8 lj:py-14 lj:text-center">
				<div className="lj:mb-6 lj:flex lj:size-20 lj:items-center lj:justify-center lj:rounded-full lj:bg-lj-surf-card-muted lj:text-lj-c-secondary-max">
					<ObsidianIcon name={icon} className="lj:size-9" />
				</div>
				{title == null ? null : (
					<h2 className="lj:text-3xl lj:font-light lj:tracking-tight lj:text-lj-c-strong">
						{title}
					</h2>
				)}
				<p className={`${title == null ? '' : 'lj:mt-3 '}lj:max-w-xl lj:text-sm lj:leading-7 lj:text-lj-c-muted`}>
					{description}
				</p>
				<button
					type="button"
					onClick={onAction}
					className={`lj:mt-8 ${DASHBOARD_EMPTY_STATE_ACTION_CLASS_NAME}`}
				>
					<ObsidianIcon name="plus" className="lj:size-4" />
					{actionLabel}
				</button>
			</div>
		</div>
	)
}
