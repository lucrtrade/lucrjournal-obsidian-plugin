import { moment } from 'obsidian'

import { en } from './locale/en'
import { zhCN } from './locale/zh-cn'

export type SupportedLocale = 'en' | 'zh'
export type LocaleSettingValue = SupportedLocale | 'system'
export type TranslationKey = keyof typeof en

let currentLocaleSetting: LocaleSettingValue = 'system'

type ExtractVars<S extends string> = S extends `${string}{${infer Var}}${infer Rest}`
	? Var | ExtractVars<Rest>
	: never

type VarsFor<K extends TranslationKey> = ExtractVars<(typeof en)[K]>

export function setCurrentLocaleSetting(localeSetting: LocaleSettingValue): void {
	currentLocaleSetting = localeSetting
}

export function getCurrentLocale(): SupportedLocale {
	if (currentLocaleSetting !== 'system') {
		return currentLocaleSetting
	}

	const locale = moment.locale()
	return locale === 'zh-cn' || locale === 'zh' ? 'zh' : 'en'
}

function getCurrentIntlLocale(): 'zh-CN' | 'en-US' {
	return getCurrentLocale() === 'zh' ? 'zh-CN' : 'en-US'
}

export function formatLocalizedMonthName(date: Date, width: 'long' | 'short' = 'long'): string {
	if (getCurrentLocale() === 'zh') {
		return `${date.getMonth() + 1}月`
	}

	return new Intl.DateTimeFormat(getCurrentIntlLocale(), { month: width }).format(date)
}

export function formatLocalizedMonthYear(date: Date, monthWidth: 'long' | 'short' = 'long'): string {
	if (getCurrentLocale() === 'zh') {
		return `${date.getFullYear()}年${date.getMonth() + 1}月`
	}

	return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
		month: monthWidth,
		year: 'numeric',
	}).format(date)
}

export function t<K extends TranslationKey>(
	key: K,
	...args: [VarsFor<K>] extends [never] ? [] : [vars: Record<VarsFor<K>, string | number>]
): string {
	let result: string

	if (getCurrentLocale() === 'zh') {
		result = zhCN[key] ?? en[key]
	} else {
		result = en[key]
	}

	const vars = args[0]
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			result = result.replaceAll(`{${k}}`, String(v))
		}
	}

	return result
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('getCurrentLocale', () => {
		it('returns the configured locale when settings overrides system locale', () => {
			setCurrentLocaleSetting('zh')
			expect(getCurrentLocale()).toBe('zh')

			setCurrentLocaleSetting('en')
			expect(getCurrentLocale()).toBe('en')
		})

		it('falls back to system locale when settings use system', () => {
			const originalLocale = moment.locale()
			setCurrentLocaleSetting('system')
			moment.locale('zh-cn')
			expect(getCurrentLocale()).toBe('zh')

			moment.locale('en')
			expect(getCurrentLocale()).toBe('en')

			moment.locale(originalLocale)
			setCurrentLocaleSetting('system')
		})
	})

	describe('formatLocalizedMonthName', () => {
		it('formats month names in chinese without english abbreviations', () => {
			setCurrentLocaleSetting('zh')
			expect(formatLocalizedMonthName(new Date(2026, 3, 1))).toBe('4月')
			expect(formatLocalizedMonthName(new Date(2026, 3, 1), 'short')).toBe('4月')
		})

		it('formats month names in english with Intl locale output', () => {
			setCurrentLocaleSetting('en')
			expect(formatLocalizedMonthName(new Date(2026, 3, 1))).toBe('April')
			expect(formatLocalizedMonthName(new Date(2026, 3, 1), 'short')).toBe('Apr')
		})
	})

	describe('formatLocalizedMonthYear', () => {
		it('formats month-year labels in chinese', () => {
			setCurrentLocaleSetting('zh')
			expect(formatLocalizedMonthYear(new Date(2026, 3, 1))).toBe('2026年4月')
			expect(formatLocalizedMonthYear(new Date(2026, 3, 1), 'short')).toBe('2026年4月')
		})

		it('formats month-year labels in english with Intl locale output', () => {
			setCurrentLocaleSetting('en')
			expect(formatLocalizedMonthYear(new Date(2026, 3, 1))).toBe('April 2026')
			expect(formatLocalizedMonthYear(new Date(2026, 3, 1), 'short')).toBe('Apr 2026')
		})
	})
}
