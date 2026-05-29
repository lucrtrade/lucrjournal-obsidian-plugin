import {
	type NormalizedOcrLine,
	TRADING_VIEW_CONTEXT_KEYWORD_PATTERN,
	TRADING_VIEW_MIN_PRICE_CANDIDATE,
	TRADING_VIEW_NUMBER_PATTERN,
	type TradingViewPriceCandidate,
	extractAnchoredNumber,
	extractFirstTradingViewNumber,
	extractLeadingQuantityBeforeAxisPrice,
	extractQuantityNumber,
	findFirstLabelLineIndex,
	findLabelMatch,
	normalizeNumericToken,
} from './lines'

type TradingViewDirection = 'long' | 'short'

type TradingViewDirectionMatch = {
	direction: TradingViewDirection
	lineIndex: number
}

type TradingViewAxisMatch = TradingViewPriceCandidate & {
	matchKind: 'exact' | 'relaxed'
}

type TradingViewEntryMatch = {
	entryPrice: number
	stopPrice: number
	targetPrice: number
	score: number
}

const TRADING_VIEW_PRICE_MATCH_EPSILON = 2
const TRADING_VIEW_RELAXED_PRICE_MATCH_EPSILON = 5

export function extractTradingViewPriceMatch(lines: NormalizedOcrLine[], stopOffset: number, targetOffset: number) {
	const axisCandidates = extractTradingViewAxisPriceCandidates(lines)
	if (axisCandidates.length === 0) {
		return undefined
	}

	const explicitDirectionMatch = detectTradingViewDirection(lines)
	const stopLabelLineIndex = findFirstLabelLineIndex(lines, [/(?<![a-z])stop\b/i])
	const targetLabelLineIndex = findFirstLabelLineIndex(lines, [/(?<![a-z])target\b/i])
	const directionMatches = explicitDirectionMatch === undefined
		? ([
			{
				direction: 'long',
				lineIndex: inferTradingViewDirectionAnchorLineIndex(stopLabelLineIndex, targetLabelLineIndex),
			},
			{
				direction: 'short',
				lineIndex: inferTradingViewDirectionAnchorLineIndex(stopLabelLineIndex, targetLabelLineIndex),
			},
		] as const satisfies readonly TradingViewDirectionMatch[])
		: [explicitDirectionMatch]

	let bestMatch: TradingViewEntryMatch | undefined

	for (const directionMatch of directionMatches) {
		for (const entryCandidate of axisCandidates) {
			const entryMatch = scoreTradingViewEntryCandidate(
				entryCandidate,
				axisCandidates,
				directionMatch,
				stopOffset,
				targetOffset,
				stopLabelLineIndex,
				targetLabelLineIndex,
				explicitDirectionMatch !== undefined,
			)

			if (entryMatch === undefined) {
				continue
			}

			if (bestMatch === undefined || entryMatch.score > bestMatch.score) {
				bestMatch = entryMatch
			}
		}
	}

	return bestMatch
}

function scoreTradingViewEntryCandidate(
	entryCandidate: TradingViewPriceCandidate,
	axisCandidates: TradingViewPriceCandidate[],
	directionMatch: TradingViewDirectionMatch,
	stopOffset: number,
	targetOffset: number,
	stopLabelLineIndex: number | undefined,
	targetLabelLineIndex: number | undefined,
	hasExplicitDirection: boolean,
): TradingViewEntryMatch | undefined {
	const expectedStopPrice = directionMatch.direction === 'long'
		? entryCandidate.value - stopOffset
		: entryCandidate.value + stopOffset
	const expectedTargetPrice = directionMatch.direction === 'long'
		? entryCandidate.value + targetOffset
		: entryCandidate.value - targetOffset

	const stopCandidate = findBestTradingViewAxisMatch(
		axisCandidates,
		expectedStopPrice,
		entryCandidate.lineIndex,
		directionMatch.direction === 'long' ? 'below' : 'above',
		stopLabelLineIndex,
	)
	const targetCandidate = findBestTradingViewAxisMatch(
		axisCandidates,
		expectedTargetPrice,
		entryCandidate.lineIndex,
		directionMatch.direction === 'long' ? 'above' : 'below',
		targetLabelLineIndex,
	)

	if (stopCandidate === undefined && targetCandidate === undefined) {
		return undefined
	}

	if (!hasExplicitDirection && (stopCandidate === undefined || targetCandidate === undefined)) {
		return undefined
	}

	let score = 0

	if (stopCandidate !== undefined) {
		score += 120
		if (stopCandidate.matchKind === 'exact') {
			score += 24
		}
	}

	if (targetCandidate !== undefined) {
		score += 120
		if (targetCandidate.matchKind === 'exact') {
			score += 24
		}
	}

	if (stopCandidate !== undefined && targetCandidate !== undefined) {
		const hasExpectedOrdering = directionMatch.direction === 'long'
			? targetCandidate.lineIndex < entryCandidate.lineIndex && entryCandidate.lineIndex < stopCandidate.lineIndex
			: stopCandidate.lineIndex < entryCandidate.lineIndex && entryCandidate.lineIndex < targetCandidate.lineIndex
		if (hasExpectedOrdering) {
			score += 80
		}
	}

	score += Math.max(0, 40 - (Math.abs(entryCandidate.lineIndex - directionMatch.lineIndex) * 8))

	if (stopLabelLineIndex !== undefined && stopCandidate !== undefined) {
		score += Math.max(0, 24 - (Math.abs(stopCandidate.lineIndex - stopLabelLineIndex) * 6))
	}

	if (targetLabelLineIndex !== undefined && targetCandidate !== undefined) {
		score += Math.max(0, 24 - (Math.abs(targetCandidate.lineIndex - targetLabelLineIndex) * 6))
	}

	const resolvedPrices = resolveTradingViewResolvedPrices(
		entryCandidate.value,
		directionMatch.direction,
		stopOffset,
		targetOffset,
		stopCandidate,
		targetCandidate,
	)

	return {
		entryPrice: resolvedPrices.entryPrice,
		stopPrice: resolvedPrices.stopPrice,
		score,
		targetPrice: resolvedPrices.targetPrice,
	}
}

