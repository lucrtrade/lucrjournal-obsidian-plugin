/// <reference types="vitest/importMeta" />

import {
	POSITION_ATTACHMENT_OCR_FIELDS,
	type PositionAttachmentOcrDraft,
	type PositionAttachmentOcrPatchContext,
	type PositionAttachmentOcrResult,
} from './fields'

import type { PositionUpdatePatch } from '../../domains'

export function mergePositionAttachmentOcrResults(results: PositionAttachmentOcrResult[]): PositionAttachmentOcrResult {
	const merged: PositionAttachmentOcrResult = {}

	for (const field of POSITION_ATTACHMENT_OCR_FIELDS) {
		const fieldKey = field.key

		switch (fieldKey) {
			case 'notional_value': {
				const value = resolveFirstRecognizedNotionalValue(results)
				if (value === undefined) {
					break
				}
				merged.notional_value = value
				break
			}
			case 'entry_price': {
				const value = resolveFirstRecognizedEntryPrice(results)
				if (value === undefined) {
					break
				}
				merged.entry_price = value
				break
			}
			case 'exit_price': {
				const value = resolveFirstRecognizedExitPrice(results)
				if (value === undefined) {
					break
				}
				merged.exit_price = value
				break
			}
			case 'stop_loss': {
				const value = resolveFirstRecognizedStopLoss(results)
				if (value === undefined) {
					break
				}
				merged.stop_loss = value
				break
			}
			case 'target_price': {
				const value = resolveFirstRecognizedTargetPrice(results)
				if (value === undefined) {
					break
				}
				merged.target_price = value
				break
			}
			default:
				fieldKey satisfies never
				throw new Error('Unknown OCR field key')
		}
	}

	const imageUrl = resolveFirstRecognizedImageUrl(results)
	if (imageUrl !== undefined) {
		merged.image_url = imageUrl
	}

	return merged
}

// @story [[lucrjournal/ocr#^empty-ocr-result]] Requires at least one recognized trade field
export function hasRecognizedPositionAttachmentOcrResult(result: PositionAttachmentOcrResult): boolean {
	return POSITION_ATTACHMENT_OCR_FIELDS.some((field) => {
		const value = result[field.key]
		return value !== undefined && String(value).trim().length > 0
	})
}

export function buildPositionAttachmentOcrDraft(result: PositionAttachmentOcrResult): PositionAttachmentOcrDraft {
	return POSITION_ATTACHMENT_OCR_FIELDS.reduce<PositionAttachmentOcrDraft>((draft, field) => {
		draft[field.key] = field.toDraftValue(result)
		return draft
	}, {
		notional_value: '',
		entry_price: '',
		exit_price: '',
		stop_loss: '',
		target_price: '',
	})
}

// @story [[lucrjournal/ocr#^reviewed-ocr-patch]] Includes only recognized or user-entered reviewed fields
export function buildPositionAttachmentOcrFieldPatch(
	result: PositionAttachmentOcrResult,
	draft: PositionAttachmentOcrDraft,
	context: PositionAttachmentOcrPatchContext = {},
): PositionUpdatePatch {
	const patch: PositionUpdatePatch = {}
	const patchRecord: Partial<Record<Exclude<keyof PositionAttachmentOcrResult, 'image_url'>, string | number | null>> = patch

	for (const field of POSITION_ATTACHMENT_OCR_FIELDS) {
		const hasRecognizedValue = result[field.key] !== undefined
		const hasUserValue = draft[field.key].trim().length > 0
		if (!hasRecognizedValue && !hasUserValue) {
			continue
		}

		patchRecord[field.key] = field.toFrontmatterValue(draft[field.key])
	}

	normalizePositionAttachmentOcrNotionalValuePatch(patch, context)

	return patch
}

// @story [[lucrjournal/ocr#^native-ocr-amount]] Routes native amounts to the native frontmatter field
function normalizePositionAttachmentOcrNotionalValuePatch(
	patch: PositionUpdatePatch,
	context: PositionAttachmentOcrPatchContext,
) {
	if (context.notionalAsset !== 'native' || Object.prototype.hasOwnProperty.call(patch, 'notional_value') === false) {
		return
	}

	patch.notional_amount = patch.notional_value
	delete patch.notional_value
}

export function listRecognizedPositionAttachmentOcrValues(result: PositionAttachmentOcrResult) {
	return POSITION_ATTACHMENT_OCR_FIELDS.flatMap((field) => {
		const value = result[field.key]
		if (value === undefined || String(value).trim().length === 0) {
			return []
		}

		return [{
			key: field.key,
			labelKey: field.labelKey,
			value: field.toDraftValue(result),
		}]
	})
}

function resolveFirstRecognizedNotionalValue(results: PositionAttachmentOcrResult[]) {
	for (const result of results) {
		if (result.notional_value !== undefined) {
			return result.notional_value
		}
	}

	return undefined
}

function resolveFirstRecognizedEntryPrice(results: PositionAttachmentOcrResult[]) {
	for (const result of results) {
		if (result.entry_price !== undefined) {
			return result.entry_price
		}
	}

	return undefined
}

function resolveFirstRecognizedExitPrice(results: PositionAttachmentOcrResult[]) {
	for (const result of results) {
		if (result.exit_price !== undefined) {
			return result.exit_price
		}
	}

	return undefined
}

function resolveFirstRecognizedStopLoss(results: PositionAttachmentOcrResult[]) {
	for (const result of results) {
		if (result.stop_loss !== undefined) {
			return result.stop_loss
		}
	}

	return undefined
}

