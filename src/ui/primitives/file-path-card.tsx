type FilePathCardSingleProps = {
	label: string
	value: string
	mono?: boolean
}

type FilePathCardMultiProps = {
	label: string
	values: string[]
	mono?: boolean
	emptyLabel?: string
}

type FilePathCardProps = FilePathCardSingleProps | FilePathCardMultiProps

function isMultiValueFilePathCardProps(props: FilePathCardProps): props is FilePathCardMultiProps {
	return Array.isArray((props as Partial<FilePathCardMultiProps>).values)
}

export function FilePathCard(props: FilePathCardProps) {
	const { label, mono = true } = props
	const valueClassName = mono
		? 'lj:font-mono lj:text-xs lj:text-lj-c-secondary lj:break-all'
		: 'lj:text-sm lj:font-medium lj:text-lj-c-strong'

	return (
		<div className="lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-field lj:px-4 lj:py-3">
			<div className="lj:text-[10px] lj:font-semibold lj:tracking-[0.16em] lj:text-lj-c-muted-dim lj:uppercase">
				{label}
			</div>
			{isMultiValueFilePathCardProps(props) ? (
				props.values.length === 0 ? (
					<div className="lj:mt-1 lj:text-xs lj:text-lj-c-hint lj:italic">
						{props.emptyLabel ?? ''}
					</div>
				) : (
					<ul className="lj:mt-2 lj:flex lj:flex-col lj:gap-1 lj:max-h-48 lj:overflow-y-auto">
						{props.values.map((v) => (
							<li key={v} className={`lj:mt-0 ${valueClassName}`}>{v}</li>
						))}
					</ul>
				)
			) : (
				<div className={`lj:mt-1 ${valueClassName}`}>{props.value}</div>
			)}
		</div>
	)
}
