import { TagTokenInput, normalizeTags } from '../../primitives/tag-token-input'

import type { FormTypeRenderer } from './index'

const TAGS_INVALID_MESSAGE_KEY = 'DASHBOARD_ENTRY_FIELD_TAGS_INVALID'

// @story [[lucrjournal/form#^tags-form-bridge]] Bridges normalized token values to the comma-delimited form string
export const TagsFormFieldRenderer: FormTypeRenderer<'tags'> = ({
	value,
	onChange,
	placeholder,
	classNames,
	tagOptions,
	localize,
}) => (
	<div className={classNames?.input}>
		<TagTokenInput
			value={normalizeTags(value.split(','))}
			onChange={(nextTags) => onChange(nextTags.join(', '))}
			suggestions={tagOptions}
			placeholder={placeholder}
			invalidMessage={localize(TAGS_INVALID_MESSAGE_KEY)}
		/>
	</div>
)
