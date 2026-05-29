type StatusDotTone = 'highlight' | 'muted' | 'faint' | 'outline'

type StatusDotProps = {
	sizeClassName?: string
	tone: StatusDotTone
	emphasized?: boolean
	className?: string
}

const HIGHLIGHT_GLOW_CLASS_NAME = 'lj-status-dot-highlight-glow'

export function StatusDot({
	sizeClassName = 'lj:size-1.5',
	tone,
	emphasized = false,
	className,
}: StatusDotProps) {
	return (
		<span
			aria-hidden="true"
			className={[
				sizeClassName,
				'lj:inline-block',
				'lj:shrink-0',
				'lj:rounded-full',
				emphasized ? 'lj:scale-110' : '',
				resolveToneClassName(tone),
				className ?? '',
			].filter(Boolean).join(' ')}
		/>
	)
}

function resolveToneClassName(tone: StatusDotTone) {
	switch (tone) {
		case 'highlight':
			return `lj:bg-lj-profit-dot ${HIGHLIGHT_GLOW_CLASS_NAME}`
		case 'muted':
			return 'lj:bg-lj-loss-dot'
		case 'faint':
			return 'lj:bg-lj-text-muted'
		case 'outline':
			return 'lj:border lj:border-lj-c-hint lj:bg-transparent'
		default:
			tone satisfies never
			throw new Error('Unknown status dot tone')
	}
}
