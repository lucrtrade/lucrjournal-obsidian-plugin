import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { LUCR_JOURNAL_VIEW_TYPE } from '../../constant'

type TooltipPosition = {
	left: number
	top: number
}

type InfoTooltipProps = {
	title: string
	children: ReactNode
}

const TOOLTIP_OFFSET_Y = 8
const TOOLTIP_WIDTH = 320
const TOOLTIP_VIEWPORT_PADDING = 16

export function InfoTooltip({ title, children }: InfoTooltipProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [position, setPosition] = useState<TooltipPosition | null>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const tooltipRef = useRef<HTMLDivElement>(null)
	const closeTimerRef = useRef<number | null>(null)

	useEffect(() => () => {
		if (closeTimerRef.current !== null) {
			window.clearTimeout(closeTimerRef.current)
		}
	}, [])

	useEffect(() => {
		if (!isOpen || triggerRef.current === null) {
			return
		}

		const updatePosition = () => {
			if (triggerRef.current === null) {
				return
			}

			const portalTarget = triggerRef.current.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`)
			const offsetRect = portalTarget?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth }
			const rect = triggerRef.current.getBoundingClientRect()
			const maxLeft = Math.max(
				TOOLTIP_VIEWPORT_PADDING,
				offsetRect.width - TOOLTIP_WIDTH - TOOLTIP_VIEWPORT_PADDING,
			)
			const nextLeft = Math.min(
				Math.max(TOOLTIP_VIEWPORT_PADDING, rect.left - offsetRect.left),
				maxLeft,
			)

			setPosition({
				left: nextLeft,
				top: rect.bottom - offsetRect.top + TOOLTIP_OFFSET_Y,
			})
		}

		updatePosition()

		const handlePointerDown = (event: MouseEvent) => {
			if (
				(triggerRef.current?.contains(event.target as Node) ?? false)
				|| (tooltipRef.current?.contains(event.target as Node) ?? false)
			) {
				return
			}

			setIsOpen(false)
		}

		const handleScroll = () => setIsOpen(false)
		const handleResize = () => setIsOpen(false)

		activeDocument.addEventListener('mousedown', handlePointerDown)
		window.addEventListener('scroll', handleScroll, true)
		window.addEventListener('resize', handleResize)
		return () => {
			activeDocument.removeEventListener('mousedown', handlePointerDown)
			window.removeEventListener('scroll', handleScroll, true)
			window.removeEventListener('resize', handleResize)
		}
	}, [isOpen])

	const clearPendingClose = () => {
		if (closeTimerRef.current !== null) {
			window.clearTimeout(closeTimerRef.current)
			closeTimerRef.current = null
		}
	}

	const scheduleClose = () => {
		clearPendingClose()
		closeTimerRef.current = window.setTimeout(() => {
			setIsOpen(false)
			closeTimerRef.current = null
		}, 100)
	}

	const portalTarget = triggerRef.current?.closest(`.${LUCR_JOURNAL_VIEW_TYPE}`) ?? activeDocument.body

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-label={title}
				aria-expanded={isOpen}
				className="lj:inline-flex lj:size-4.5 lj:shrink-0 lj:items-center lj:justify-center lj:rounded-full lj:bg-transparent lj:text-lj-c-hint lj:transition-colors lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-strong lj:focus-visible:lj:outline-none lj:focus-visible:lj:ring-2 lj:focus-visible:lj:ring-lj-alpha-10"
				onMouseEnter={() => {
					clearPendingClose()
					setIsOpen(true)
				}}
				onMouseLeave={scheduleClose}
				onFocus={() => {
					clearPendingClose()
					setIsOpen(true)
				}}
				onBlur={scheduleClose}
			>
				<span aria-hidden="true" className="lj:text-[11px] lj:font-semibold lj:leading-none">?</span>
			</button>

			{isOpen && position !== null && createPortal(
				<div
					ref={tooltipRef}
					role="tooltip"
					className="lj:fixed lj:z-[10000] lj:w-[320px] lj:max-w-[calc(100vw-2rem)] lj:overflow-hidden lj:rounded-2xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:p-3 lj:shadow-[0_16px_50px_rgba(0,0,0,0.18)]"
					style={{ left: position.left, top: position.top }}
					onMouseEnter={clearPendingClose}
					onMouseLeave={scheduleClose}
				>
					<div className="lj:mb-2 lj:text-[11px] lj:font-bold lj:tracking-[0.18em] lj:text-lj-c-strong lj:uppercase">
						{title}
					</div>
					<div className="lj:flex lj:flex-col lj:gap-1.5">
						{children}
					</div>
				</div>,
				portalTarget,
			)}
		</>
	)
}
