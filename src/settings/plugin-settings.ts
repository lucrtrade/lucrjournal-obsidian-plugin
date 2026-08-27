import {
	createPluginPreferences,
	type PluginPreferences,
} from './plugin-preferences'

import type { LocaleSettingValue } from '../lang/helpers'
import type { en } from '../lang/locale/en'
import type LucrJournalPlugin from '../main'

type TimeZoneLabelKey = Extract<keyof typeof en, `SETTINGS_TIMEZONE_OPTION_${string}`>
type LanguageLabelKey = Extract<keyof typeof en, `SETTINGS_LANGUAGE_OPTION_${string}`>
type ModifiedUpdateModeLabelKey = Extract<keyof typeof en, `SETTINGS_MODIFIED_UPDATE_MODE_OPTION_${string}`>

type DomainModifiedUpdateMode = 'user-driven' | 'file-driven'

export const TIMEZONES: ReadonlyArray<{
	labelKey: TimeZoneLabelKey;
	value: string;
}> = [
	{ value: 'Etc/UTC', labelKey: 'SETTINGS_TIMEZONE_OPTION_UTC' },
	{ value: 'America/New_York', labelKey: 'SETTINGS_TIMEZONE_OPTION_NEW_YORK' },
	{ value: 'America/Chicago', labelKey: 'SETTINGS_TIMEZONE_OPTION_CHICAGO' },
	{ value: 'America/Los_Angeles', labelKey: 'SETTINGS_TIMEZONE_OPTION_LOS_ANGELES' },
	{ value: 'America/Sao_Paulo', labelKey: 'SETTINGS_TIMEZONE_OPTION_SAO_PAULO' },
	{ value: 'Europe/London', labelKey: 'SETTINGS_TIMEZONE_OPTION_LONDON' },
	{ value: 'Europe/Berlin', labelKey: 'SETTINGS_TIMEZONE_OPTION_BERLIN' },
	{ value: 'Europe/Moscow', labelKey: 'SETTINGS_TIMEZONE_OPTION_MOSCOW' },
	{ value: 'Asia/Dubai', labelKey: 'SETTINGS_TIMEZONE_OPTION_DUBAI' },
	{ value: 'Asia/Kolkata', labelKey: 'SETTINGS_TIMEZONE_OPTION_KOLKATA' },
	{ value: 'Asia/Shanghai', labelKey: 'SETTINGS_TIMEZONE_OPTION_SHANGHAI' },
	{ value: 'Asia/Hong_Kong', labelKey: 'SETTINGS_TIMEZONE_OPTION_HONG_KONG' },
	{ value: 'Asia/Tokyo', labelKey: 'SETTINGS_TIMEZONE_OPTION_TOKYO' },
	{ value: 'Asia/Seoul', labelKey: 'SETTINGS_TIMEZONE_OPTION_SEOUL' },
	{ value: 'Asia/Singapore', labelKey: 'SETTINGS_TIMEZONE_OPTION_SINGAPORE' },
	{ value: 'Australia/Sydney', labelKey: 'SETTINGS_TIMEZONE_OPTION_SYDNEY' },
	{ value: 'Pacific/Auckland', labelKey: 'SETTINGS_TIMEZONE_OPTION_AUCKLAND' },
]

export const LANGUAGES: ReadonlyArray<{
	labelKey: LanguageLabelKey;
	value: LocaleSettingValue;
}> = [
	{ value: 'system', labelKey: 'SETTINGS_LANGUAGE_OPTION_SYSTEM' },
	{ value: 'en', labelKey: 'SETTINGS_LANGUAGE_OPTION_ENGLISH' },
	{ value: 'zh', labelKey: 'SETTINGS_LANGUAGE_OPTION_CHINESE' },
]

export const DOMAIN_MODIFIED_UPDATE_MODES: ReadonlyArray<{
	labelKey: ModifiedUpdateModeLabelKey
	value: DomainModifiedUpdateMode
}> = [
	{ value: 'user-driven', labelKey: 'SETTINGS_MODIFIED_UPDATE_MODE_OPTION_USER_DRIVEN' },
	{ value: 'file-driven', labelKey: 'SETTINGS_MODIFIED_UPDATE_MODE_OPTION_FILE_DRIVEN' },
]

export class PluginSettings {
	public lang: LocaleSettingValue = 'system'
	public timeZone = resolveDefaultTimeZone()
	public enableAutoModifiedUpdate = true
	public modifiedUpdateMode: DomainModifiedUpdateMode = 'user-driven'
	public previousRelease = ''
	public showReleaseNotes = true
	// @story [[lucrjournal/runtime#^debug-mode-default]] Keeps runtime debug instrumentation disabled by default.
	public debugMode = false
	public globalScreenshotShortcut = 'Command+Shift+2'
	public showFolderInExplorer = false
	public preferences: PluginPreferences = createPluginPreferences(null)
}

let currentTimeZoneSetting = resolveDefaultTimeZone()

export class PluginSettingsManager {
	public constructor(private readonly plugin: LucrJournalPlugin) {}

	public async editAndSave(
		edit: (settings: PluginSettings) => void,
		_saveImmediately = false,
	): Promise<void> {
		edit(this.plugin.settings)
		await this.plugin.saveData(this.plugin.settings)
	}
}

