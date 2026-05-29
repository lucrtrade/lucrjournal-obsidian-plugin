import { type ReactNode, useEffect } from 'react'

type ImageLightboxProps = {
	alt: string
	isOpen: boolean
	onClose: () => void
	onNext?: () => void
	onPrevious?: () => void
	src: string
	topRightAction?: ReactNode
}

export function ImageLightbox({
	alt,
	isOpen,
	onClose,
	onNext,
	onPrevious,
	src,
	topRightAction,
}: ImageLightboxProps) {
	useEffect(() => {
		if (!isOpen) {
			return
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
				return
			}

			if (event.key === 'ArrowLeft') {
				onPrevious?.()
			}

			if (event.key === 'ArrowRight') {
				onNext?.()
			}
		}

		activeDocument.addEventListener('keydown', handleKeyDown)
		return () => activeDocument.removeEventListener('keydown', handleKeyDown)
	}, [isOpen, onClose, onNext, onPrevious])

	if (!isOpen) {
		return null
	}

	return (
		<div
			data-lj-panel="attachment-lightbox"
			role="dialog"
			aria-modal="true"
			onClick={onClose}
			className="lj:fixed lj:inset-0 lj:z-[130] lj:flex lj:cursor-zoom-out lj:items-center lj:justify-center lj:bg-lj-lightbox-backdrop lj:p-4 lj:sm:p-6"
		>
			{topRightAction !== undefined && (
				<div
					onClick={(event) => event.stopPropagation()}
					className="lj:fixed lj:right-4 lj:top-4 lj:z-[131] lj:sm:right-6 lj:sm:top-6"
				>
					{topRightAction}
				</div>
			)}
			<img
				src={src}
				alt={alt}
				draggable={false}
				className="lj:max-h-full lj:max-w-full lj:object-contain lj:select-none"
			/>
		</div>
	)
}
