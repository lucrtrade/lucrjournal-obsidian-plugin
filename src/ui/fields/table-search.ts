/// <reference types="vitest/importMeta" />

import type { FieldDescriptor, TitleFieldValue } from '../../domains/core/fields'
import type { DomainPersistedEntry, DomainRuntimeApp } from '../../domains/core/type'

type SearchToken =
	| { kind: 'fuzzy'; value: string }
	| { kind: 'exact'; value: string }

function normalizeSearchValue(value: string): string {
	return value.trim().toLowerCase()
}

// @story [[lucrjournal/fields#^search-token-syntax]] Parses quoted substrings separately from unquoted prefix tokens
function parseSearchTokens(query: string): SearchToken[] {
	const normalizedQuery = query.trim()
	if (normalizedQuery === '') {
		return []
	}
	const tokens: SearchToken[] = []
	const pattern = /"([^"]+)"|(\S+)/g
	for (const match of normalizedQuery.matchAll(pattern)) {
		const exactValue = match[1]
		if (typeof exactValue === 'string') {
			const normalizedValue = normalizeSearchValue(exactValue)
			if (normalizedValue !== '') {
				tokens.push({ kind: 'exact', value: normalizedValue })
			}
			continue
		}
		const fuzzyValue = match[2]
		if (typeof fuzzyValue === 'string') {
			const normalizedValue = normalizeSearchValue(fuzzyValue)
			if (normalizedValue !== '') {
				tokens.push({ kind: 'fuzzy', value: normalizedValue })
			}
		}
	}
	return tokens
}

function extractWordTokens(value: string): string[] {
	return value.match(/[\p{L}\p{N}]+/gu) ?? []
}

function isTitleFieldValue(value: unknown): value is TitleFieldValue {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as Partial<TitleFieldValue>).title === 'string'
}

function isPrefixMatch(haystack: string, needle: string): boolean {
	if (needle === '') {
		return true
	}
	return haystack.startsWith(needle) || extractWordTokens(haystack).some((token) => token.startsWith(needle))
}

function extractSearchText(value: unknown): string[] {
	if (typeof value === 'string') {
		const normalizedValue = normalizeSearchValue(value)
		return normalizedValue === '' ? [] : [normalizedValue]
	}
	if (typeof value === 'number' || typeof value === 'bigint') {
		return [String(value)]
	}
	if (Array.isArray(value)) {
		return value.flatMap((item) => extractSearchText(item))
	}
	if (typeof value !== 'object' || value === null) {
		return []
	}
	if (isTitleFieldValue(value)) {
		const normalizedTitle = normalizeSearchValue(value.title)
		return normalizedTitle === '' ? [] : [normalizedTitle]
	}
	return []
}

// @story [[lucrjournal/fields#^search-token-conjunction]] Requires every parsed token to match one searchable value
export function matchesSearchQuery(values: readonly string[], query: string): boolean {
	const tokens = parseSearchTokens(query)
	if (tokens.length === 0) {
		return true
	}
	return tokens.every((token) =>
		values.some((value) => {
			const normalizedValue = normalizeSearchValue(value)
			return (
				token.kind === 'exact'
					? normalizedValue.includes(token.value)
					: isPrefixMatch(normalizedValue, token.value)
			)
		}),
	)
}

