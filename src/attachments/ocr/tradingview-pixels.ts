import { CanvasProcessor } from 'ppu-ocv/canvas'

import {
	TRADING_VIEW_CONTEXT_KEYWORD_PATTERN,
	TRADING_VIEW_MIN_PRICE_CANDIDATE,
	TRADING_VIEW_NUMBER_PATTERN,
	canonicalizeOcrLine,
	isLikelyRoundNumberGridPrice,
	isLikelyTradingViewDistanceValue,
	normalizeNumericToken,
} from './lines'

import type { PositionAttachmentOcrRecognition } from '../ocr-runtime'
import type { PositionAttachmentOcrResult } from './fields'

const TRADING_VIEW_OVERLAY_SEGMENT_MAX_GAP = 3

type TradingViewVisualPriceMatch = {
	entry_price: number
	stop_loss: number
	target_price: number
}

type TradingViewOverlaySegment = {
	end: number
	peak: number
	start: number
}

export async function extractTradingViewVisualPriceMatch(
	buffer: ArrayBuffer,
	recognition: PositionAttachmentOcrRecognition,
): Promise<TradingViewVisualPriceMatch | undefined> {
	const canvas = await CanvasProcessor.prepareCanvas(buffer) as {
		getContext: (contextId: '2d') => CanvasRenderingContext2D | null
		height: number
		width: number
	}
	const width = canvas.width
	const height = canvas.height
	if (width === 0 || height === 0) {
		return undefined
	}

	const context = canvas.getContext('2d')
	if (context === null) {
		return undefined
	}
	const imageData = context.getImageData(0, 0, width, height)
	const overlayRange = detectTradingViewOverlayRange(imageData.data, width, height)
	if (overlayRange === undefined) {
		return undefined
	}

	const axisCandidates = extractTradingViewRightAxisPriceCandidates(recognition, width)
	if (axisCandidates.length < 3) {
		return undefined
	}

	const targetCandidate = findNearestTradingViewAxisCandidate(axisCandidates, overlayRange.targetY)
	const entryCandidate = findNearestTradingViewAxisCandidate(axisCandidates, overlayRange.entryY)
	const stopCandidate = findNearestTradingViewAxisCandidate(axisCandidates, overlayRange.stopY)
	if (targetCandidate === undefined || entryCandidate === undefined || stopCandidate === undefined) {
		return undefined
	}

	const visualPriceMatch = {
		entry_price: entryCandidate.value,
		stop_loss: stopCandidate.value,
		target_price: targetCandidate.value,
	}

	if (!hasMonotonicTradingViewPriceOrdering(visualPriceMatch)) {
		return undefined
	}

	return visualPriceMatch
}

export function mergePositionAttachmentOcrResultWithVisualPriceMatch(
	textResult: PositionAttachmentOcrResult,
	visualPriceMatch: TradingViewVisualPriceMatch | undefined,
): PositionAttachmentOcrResult {
	if (visualPriceMatch === undefined) {
		return textResult
	}

	const mergedResult: PositionAttachmentOcrResult = {
		...textResult,
	}

	const shouldPreferWholeVisualTuple = (
		textResult.target_price !== undefined
		&& textResult.target_price !== visualPriceMatch.target_price
		&& isLikelyRoundNumberGridPrice(textResult.target_price)
		&& !isLikelyRoundNumberGridPrice(visualPriceMatch.target_price)
	)

	if (shouldPreferWholeVisualTuple) {
		return {
			...mergedResult,
			entry_price: visualPriceMatch.entry_price,
			stop_loss: visualPriceMatch.stop_loss,
			target_price: visualPriceMatch.target_price,
		}
	}

	mergedResult.entry_price ??= visualPriceMatch.entry_price
	mergedResult.stop_loss ??= visualPriceMatch.stop_loss
	mergedResult.target_price ??= visualPriceMatch.target_price

	if (
		mergedResult.target_price !== undefined
		&& (
			isLikelyRoundNumberGridPrice(mergedResult.target_price)
			|| isLikelyTradingViewDistanceValue(mergedResult.target_price)
		)
		&& !isLikelyRoundNumberGridPrice(visualPriceMatch.target_price)
	) {
		mergedResult.target_price = visualPriceMatch.target_price
	}

	if (
		mergedResult.stop_loss !== undefined
		&& (
			isLikelyRoundNumberGridPrice(mergedResult.stop_loss)
			|| isLikelyTradingViewDistanceValue(mergedResult.stop_loss)
		)
		&& !isLikelyRoundNumberGridPrice(visualPriceMatch.stop_loss)
	) {
		mergedResult.stop_loss = visualPriceMatch.stop_loss
	}

	return mergedResult
}

