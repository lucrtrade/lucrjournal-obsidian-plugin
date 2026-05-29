import { formatOpenedAtForDisplay, formatRelativeTimeFromNow } from '../../utils'

type DatetimeDisplayProps = {
	datetime: string | null | undefined
	className?: string
}

export function DatetimeDisplay({ datetime, className }: DatetimeDisplayProps) {
	const absolute = formatOpenedAtForDisplay(datetime)
	const relative = formatRelativeTimeFromNow(datetime)

	if (absolute === null) {
		return <span className={`lj:text-lj-c-hint-faint ${className ?? ''}`}>-</span>
	}

	return (
		<span className={`lj:inline-flex lj:items-center lj:gap-2 ${className ?? ''}`}>
			<span className="lj:font-mono lj:text-lj-c-strong">{absolute}</span>
			{relative !== null && (
				<span className="lj:text-[10px] lj:text-lj-c-hint-faint">{relative}</span>
			)}
		</span>
	)
}
