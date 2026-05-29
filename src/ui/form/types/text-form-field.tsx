import type { FormTypeRenderer } from './index'

export const TextFormFieldRenderer: FormTypeRenderer<'text'> = ({
	value,
	onChange,
	placeholder,
	classNames,
}) => (
	<input
		type="text"
		value={value}
		onChange={(event) => onChange(event.target.value)}
		placeholder={placeholder}
		className={classNames?.input}
	/>
)
