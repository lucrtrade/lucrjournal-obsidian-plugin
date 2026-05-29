import { genericTableRenderers } from './generic-renderers'

import type { BaseFieldType } from '../../../domains/core/fields'
import type { TableRendererRegistry } from '../types'

export const tableRenderers = {
	...genericTableRenderers,
} satisfies TableRendererRegistry<BaseFieldType>