function findBestTradingViewAxisMatch(
	axisCandidates: TradingViewPriceCandidate[],
	expectedValue: number,
	entryLineIndex: number,
	preferredRelativePosition: 'above' | 'below',
	labelLineIndex: number | undefined,
) {
	let bestCandidate: TradingViewAxisMatch | undefined
	let bestScore = Number.NEGATIVE_INFINITY

	for (const candidate of axisCandidates) {
		if (candidate.lineIndex === entryLineIndex) {
			continue
		}

		const valueDelta = Math.abs(candidate.value - expectedValue)
		const matchKind = resolveTradingViewAxisMatchKind(valueDelta)
		if (matchKind === undefined) {
			continue
		}

		const hasPreferredOrdering = preferredRelativePosition === 'above'
			? candidate.lineIndex < entryLineIndex
			: candidate.lineIndex > entryLineIndex
		let candidateScore = 100 - (valueDelta * 10)
		if (hasPreferredOrdering) {
			candidateScore += 20
		}
		if (matchKind === 'exact') {
			candidateScore += 20
		}

		if (labelLineIndex !== undefined) {
			candidateScore -= Math.abs(candidate.lineIndex - labelLineIndex) * 4
		}

		if (candidateScore > bestScore) {
			bestCandidate = {
				...candidate,
				matchKind,
			}
			bestScore = candidateScore
		}
	}

	return bestCandidate
}

function resolveTradingViewAxisMatchKind(valueDelta: number) {
	if (valueDelta < TRADING_VIEW_PRICE_MATCH_EPSILON) {
		return 'exact'
	}

	if (valueDelta <= TRADING_VIEW_RELAXED_PRICE_MATCH_EPSILON) {
		return 'relaxed'
	}

	return undefined
}

function resolveTradingViewResolvedPrices(
	entryPrice: number,
	direction: TradingViewDirection,
	stopOffset: number,
	targetOffset: number,
	stopCandidate: TradingViewAxisMatch | undefined,
	targetCandidate: TradingViewAxisMatch | undefined,
) {
	const inferredEntryFromStop = stopCandidate === undefined
		? undefined
		: direction === 'long'
			? stopCandidate.value + stopOffset
			: stopCandidate.value - stopOffset
	const inferredEntryFromTarget = targetCandidate === undefined
		? undefined
		: direction === 'long'
			? targetCandidate.value - targetOffset
			: targetCandidate.value + targetOffset

	const snappedEntryPrice = resolveTradingViewEntryPriceFromAxis(
		entryPrice,
		inferredEntryFromStop,
		inferredEntryFromTarget,
	)

	const snappedStopPrice = resolveTradingViewStopOrTargetPrice(
		direction === 'long' ? snappedEntryPrice - stopOffset : snappedEntryPrice + stopOffset,
		stopCandidate,
		snappedEntryPrice !== entryPrice,
	)
	const snappedTargetPrice = resolveTradingViewStopOrTargetPrice(
		direction === 'long' ? snappedEntryPrice + targetOffset : snappedEntryPrice - targetOffset,
		targetCandidate,
		snappedEntryPrice !== entryPrice,
	)

	return {
		entryPrice: snappedEntryPrice,
		stopPrice: snappedStopPrice,
		targetPrice: snappedTargetPrice,
	}
}

