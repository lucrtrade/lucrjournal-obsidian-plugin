import { type App } from 'obsidian'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { LUCR_JOURNAL_VIEW_TYPE } from '../../../constant'
import { openVaultLinkText } from '../../../views/link-activation'
import { ReadonlyTokenList } from '../../primitives/readonly-token-list'

type WikilinkItem = { name: string; link: string }

export function ReadonlyWikilinkListCell({
	app,
	items,
}: {
	app: App
	items: WikilinkItem[]
}): ReactNode {
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const popoverRef = useRef<HTMLDivElement>(null)
	const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

	useEffect(() => {
		if (!isOpen || !triggerRef.current) {
			return
		}

		const rect = triggerRef.current.getBoundingClientRect()
		const portalTarget = triggerRef.current.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`)
		const offset = portalTarget?.getBoundingClientRect() ?? { top: 0, left: 0 }
		setPopoverPos({
			top: rect.bottom + 4 - offset.top,
			left: rect.left - offset.left,
		})

		const handlePointerDown = (event: MouseEvent) => {
			if (
				(triggerRef.current?.contains(event.target as Node) ?? false) ||
				(popoverRef.current?.contains(event.target as Node) ?? false)
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
	}, [isOpen])

	if (items.length === 0) {
		return <span className="lj:text-lj-c-muted-faint lj:px-1">-</span>
	}

	const portalTarget = triggerRef.current?.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`) ?? activeDocument.body

	return (
		<div className="lj:relative lj:w-full">
			<button
				ref={triggerRef}
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					setIsOpen((open) => !open)
				}}
				className="lj:block lj:w-full lj:cursor-pointer lj:text-left"
			>
				<ReadonlyTokenList items={items.map((item) => item.name)} />
			</button>

			{isOpen && popoverPos && createPortal(
				<div
					ref={popoverRef}
					className="lj:fixed lj:z-[9999] lj:min-w-[140px] lj:max-w-[260px] lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:p-1.5 lj:shadow-xl"
					style={{ top: popoverPos.top, left: popoverPos.left }}
					onClick={(event) => event.stopPropagation()}
				>
					{items.map((item) => (
						<button
							key={item.link}
							type="button"
							onClick={(event) => {
								void openVaultLinkText(app, item.name, '', event)
								setIsOpen(false)
							}}
							className="lj:flex lj:w-full lj:min-w-0 lj:items-center lj:rounded-lg lj:px-3 lj:py-2 lj:text-left lj:text-[12px] lj:text-lj-c-secondary lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong"
						>
							<span className="lj:min-w-0 lj:truncate">{item.name}</span>
						</button>
					))}
				</div>,
				portalTarget,
			)}
		</div>
	)
}
