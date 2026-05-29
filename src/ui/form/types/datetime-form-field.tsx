import { EditableDatetimeField } from '../../primitives/editable-datetime-field'

import type { FormTypeRenderer } from './index'

export const DatetimeFormFieldRenderer: FormTypeRenderer<'datetime'> = ({
	value,
	onChange,
	placeholder,
	classNames,
}) => (
	<EditableDatetimeField
		value={value}
		onSave={onChange}
		className={classNames?.input}
		renderDisplay={(currentValue) => {
			if (currentValue == null || currentValue.trim() === '') {
				return placeholder ?? ''
			}
			return currentValue
		}}
	/>
)
