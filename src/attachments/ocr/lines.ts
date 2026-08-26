import type { PositionAttachmentOcrRecognition } from '../ocr-runtime'

export const TRADING_VIEW_MIN_PRICE_CANDIDATE = 1_000
export const TRADING_VIEW_NUMBER_PATTERN = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g
export const TRADING_VIEW_CONTEXT_KEYWORD_PATTERN = /\b(?:amount|long|open|qty|risk\/reward|risk|reward|short|stop|target)\b/i

export type TradingViewPriceCandidate = {
	lineIndex: number
	value: number
}

export function isLikelyRoundNumberGridPrice(value: number) {
	return Math.abs(value % 100) < 0.0001
}

export function isLikelyTradingViewDistanceValue(value: number) {
	return value > 0 && value < TRADING_VIEW_MIN_PRICE_CANDIDATE
}

const METATRADER_MOBILE_NUMBER_PATTERN = /(?:\d+(?:[ ,]\d{3})+|\d+)(?:\.\d+)?/g

export type NormalizedOcrLine = {
	canonical: string
	index: number
}

export function buildNormalizedOcrLines(recognition: PositionAttachmentOcrRecognition): NormalizedOcrLine[] {
	const lines = recognition.lines.length > 0
		? recognition.lines.map((line) => line.text)
		: recognition.text.split('\n')

	return lines
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line, index) => ({
			canonical: canonicalizeOcrLine(line),
			index,
		}))
}

export function extractAnchoredNumber(lines: NormalizedOcrLine[], labelPatterns: RegExp[]) {
	for (let index = 0; index < lines.length; index++) {
		const currentLine = lines[index]!
		const labelMatch = findLabelMatch(currentLine.canonical, labelPatterns)
		if (labelMatch === null) {
			continue
		}

		const sameLineValue = extractFirstTradingViewNumber(
			currentLine.canonical.slice(labelMatch.index + labelMatch[0].length),
		)
		if (sameLineValue !== undefined) {
			return sameLineValue
		}

		const nextLine = lines[index + 1]
		if (nextLine === undefined) {
			continue
		}

		const nextLineValue = extractFirstTradingViewNumber(nextLine.canonical)
		if (nextLineValue !== undefined) {
			return nextLineValue
		}
	}

	return undefined
}

export function findFirstLabelLineIndex(lines: NormalizedOcrLine[], labelPatterns: RegExp[]) {
	for (const line of lines) {
		if (findLabelMatch(line.canonical, labelPatterns) !== null) {
			return line.index
		}
	}

	return undefined
}

export function findLabelMatch(text: string, labelPatterns: RegExp[]) {
	for (const pattern of labelPatterns) {
		const match = pattern.exec(text)
		if (match !== null) {
			return match
		}
	}

	return null
}

export function canonicalizeOcrLine(text: string) {
	return text
		.toLowerCase()
		.replace(/[\u00b5\u03bc]/g, 'u')
		.replace(/([a-z0-9])(?=(qty|stop|target)\b)/gi, '$1 ')
		.replaceAll('\u00d7', 'x')
		.replaceAll(':', ' ')
		.replaceAll('|', ' ')
		.replace(/[^\w\u4e00-\u9fff./,+\- ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export function normalizeNumericToken(token: string) {
	return token
		.replaceAll(',', '')
		.replace(/\s+/g, '')
		.replace(/[o]/gi, '0')
}

export function extractFirstTradingViewNumber(text: string) {
	const croppedText = cropTradingViewValueSegment(text)
	return extractFirstNumber(croppedText)
}

export function extractQuantityNumber(text: string) {
	const croppedText = cropTradingViewValueSegment(text)
	const gluedPriceMatch = croppedText.match(/^\s*(0\.\d{3})(?=\d{5}\.\d\b)/)
	if (gluedPriceMatch?.[1] !== undefined) {
		return Number.parseFloat(gluedPriceMatch[1])
	}

	return extractFirstNumber(croppedText)
}

function cropTradingViewValueSegment(text: string) {
	const stopPatterns = [
		/\bamount\b/i,
		/\brisk\/reward\b/i,
		/\bopen\b/i,
		/(?<![a-z])qty\b/i,
		/(?<![a-z])stop\b/i,
		/(?<![a-z])target\b/i,
	]

	let endIndex = text.length
	for (const pattern of stopPatterns) {
		const match = pattern.exec(text)
		if (match === null || match.index === 0) {
			continue
		}

		endIndex = Math.min(endIndex, match.index)
	}

	return text.slice(0, endIndex).trim()
}

export function extractLeadingQuantityBeforeAxisPrice(text: string | undefined) {
	if (text === undefined) {
		return undefined
	}

	const match = text.match(/^\s*(0\.\d{3})(?=\d{5}\.\d\b)/)
	if (match?.[1] === undefined) {
		return undefined
	}

	return Number.parseFloat(match[1])
}

export function extractFirstMetaTraderNumber(text: string) {
	const match = text.match(METATRADER_MOBILE_NUMBER_PATTERN)
	if (match === null) {
		return undefined
	}

	const parsedValue = Number.parseFloat(normalizeNumericToken(match[0]))
	return Number.isNaN(parsedValue) ? undefined : parsedValue
}

export function extractMetaTraderNumbers(text: string) {
	return Array.from(text.matchAll(METATRADER_MOBILE_NUMBER_PATTERN))
		.map((match) => Number.parseFloat(normalizeNumericToken(match[0])))
		.filter((value) => !Number.isNaN(value))
}

function extractFirstNumber(text: string) {
	const match = text.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/)
	if (match === null) {
		return undefined
	}

	const normalizedValue = normalizeNumericToken(match[0])
	const parsedValue = Number.parseFloat(normalizedValue)
	return Number.isNaN(parsedValue) ? undefined : parsedValue
}
