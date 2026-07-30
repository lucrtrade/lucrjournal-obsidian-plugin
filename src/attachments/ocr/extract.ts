import { buildNormalizedOcrLines } from './lines'
import { extractMetaTraderMobilePositionResult } from './metatrader'
import {
	extractTradingViewVisualPriceMatch,
	mergePositionAttachmentOcrResultWithVisualPriceMatch,
} from './tradingview-pixels'
import {
	extractNotionalValue,
	extractStopLoss,
	extractTargetPrice,
	extractTradingViewPriceMatch,
} from './tradingview-text'

import type { PositionAttachmentOcrResult } from './fields'
import type { PositionAttachmentOcrRecognition } from '../ocr-runtime'

export async function extractPositionAttachmentOcrResultFromImageRecognition(
	buffer: ArrayBuffer,
	recognition: PositionAttachmentOcrRecognition,
): Promise<PositionAttachmentOcrResult> {
	const textResult = extractPositionAttachmentOcrResultFromRecognition(recognition)
	const visualPriceMatch = await extractTradingViewVisualPriceMatch(buffer, recognition)
	return mergePositionAttachmentOcrResultWithVisualPriceMatch(textResult, visualPriceMatch)
}

// @story [[lucrjournal/ocr#^platform-ocr-extraction]] Prefers MetaTrader blocks before TradingView extraction
export function extractPositionAttachmentOcrResultFromRecognition(
	recognition: PositionAttachmentOcrRecognition,
): PositionAttachmentOcrResult {
	const lines = buildNormalizedOcrLines(recognition)
	const metaTraderResult = extractMetaTraderMobilePositionResult(lines)
	if (metaTraderResult !== undefined) {
		return metaTraderResult
	}

	const notionalValue = extractNotionalValue(lines)
	const rawStopLoss = extractStopLoss(lines)
	const rawTargetPrice = extractTargetPrice(lines)

	const result: PositionAttachmentOcrResult = {
		notional_value: notionalValue,
		stop_loss: rawStopLoss,
		target_price: rawTargetPrice,
	}

	if (rawStopLoss !== undefined && rawTargetPrice !== undefined) {
		const tradingViewMatch = extractTradingViewPriceMatch(lines, rawStopLoss, rawTargetPrice)
		if (tradingViewMatch !== undefined) {
			result.entry_price = tradingViewMatch.entryPrice
			result.stop_loss = tradingViewMatch.stopPrice
			result.target_price = tradingViewMatch.targetPrice
		}
	}

	return result
}