// @story [[lucrjournal/fields#^searchable-field-projections]] Reads only searchable table descriptors and prefers their search projection
export function getSearchableFieldValues<Schema>(
	entry: DomainPersistedEntry<Schema>,
	fields: readonly FieldDescriptor<Schema>[],
	app?: DomainRuntimeApp,
): string[] {
	return fields
		.filter((field): field is FieldDescriptor<Schema> & {
			getValue?: NonNullable<FieldDescriptor<Schema>['getValue']>
			searchValue?: NonNullable<FieldDescriptor<Schema>['searchValue']>
		} => (
			field.usages.includes('Table')
			&& field.searchable === true
			&& (field.searchValue !== undefined || field.getValue !== undefined)
		))
		.flatMap((field) => extractSearchText(field.searchValue?.(entry, app) ?? field.getValue?.(entry, app)))
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('matchesSearchQuery', () => {
		// @story [[lucrjournal/fields#^search-token-syntax]] Covers Unicode word-prefix matching for unquoted search terms
		it('uses word prefix match for unquoted terms', () => {
			expect(matchesSearchQuery(['federal reserve outlook'], 'fed')).toBe(true)
			expect(matchesSearchQuery(['ETF_Flow_Headline_Supports_Momentum_Leg'], 'head')).toBe(true)
			expect(matchesSearchQuery(['market outlook'], 'mko')).toBe(false)
		})

		// @story [[lucrjournal/fields#^search-token-syntax]] Covers continuous substring matching for quoted search terms
		it('uses exact contains match for quoted terms', () => {
			expect(matchesSearchQuery(['federal reserve outlook'], '"reserve out"')).toBe(true)
			expect(matchesSearchQuery(['federal reserve outlook'], '"fro"')).toBe(false)
		})

		it('does not allow unrelated prefix fragments to match across distant words', () => {
			expect(matchesSearchQuery(['ETF_Flow_Headline_Supports_Momentum_Leg'], 'fed sp')).toBe(false)
		})

		// @story [[lucrjournal/fields#^search-token-conjunction]] Covers conjunction across independently searchable values
		it('requires every token to match at least one searchable value', () => {
			expect(matchesSearchQuery(['macro setup', 'bloomberg terminal'], 'mac "bloom"')).toBe(true)
			expect(matchesSearchQuery(['macro setup', 'bloomberg terminal'], 'mac "reuters"')).toBe(false)
		})
	})

	describe('getSearchableFieldValues', () => {
		// @story [[lucrjournal/fields#^searchable-field-projections]] Covers searchable table field selection and title projection
		it('extracts only searchable table fields and unwraps title values', () => {
			const entry = {
				file: { path: 'LucrTrade/news/test.md', basename: 'test' },
				fm: { title: 'Fed Minutes', source: 'Bloomberg', tags: ['macro'] },
			} as DomainPersistedEntry<{ title: string; source: string; tags: string[] }>
			const fields = [
				{
					key: 'title',
					usages: ['Table'],
					type: 'title',
					label: () => 'title',
					searchable: true,
					getValue: (currentEntry: typeof entry) => ({ title: currentEntry.fm.title }),
				},
				{
					key: 'source',
					usages: ['Table'],
					type: 'text',
					label: () => 'source',
					searchable: true,
					getValue: (currentEntry: typeof entry) => currentEntry.fm.source,
				},
				{
					key: 'tags',
					usages: ['Table'],
					type: 'text',
					label: () => 'tags',
					getValue: (currentEntry: typeof entry) => currentEntry.fm.tags,
				},
			] satisfies FieldDescriptor<{ title: string; source: string; tags: string[] }>[]

			expect(getSearchableFieldValues(entry, fields)).toEqual(['fed minutes', 'bloomberg'])
		})

		// @story [[lucrjournal/fields#^searchable-field-projections]] Covers explicit search projections taking precedence over display values
		it('prefers searchValue when a field needs a different search projection', () => {
			const entry = {
				file: { path: 'LucrJournal/positions/POS-1.md', basename: 'POS-1' },
				fm: { symbol: '[[SBL-Main-BTCUSDT]]' },
			} as DomainPersistedEntry<{ symbol: string }>
			const fields = [
				{
					key: 'account',
					usages: ['Table'],
					type: 'text',
					label: () => 'account',
					searchable: true,
					getValue: () => 'render-only',
					searchValue: () => ['[[ACC-Main]]', '[[Binance]]'],
				},
			] satisfies FieldDescriptor<{ symbol: string }>[]

			expect(getSearchableFieldValues(entry, fields)).toEqual(['[[acc-main]]', '[[binance]]'])
		})
	})
}