function resolveFirstRecognizedTargetPrice(results: PositionAttachmentOcrResult[]) {
	for (const result of results) {
		if (result.target_price !== undefined) {
			return result.target_price
		}
	}

	return undefined
}

function resolveFirstRecognizedImageUrl(results: PositionAttachmentOcrResult[]) {
	for (const result of results) {
		if (result.image_url !== undefined) {
			return result.image_url
		}
	}

	return undefined
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest
	const applyPositionAttachmentOcrDraftToFrontmatter = (
		frontmatter: Record<string, unknown>,
		result: PositionAttachmentOcrResult,
		draft: PositionAttachmentOcrDraft,
	) => {
		Object.assign(frontmatter, buildPositionAttachmentOcrFieldPatch(result, draft))
	}

	describe('position attachment OCR merge helpers', () => {
		it('merges the first recognized value for each OCR field', () => {
			expect(mergePositionAttachmentOcrResults([
				{ notional_value: 1.25 },
				{ stop_loss: 123.45 },
				{ notional_value: 2.5, target_price: 234.56 },
			])).toEqual({
				notional_value: 1.25,
				stop_loss: 123.45,
				target_price: 234.56,
			})
		})

		// @story [[lucrjournal/ocr#^manual-ocr-review]] Covers drafts for the canonical review fields
		it('builds and reapplies OCR drafts for position frontmatter fields', () => {
			const draft = buildPositionAttachmentOcrDraft({
				notional_value: 0.35,
				stop_loss: 62450.5,
				target_price: 68200,
			})
			const frontmatter: Record<string, unknown> = {}

			applyPositionAttachmentOcrDraftToFrontmatter(frontmatter, {
				notional_value: 0.35,
				stop_loss: 62450.5,
				target_price: 68200,
			}, draft)

			expect(frontmatter).toEqual({
				notional_value: 0.35,
				stop_loss: 62450.5,
				target_price: 68200,
			})
		})

		// @story [[lucrjournal/ocr#^reviewed-ocr-patch]] Covers preserving unrecognized empty fields
		it('does not overwrite untouched fields that OCR failed to detect', () => {
			const frontmatter: Record<string, unknown> = {
				notional_value: 1,
				stop_loss: 61000,
				target_price: 72000,
			}
			const draft = buildPositionAttachmentOcrDraft({ notional_value: 0.35 })

			applyPositionAttachmentOcrDraftToFrontmatter(frontmatter, { notional_value: 0.35 }, draft)

			expect(frontmatter).toEqual({
				notional_value: 0.35,
				stop_loss: 61000,
				target_price: 72000,
			})
		})

		it('builds a position patch without untouched OCR fields', () => {
			const patch = buildPositionAttachmentOcrFieldPatch({ notional_value: 0.35 }, {
				notional_value: '0.35',
				entry_price: '',
				exit_price: '',
				stop_loss: '',
				target_price: '',
			})

			expect(patch).toEqual({
				notional_value: 0.35,
			})
		})

		// @story [[lucrjournal/ocr#^native-ocr-amount]] Covers native amount routing
		it('routes native OCR amount to notional_amount', () => {
			const patch = buildPositionAttachmentOcrFieldPatch({
				entry_price: 100,
				notional_value: 0.35,
			}, {
				notional_value: '0.35',
				entry_price: '120',
				exit_price: '',
				stop_loss: '',
				target_price: '',
			}, {
				notionalAsset: 'native',
			})

			expect(patch).toEqual({
				entry_price: 120,
				notional_amount: 0.35,
			})
		})

		it('keeps native OCR amount even without a usable entry price', () => {
			const patch = buildPositionAttachmentOcrFieldPatch({ notional_value: 0.35 }, {
				notional_value: '0.35',
				entry_price: '',
				exit_price: '',
				stop_loss: '',
				target_price: '',
			}, {
				notionalAsset: 'native',
			})

			expect(patch).toEqual({ notional_amount: 0.35 })
		})

		// @story [[lucrjournal/ocr#^ocr-does-not-infer-side]] Covers leaving side outside the reviewed patch
		it('does not infer side from reviewed stop and target prices', () => {
			expect(buildPositionAttachmentOcrFieldPatch({}, {
				notional_value: '',
				entry_price: '',
				exit_price: '',
				stop_loss: '105',
				target_price: '95',
			})).toEqual({
				stop_loss: 105,
				target_price: 95,
			})

			expect(buildPositionAttachmentOcrFieldPatch({}, {
				notional_value: '',
				entry_price: '',
				exit_price: '',
				stop_loss: '95',
				target_price: '105',
			})).toEqual({
				stop_loss: 95,
				target_price: 105,
			})
		})

		// @story [[lucrjournal/ocr#^empty-ocr-result]] Covers rejecting preview-only and field-empty results
		it('reports empty OCR payloads correctly', () => {
			expect(hasRecognizedPositionAttachmentOcrResult({})).toBe(false)
			expect(hasRecognizedPositionAttachmentOcrResult({ notional_value: 0 })).toBe(true)
			expect(hasRecognizedPositionAttachmentOcrResult({ image_url: 'blob:preview' })).toBe(false)
		})

		it('does not report preview image metadata as a recognized OCR value', () => {
			expect(listRecognizedPositionAttachmentOcrValues({
				image_url: 'blob:preview',
			})).toEqual([])
		})
	})
}
