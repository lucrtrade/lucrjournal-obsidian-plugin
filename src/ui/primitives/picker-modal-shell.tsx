import { useEffect, type ReactNode } from 'react'

type PickerModalShellProps = {
	isOpen: boolean
	onClose: () => void
	label: string
	header: ReactNode
	children: ReactNode
	footer?: ReactNode
	bodyClassName?: string
	dataLjPanel?: string
	zIndexClassName?: string
	maxWidthClassName?: string
	maxHeightClassName?: string
}

export function PickerModalShell({
	isOpen,
	onClose,
	label,
	header,
	children,
	footer,
	bodyClassName,
	dataLjPanel,
	zIndexClassName,
	maxWidthClassName,
	maxHeightClassName,
}: PickerModalShellProps) {
	useEffect(() => {
		if (!isOpen) {
			return
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}

		activeDocument.addEventListener('keydown', handleKeyDown)
		activeDocument.body.classList.add('lj-modal-open')

		return () => {
			activeDocument.removeEventListener('keydown', handleKeyDown)
			activeDocument.body.classList.remove('lj-modal-open')
		}
	}, [isOpen, onClose])

	if (!isOpen) {
		return null
	}

	return (
		<div className={`lj:fixed lj:inset-0 lj:z-[110] lj:flex lj:items-center lj:justify-center lj:overflow-y-auto lj:p-4 lj:sm:p-6 ${zIndexClassName ?? ''}`}>
			<div
				className="lj:absolute lj:inset-0 lj:bg-lj-overlay-backdrop lj:backdrop-blur-sm"
				onClick={onClose}
			/>
			<div
				className={`lj-modal-surface-shadow lj:relative lj:flex lj:w-full lj:min-h-0 lj:flex-col lj:overflow-hidden lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-raised ${maxWidthClassName ?? 'lj:max-w-md'} ${maxHeightClassName ?? 'lj:max-h-[min(64vh,33.5rem)]'}`}
				data-lj-panel={dataLjPanel}
				data-lj-modal={label}
			>
				<div className="lj:shrink-0">
					{header}
				</div>
				<div className={`lj:flex-1 lj:min-h-0 lj:overflow-y-auto ${bodyClassName ?? ''}`}>
					{children}
				</div>
				{footer && (
					<div className="lj:shrink-0">
						{footer}
					</div>
				)}
			</div>
		</div>
	)
}
