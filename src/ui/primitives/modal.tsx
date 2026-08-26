import { useEffect, useRef } from 'react'

import { ObsidianIcon } from './obsidian-icon'

import type { ReactNode } from 'react'

type ModalProps = {
	isOpen: boolean
	onClose: () => void
	title: string
	children: ReactNode
	footer?: ReactNode
	zIndexClassName?: string
	maxWidthClassName?: string
	contentClassName?: string
	dataLjPanel?: string
	titleClassName?: string
	headerClassName?: string
	footerClassName?: string
}

export function Modal({ isOpen, onClose, title, children, footer, zIndexClassName, maxWidthClassName, contentClassName, dataLjPanel, titleClassName, headerClassName, footerClassName }: ModalProps) {
	const modalRef = useRef<HTMLDivElement>(null)

	// @story [[lucrjournal/primitives#^modal-lifecycle]] Pairs modal Escape and body state with open lifecycle cleanup
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose() 
			}
		}
		if (isOpen) {
			activeDocument.addEventListener('keydown', handleKeyDown)
			activeDocument.body.classList.add('lj-modal-open')
		}
		return () => {
			activeDocument.removeEventListener('keydown', handleKeyDown)
			activeDocument.body.classList.remove('lj-modal-open')
		}
	}, [isOpen, onClose])

	return isOpen ? (
		<div className={`lj:fixed lj:inset-0 lj:flex lj:items-center lj:justify-center lj:p-4 lj:sm:p-6 lj:pointer-events-auto ${zIndexClassName ?? 'lj:z-[100]'}`}>
			<div
				className="lj:absolute lj:inset-0 lj:bg-lj-overlay-backdrop lj:backdrop-blur-sm"
				onClick={onClose}
			/>
			<div
				ref={modalRef}
				className={`lj-modal-surface-shadow lj:relative lj:flex lj:max-h-[90vh] lj:w-full lj:flex-col lj:overflow-visible lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised ${maxWidthClassName ?? 'lj:max-w-[860px]'}`}
				data-lj-panel={dataLjPanel}
				data-lj-modal={title}
			>
				<div className={`lj:flex lj:shrink-0 lj:items-center lj:justify-between lj:border-b lj:border-lj-alpha-5 ${headerClassName ?? 'lj:px-8 lj:py-6'}`}>
					<h2 className={titleClassName ?? 'lj:text-[20px] lj:font-medium lj:tracking-[0.01em] lj:text-lj-c-strong'}>
						{title}
					</h2>
					<button
						onClick={onClose}
						className="lj:rounded-md lj:p-2 lj:text-lj-c-hint-vivid lj:transition-colors lj:hover:bg-lj-alpha-5-10 lj:hover:text-lj-c-strong"
					>
						<ObsidianIcon name="x" className="lj:size-5" />
					</button>
				</div>

				<div className={`lj:flex-1 lj:overflow-y-auto ${contentClassName ?? 'lj:px-8 lj:py-8'}`}>
					{children}
				</div>

				{footer && (
					<div className={`lj:shrink-0 lj:border-t lj:border-lj-alpha-5 lj:bg-lj-surf-inset ${footerClassName ?? 'lj:px-8 lj:py-5'}`}>
						{footer}
					</div>
				)}
			</div>
		</div>
	) : null
}
