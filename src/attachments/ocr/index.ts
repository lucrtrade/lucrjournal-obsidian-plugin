/// <reference types="vitest/importMeta" />

import { createLogger } from '../../logger'
import {
	preparePositionAttachmentOcrRuntime,
	recognizePositionAttachmentText,
	type PositionAttachmentOcrProgress,
} from '../ocr-runtime'

import {
	extractPositionAttachmentOcrResultFromImageRecognition,
	extractPositionAttachmentOcrResultFromRecognition,
} from './extract'
import {
	POSITION_ATTACHMENT_OCR_FIELDS,
	type PositionAttachmentOcrResult,
} from './fields'
import { TRADING_VIEW_NUMBER_PATTERN } from './lines'
import {
	findNearestTradingViewOverlaySegment,
	mergePositionAttachmentOcrResultWithVisualPriceMatch,
	resolveTradingViewRightAxisValue,
} from './tradingview-pixels'

export type { PositionAttachmentOcrResult, PositionAttachmentOcrDraft } from './fields'
export {
	mergePositionAttachmentOcrResults,
	hasRecognizedPositionAttachmentOcrResult,
	buildPositionAttachmentOcrDraft,
	buildPositionAttachmentOcrFieldPatch,
	listRecognizedPositionAttachmentOcrValues,
} from './merge'

const logger = createLogger('ocr')

const POSITION_ATTACHMENT_OCR_DELAY_MS = 720

export function getPositionAttachmentOcrFields() {
	return POSITION_ATTACHMENT_OCR_FIELDS
}

export async function preparePositionAttachmentOcr(options?: {
	onProgress?: (progress: PositionAttachmentOcrProgress) => void
}) {
	await preparePositionAttachmentOcrRuntime(options)
}

export async function detectPositionAttachmentOcr(
	buffer: ArrayBuffer,
	options?: {
		onProgress?: (progress: PositionAttachmentOcrProgress) => void
	},
): Promise<PositionAttachmentOcrResult> {
	await delay(POSITION_ATTACHMENT_OCR_DELAY_MS)

	const recognition = await recognizePositionAttachmentText(buffer, options)

	logger.debug('detected position attachment ocr', { ...recognition })
	return await extractPositionAttachmentOcrResultFromImageRecognition(buffer, recognition)
}

