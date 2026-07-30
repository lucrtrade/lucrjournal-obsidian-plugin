import type { en } from '../../lang/locale/en'

export type PositionAttachmentOcrResult = {
	notional_value?: number
	entry_price?: number
	exit_price?: number
	stop_loss?: number
	target_price?: number
	image_url?: string
}

type PositionAttachmentOcrFieldKey = Exclude<keyof PositionAttachmentOcrResult, 'image_url'>
export type PositionAttachmentOcrDraft = Record<PositionAttachmentOcrFieldKey, string>

export type PositionAttachmentOcrPatchContext = {
	notionalAsset?: 'native' | 'usd' | null
}

type PositionAttachmentOcrFieldDefinition = {
	key: PositionAttachmentOcrFieldKey
	labelKey: keyof typeof en
	inputMode: 'decimal' | 'text'
	inputType: 'number' | 'text'
	toDraftValue: (result: PositionAttachmentOcrResult) => string
	toFrontmatterValue: (draft: string) => number | string | null
}

// @story [[lucrjournal/ocr#^manual-ocr-review]] Defines the only editable and writable OCR fields
export const POSITION_ATTACHMENT_OCR_FIELDS = [
	{
		key: 'notional_value',
		labelKey: 'POSITION_DETAILS_AMOUNT',
		inputMode: 'decimal',
		inputType: 'number',
		toDraftValue: (result) => result.notional_value == null ? '' : String(result.notional_value),
		toFrontmatterValue: (draft) => {
			const trimmed = draft.trim()
			if (trimmed === '') {
				return null
			}

			const parsed = Number.parseFloat(trimmed)
			return Number.isNaN(parsed) ? null : parsed
		},
	},
	{
		key: 'entry_price',
		labelKey: 'POSITION_DETAILS_ENTRY_PRICE',
		inputMode: 'decimal',
		inputType: 'number',
		toDraftValue: (result) => result.entry_price == null ? '' : String(result.entry_price),
		toFrontmatterValue: (draft) => {
			const trimmed = draft.trim()
			if (trimmed === '') {
				return null
			}

			const parsed = Number.parseFloat(trimmed)
			return Number.isNaN(parsed) ? null : parsed
		},
	},
	{
		key: 'exit_price',
		labelKey: 'POSITION_DETAILS_EXIT_PRICE',
		inputMode: 'decimal',
		inputType: 'number',
		toDraftValue: (result) => result.exit_price == null ? '' : String(result.exit_price),
		toFrontmatterValue: (draft) => {
			const trimmed = draft.trim()
			if (trimmed === '') {
				return null
			}

			const parsed = Number.parseFloat(trimmed)
			return Number.isNaN(parsed) ? null : parsed
		},
	},
	{
		key: 'stop_loss',
		labelKey: 'POSITION_DETAILS_STOP_LOSS',
		inputMode: 'decimal',
		inputType: 'number',
		toDraftValue: (result) => result.stop_loss == null ? '' : String(result.stop_loss),
		toFrontmatterValue: (draft) => {
			const trimmed = draft.trim()
			if (trimmed === '') {
				return null
			}

			const parsed = Number.parseFloat(trimmed)
			return Number.isNaN(parsed) ? null : parsed
		},
	},
	{
		key: 'target_price',
		labelKey: 'POSITION_DETAILS_TARGET_PRICE',
		inputMode: 'decimal',
		inputType: 'number',
		toDraftValue: (result) => result.target_price == null ? '' : String(result.target_price),
		toFrontmatterValue: (draft) => {
			const trimmed = draft.trim()
			if (trimmed === '') {
				return null
			}

			const parsed = Number.parseFloat(trimmed)
			return Number.isNaN(parsed) ? null : parsed
		},
	},
] as const satisfies readonly PositionAttachmentOcrFieldDefinition[]
