import { normalizeTag, normalizeTagOptions, normalizeTags, type TagOption } from '../../domains/core/tags'

import { TokenInput } from './token-input'

import type { ReactNode } from 'react'

export { normalizeTags } from '../../domains/core/tags'

export function TagTokenInput({
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
	suggestions?: readonly TagOption[]
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
			value={normalizeTags(value)}
			onChange={onChange}
			suggestions={suggestions}
			placeholder={placeholder}
			autoFocus={autoFocus}
			onEscape={onEscape}
			compact={compact}
			borderless={borderless}
			normalizeValue={normalizeTag}
			normalizeOptions={normalizeTagOptions}
			onQueryChange={onQueryChange}
			onInvalidQueryChange={onInvalidQueryChange}
			invalidMessage={invalidMessage}
		/>
	)
}
