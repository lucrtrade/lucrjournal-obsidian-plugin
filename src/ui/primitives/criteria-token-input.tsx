import { normalizeCriteria, normalizeCriteriaOptions, type CriteriaOption } from '../../domains/criteria'

import { TokenInput } from './token-input'

import type { ReactNode } from 'react'

export function CriteriaTokenInput({
	value,
	onChange,
	suggestions = [],
	placeholder,
	autoFocus = false,
	onEscape,
	compact = false,
	borderless = false,
	onQueryChange,
	onInvalidQueryChange,
	invalidMessage,
}: {
	value: string[]
	onChange: (value: string[]) => void
	suggestions?: readonly CriteriaOption[]
	placeholder?: string
	autoFocus?: boolean
	onEscape?: () => void
	compact?: boolean
	borderless?: boolean
	onQueryChange?: (query: string) => void
	onInvalidQueryChange?: (isInvalid: boolean) => void
	invalidMessage?: string
}): ReactNode {
	return (
		<TokenInput
			value={value.map((item) => normalizeCriteria(item)).filter((item) => item !== '')}
			onChange={onChange}
			suggestions={suggestions}
			placeholder={placeholder}
			autoFocus={autoFocus}
			onEscape={onEscape}
			compact={compact}
			borderless={borderless}
			normalizeValue={normalizeCriteria}
			normalizeOptions={normalizeCriteriaOptions}
			onQueryChange={onQueryChange}
			onInvalidQueryChange={onInvalidQueryChange}
			invalidMessage={invalidMessage}
		/>
	)
}
