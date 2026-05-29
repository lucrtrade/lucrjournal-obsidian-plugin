import { TagChip } from './tag-chip'

import type { ReactNode } from 'react'

const DEFAULT_CHIP_CLASS_NAME = 'lj:max-w-[9rem] lj:min-w-0 lj:shrink lj:rounded-full lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2.5 lj:py-0.5 lj:text-[11px] lj:text-lj-c-secondary'
const SUMMARY_CHIP_CLASS_NAME = 'lj:shrink-0 lj:rounded-full lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2 lj:py-0.5 lj:text-[10px] lj:text-lj-c-hint'

export function ReadonlyTokenList({
	items,
	emptyLabel = '-',
	maxVisible = 2,
	chipClassName,
	displayValue = defaultDisplayValue,
}: {
	items: readonly string[]
	emptyLabel?: string
	maxVisible?: number
	chipClassName?: string
	displayValue?: (item: string) => string
}): ReactNode {
	if (items.length === 0) {
		return <span className="lj:px-1 lj:text-lj-c-muted-faint">{emptyLabel}</span>
	}

	const visibleItems = items.slice(0, maxVisible)
	const hiddenItems = items.slice(maxVisible)

	return (
		<div className="lj:flex lj:min-w-0 lj:max-w-full lj:items-center lj:gap-1 lj:overflow-hidden lj:px-1" title={items.join(', ')}>
			{visibleItems.map((item) => (
				<TagChip
					key={item}
					label={displayValue(item)}
					title={item}
					className={chipClassName ?? DEFAULT_CHIP_CLASS_NAME}
				/>
			))}
			{hiddenItems.length > 0 ? (
				<span title={hiddenItems.join(', ')} className={SUMMARY_CHIP_CLASS_NAME}>
					+{hiddenItems.length}
				</span>
			) : null}
		</div>
	)
}

function defaultDisplayValue(item: string): string {
	return item
}