function detectTradingViewOverlayRange(pixelData: Uint8ClampedArray, width: number, height: number) {
	const background = sampleTradingViewBackgroundColor(pixelData, width, height)
	const searchMaxX = Math.floor(width * 0.65)
	const greenColumnCounts = new Array<number>(searchMaxX).fill(0)

	for (let x = 0; x < searchMaxX; x += 1) {
		for (let y = 0; y < height; y += 1) {
			if (!isTradingViewGreenOverlayPixel(pixelData, width, x, y, background)) {
				continue
			}

			greenColumnCounts[x]! += 1
		}
	}

	const overlayColumnSegment = findLargestTradingViewOverlaySegment(
		greenColumnCounts,
		Math.max(40, Math.floor(height * 0.18)),
	)
	if (overlayColumnSegment === undefined) {
		return undefined
	}

	const minX = overlayColumnSegment.start
	const maxX = overlayColumnSegment.end

	const rowWidth = maxX - minX + 1
	const minRowPixelCount = Math.max(36, Math.floor(rowWidth * 0.72))
	const greenRows = new Array<number>(height).fill(0)
	const grayRows = new Array<number>(height).fill(0)

	for (let y = 0; y < height; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			if (isTradingViewGreenOverlayPixel(pixelData, width, x, y, background)) {
				greenRows[y]! += 1
				continue
			}

			if (isTradingViewGrayOverlayPixel(pixelData, width, x, y, background)) {
				grayRows[y]! += 1
			}
		}
	}

	const greenSegment = findLargestTradingViewOverlaySegment(greenRows, minRowPixelCount)
	if (greenSegment === undefined) {
		return undefined
	}

	const graySegment = findNearestTradingViewOverlaySegment(grayRows, minRowPixelCount, greenSegment)
	if (graySegment === undefined) {
		return undefined
	}

	if (greenSegment.start < graySegment.start) {
		return {
			entryY: greenSegment.end,
			stopY: graySegment.end,
			targetY: greenSegment.start,
		}
	}

	return {
		entryY: graySegment.end,
		stopY: graySegment.start,
		targetY: greenSegment.end,
	}
}

function sampleTradingViewBackgroundColor(pixelData: Uint8ClampedArray, width: number, height: number) {
	const sampleWidth = Math.min(20, width)
	const sampleHeight = Math.min(20, height)
	let red = 0
	let green = 0
	let blue = 0
	let count = 0

	for (let y = 0; y < sampleHeight; y += 1) {
		for (let x = 0; x < sampleWidth; x += 1) {
			const index = ((y * width) + x) * 4
			red += pixelData[index]!
			green += pixelData[index + 1]!
			blue += pixelData[index + 2]!
			count += 1
		}
	}

	return {
		blue: blue / count,
		green: green / count,
		red: red / count,
	}
}

function isTradingViewGreenOverlayPixel(
	pixelData: Uint8ClampedArray,
	width: number,
	x: number,
	y: number,
	background: {
		blue: number
		green: number
		red: number
	},
) {
	const index = ((y * width) + x) * 4
	const red = pixelData[index]!
	const green = pixelData[index + 1]!
	const blue = pixelData[index + 2]!
	return green - red > 8
		&& green - blue > 5
		&& calculateTradingViewBackgroundDelta(red, green, blue, background) > 24
}

function isTradingViewGrayOverlayPixel(
	pixelData: Uint8ClampedArray,
	width: number,
	x: number,
	y: number,
	background: {
		blue: number
		green: number
		red: number
	},
) {
	const index = ((y * width) + x) * 4
	const red = pixelData[index]!
	const green = pixelData[index + 1]!
	const blue = pixelData[index + 2]!
	return Math.abs(red - green) < 8
		&& Math.abs(green - blue) < 8
		&& red < 200
		&& green < 200
		&& blue < 200
		&& calculateTradingViewBackgroundDelta(red, green, blue, background) > 24
}

function calculateTradingViewBackgroundDelta(
	red: number,
	green: number,
	blue: number,
	background: {
		blue: number
		green: number
		red: number
	},
) {
	return Math.abs(red - background.red)
		+ Math.abs(green - background.green)
		+ Math.abs(blue - background.blue)
}

function findLargestTradingViewOverlaySegment(rowCounts: number[], minPixelCount: number) {
	const segments = collectTradingViewOverlaySegments(rowCounts, minPixelCount)
	if (segments.length === 0) {
		return undefined
	}

	return segments.reduce((bestSegment, segment) => {
		const bestSize = (bestSegment.end - bestSegment.start) * bestSegment.peak
		const segmentSize = (segment.end - segment.start) * segment.peak
		return segmentSize > bestSize ? segment : bestSegment
	})
}

export function findNearestTradingViewOverlaySegment(
	rowCounts: number[],
	minPixelCount: number,
	referenceSegment: TradingViewOverlaySegment,
) {
	const segments = mergeCloseTradingViewOverlaySegments(collectTradingViewOverlaySegments(rowCounts, minPixelCount))
		.filter((segment) => segment.end < referenceSegment.start || segment.start > referenceSegment.end)
	if (segments.length === 0) {
		return undefined
	}

	return segments.reduce((bestSegment, segment) => {
		const bestDistance = calculateTradingViewSegmentDistance(bestSegment, referenceSegment)
		const segmentDistance = calculateTradingViewSegmentDistance(segment, referenceSegment)
		return segmentDistance < bestDistance ? segment : bestSegment
	})
}

