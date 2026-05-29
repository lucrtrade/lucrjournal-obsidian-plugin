import {
	type NormalizedOcrLine,
	TRADING_VIEW_MIN_PRICE_CANDIDATE,
	extractFirstMetaTraderNumber,
	extractMetaTraderNumbers,
} from './lines'

const METATRADER_SIDE_PATTERN = /(?:buy|sell|seli)/i

export function extractMetaTraderMobilePositionResult(lines: NormalizedOcrLine[]) {
	const positionLineIndex = lines.findIndex((line) => METATRADER_SIDE_PATTERN.test(line.canonical))
	if (positionLineIndex === -1) {
		return undefined
	}

	const positionLine = lines[positionLineIndex]!
	const nextPositionLineIndex = lines.findIndex((line, index) => {
		return index > positionLineIndex && METATRADER_SIDE_PATTERN.test(line.canonical)
	})
	const positionEndIndex = nextPositionLineIndex === -1 ? lines.length : nextPositionLineIndex
	const sideMatch = METATRADER_SIDE_PATTERN.exec(positionLine.canonical)
	if (sideMatch === null) {
		return undefined
	}

	const notionalValue = extractFirstMetaTraderNumber(positionLine.canonical.slice(sideMatch.index + sideMatch[0].length))
	if (notionalValue === undefined) {
		const tableResult = extractMetaTraderTablePositionResult(lines, positionLineIndex)
		if (tableResult !== undefined) {
			return tableResult
		}
	}

	const priceMatch = extractMetaTraderMobileEntryExitPrice(lines, positionLineIndex, positionEndIndex)
	const stopLoss = extractMetaTraderMobileLabeledPrice(lines, positionLineIndex, positionEndIndex, /s\s*\/\s*l/i)
	const targetPrice = extractMetaTraderMobileLabeledPrice(lines, positionLineIndex, positionEndIndex, /t\s*\/\s*p/i)

	if (
		notionalValue === undefined
		&& priceMatch?.entryPrice === undefined
		&& priceMatch?.exitPrice === undefined
		&& stopLoss === undefined
		&& targetPrice === undefined
	) {
		return undefined
	}

	return {
		entry_price: priceMatch?.entryPrice,
		exit_price: priceMatch?.exitPrice,
		notional_value: notionalValue,
		stop_loss: stopLoss,
		target_price: targetPrice,
	}
}

function extractMetaTraderTablePositionResult(lines: NormalizedOcrLine[], positionLineIndex: number) {
	const values = lines
		.slice(positionLineIndex + 1)
		.flatMap((line) => extractMetaTraderNumbers(line.canonical))

	const volumeIndex = values.findIndex((value) => value > 0 && value < 1_000)
	if (volumeIndex === -1) {
		return undefined
	}

	const prices = values
		.slice(volumeIndex + 1)
		.filter((value) => value >= TRADING_VIEW_MIN_PRICE_CANDIDATE)

	if (prices.length < 4) {
		return undefined
	}

	return {
		entry_price: prices[0],
		exit_price: prices[3],
		notional_value: values[volumeIndex],
		stop_loss: prices[1],
		target_price: prices[2],
	}
}

function extractMetaTraderMobileEntryExitPrice(
	lines: NormalizedOcrLine[],
	positionLineIndex: number,
	positionEndIndex: number,
) {
	const searchEndIndex = Math.min(positionEndIndex, positionLineIndex + 4)
	for (let index = positionLineIndex + 1; index < searchEndIndex; index++) {
		const line = lines[index]!
		const values = extractMetaTraderNumbers(line.canonical)
		if (
			values.length < 2
			|| values[0]! < TRADING_VIEW_MIN_PRICE_CANDIDATE
			|| values[1]! < TRADING_VIEW_MIN_PRICE_CANDIDATE
		) {
			continue
		}

		return {
			entryPrice: values[0],
			exitPrice: values[1],
		}
	}

	return undefined
}

function extractMetaTraderMobileLabeledPrice(
	lines: NormalizedOcrLine[],
	positionLineIndex: number,
	positionEndIndex: number,
	labelPattern: RegExp,
) {
	for (let index = positionLineIndex + 1; index < positionEndIndex; index++) {
		const line = lines[index]!
		const labelMatch = labelPattern.exec(line.canonical)
		if (labelMatch === null) {
			continue
		}

		const sameLineValue = extractFirstMetaTraderNumber(
			line.canonical.slice(labelMatch.index + labelMatch[0].length),
		)
		if (sameLineValue !== undefined) {
			return sameLineValue
		}

		const nextLine = lines[index + 1]
		if (nextLine === undefined || index + 1 >= positionEndIndex) {
			return undefined
		}

		return extractFirstMetaTraderNumber(nextLine.canonical)
	}

	return undefined
}
