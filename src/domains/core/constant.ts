/// <reference types="vitest/importMeta" />

import { type } from 'arktype'

import { DatetimePattern } from '../../utils/datetime-pattern'

// @story [[lucrjournal/domain-model#^basename-only-wikilinks]] Restricts persisted domain links to unambiguous basenames
const WikilinkPattern = /^\[\[[^/[\]#^|\n]+\]\]$/
const SymbolPattern = /^(?:[A-Z0-9]+(?:\.[A-Z0-9]+)?|[A-Z0-9]+\/[A-Z0-9]+(?:\.[A-Z0-9]+)?(?::[A-Z0-9]+)?)$/

const PLATFORM_WIKILINK_FORMAT = 'a platform wikilink like [[Binance]]'
const ACCOUNT_WIKILINK_FORMAT = 'an account wikilink like [[ACC-Binance]]'
const SYMBOL_WIKILINK_FORMAT = 'a symbol wikilink like [[SBL-Research-BTC∕USDT]]'
const SYMBOL_FORMAT = 'an uppercase trading symbol like TSLA, BTCUSD, BTCUSDT.P, NQ, ES, BTC/USDT, BTC/USDT.P or BTC/USDT:USDT'
const DATETIME_FORMAT = 'a datetime string like 2026-03-16T23:22:45+08:00'

export const PlatformWikilinkType = type(WikilinkPattern)
	.describe(PLATFORM_WIKILINK_FORMAT)
	.brand('platform')

export type PlatformWikilink = typeof PlatformWikilinkType.infer

export const AccountWikilinkType = type(WikilinkPattern)
	.describe(ACCOUNT_WIKILINK_FORMAT)
	.brand('account')

export type AccountWikilink = typeof AccountWikilinkType.infer

export const SymbolWikilinkType = type(WikilinkPattern)
	.describe(SYMBOL_WIKILINK_FORMAT)
	.brand('symbol_entry')

export type SymbolWikilink = typeof SymbolWikilinkType.infer

export const SymbolType = type(SymbolPattern)
	.describe(SYMBOL_FORMAT)
	.brand('symbol')

export const DatetimeType = type(DatetimePattern)
	.describe(DATETIME_FORMAT)
	.brand('datetime')

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('WikilinkPattern', () => {
		// @story [[lucrjournal/domain-model#^basename-only-wikilinks]] Covers non-empty basename-only domain links
		it('accepts a wikilink with a non-empty body', () => {
			expect(WikilinkPattern.test('[[Binance]]')).toBe(true)
			expect(WikilinkPattern.test('[[OKX]]')).toBe(true)
		})

		it('rejects empty or malformed wikilinks', () => {
			expect(WikilinkPattern.test('[[]]')).toBe(false)
			expect(WikilinkPattern.test('[[Binance]')).toBe(false)
			expect(WikilinkPattern.test('[Binance]]')).toBe(false)
			expect(WikilinkPattern.test('Binance')).toBe(false)
		})

		// @story [[lucrjournal/domain-model#^basename-only-wikilinks]] Covers every forbidden basename-link character
		it('rejects forbidden wikilink characters', () => {
			expect(WikilinkPattern.test('[[foo/bar]]')).toBe(false)
			expect(WikilinkPattern.test('[[foo[bar]]')).toBe(false)
			expect(WikilinkPattern.test('[[foo]bar]]')).toBe(false)
			expect(WikilinkPattern.test('[[foo#bar]]')).toBe(false)
			expect(WikilinkPattern.test('[[foo^bar]]')).toBe(false)
			expect(WikilinkPattern.test('[[foo|bar]]')).toBe(false)
			expect(WikilinkPattern.test('[[foo\nbar]]')).toBe(false)
		})

		it('exposes custom error messages with the expected format hint', () => {
			const NOTE_META_WIKILINK_FORMAT = 'a analysis meta wikilink like [[Key]]'
			const AnalysisMetaWikilinkType = type(WikilinkPattern)
				.describe(NOTE_META_WIKILINK_FORMAT)
				.brand('analysis_meta')
			expect(() => PlatformWikilinkType.assert('Binance')).toThrow(`must be ${PLATFORM_WIKILINK_FORMAT}`)
			expect(() => AccountWikilinkType.assert('Main Account')).toThrow(`must be ${ACCOUNT_WIKILINK_FORMAT}`)
			expect(() => SymbolWikilinkType.assert('BTC/USDT')).toThrow(`must be ${SYMBOL_WIKILINK_FORMAT}`)
			expect(() => AnalysisMetaWikilinkType.assert('Key')).toThrow(`must be ${NOTE_META_WIKILINK_FORMAT}`)
		})
	})

	describe('SymbolPattern', () => {
		it('accepts uppercase alphanumeric pair and single-token symbols', () => {
			expect(SymbolPattern.test('BTC/USDT')).toBe(true)
			expect(SymbolPattern.test('BTC1/USDT')).toBe(true)
			expect(SymbolPattern.test('FOO/BAR')).toBe(true)
			expect(SymbolPattern.test('1000PEPE/USDT:USDT')).toBe(true)
			expect(SymbolPattern.test('BTC/USDT:USDT')).toBe(true)
			expect(SymbolPattern.test('BTC/USDT.P')).toBe(true)
			expect(SymbolPattern.test('ETH/USDT.PERP')).toBe(true)
			expect(SymbolPattern.test('BTCUSDT.P')).toBe(true)
			expect(SymbolPattern.test('TSLA')).toBe(true)
			expect(SymbolPattern.test('BTCUSD')).toBe(true)
			expect(SymbolPattern.test('NQ')).toBe(true)
			expect(SymbolPattern.test('ES')).toBe(true)
			expect(SymbolPattern.test('FOOBAR')).toBe(true)
		})

		it('rejects symbols that are not pure uppercase', () => {
			expect(SymbolPattern.test('btc/USDT')).toBe(false)
			expect(SymbolPattern.test('Btc/USDT')).toBe(false)
			expect(SymbolPattern.test('BTC/Usdt')).toBe(false)
			expect(SymbolPattern.test('BTC/USDT:usdt')).toBe(false)
		})

		it('rejects malformed symbol structures', () => {
			expect(SymbolPattern.test('BTC-USDT')).toBe(false)
			expect(SymbolPattern.test('BTC/USDT:USDT:USDT')).toBe(false)
			expect(SymbolPattern.test('BTC/')).toBe(false)
			expect(SymbolPattern.test('/USDT')).toBe(false)
			expect(SymbolPattern.test('BTC USD')).toBe(false)
		})

		it('exposes a custom error message with the expected format hint', () => {
			expect(() => SymbolType.assert('btc/usdt')).toThrow(`must be ${SYMBOL_FORMAT}`)
		})
	})

	describe('DatetimePattern', () => {
		// @story [[lucrjournal/domain-model#^domain-datetime-shape]] Covers accepted timezone-aware second-precision values
		it('accepts second-precision ISO datetime strings with timezone offsets', () => {
			expect(DatetimePattern.test('2026-03-20T16:31:05+08:00')).toBe(true)
			expect(DatetimePattern.test('2026-12-31T00:00:00+00:00')).toBe(true)
			expect(DatetimePattern.test('2026-03-20T16:31:05Z')).toBe(true)
		})

		// @story [[lucrjournal/domain-model#^domain-datetime-shape]] Covers missing offsets, precision, and bounded datetime parts
		it('rejects non-datetime or malformed datetime strings', () => {
			expect(DatetimePattern.test('2026-03-20 16:31')).toBe(false)
			expect(DatetimePattern.test('2026-03-20T16:31:05')).toBe(false)
			expect(DatetimePattern.test('2026-03-20T16:31')).toBe(false)
			expect(DatetimePattern.test('2026-03-20')).toBe(false)
			expect(DatetimePattern.test('2026-13-20T16:31:05+08:00')).toBe(false)
			expect(DatetimePattern.test('2026-03-20T24:31:05+08:00')).toBe(false)
		})

		it('exposes a custom error message with the expected format hint', () => {
			expect(() => DatetimeType.assert('2026-03-20 16:31')).toThrow(`must be ${DATETIME_FORMAT}`)
		})
	})
}