function collectTradingViewOverlaySegments(rowCounts: number[], minPixelCount: number) {
	const segments: TradingViewOverlaySegment[] = []
	let startIndex: number | undefined
	let peak = 0

	for (let index = 0; index < rowCounts.length; index += 1) {
		const rowCount = rowCounts[index]!
		if (rowCount >= minPixelCount) {
			startIndex ??= index
			peak = Math.max(peak, rowCount)
			continue
		}

		if (startIndex !== undefined) {
			segments.push({
				end: index - 1,
				peak,
				start: startIndex,
			})
			startIndex = undefined
			peak = 0
		}
	}

	if (startIndex !== undefined) {
		segments.push({
			end: rowCounts.length - 1,
			peak,
			start: startIndex,
		})
	}

	return segments.filter((segment) => segment.end - segment.start >= 12)
}

function mergeCloseTradingViewOverlaySegments(segments: TradingViewOverlaySegment[]) {
	const mergedSegments: TradingViewOverlaySegment[] = []

	for (const segment of segments) {
		const previousSegment = mergedSegments[mergedSegments.length - 1]
		if (
			previousSegment !== undefined
			&& segment.start - previousSegment.end <= TRADING_VIEW_OVERLAY_SEGMENT_MAX_GAP
		) {
			previousSegment.end = segment.end
			previousSegment.peak = Math.max(previousSegment.peak, segment.peak)
			continue
		}

		mergedSegments.push({ ...segment })
	}

	return mergedSegments
}

function calculateTradingViewSegmentDistance(
	leftSegment: TradingViewOverlaySegment,
	rightSegment: TradingViewOverlaySegment,
) {
	if (leftSegment.end < rightSegment.start) {
		return rightSegment.start - leftSegment.end
	}

	if (rightSegment.end < leftSegment.start) {
		return leftSegment.start - rightSegment.end
	}

	return 0
}

function extractTradingViewRightAxisPriceCandidates(
	recognition: PositionAttachmentOcrRecognition,
	imageWidth: number,
) {
	return recognition.lines.flatMap((line) => {
		if (line.box === undefined) {
			return []
		}

		const lineRight = line.box.x + line.box.width
		if (lineRight < imageWidth * 0.92) {
			return []
		}

		const canonical = canonicalizeOcrLine(line.text)
		if (TRADING_VIEW_CONTEXT_KEYWORD_PATTERN.test(canonical)) {
			return []
		}

		const valueMatches = Array.from(canonical.matchAll(TRADING_VIEW_NUMBER_PATTERN))
		const lastValueMatch = valueMatches[valueMatches.length - 1]
		if (lastValueMatch === undefined) {
			return []
		}

		const value = resolveTradingViewRightAxisValue(valueMatches)
		if (Number.isNaN(value) || value < TRADING_VIEW_MIN_PRICE_CANDIDATE) {
			return []
		}

		const centerY = line.box.y + (line.box.height / 2)
		return [{
			centerY,
			value,
		}]
	})
}

export function resolveTradingViewRightAxisValue(valueMatches: RegExpMatchArray[]) {
	const firstMatch = valueMatches[0]!
	const lastMatch = valueMatches[valueMatches.length - 1]!
	const firstValue = Number.parseFloat(normalizeNumericToken(firstMatch[0]))
	const lastValue = Number.parseFloat(normalizeNumericToken(lastMatch[0]))

	if (
		valueMatches.length > 1
		&& !Number.isNaN(firstValue)
		&& !isLikelyRoundNumberGridPrice(firstValue)
		&& isLikelyRoundNumberGridPrice(lastValue)
	) {
		return firstValue
	}

	return lastValue
}

function findNearestTradingViewAxisCandidate(
	axisCandidates: Array<{
		centerY: number
		value: number
	}>,
	targetY: number,
) {
	let bestCandidate: {
		centerY: number
		value: number
	} | undefined
	let bestDistance = Number.POSITIVE_INFINITY

	for (const candidate of axisCandidates) {
		const distance = Math.abs(candidate.centerY - targetY)
		if (distance < bestDistance) {
			bestCandidate = candidate
			bestDistance = distance
		}
	}

	return bestCandidate
}

function hasMonotonicTradingViewPriceOrdering(priceMatch: TradingViewVisualPriceMatch) {
	return (
		(priceMatch.target_price > priceMatch.entry_price && priceMatch.entry_price > priceMatch.stop_loss)
		|| (priceMatch.stop_loss > priceMatch.entry_price && priceMatch.entry_price > priceMatch.target_price)
	)
}
