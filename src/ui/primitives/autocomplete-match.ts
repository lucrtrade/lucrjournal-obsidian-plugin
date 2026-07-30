interface AutocompleteOptionLike {
	value: string
	label?: string
	keywords?: string[]
}

export function rankAutocompleteOptions<T extends AutocompleteOptionLike>(
	options: readonly T[],
	query: string,
	normalizeValue: (value: string) => string,
): T[] {
	// @story [[lucrjournal/primitives#^autocomplete-match-scope]] Normalizes and filters every searchable option field
	const normalizedQuery = normalizeValue(query).toLowerCase()
	if (normalizedQuery === '') {
		return [...options]
	}

	return [...options]
		.map((option, index) => ({
			option,
			index,
			score: scoreAutocompleteTexts(
				[
					normalizeValue(option.value),
					option.label === undefined ? '' : normalizeValue(option.label),
					...(option.keywords ?? []).map((keyword) => normalizeValue(keyword)),
				],
				normalizedQuery,
			),
		}))
		.filter((candidate): candidate is { option: T; index: number; score: number } => candidate.score !== null)
		// @story [[lucrjournal/primitives#^autocomplete-rank-order]] Orders matches by rank label and original position
		.sort((left, right) => {
			if (left.score !== right.score) {
				return left.score - right.score
			}

			const leftLabel = left.option.label ?? left.option.value
			const rightLabel = right.option.label ?? right.option.value
			const labelOrder = leftLabel.localeCompare(rightLabel)
			if (labelOrder !== 0) {
				return labelOrder
			}

			return left.index - right.index
		})
		.map((candidate) => candidate.option)
}

export function rankAutocompleteStrings(
	options: readonly string[],
	query: string,
	normalizeValue: (value: string) => string = defaultNormalizeAutocompleteValue,
): string[] {
	return rankAutocompleteOptions(
		options.map((value) => ({ value })),
		query,
		normalizeValue,
	).map((option) => option.value)
}

function scoreAutocompleteTexts(texts: readonly string[], normalizedQuery: string): number | null {
	let bestScore: number | null = null

	for (const rawText of texts) {
		const text = rawText.toLowerCase()
		if (text === '') {
			continue
		}

		let score: number | null = null
		if (text === normalizedQuery) {
			score = 0
		} else if (text.startsWith(normalizedQuery)) {
			score = 1
		} else if (text.includes(normalizedQuery)) {
			score = 2
		}

		if (score !== null && (bestScore === null || score < bestScore)) {
			bestScore = score
		}
	}

	return bestScore
}

function defaultNormalizeAutocompleteValue(value: string): string {
	return value.trim()
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('rankAutocompleteOptions', () => {
		it('sorts exact matches before prefix and substring matches', () => {
			// @story [[lucrjournal/primitives#^autocomplete-rank-order]] Covers exact prefix and substring rank order
			expect(rankAutocompleteOptions([
				{ value: 'Macro Setup' },
				{ value: 'Macro' },
				{ value: 'Daily Macro' },
			], 'macro', defaultNormalizeAutocompleteValue).map((option) => option.value)).toEqual([
				'Macro',
				'Macro Setup',
				'Daily Macro',
			])
		})

		it('matches against normalized labels too', () => {
			// @story [[lucrjournal/primitives#^autocomplete-match-scope]] Covers normalized label matching
			expect(rankAutocompleteOptions([
				{ value: 'entry-criteria', label: 'Entry Criteria' },
				{ value: 'exit-criteria', label: 'Exit Criteria' },
			], 'entry criteria', defaultNormalizeAutocompleteValue).map((option) => option.value)).toEqual([
				'entry-criteria',
			])
		})
	})
}
