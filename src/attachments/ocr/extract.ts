import { buildNormalizedOcrLines, extractAnchoredNumber } from './lines'
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
	const result = mergePositionAttachmentOcrResultWithVisualPriceMatch(textResult, visualPriceMatch)
	const lines = buildNormalizedOcrLines(recognition)
	const creationFields = extractPositionOcrCreationFields(lines)
	const screenshotPrices = extractScreenshotPriceFields(lines, creationFields.side)
	return {
		...result,
		...creationFields,
		...(screenshotPrices.entry_price !== undefined ? { entry_price: screenshotPrices.entry_price } : {}),
		...(screenshotPrices.stop_loss !== undefined ? { stop_loss: screenshotPrices.stop_loss } : {}),
		...(screenshotPrices.target_price !== undefined ? { target_price: screenshotPrices.target_price } : {}),
	}
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

function extractPositionOcrCreationFields(lines: ReturnType<typeof buildNormalizedOcrLines>) {
	for (const line of lines) {
		const metaTraderSide = line.canonical.match(/(buy|sell|seli)/i)
		if (metaTraderSide !== null) {
			return {
				side: /^buy$/i.test(metaTraderSide[1]!) ? 'LONG' as const : 'SHORT' as const,
				symbol: line.canonical
					.slice(0, metaTraderSide.index)
					.match(/[a-z][a-z0-9./:]*/i)?.[0]
					?.toUpperCase()
					.replace(/[+.]+$/, ''),
			}
		}
	}

	const result: PositionAttachmentOcrResult = {}
	if (lines.some((line) => /(?:perp|\u6c38\u7eed|\b\d{1,3}x\b)/i.test(line.canonical))) {
		result.is_perp = true
	}
	const symbol = extractTradingViewSymbol(lines)
	const nativeAmount = extractOcrNativeAmount(lines, symbol)
	if (nativeAmount !== undefined) {
		result.notional_amount = nativeAmount.value
	}
	const side = extractTradingViewSide(lines, nativeAmount)
	if (side !== undefined) {
		result.side = side
	}
	if (symbol !== undefined) {
		result.symbol = result.is_perp === true && !/\.p$/i.test(symbol) ? `${symbol}.P` : symbol
	}
	return result
}

function extractScreenshotPriceFields(
	lines: ReturnType<typeof buildNormalizedOcrLines>,
	side?: 'LONG' | 'SHORT',
): Partial<Pick<PositionAttachmentOcrResult, 'entry_price' | 'stop_loss' | 'target_price'>> {
	const result: Partial<Pick<PositionAttachmentOcrResult, 'entry_price' | 'stop_loss' | 'target_price'>> = {}
	const entryPrice = extractAnchoredNumber(lines, [/\bentry(?:\s+price)?\b/i, /\u5f00\u4ed3\u4ef7\u683c/u])
	if (entryPrice !== undefined) {
		result.entry_price = entryPrice
	} else {
		for (const line of lines) {
			const tableMatch = line.canonical.match(/(?:^|\s)-?\d+(?:\.\d+)?\s+[a-z]{2,12}\s+((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/i)
			if (tableMatch?.[1] !== undefined) {
				const parsed = Number.parseFloat(tableMatch[1].replaceAll(',', ''))
				if (!Number.isNaN(parsed) && parsed > 0) {
					result.entry_price = parsed
					break
				}
			}
		}
	}

	const slashPair = extractSlashPricePair(lines, result.entry_price)
	if (slashPair !== undefined) {
		const [p1, p2] = slashPair
		const effectiveEntry = result.entry_price
		if (side === 'SHORT' || (effectiveEntry !== undefined && Math.min(p1, p2) < effectiveEntry && Math.max(p1, p2) > effectiveEntry && side !== 'LONG')) {
			result.target_price = Math.min(p1, p2)
			result.stop_loss = Math.max(p1, p2)
		} else if (side === 'LONG' || (effectiveEntry !== undefined && Math.min(p1, p2) < effectiveEntry && Math.max(p1, p2) > effectiveEntry)) {
			result.stop_loss = Math.min(p1, p2)
			result.target_price = Math.max(p1, p2)
		} else {
			result.target_price = p1
			result.stop_loss = p2
		}
	} else {
		for (const line of lines) {
			if (!/\u6b62\u76c8\u6b62\u635f/u.test(line.canonical)) {
				continue
			}
			const values = Array.from(line.canonical.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g))
				.map((match) => Number.parseFloat(match[0].replaceAll(',', '')))
				.filter((value) => !Number.isNaN(value))
			if (values.length >= 2) {
				result.target_price = values[0]
				result.stop_loss = values[1]
				break
			}
		}
	}

	return result
}

function extractSlashPricePair(
	lines: ReturnType<typeof buildNormalizedOcrLines>,
	entryPrice?: number,
): [number, number] | undefined {
	const candidates: [number, number][] = []

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.canonical
		if (Array.from(line.matchAll(/\b\d{2}\/\d{2}\b/g)).length >= 2) {
			continue
		}

		// Case 1: same line "90.0000 / 100.0000"
		const sameLineMatches = Array.from(line.matchAll(/(?:^|\s)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*\/\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s|$)/g))
		for (const match of sameLineMatches) {
			if (match[1] && match[2]) {
				if (/^0[1-9]\/[0-3]\d$/.test(match[0].trim())) {
					continue
				}
				const p1 = Number.parseFloat(match[1].replaceAll(',', ''))
				const p2 = Number.parseFloat(match[2].replaceAll(',', ''))
				if (!Number.isNaN(p1) && !Number.isNaN(p2) && p1 > 0 && p2 > 0) {
					candidates.push([p1, p2])
				}
			}
		}

		// Case 2: line contains "price /", and a following line has the other price
		const slashMatch = line.match(/(?:^|\s)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*\/(?:\s*$|\s+[^\d/])/i)
		if (slashMatch?.[1]) {
			if (/^0[1-9]\/$/.test(slashMatch[0].trim())) {
				continue
			}
			const p1 = Number.parseFloat(slashMatch[1].replaceAll(',', ''))
			if (!Number.isNaN(p1) && p1 > 0) {
				for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
					const nextLine = lines[j]!.canonical.trim()
					const exactNumberMatch = nextLine.match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)$/)
					if (exactNumberMatch?.[1]) {
						const p2 = Number.parseFloat(exactNumberMatch[1].replaceAll(',', ''))
						if (!Number.isNaN(p2) && p2 > 0) {
							candidates.push([p1, p2])
						}
					}
				}
			}
		}
	}

	if (candidates.length === 0) {
		return undefined
	}

	if (entryPrice !== undefined) {
		const straddling = candidates.find(
			([p1, p2]) => Math.min(p1, p2) < entryPrice && Math.max(p1, p2) > entryPrice,
		)
		if (straddling !== undefined) {
			return straddling
		}

		const validCandidates = candidates.filter(
			([p1, p2]) => p1 >= entryPrice * 0.05 && p1 <= entryPrice * 20 && p2 >= entryPrice * 0.05 && p2 <= entryPrice * 20,
		)
		if (validCandidates.length > 0) {
			return validCandidates[0]
		}
	}

	return candidates[0]
}

