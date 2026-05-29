import { t } from '../../../lang/helpers'

import type { SelectOption, SelectOptionTone } from '../../../domains/core/form'
import type { CSSProperties } from 'react'

type Primitive = string | number | boolean
type EnumBadgeVariant = 'default' | 'prominent' | 'side'

const ENUM_BADGE_CLASS_NAMES = {
	default: 'lj:inline-flex lj:items-center lj:justify-center lj:rounded-full lj:border lj:px-2.5 lj:py-1 lj:text-[11px] lj:font-medium',
	prominent: 'lj:inline-flex lj:w-16 lj:items-center lj:justify-center lj:rounded lj:px-0 lj:py-1 lj:text-[9px] lj:font-semibold lj:tracking-wider',
	side: 'lj:inline-flex lj:min-w-12 lj:items-center lj:justify-center lj:rounded lj:border lj:px-2 lj:py-1 lj:text-[9px] lj:font-semibold lj:tracking-wider lj:uppercase',
} as const

function resolveEnumBadgeStyle(tone: SelectOptionTone | undefined): CSSProperties | undefined {
	if (tone === undefined) {
		return undefined
	}

	return {
		backgroundColor: `var(${tone.background})`,
		borderColor: `var(${tone.border ?? tone.background})`,
		color: `var(${tone.text})`,
	}
}

export function resolveOptionLabel(option: SelectOption): string {
	if (option.labelKey === undefined) {
		return option.label
	}

	return t(option.labelKey as never)
}

export function EnumBadge({
	option,
	fallbackValue,
	variant = 'default',
}: {
	option?: SelectOption
	fallbackValue?: Primitive | null
	variant?: EnumBadgeVariant
}) {
	if (option === undefined) {
		return <span className="lj:text-lj-c-tertiary">{fallbackValue == null ? '-' : String(fallbackValue)}</span>
	}

	return (
		<span
			className={ENUM_BADGE_CLASS_NAMES[variant]}
			style={resolveEnumBadgeStyle(option.tone)}
		>
			{resolveOptionLabel(option)}
		</span>
	)
}
