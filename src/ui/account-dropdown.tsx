import { AccountDomain, type IconDescriptor } from '../domains'

import { IconView } from './primitives/icon-view'
import { ObsidianDropdown } from './primitives/obsidian-dropdown'
import { ObsidianIcon } from './primitives/obsidian-icon'

import type { App } from 'obsidian'

const ACCOUNT_MENU_CLASS_NAME = 'lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:p-1 lj:shadow-xl lj:backdrop-blur-xl'
const ACCOUNT_OPTION_SELECTED_CLASS_NAME = 'lj:bg-lj-alpha-5-10 lj:text-lj-c-strong'
const ACCOUNT_OPTION_IDLE_CLASS_NAME = 'lj:text-lj-c-secondary lj:hover:bg-lj-alpha-5'
const ACCOUNT_FOOTER_DISABLED_CLASS_NAME = 'lj:text-lj-c-muted-vivid'
export type AccountDropdownOption = {
	value: string
	label: string
	icon: string | IconDescriptor
}

type AccountDropdownProps = {
	options: AccountDropdownOption[]
	value: string
	onChange: (value: string) => void
	variant: 'header' | 'field'
	headerDensity?: 'wide' | 'compact' | 'collapsed'
	placeholder?: string
	align?: 'left' | 'right'
	minMenuWidth?: number
	triggerDataControl?: string
	triggerTitle?: string
	triggerAriaLabel?: string
	footerActionLabel?: string
	showFooterActionDivider?: boolean
	onFooterAction?: () => void
}

export function buildAccountDropdownOptions({
	app,
	accounts,
	allLabel,
	valueForAccount = (account) => AccountDomain.toDisplayName(account),
}: {
	app: App
	accounts: ReturnType<typeof AccountDomain.totalEntries>
	allLabel?: string
	valueForAccount?: (account: ReturnType<typeof AccountDomain.totalEntries>[number]['fm']) => string
}): AccountDropdownOption[] {
	return [
		...(allLabel === undefined
			? []
			: [{
				value: allLabel,
				label: allLabel,
				icon: AccountDomain.resolveIcon(),
			}]),
		...accounts
			.map(({ fm: account }) => ({
				value: valueForAccount(account),
				label: AccountDomain.toDisplayName(account),
				icon: resolveAccountOptionIcon(app, account),
			}))
			.sort((left, right) => left.label.localeCompare(right.label)),
	]
}

export function AccountDropdown({
	options,
	value,
	onChange,
	variant,
	headerDensity = 'wide',
	placeholder,
	align = 'left',
	minMenuWidth = 0,
	triggerDataControl,
	triggerTitle,
	triggerAriaLabel,
	footerActionLabel,
	showFooterActionDivider = false,
	onFooterAction,
}: AccountDropdownProps) {
	const selectedOption = options.find((option) => option.value === value) ?? null

	return (
		<ObsidianDropdown
			options={options.map((option) => ({
				value: option.value,
				label: option.label,
				icon: <IconView icon={option.icon} />,
			}))}
			value={value}
			onChange={onChange}
			align={align}
			minMenuWidth={minMenuWidth}
			triggerDataControl={triggerDataControl}
			triggerTitle={triggerTitle}
			triggerAriaLabel={triggerAriaLabel}
			triggerClassName={getAccountDropdownTriggerClassName(variant, headerDensity)}
			menuClassName={ACCOUNT_MENU_CLASS_NAME}
			optionClassName={(selected) => `lj:flex lj:w-full lj:items-center lj:justify-start lj:gap-3 lj:rounded-md lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:transition-colors ${
				selected
					? ACCOUNT_OPTION_SELECTED_CLASS_NAME
					: ACCOUNT_OPTION_IDLE_CLASS_NAME
			}`}
			footerAction={footerActionLabel === undefined
				? undefined
				: {
					content: (
						<>
							<span className="lj:flex lj:size-4 lj:shrink-0 lj:items-center lj:justify-center">
								<ObsidianIcon name="plus" className="lj:size-4 lj:text-lj-c-hint-vivid" />
							</span>
							<span className="lj:min-w-0 lj:flex-1 lj:truncate lj:text-left">
								{footerActionLabel}
							</span>
						</>
					),
					onClick: onFooterAction,
					divider: showFooterActionDivider,
					className: `lj:flex lj:w-full lj:items-center lj:justify-start lj:gap-3 lj:rounded-md lj:px-3 lj:py-2.5 lj:text-left lj:text-sm ${
						onFooterAction === undefined
							? ACCOUNT_FOOTER_DISABLED_CLASS_NAME
							: ACCOUNT_OPTION_IDLE_CLASS_NAME
					}`,
					title: footerActionLabel,
					ariaLabel: footerActionLabel,
				}}
			renderTriggerContent={() => (
				<span className={`lj:flex lj:min-w-0 lj:flex-1 lj:items-center ${
					variant === 'header'
						? headerDensity === 'collapsed'
							? 'lj:justify-center lj:gap-1.5'
							: 'lj:justify-start lj:gap-2.5'
						: 'lj:justify-start lj:gap-2.5'
				}`}>
					<IconView icon={selectedOption?.icon ?? AccountDomain.resolveIcon()} />
					{(variant === 'field' || headerDensity !== 'collapsed') && (
						<span className={`lj:min-w-0 lj:flex-1 lj:truncate lj:text-left ${
							variant === 'field' && selectedOption === null
								? 'lj:text-lj-c-hint-dim'
								: ''
						}`}>
							{selectedOption?.label ?? placeholder ?? ''}
						</span>
					)}
				</span>
			)}
			renderOptionContent={(option, selected) => (
				<>
					{option.icon}
					<span className={`lj:min-w-0 lj:flex-1 lj:truncate lj:text-left ${
						selected ? 'lj:text-lj-c-strong' : ''
					}`}>
						{option.label}
					</span>
				</>
			)}
		/>
	)
}

function getAccountDropdownTriggerClassName(
	variant: AccountDropdownProps['variant'],
	headerDensity: NonNullable<AccountDropdownProps['headerDensity']>,
) {
	if (variant === 'field') {
		return 'lj:flex lj:h-10 lj:w-full lj:items-center lj:justify-between lj:gap-2 lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-input lj:px-3 lj:text-[13px] lj:font-medium lj:text-lj-c-strong lj:transition-[border-color,box-shadow,color] lj:hover:border-lj-alpha-20 lj:focus:outline-none'
	}

	return `lj:flex lj:h-14 lj:min-w-0 lj:items-center lj:text-sm lj:leading-none lj:font-medium lj:text-lj-c-tertiary lj:transition-colors lj:hover:text-lj-c-strong ${
		headerDensity === 'wide'
			? 'lj:justify-start lj:gap-2'
			: headerDensity === 'compact'
				? 'lj:max-w-[10.5rem] lj:justify-between lj:gap-2.5'
				: 'lj:justify-center lj:gap-1.5'
	}`
}

function resolveAccountOptionIcon(app: App, account: ReturnType<typeof AccountDomain.totalEntries>[number]['fm']): IconDescriptor {
	return AccountDomain.resolveDisplayIcon(app, account)
}
