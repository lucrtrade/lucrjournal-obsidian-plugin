import { type ReactNode } from 'react'

import { EditableFrontmatterNumberCell } from './editable-frontmatter-number-cell'

interface EditableContractUnitCellProps {
	value: number | null
	editable: boolean
	source: 'fixed' | 'builtin' | 'custom'
	onSave: (value: number | null) => Promise<void>
}

function formatContractUnitDisplay(value: number | null) {
	return {
		text: value == null ? '-' : String(value),
		valueClassName: 'lj:text-lj-c-tertiary',
	}
}

export function EditableContractUnitCell({
	value,
	editable,
	source,
	onSave,
}: EditableContractUnitCellProps): ReactNode {
	const sourceClassName = source === 'custom'
		? 'lj:border-lj-alpha-20 lj:bg-lj-surf-warning-soft lj:text-lj-c-warning'
		: 'lj:border-transparent lj:text-lj-c-tertiary'

	if (!editable) {
		const display = formatContractUnitDisplay(value)
		return (
			<div className="lj:px-1">
				<div className={`lj:inline-flex lj:items-center lj:truncate lj:rounded-lg lj:border lj:px-2 lj:py-1 lj:font-mono ${sourceClassName}`}>
					{display.text}
				</div>
			</div>
		)
	}

	return (
		<EditableFrontmatterNumberCell
			value={value}
			onSave={async (nextValue) => {
				if (nextValue == null) {
					await onSave(null)
					return
				}
				const roundedValue = Math.round(nextValue)
				if (roundedValue <= 0) {
					return
				}
				await onSave(roundedValue)
			}}
			formatDisplay={(currentValue) => ({
				...formatContractUnitDisplay(currentValue),
				valueClassName: sourceClassName,
			})}
		/>
	)
}
