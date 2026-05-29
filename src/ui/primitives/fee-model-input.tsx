import type { FeeModelFormValue } from '../../domains/symbol/fee-model'
import type { KeyboardEventHandler, RefObject } from 'react'

type FeeModelInputProps = {
	value: FeeModelFormValue
	onChange: (value: FeeModelFormValue) => void
	placeholder?: string
	ariaLabel?: string
	containerClassName?: string
	inputClassName?: string
	prefixButtonClassName?: string
	unitButtonClassName?: string
	prefix: string
	suffix: string
	inputRef?: RefObject<HTMLInputElement | null>
	autoFocus?: boolean
	onBlur?: () => void
	onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}

export function FeeModelInput({
	value,
	onChange,
	placeholder,
	ariaLabel,
	containerClassName,
	inputClassName,
	prefixButtonClassName,
	unitButtonClassName,
	prefix,
	suffix,
	inputRef,
	autoFocus = false,
	onBlur,
	onKeyDown,
}: FeeModelInputProps) {
	return (
		<div className={containerClassName}>
			{prefix === '' ? null : (
				<span
					className={prefixButtonClassName ?? unitButtonClassName}
				>
					{prefix}
				</span>
			)}
			<input
				ref={inputRef}
				type="text"
				inputMode="decimal"
				value={value.value}
				onChange={(event) => onChange({ value: event.currentTarget.value })}
				onBlur={onBlur}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				autoFocus={autoFocus}
				aria-label={ariaLabel}
				className={inputClassName}
			/>
			{suffix === '' ? null : (
				<span
					className={unitButtonClassName}
				>
					{suffix}
				</span>
			)}
		</div>
	)
}