function resolveTradingViewEntryPriceFromAxis(
	entryPrice: number,
	inferredEntryFromStop: number | undefined,
	inferredEntryFromTarget: number | undefined,
) {
	if (inferredEntryFromStop !== undefined && inferredEntryFromTarget !== undefined) {
		if (Math.abs(inferredEntryFromStop - inferredEntryFromTarget) <= TRADING_VIEW_RELAXED_PRICE_MATCH_EPSILON) {
			return inferredEntryFromStop
		}

		return entryPrice
	}

	const inferredEntry = inferredEntryFromStop ?? inferredEntryFromTarget
	if (inferredEntry === undefined) {
		return entryPrice
	}

	return Math.abs(inferredEntry - entryPrice) <= TRADING_VIEW_RELAXED_PRICE_MATCH_EPSILON
		? inferredEntry
		: entryPrice
}

function resolveTradingViewStopOrTargetPrice(
	expectedPrice: number,
	axisMatch: TradingViewAxisMatch | undefined,
	preferAxisValue: boolean,
) {
	if (axisMatch === undefined) {
		return expectedPrice
	}

	return preferAxisValue || axisMatch.matchKind === 'exact'
		? axisMatch.value
		: expectedPrice
}

function detectTradingViewDirection(lines: NormalizedOcrLine[]): TradingViewDirectionMatch | undefined {
	for (const line of lines) {
		if (/\blong\b/i.test(line.canonical)) {
			return {
				direction: 'long',
				lineIndex: line.index,
			}
		}

		if (/\bshort\b/i.test(line.canonical)) {
			return {
				direction: 'short',
				lineIndex: line.index,
			}
		}
	}

	return undefined
}

function inferTradingViewDirectionAnchorLineIndex(
	stopLabelLineIndex: number | undefined,
	targetLabelLineIndex: number | undefined,
) {
	if (stopLabelLineIndex === undefined && targetLabelLineIndex === undefined) {
		return 0
	}

	if (stopLabelLineIndex === undefined) {
		return targetLabelLineIndex ?? 0
	}

	if (targetLabelLineIndex === undefined) {
		return stopLabelLineIndex
	}

	return Math.round((stopLabelLineIndex + targetLabelLineIndex) / 2)
}

function extractTradingViewAxisPriceCandidates(lines: NormalizedOcrLine[]) {
	const candidates: TradingViewPriceCandidate[] = []

	for (const line of lines) {
		if (TRADING_VIEW_CONTEXT_KEYWORD_PATTERN.test(line.canonical)) {
			continue
		}

		const values = Array.from(line.canonical.matchAll(TRADING_VIEW_NUMBER_PATTERN))
			.map((match) => {
				const parsedValue = Number.parseFloat(normalizeNumericToken(match[0]))
				if (Number.isNaN(parsedValue) || parsedValue < TRADING_VIEW_MIN_PRICE_CANDIDATE) {
					return undefined
				}

				return parsedValue
			})
			.filter((value): value is number => value !== undefined)

		for (const value of values) {
			candidates.push({
				lineIndex: line.index,
				value,
			})
		}
	}

	return candidates
}

export function extractNotionalValue(lines: NormalizedOcrLine[]) {
	for (let index = 0; index < lines.length; index++) {
		const currentLine = lines[index]!
		const labelMatch = findLabelMatch(currentLine.canonical, [/(?<![a-z])qty\b/i])
		if (labelMatch === null) {
			continue
		}

		const sameLineValue = extractQuantityNumber(
			currentLine.canonical.slice(labelMatch.index + labelMatch[0].length),
		)
		if (sameLineValue !== undefined) {
			return sameLineValue
		}

		const previousLineValue = extractLeadingQuantityBeforeAxisPrice(lines[index - 1]?.canonical)
		if (previousLineValue !== undefined) {
			return previousLineValue
		}

		const nextLine = lines[index + 1]
		if (nextLine !== undefined && !TRADING_VIEW_CONTEXT_KEYWORD_PATTERN.test(nextLine.canonical)) {
			const nextLineValue = extractFirstTradingViewNumber(nextLine.canonical)
			if (nextLineValue !== undefined) {
				return nextLineValue
			}
		}
	}

	return undefined
}

export function extractStopLoss(lines: NormalizedOcrLine[]) {
	return extractAnchoredNumber(lines, [
		/(?<![a-z])stop\b/i,
	])
}

export function extractTargetPrice(lines: NormalizedOcrLine[]) {
	return extractAnchoredNumber(lines, [
		/(?<![a-z])target\b/i,
	])
}
