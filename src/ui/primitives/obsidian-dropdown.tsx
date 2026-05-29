import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { LUCR_JOURNAL_VIEW_TYPE } from '../../constant'

import { ObsidianIcon } from './obsidian-icon'
import { useObservedWidth } from './use-observed-width'

import type { ReactNode } from 'react'

type ObsidianDropdownOption = {
	value: string
	label: string
	icon?: ReactNode
}

type ObsidianDropdownFooterAction = {
	content: ReactNode
	onClick?: () => void
	className?: string
	divider?: boolean
	title?: string
	ariaLabel?: string
}

type ObsidianDropdownProps = {
	options: ObsidianDropdownOption[]
	value?: string
	onChange: (value: string) => void
	align?: 'left' | 'right'
	minMenuWidth?: number
	triggerClassName?: string
	menuClassName?: string
	optionClassName?: string | ((selected: boolean) => string)
	triggerTitle?: string
	triggerAriaLabel?: string
	triggerDataControl?: string
	showChevron?: boolean
	renderTriggerContent?: (option: ObsidianDropdownOption | null) => ReactNode
	renderOptionContent?: (option: ObsidianDropdownOption, selected: boolean) => ReactNode
	footerAction?: ObsidianDropdownFooterAction
}

export function ObsidianDropdown({
	options,
	value,
	onChange,
	align = 'left',
	minMenuWidth = 0,
	triggerClassName,
	menuClassName,
	optionClassName,
	triggerTitle,
	triggerAriaLabel,
	triggerDataControl,
	showChevron = true,
	renderTriggerContent,
	renderOptionContent,
	footerAction,
}: ObsidianDropdownProps) {
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	const triggerWidth = useObservedWidth(triggerRef)
	const selectedOption = options.find((option) => option.value === value) ?? null
	const menuWidth = Math.max(triggerWidth, minMenuWidth)
	const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

	useEffect(() => {
		if (!isOpen || !triggerRef.current) {
			return 
		}

		const updatePosition = () => {
			const rect = triggerRef.current!.getBoundingClientRect()
			// `contain: strict` on an ancestor (e.g. Obsidian's .workspace-leaf)
			// turns `position: fixed` into `position: absolute` relative to that
			// ancestor. Subtract the portal target's rect to compensate.
			const portalTarget = triggerRef.current!.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`)
			const offset = portalTarget?.getBoundingClientRect() ?? { top: 0, left: 0 }
			setMenuPos({
				top: rect.bottom + 4 - offset.top,
				left: (align === 'right' ? rect.right - menuWidth : rect.left) - offset.left,
			})
		}

		updatePosition()

		const handlePointerDown = (event: MouseEvent) => {
			if (
				(triggerRef.current?.contains(event.target as Node) ?? false) ||
				(menuRef.current?.contains(event.target as Node) ?? false)
			) {
				return
			}
			setIsOpen(false)
		}

		const handleScroll = () => setIsOpen(false)

		activeDocument.addEventListener('mousedown', handlePointerDown)
		window.addEventListener('scroll', handleScroll, true)
		return () => {
			activeDocument.removeEventListener('mousedown', handlePointerDown)
			window.removeEventListener('scroll', handleScroll, true)
		}
	}, [isOpen, align, menuWidth])

	return (
		<div className="lj:relative">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				className={triggerClassName}
				title={triggerTitle}
				aria-label={triggerAriaLabel}
				aria-expanded={isOpen}
				aria-haspopup="menu"
				data-lj-control={triggerDataControl}
			>
				{renderTriggerContent ? (
					renderTriggerContent(selectedOption)
				) : (
					<span className="lj:min-w-0 lj:flex-1 lj:truncate lj:text-left">
						{selectedOption?.label ?? ''}
					</span>
				)}
				{showChevron && (
					<ObsidianIcon
						name="chevron-down"
						className={`lj:size-4 lj:shrink-0 lj:transition-transform lj:duration-300 ${isOpen ? 'lj:rotate-180' : ''}`}
					/>
				)}
			</button>

			{isOpen && menuPos && createPortal(
				<div
					ref={menuRef}
					className={`lj:fixed lj:z-[9999] lj:overflow-hidden ${menuClassName ?? ''}`}
					style={{ top: menuPos.top, left: menuPos.left, width: `${menuWidth}px` }}
				>
					{options.map((option) => {
						const selected = option.value === value

						return (
							<button
								key={option.value}
								type="button"
								onClick={() => {
									onChange(option.value)
									setIsOpen(false)
								}}
								className={typeof optionClassName === 'function' ? optionClassName(selected) : optionClassName}
							>
								{renderOptionContent ? (
									renderOptionContent(option, selected)
								) : (
									<span className={selected ? 'lj:text-lj-c-strong' : 'lj:text-lj-c-secondary'}>
										{option.label}
									</span>
								)}
							</button>
						)
					})}
					{footerAction !== undefined && (
						<>
							{footerAction.divider && (
								<div className="lj:mt-1 lj:border-t lj:border-lj-alpha-10 lj:pt-1" />
							)}
							{footerAction.onClick === undefined ? (
								<div
									className={footerAction.className ?? ''}
									title={footerAction.title}
									aria-label={footerAction.ariaLabel}
								>
									{footerAction.content}
								</div>
							) : (
								<button
									type="button"
									onClick={() => {
										footerAction.onClick?.()
										setIsOpen(false)
									}}
									className={footerAction.className ?? ''}
									title={footerAction.title}
									aria-label={footerAction.ariaLabel}
								>
									{footerAction.content}
								</button>
							)}
						</>
					)}
				</div>,
				triggerRef.current?.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`) ?? activeDocument.body,
			)}
		</div>
	)
}
