import { SymbolIcon } from './primitives/symbol-icon'

type PositionSymbolContentProps = {
	symbol: string | null | undefined
	logo?: string | null | undefined
	className?: string
	iconClassName?: string
	labelClassName?: string
	placeholder?: string
}

export function PositionSymbolContent({
	symbol,
	logo,
	className,
	iconClassName,
	labelClassName,
	placeholder = '-',
}: PositionSymbolContentProps) {
	const displaySymbol = symbol?.trim() ?? placeholder

	return (
		<span className={`lj:flex lj:min-w-0 lj:items-center lj:gap-2 ${className ?? ''}`.trim()}>
			<SymbolIcon
				logo={logo}
				className={`lj:size-4 lj:shrink-0 ${iconClassName ?? ''}`.trim()}
			/>
			<span className={`lj:min-w-0 lj:flex-1 lj:truncate ${labelClassName ?? ''}`.trim()}>
				{displaySymbol}
			</span>
		</span>
	)
}
