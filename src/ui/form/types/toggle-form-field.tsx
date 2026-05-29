import type { FormTypeRenderer } from './index'

export const ToggleFormFieldRenderer: FormTypeRenderer<'toggle'> = ({
	value,
	onChange,
	classNames,
	ariaLabel,
}) => (
	<button
		type="button"
		role="switch"
		aria-label={ariaLabel}
		aria-checked={value}
		onClick={() => onChange(!value)}
		className={resolveToggleClassName(classNames?.toggleButton, value)}
	>
		<span className={resolveToggleClassName(classNames?.toggleThumb, value)} />
	</button>
)

function resolveToggleClassName(
	className: string | ((value: boolean) => string) | undefined,
	value: boolean,
) {
	return typeof className === 'function' ? className(value) : className
}
