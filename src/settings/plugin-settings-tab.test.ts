import { describe, expect, it, vi } from 'vitest'

import { setCurrentLocaleSetting } from '../lang/helpers'

import { PluginSettings, PluginSettingsManager } from './plugin-settings'
import { PluginSettingsTab } from './plugin-settings-tab'

import type LucrJournalPlugin from '../main'

function createPlugin() {
	const settings = new PluginSettings()
	const refreshLocalizedUi = vi.fn()
	const plugin = {
		app: {},
		settings,
		applyDebugMode: vi.fn(),
		refreshLocalizedUi,
		saveData: vi.fn(),
	} as unknown as LucrJournalPlugin

	plugin.settingsManager = new PluginSettingsManager(plugin)

	return { plugin, refreshLocalizedUi }
}

describe('PluginSettingsTab', () => {
	it('exposes declarative setting definitions', () => {
		setCurrentLocaleSetting('en')
		const { plugin } = createPlugin()
		const tab = new PluginSettingsTab(plugin)
		const groups = tab.getSettingDefinitions() as Array<{
			heading: string
			items: Array<{ control?: { key: string }, visible?: () => boolean }>
		}>
		const controls = groups.flatMap((group) => group.items).filter((item) => item.control)

		expect(controls.map((item) => item.control?.key)).toEqual([
			'lang',
			'timeZone',
			'enableAutoModifiedUpdate',
			'modifiedUpdateMode',
			'showReleaseNotes',
			'debugMode',
		])
		const lastGroup = groups[groups.length - 1]
		expect(lastGroup?.heading).toBe('Advanced')
		expect(lastGroup?.items.map((item) => item.control?.key)).toEqual([
			'showReleaseNotes',
			'debugMode',
		])

		const modifiedMode = controls.find((item) => item.control?.key === 'modifiedUpdateMode')
		expect(modifiedMode?.visible?.()).toBe(true)
		plugin.settings.enableAutoModifiedUpdate = false
		expect(modifiedMode?.visible?.()).toBe(false)
	})

	it('saves declarative control changes through the settings manager', async () => {
		const { plugin, refreshLocalizedUi } = createPlugin()
		const tab = new PluginSettingsTab(plugin)
		let updates = 0
		Object.assign(tab, { update: () => {
			updates += 1
		} })

		await tab.setControlValue('lang', 'zh')
		expect(plugin.settings.lang).toBe('zh')
		expect(refreshLocalizedUi).toHaveBeenCalledTimes(1)
		expect(updates).toBe(1)

		await tab.setControlValue('showReleaseNotes', false)
		expect(plugin.settings.showReleaseNotes).toBe(false)
		expect(updates).toBe(1)

		await tab.setControlValue('debugMode', true)
		expect(plugin.settings.debugMode).toBe(true)
		expect(updates).toBe(1)
	})
})
