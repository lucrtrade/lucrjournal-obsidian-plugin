type TagChipProps = {
	label: string
	title?: string
	className?: string
}

const READONLY_TAG_CHIP_CLASS_NAME = 'lj:inline-flex lj:min-w-0 lj:max-w-full lj:items-center lj:overflow-hidden lj:rounded lj:bg-lj-alpha-5 lj:px-2 lj:py-0.5 lj:text-[10px] lj:text-lj-c-muted'

export function TagChip({ label, title, className }: TagChipProps) {
	return (
		<span
			title={title ?? label}
			className={className ?? READONLY_TAG_CHIP_CLASS_NAME}
		>
			<span className="lj:block lj:min-w-0 lj:truncate">{label}</span>
		</span>
	)
}