function delay(durationMs: number) {
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, durationMs)
	})
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('position attachment OCR helpers', () => {
		it('does not treat source paths and diff counts as a position', async () => {
			const png = new Uint8Array([
				137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
				0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
				0, 0, 0, 13, 73, 68, 65, 84, 8, 29, 99, 248, 207, 192, 240, 31,
				0, 5, 128, 2, 63, 73, 194, 192, 61, 0, 0, 0, 0, 73, 69, 78, 68,
				174, 66, 96, 130,
			])
			const result = await extractPositionAttachmentOcrResultFromImageRecognition(
				png.buffer,
				{
					confidence: 0.88,
					lines: [
						{ confidence: 0.99, text: 'A Edited 4 files' },
						{ confidence: 0.99, text: 'src/global-screenshot.ts' },
						{ confidence: 0.99, text: '+128-10' },
						{ confidence: 0.99, text: '+41 -12' },
						{ confidence: 0.99, text: 'src/ui/attachment/ocr-position-import-modal.tsx' },
					],
					text: 'A Edited 4 files\nsrc/global-screenshot.ts\n+128-10\n+41 -12\nsrc/ui/attachment/ocr-position-import-modal.tsx',
				},
			)
			expect(result.symbol).toBeUndefined()
			expect(result.side).toBeUndefined()
			expect(result.notional_amount).toBeUndefined()
		})

		it('extracts OCR fields from anchored text lines', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.91,
				lines: [
					{ confidence: 0.92, text: 'Qty: 0.35 BTC' },
					{ confidence: 0.89, text: 'Stop: 62450.50' },
					{ confidence: 0.9, text: 'Target: 68200' },
				],
				text: 'Qty: 0.35 BTC\nStop: 62450.50\nTarget: 68200',
			})).toEqual({
				notional_value: 0.35,
				stop_loss: 62450.5,
				target_price: 68200,
			})
		})

		it('extracts the first stop value from dense trading text', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.9,
				lines: [
					{ confidence: 0.9, text: 'Stop: 445.0 (0.593%) 4,450, Amount: 19000.64' },
				],
				text: 'Stop: 445.0 (0.593%) 4,450, Amount: 19000.64',
			})).toEqual({
				stop_loss: 445,
			})
		})

		it('extracts OCR fields when value is rendered on the next line', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.88,
				lines: [
					{ confidence: 0.9, text: 'Qty:' },
					{ confidence: 0.84, text: '1,250.75' },
					{ confidence: 0.91, text: 'Stop:' },
					{ confidence: 0.87, text: '61,000' },
					{ confidence: 0.86, text: 'Target:' },
					{ confidence: 0.83, text: '68,250' },
				],
				text: 'Qty:\n1,250.75\nStop:\n61,000\nTarget:\n68,250',
			})).toEqual({
				notional_value: 1250.75,
				stop_loss: 61000,
				target_price: 68250,
			})
		})

		// @story [[lucrjournal/ocr#^platform-ocr-extraction]] Covers MetaTrader mobile field extraction
		it('extracts MetaTrader mobile position fields', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.98,
				lines: [
					{ confidence: 0.98, text: 'XAUUSD+, selI 0.01' },
					{ confidence: 0.98, text: '-0.27' },
					{ confidence: 0.98, text: '4 519.44 -> 4 519.71' },
					{ confidence: 0.98, text: 'S/L:' },
					{ confidence: 0.98, text: '4 520.73 Swap:' },
					{ confidence: 0.98, text: '0.00' },
					{ confidence: 0.98, text: 'T/P:' },
					{ confidence: 0.98, text: '4 516.19' },
				],
				text: 'XAUUSD+, selI 0.01\n-0.27\n4 519.44 -> 4 519.71\nS/L:\n4 520.73 Swap:\n0.00\nT/P:\n4 516.19',
			})).toEqual({
				entry_price: 4519.44,
				exit_price: 4519.71,
				notional_value: 0.01,
				stop_loss: 4520.73,
				target_price: 4516.19,
			})
		})

		it('extracts MetaTrader history table position fields', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.98,
				lines: [
					{ confidence: 0.98, text: 'sell' },
					{ confidence: 0.98, text: '0.01' },
					{ confidence: 0.98, text: '4519.44' },
					{ confidence: 0.98, text: '4520.73 x 4516.19 x' },
					{ confidence: 0.98, text: '4519.71 -0.27 X' },
				],
				text: 'sell\n0.01\n4519.44\n4520.73 x 4516.19 x\n4519.71 -0.27 X',
			})).toEqual({
				entry_price: 4519.44,
				exit_price: 4519.71,
				notional_value: 0.01,
				stop_loss: 4520.73,
				target_price: 4516.19,
			})
		})

		it('extracts the first MetaTrader history list position', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.98,
				lines: [
					{ confidence: 0.98, text: 'XAUUSDb\u00b5y 0.05' },
					{ confidence: 0.98, text: '2026.05.22 17:28:2' },
					{ confidence: 0.98, text: '4 495.46 -> 4 497.76' },
					{ confidence: 0.98, text: '11.50' },
					{ confidence: 0.98, text: 'XAUUSDb\u00b5y 0.05' },
					{ confidence: 0.98, text: '4 499.43 -> 4 500.31' },
					{ confidence: 0.98, text: 'S/L:' },
					{ confidence: 0.98, text: '4 495.00 Swap:' },
				],
				text: 'XAUUSDb\u00b5y 0.05\n2026.05.22 17:28:2\n4 495.46 -> 4 497.76\n11.50\nXAUUSDb\u00b5y 0.05\n4 499.43 -> 4 500.31\nS/L:\n4 495.00 Swap:',
			})).toEqual({
				entry_price: 4495.46,
				exit_price: 4497.76,
				notional_value: 0.05,
			})
		})

		// @story [[lucrjournal/ocr#^platform-ocr-extraction]] Covers TradingView text and axis extraction
		it('extracts OCR fields from fused tradingview text without spaces before labels', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.82,
				lines: [
					{ confidence: 0.82, text: '76,200' },
					{ confidence: 0.82, text: '76,000' },
					{ confidence: 0.82, text: '75,800' },
					{ confidence: 0.82, text: 'Stop:445.00.593%)4,450,Amount:19000.64' },
					{ confidence: 0.82, text: '75,600' },
					{ confidence: 0.82, text: '0 75,525' },
					{ confidence: 0.82, text: '75,400' },
					{ confidence: 0.82, text: '75,200' },
					{ confidence: 0.82, text: 'O 0 75,080' },
					{ confidence: 0.82, text: 'Open P&L116.9Qty:4.493 74,963' },
					{ confidence: 0.82, text: 'Risk/reward ratio:3.28' },
					{ confidence: 0.82, text: '74,800' },
					{ confidence: 0.82, text: '74,600' },
					{ confidence: 0.82, text: '74,400' },
					{ confidence: 0.82, text: '74262' },
					{ confidence: 0.82, text: 'A0' },
					{ confidence: 0.82, text: '74,000' },
					{ confidence: 0.82, text: '73,800' },
					{ confidence: 0.82, text: '0 73,622' },
					{ confidence: 0.82, text: 'Target:1457.51.941%)14,575,Amount:23273.19' },
					{ confidence: 0.82, text: '73,400' },
					{ confidence: 0.82, text: '73,200' },
				],
				text: [
					'76,200',
					'76,000',
					'75,800',
					'Stop:445.00.593%)4,450,Amount:19000.64',
					'75,600',
					'0 75,525',
					'75,400',
					'75,200',
					'O 0 75,080',
					'Open P&L116.9Qty:4.493 74,963',
					'Risk/reward ratio:3.28',
					'74,800',
					'74,600',
					'74,400',
					'74262',
					'A0',
					'74,000',
					'73,800',
					'0 73,622',
					'Target:1457.51.941%)14,575,Amount:23273.19',
					'73,400',
					'73,200',
				].join('\n'),
			})).toEqual({
				notional_value: 4.493,
				stop_loss: 75525,
				target_price: 73622,
				entry_price: 75080,
			})
		})

		it('extracts entry price from TradingView offsets and coordinate axis prices', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.95,
				lines: [
					{ confidence: 0.95, text: '75420.0' },
					{ confidence: 0.95, text: 'Target: 560 (0.75%) 5600' },
					{ confidence: 0.95, text: 'Long, Qty: 0.147' },
					{ confidence: 0.95, text: '74860.0' },
					{ confidence: 0.95, text: 'Stop: 340 (0.45%) 3400' },
					{ confidence: 0.95, text: '74520.0' },
				],
				text: '75420.0\nTarget: 560 (0.75%) 5600\nLong, Qty: 0.147\n74860.0\nStop: 340 (0.45%) 3400\n74520.0',
			})).toEqual({
				notional_value: 0.147,
				entry_price: 74860,
				stop_loss: 74520,
				target_price: 75420,
			})
		})

		it('extracts entry price for Short position even if target price label is missing', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.95,
				lines: [
					{ confidence: 0.95, text: 'Stop: 290 (0.39%) 2900' },
					{ confidence: 0.95, text: '74730.0' },
					{ confidence: 0.95, text: 'Short, Qty: 0.172' },
					{ confidence: 0.95, text: '74440.0' },
					{ confidence: 0.95, text: 'Target: 1180 (1.59%) 11800' },
				],
				text: 'Stop: 290 (0.39%) 2900\n74730.0\nShort, Qty: 0.172\n74440.0\nTarget: 1180 (1.59%) 11800',
			})).toEqual({
				notional_value: 0.172,
				entry_price: 74440,
				stop_loss: 74730,
				target_price: 73260,
			})
		})

		it('prefers the axis price closest to the overlay context when round-number grid values also match', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.95,
				lines: [
					{ confidence: 0.95, text: '74900.0' },
					{ confidence: 0.95, text: 'Stop: 300 (0.40%) 3000, Amount: 950.00' },
					{ confidence: 0.95, text: '74730.0' },
					{ confidence: 0.95, text: '74600.0' },
					{ confidence: 0.95, text: '74430.0' },
					{ confidence: 0.95, text: 'Short, Qty: 0.167' },
					{ confidence: 0.95, text: '74000.0' },
					{ confidence: 0.95, text: '73830.0' },
					{ confidence: 0.95, text: 'Target: 600 (0.81%) 6000, Amount: 1100.00' },
				],
				text: '74900.0\nStop: 300 (0.40%) 3000, Amount: 950.00\n74730.0\n74600.0\n74430.0\nShort, Qty: 0.167\n74000.0\n73830.0\nTarget: 600 (0.81%) 6000, Amount: 1100.00',
			})).toEqual({
				notional_value: 0.167,
				entry_price: 74430,
				stop_loss: 74730,
				target_price: 73830,
			})
		})

		it('extracts qty when OCR glues it to the previous price axis value', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.95,
				lines: [
					{ confidence: 0.95, text: '0.20481467.3' },
					{ confidence: 0.95, text: 'Long. Qty:' },
				],
				text: '0.20481467.3\nLong. Qty:',
			})).toEqual({
				notional_value: 0.204,
			})
		})

		it('extracts qty when OCR glues it to the same line price axis value', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.95,
				lines: [
					{ confidence: 0.95, text: 'Short, Qty: 0.16774360.0' },
				],
				text: 'Short, Qty: 0.16774360.0',
			})).toEqual({
				notional_value: 0.167,
			})
		})

		it('does not read Open P&L as qty fallback', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.95,
				lines: [
					{ confidence: 0.95, text: 'Long. Qty:' },
					{ confidence: 0.95, text: 'Open P&L: 160,000 81420.0' },
				],
				text: 'Long. Qty:\nOpen P&L: 160,000 81420.0',
			})).toEqual({})
		})

		it('prefers overlay price when OCR fuses it with a round grid price', () => {
			const matches = Array.from('75420.0 75500.0'.matchAll(TRADING_VIEW_NUMBER_PATTERN))
			expect(resolveTradingViewRightAxisValue(matches)).toBe(75420)
		})

		it('snaps entry stop and target prices back to the price axis when OCR entry is off by a few points', () => {
			expect(extractPositionAttachmentOcrResultFromRecognition({
				confidence: 0.95,
				lines: [
					{ confidence: 0.95, text: 'Stop: 270 (0.36%) 2700, Amount: 950.00' },
					{ confidence: 0.95, text: '75190.0' },
					{ confidence: 0.95, text: '74923.0' },
					{ confidence: 0.95, text: 'Short, Qty: 0.185' },
					{ confidence: 0.95, text: '74470.0' },
					{ confidence: 0.95, text: '73960.0' },
					{ confidence: 0.95, text: '73720.0' },
					{ confidence: 0.95, text: 'Target: 1200 (1.60%) 12000, Amount: 1222.22' },
				],
				text: 'Stop: 270 (0.36%) 2700, Amount: 950.00\n75190.0\n74923.0\nShort, Qty: 0.185\n74470.0\n73960.0\n73720.0\nTarget: 1200 (1.60%) 12000, Amount: 1222.22',
			})).toEqual({
				notional_value: 0.185,
				entry_price: 74920,
				stop_loss: 75190,
				target_price: 73720,
			})
		})

		it('fills missing price fields from the visual overlay match', () => {
			expect(mergePositionAttachmentOcrResultWithVisualPriceMatch(
				{},
				{
					entry_price: 81340,
					stop_loss: 81120,
					target_price: 81960,
				},
			)).toEqual({
				entry_price: 81340,
				stop_loss: 81120,
				target_price: 81960,
			})
		})

		it('prefers visual price over TradingView distance value', () => {
			expect(mergePositionAttachmentOcrResultWithVisualPriceMatch(
				{
					entry_price: 74860,
					stop_loss: 340,
					target_price: 75420,
				},
				{
					entry_price: 74860,
					stop_loss: 74520,
					target_price: 75420,
				},
			)).toEqual({
				entry_price: 74860,
				stop_loss: 74520,
				target_price: 75420,
			})
		})

		it('prefers non-round visual target over round-number grid target', () => {
			expect(mergePositionAttachmentOcrResultWithVisualPriceMatch(
				{
					entry_price: 81340,
					stop_loss: 81120,
					target_price: 82000,
				},
				{
					entry_price: 81300,
					stop_loss: 81080,
					target_price: 81960,
				},
			)).toEqual({
				entry_price: 81300,
				stop_loss: 81080,
				target_price: 81960,
			})
		})

		it('keeps close overlay row segments together', () => {
			const rows = new Array<number>(50).fill(0)
			for (let index = 10; index <= 22; index += 1) {
				rows[index] = 100
			}
			for (let index = 24; index <= 40; index += 1) {
				rows[index] = 100
			}

			expect(findNearestTradingViewOverlaySegment(rows, 50, {
				end: 8,
				peak: 100,
				start: 0,
			})).toEqual({
				end: 40,
				peak: 100,
				start: 10,
			})
		})
	})
}