export function createPluginSettings(persistedSettings: unknown): PluginSettings {
	const settings = new PluginSettings()
	if (!isRecord(persistedSettings)) {
		return settings
	}

	if (typeof persistedSettings.timeZone === 'string') {
		settings.timeZone = persistedSettings.timeZone
	}

	if (isLocaleSettingValue(persistedSettings.lang)) {
		settings.lang = persistedSettings.lang
	}

	if (typeof persistedSettings.enableAutoModifiedUpdate === 'boolean') {
		settings.enableAutoModifiedUpdate = persistedSettings.enableAutoModifiedUpdate
	}

	if (isDomainModifiedUpdateMode(persistedSettings.modifiedUpdateMode)) {
		settings.modifiedUpdateMode = persistedSettings.modifiedUpdateMode
	}

	if (typeof persistedSettings.previousRelease === 'string') {
		settings.previousRelease = persistedSettings.previousRelease
	}

	if (typeof persistedSettings.showReleaseNotes === 'boolean') {
		settings.showReleaseNotes = persistedSettings.showReleaseNotes
	}

	// @story [[lucrjournal/runtime#^debug-mode-default]] Hydrates debug mode only from a persisted boolean.
	if (typeof persistedSettings.debugMode === 'boolean') {
		settings.debugMode = persistedSettings.debugMode
	}
	if (typeof persistedSettings.globalScreenshotShortcut === 'string') {
		settings.globalScreenshotShortcut = persistedSettings.globalScreenshotShortcut
	}

	if (typeof persistedSettings.showFolderInExplorer === 'boolean') {
		settings.showFolderInExplorer = persistedSettings.showFolderInExplorer
	}

	settings.preferences = createPluginPreferences(persistedSettings.preferences)

	return settings
}

export function setCurrentTimeZoneSetting(timeZone: string): void {
	currentTimeZoneSetting = timeZone
}

export function getCurrentTimeZoneSetting(): string {
	return currentTimeZoneSetting
}

export function getTimeZoneOffset(timeZone: string): string {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			timeZoneName: 'longOffset',
		}).formatToParts(new Date())
		const offset = parts.find((part) => part.type === 'timeZoneName')?.value

		return (
			offset
				?.replace(/^GMT/, '')
				.replace(/:00$/, '')
				.replace(/^([+-])0/, '$1') ?? '+0'
		)
	} catch {
		return '+0'
	}
}

function resolveDefaultTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLocaleSettingValue(value: unknown): value is LocaleSettingValue {
	return value === 'system' || value === 'en' || value === 'zh'
}

function isDomainModifiedUpdateMode(value: unknown): value is DomainModifiedUpdateMode {
	return value === 'user-driven' || value === 'file-driven'
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('createPluginSettings', () => {
		it('defaults lang to system', () => {
			expect(createPluginSettings(null).lang).toBe('system')
		})

		it('accepts persisted supported lang values', () => {
			expect(createPluginSettings({ lang: 'en' }).lang).toBe('en')
			expect(createPluginSettings({ lang: 'zh' }).lang).toBe('zh')
			expect(createPluginSettings({ lang: 'system' }).lang).toBe('system')
		})

		it('ignores invalid persisted lang values', () => {
			expect(createPluginSettings({ lang: 'fr' }).lang).toBe('system')
		})

		it('hydrates preferences from persisted settings', () => {
			expect(createPluginSettings({
				preferences: {
					Positions: {
						hiddenColumnIds: ['risk', 'analyses', 'unknown'],
					},
				},
			}).preferences.Positions?.hiddenColumnIds).toEqual(['risk', 'analyses'])
		})

		it('defaults modified auto update settings', () => {
			const settings = createPluginSettings(null)
			expect(settings.enableAutoModifiedUpdate).toBe(true)
			expect(settings.modifiedUpdateMode).toBe('user-driven')
		})

		it('hydrates modified auto update settings', () => {
			const settings = createPluginSettings({
				enableAutoModifiedUpdate: false,
				modifiedUpdateMode: 'file-driven',
			})
			expect(settings.enableAutoModifiedUpdate).toBe(false)
			expect(settings.modifiedUpdateMode).toBe('file-driven')
		})

		it('defaults release notes settings', () => {
			const settings = createPluginSettings(null)
			expect(settings.previousRelease).toBe('')
			expect(settings.showReleaseNotes).toBe(true)
		})

		it('hydrates release notes settings', () => {
			const settings = createPluginSettings({
				previousRelease: '1.0.37',
				showReleaseNotes: false,
			})
			expect(settings.previousRelease).toBe('1.0.37')
			expect(settings.showReleaseNotes).toBe(false)
		})

		it('defaults debug mode off', () => {
			// @story [[lucrjournal/runtime#^debug-mode-default]] Covers the disabled default for runtime debug mode.
			expect(createPluginSettings(null).debugMode).toBe(false)
		})

		it('hydrates debug mode setting', () => {
			// @story [[lucrjournal/runtime#^debug-mode-default]] Covers enabling runtime debug mode from a persisted boolean.
			expect(createPluginSettings({ debugMode: true }).debugMode).toBe(true)
		})
	})
}