function extractOcrNativeAmount(lines: ReturnType<typeof buildNormalizedOcrLines>, symbol: string | undefined): { isShort: boolean; value: number } | undefined {
	for (const line of lines) {
		const match = line.canonical.match(/(?:^|\s)(-?)(\d+(?:\.\d+)?)\s+([a-z]{2,12})\b/i)
		if (match?.[2] === undefined || match[3] === undefined) {
			continue
		}
		const unit = match[3].toUpperCase()
		if (symbol !== undefined && !symbol.startsWith(unit)) {
			continue
		}
		if (symbol === undefined && match[1] !== '-') {
			continue
		}
		return { isShort: match[1] === '-', value: Number.parseFloat(match[2]) }
	}

	return undefined
}

function extractTradingViewSymbol(lines: ReturnType<typeof buildNormalizedOcrLines>): string | undefined {
	for (const line of lines) {
		const compactSymbol = line.canonical.match(/\b([a-z]{2,12}(?:usdt|usdc))\b/i)?.[1]
		if (compactSymbol !== undefined) {
			return compactSymbol.toUpperCase()
		}
		const exchangeSymbol = line.canonical.match(/\b[a-z0-9]+:([a-z][a-z0-9.]*(?:usdt|usdc)(?:\.p)?)\b/i)?.[1]
		if (exchangeSymbol !== undefined) {
			return exchangeSymbol.toUpperCase()
		}
		const symbol = line.canonical.match(/(?:[a-z0-9]+:)?([a-z0-9]+\/(?:usdt|usdc)(?:\.[a-z0-9]+)?(?::(?:usdt|usdc))?)/i)?.[1]
		if (symbol !== undefined) {
			return symbol.toUpperCase()
		}
	}

	return undefined
}

function extractTradingViewSide(
	lines: ReturnType<typeof buildNormalizedOcrLines>,
	nativeAmount: { isShort: boolean; value: number } | undefined,
): 'LONG' | 'SHORT' | undefined {
	if (nativeAmount?.isShort === true) {
		return 'SHORT'
	}
	for (const line of lines) {
		if (line.canonical === 'long' || /\blong\b.*\b(?:qty|size|amount|contract)\b/i.test(line.canonical)) {
			return 'LONG'
		}
		if (line.canonical === 'short' || /\bshort\b.*\b(?:qty|size|amount|contract)\b/i.test(line.canonical)) {
			return 'SHORT'
		}
	}

	return undefined
}
