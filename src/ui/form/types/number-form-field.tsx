import type { FormTypeRenderer } from './index'

export const NumberFormFieldRenderer: FormTypeRenderer<'number'> = ({
	value,
	onChange,
	placeholder,
	classNames,
}) => (
	<input
		type="number"
		value={value}
		onChange={(event) => onChange(event.target.value)}
		placeholder={placeholder}
		className={classNames?.input}
	/>
)
