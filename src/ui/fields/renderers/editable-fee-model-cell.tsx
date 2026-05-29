import { Notice } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { SymbolDomain } from '../../../domains'
import { buildFeeModelFormValue, formatFeeValueDisplay, parseFeeValueInputValue, resolveFeeValueInputConfig } from '../../../domains/symbol/fee-model'
import { t } from '../../../lang/helpers'
import { FeeModelInput } from '../../primitives/fee-model-input'

import type { PositionSymbolType } from '../../../domains/symbol'

type EditableFeeModelCellProps = {
	feeValue: number | null
	symbolType: PositionSymbolType | null
	isEditing: boolean
	canEdit: boolean
	onEditStart: () => void
	onEditEnd: () => void
	onSave: (nextValue: { fee_value: number | null }) => Promise<void>
}

const FEE_CELL_INPUT_CONTAINER_CLASS_NAME = 'lj:flex lj:h-7 lj:items-center lj:overflow-hidden lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-input'
const FEE_CELL_INPUT_CLASS_NAME = 'lj:h-7 lj:w-20 lj:border-0 lj:bg-transparent lj:px-2 lj:text-right lj:text-[11px] lj:text-lj-c-strong lj:focus:outline-none'
const FEE_CELL_PREFIX_BUTTON_CLASS_NAME = 'lj:flex lj:h-7 lj:min-w-8 lj:items-center lj:justify-center lj:border-r lj:border-lj-alpha-10 lj:px-2 lj:text-[11px] lj:font-medium lj:text-lj-c-muted lj:transition-colors hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong lj:focus:outline-none'
const FEE_CELL_UNIT_BUTTON_CLASS_NAME = 'lj:flex lj:h-7 lj:min-w-8 lj:items-center lj:justify-center lj:border-l lj:border-lj-alpha-10 lj:px-2 lj:text-[11px] lj:font-medium lj:text-lj-c-muted lj:transition-colors hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong lj:focus:outline-none'

export function EditableFeeModelCell({
	feeValue,
	symbolType,
	isEditing,
	canEdit,
	onEditStart,
	onEditEnd,
	onSave,
}: EditableFeeModelCellProps) {
	const [draftFee, setDraftFee] = useState(() => buildFeeModelFormValue({ fee_value: feeValue }))
	const inputRef = useRef<HTMLInputElement>(null)
	const inputConfig = resolveFeeValueInputConfig(symbolType)
	const prefix = inputConfig.prefix
	const suffix = t(inputConfig.suffixKey)

	useEffect(() => {
		if (!isEditing) {
			setDraftFee(buildFeeModelFormValue({ fee_value: feeValue }))
			return
		}

		const timer = window.setTimeout(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		}, 0)
		return () => window.clearTimeout(timer)
	}, [feeValue, isEditing])

	const displayText = feeValue == null
		? '-'
		: suffix === '%'
			? `${prefix}${formatFeeValueDisplay(feeValue)}${suffix}`
			: `${prefix}${formatFeeValueDisplay(feeValue)} ${suffix}`

	const save = async () => {
		const trimmedValue = draftFee.value.trim()
		const nextValue = { fee_value: parseFeeValueInputValue(trimmedValue) }

		if (Object.is(nextValue.fee_value, feeValue)) {
			onEditEnd()
			return
		}

		try {
			await onSave(nextValue)
			onEditEnd()
		} catch (error) {
			const errorMessageKey = SymbolDomain.toCreateEntryErrorMessageKey(error)
			new Notice(errorMessageKey == null ? t('DASHBOARD_META_ANALYSIS_UPDATE_FAILED') : t(errorMessageKey))
		}
	}

	if (!isEditing) {
		return (
			<button
				type="button"
				disabled={!canEdit}
				onClick={(event) => {
					event.stopPropagation()
					if (canEdit) {
						onEditStart()
					}
				}}
				className="lj:flex lj:w-full lj:items-center lj:justify-end lj:px-1 lj:font-mono lj:text-lj-c-tertiary"
			>
				{displayText}
			</button>
		)
	}

	return (
		<div className="lj:flex lj:items-center lj:justify-end lj:gap-1 lj:px-1" onClick={(event) => event.stopPropagation()}>
			<FeeModelInput
				value={draftFee}
				onChange={setDraftFee}
				containerClassName={FEE_CELL_INPUT_CONTAINER_CLASS_NAME}
				inputClassName={FEE_CELL_INPUT_CLASS_NAME}
				prefixButtonClassName={FEE_CELL_PREFIX_BUTTON_CLASS_NAME}
				unitButtonClassName={FEE_CELL_UNIT_BUTTON_CLASS_NAME}
				prefix={prefix}
				suffix={suffix === '%' ? suffix : ''}
				inputRef={inputRef}
				onBlur={() => {
					void save()
				}}
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						event.preventDefault()
						onEditEnd()
					}
					if (event.key === 'Enter') {
						event.preventDefault()
						void save()
					}
				}}
			/>
		</div>
	)
}
