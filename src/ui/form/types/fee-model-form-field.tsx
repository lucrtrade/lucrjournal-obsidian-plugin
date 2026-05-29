import { t } from '../../../lang/helpers'
import { FeeModelInput } from '../../primitives/fee-model-input'

import type { FormTypeRenderer } from './index'

const FEE_FORM_INPUT_CONTAINER_CLASS_NAME = 'lj:flex lj:h-10 lj:w-full lj:items-center lj:overflow-hidden lj:rounded-lg lj:border lj:border-lj-alpha-8 lj:bg-lj-surf-input lj:transition-[border-color,box-shadow] focus-within:lj:border-lj-ring-emphasis focus-within:lj:ring-2 focus-within:lj:ring-lj-ring-faint'
const FEE_FORM_INPUT_CLASS_NAME = 'lj:h-full lj:w-full lj:border-0 lj:bg-transparent lj:px-3 lj:text-[13px] lj:text-lj-c-strong lj:placeholder:text-lj-c-hint-faint lj:focus:outline-none'
const FEE_FORM_UNIT_BUTTON_CLASS_NAME = 'lj:flex lj:h-full lj:min-w-11 lj:items-center lj:justify-center lj:border-l lj:border-lj-alpha-8 lj:px-3 lj:text-[13px] lj:font-semibold lj:text-lj-c-strong lj:transition-colors lj:hover:bg-lj-alpha-5 lj:focus:outline-none'

export const FeeModelFormFieldRenderer: FormTypeRenderer<'fee_model'> = ({
	value,
	onChange,
	placeholder,
	ariaLabel,
}) => (
	<FeeModelInput
		value={value}
		onChange={onChange}
		placeholder={placeholder}
		ariaLabel={ariaLabel}
		containerClassName={FEE_FORM_INPUT_CONTAINER_CLASS_NAME}
		inputClassName={FEE_FORM_INPUT_CLASS_NAME}
		unitButtonClassName={FEE_FORM_UNIT_BUTTON_CLASS_NAME}
		prefix=""
		suffix={t('FEE_VALUE_SUFFIX_PERCENT')}
	/>
)
