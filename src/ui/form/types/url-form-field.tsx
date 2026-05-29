import type { FormTypeRenderer } from './index'

export const UrlFormFieldRenderer: FormTypeRenderer<'url'> = ({
	value,
	onChange,
	placeholder,
	classNames,
}) => (
	<input
		type="url"
		inputMode="url"
		autoCapitalize="off"
		autoCorrect="off"
		spellCheck={false}
		value={value}
		onChange={(event) => onChange(event.target.value)}
		placeholder={placeholder}
		className={classNames?.input}
	/>
)
