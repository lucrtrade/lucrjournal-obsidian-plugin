import { ButtonComponent, PluginSettingTab, SettingGroup } from 'obsidian'

import { t } from '../lang/helpers'
import { startLogin } from '../session/login'
import { getProfile, getToken } from '../session/storage'

import {
	DOMAIN_MODIFIED_UPDATE_MODES,
	getTimeZoneOffset,
	LANGUAGES,
	TIMEZONES,
} from './plugin-settings'

import type LucrJournalPlugin from '../main'
import type { SettingDefinitionItem } from 'obsidian'

type PluginSettingsControlKey =
	| 'lang'
	| 'timeZone'
	| 'debugMode'
	| 'enableAutoModifiedUpdate'
	| 'modifiedUpdateMode'
	| 'showReleaseNotes'

export class PluginSettingsTab extends PluginSettingTab {
	private accountSectionEl: HTMLElement | null = null

	public constructor(public plugin: LucrJournalPlugin) {
		super(plugin.app, plugin)
	}

	public override getSettingDefinitions(): SettingDefinitionItem<PluginSettingsControlKey>[] {
		return [
			{
				type: 'group',
				heading: t('SETTINGS_ACCOUNT'),
				items: [
					{
						name: t('SETTINGS_ACCOUNT'),
						render: (setting) => {
							this.renderAccountSection(setting.settingEl)
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('SETTINGS_GENERAL'),
				items: [
					{
						name: t('SETTINGS_LANGUAGE'),
						desc: t('SETTINGS_LANGUAGE_DESC'),
						control: {
							type: 'dropdown',
							key: 'lang',
							options: Object.fromEntries(LANGUAGES.map(({ labelKey, value }) => [value, t(labelKey)])),
						},
					},
					{
						name: t('SETTINGS_TIMEZONE'),
						desc: t('SETTINGS_TIMEZONE_DESC'),
						control: {
							type: 'dropdown',
							key: 'timeZone',
							options: Object.fromEntries(TIMEZONES.map(({ labelKey, value }) => [value, `${t(labelKey)} (${getTimeZoneOffset(value)})`])),
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('SETTINGS_MODIFIED_UPDATE'),
				items: [
					{
						name: t('SETTINGS_MODIFIED_UPDATE_ENABLE'),
						desc: t('SETTINGS_MODIFIED_UPDATE_ENABLE_DESC'),
						control: {
							type: 'toggle',
							key: 'enableAutoModifiedUpdate',
						},
					},
					{
						name: t('SETTINGS_MODIFIED_UPDATE_MODE'),
						desc: t('SETTINGS_MODIFIED_UPDATE_MODE_DESC'),
						visible: () => this.plugin.settings.enableAutoModifiedUpdate,
						control: {
							type: 'dropdown',
							key: 'modifiedUpdateMode',
							options: Object.fromEntries(DOMAIN_MODIFIED_UPDATE_MODES.map(({ labelKey, value }) => [value, t(labelKey)])),
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('SETTINGS_ADVANCED'),
				items: [
					{
						name: t('SETTINGS_RELEASE_NOTES_ENABLE'),
						desc: t('SETTINGS_RELEASE_NOTES_ENABLE_DESC'),
						control: {
							type: 'toggle',
							key: 'showReleaseNotes',
						},
					},
					{
						name: t('SETTINGS_DEBUG_MODE'),
						desc: t('SETTINGS_DEBUG_MODE_DESC'),
						control: {
							type: 'toggle',
							key: 'debugMode',
						},
					},
				],
			},
		]
	}

	public override getControlValue(key: string): unknown {
		return this.plugin.settings[key as PluginSettingsControlKey]
	}

	public override async setControlValue(key: string, value: unknown): Promise<void> {
		const settingsKey = key as PluginSettingsControlKey
		await this.plugin.settingsManager.editAndSave((settings) => {
			switch (settingsKey) {
				case 'lang':
					settings.lang = value as typeof settings.lang
					break
				case 'timeZone':
					settings.timeZone = value as typeof settings.timeZone
					break
				case 'debugMode':
					settings.debugMode = value as typeof settings.debugMode
					break
				case 'enableAutoModifiedUpdate':
					settings.enableAutoModifiedUpdate = value as typeof settings.enableAutoModifiedUpdate
					break
				case 'modifiedUpdateMode':
					settings.modifiedUpdateMode = value as typeof settings.modifiedUpdateMode
					break
				case 'showReleaseNotes':
					settings.showReleaseNotes = value as typeof settings.showReleaseNotes
					break
				default:
					throw new Error(`unknown settings key: ${String(key)}`)
			}
		}, true)

		if (settingsKey === 'lang' || settingsKey === 'timeZone') {
			this.plugin.refreshLocalizedUi()
			this.updateDefinitions()
		}

		if (settingsKey === 'debugMode') {
			this.plugin.applyDebugMode()
		}
	}

	public override display(): void {
		this.renderLegacy()
	}

	private updateDefinitions(): void {
		(this as unknown as { update: () => void }).update()
	}

	public refresh(): void {
		if (this.accountSectionEl !== null) {
			this.renderAccountSection(this.accountSectionEl)
			return
		}

		const framework = this as unknown as { update?: () => void }
		if (typeof framework.update === 'function') {
			framework.update()
		} else {
			this.renderLegacy()
		}
	}

	private renderLegacy(): void {
		const { containerEl } = this
		containerEl.empty()

		new SettingGroup(containerEl)
			.setHeading(t('SETTINGS_ACCOUNT'))
			.addSetting((setting) => {
				this.renderAccountSection(setting.settingEl)
			})

		new SettingGroup(containerEl)
			.setHeading(t('SETTINGS_GENERAL'))
			.addSetting((setting) => {
				setting
					.setName(t('SETTINGS_LANGUAGE'))
					.setDesc(t('SETTINGS_LANGUAGE_DESC'))
					.addDropdown((dropdown) => {
						LANGUAGES.forEach(({ labelKey, value }) => {
							dropdown.addOption(value, t(labelKey))
						})

						dropdown.setValue(this.plugin.settings.lang).onChange((value) => {
							void this.plugin.settingsManager.editAndSave((settings) => {
								settings.lang = value as typeof settings.lang
							}, true).then(() => {
								this.plugin.refreshLocalizedUi()
								this.renderLegacy()
							})
						})
					})
			})
			.addSetting((setting) => {
				setting
					.setName(t('SETTINGS_TIMEZONE'))
					.setDesc(t('SETTINGS_TIMEZONE_DESC'))
					.addDropdown((dropdown) => {
						TIMEZONES.forEach(({ labelKey, value }) => {
							dropdown.addOption(value, `${t(labelKey)} (${getTimeZoneOffset(value)})`)
						})

						dropdown.setValue(this.plugin.settings.timeZone).onChange((value) => {
							void this.plugin.settingsManager.editAndSave((settings) => {
								settings.timeZone = value
							}, true).then(() => {
								this.plugin.refreshLocalizedUi()
								this.renderLegacy()
							})
						})
					})
			})
		new SettingGroup(containerEl)
			.setHeading(t('SETTINGS_MODIFIED_UPDATE'))
			.addSetting((setting) => {
				setting
					.setName(t('SETTINGS_MODIFIED_UPDATE_ENABLE'))
					.setDesc(t('SETTINGS_MODIFIED_UPDATE_ENABLE_DESC'))
					.addToggle((toggle) => {
						toggle.setValue(this.plugin.settings.enableAutoModifiedUpdate).onChange((value) => {
							void this.plugin.settingsManager.editAndSave((settings) => {
								settings.enableAutoModifiedUpdate = value
							}, true).then(() => {
								this.renderLegacy()
							})
						})
					})
			})

		if (this.plugin.settings.enableAutoModifiedUpdate) {
			new SettingGroup(containerEl)
				.addSetting((setting) => {
					setting
						.setName(t('SETTINGS_MODIFIED_UPDATE_MODE'))
						.setDesc(t('SETTINGS_MODIFIED_UPDATE_MODE_DESC'))
						.addDropdown((dropdown) => {
							DOMAIN_MODIFIED_UPDATE_MODES.forEach(({ labelKey, value }) => {
								dropdown.addOption(value, t(labelKey))
							})

							dropdown.setValue(this.plugin.settings.modifiedUpdateMode).onChange((value) => {
								void this.plugin.settingsManager.editAndSave((settings) => {
									settings.modifiedUpdateMode = value as typeof settings.modifiedUpdateMode
								}, true).then(() => {
									this.renderLegacy()
								})
							})
						})
				})
		}

		new SettingGroup(containerEl)
			.setHeading(t('SETTINGS_ADVANCED'))
			.addSetting((setting) => {
				setting
					.setName(t('SETTINGS_RELEASE_NOTES_ENABLE'))
					.setDesc(t('SETTINGS_RELEASE_NOTES_ENABLE_DESC'))
					.addToggle((toggle) => {
						toggle.setValue(this.plugin.settings.showReleaseNotes).onChange((value) => {
							void this.plugin.settingsManager.editAndSave((settings) => {
								settings.showReleaseNotes = value
							}, true).then(() => {
								this.renderLegacy()
							})
						})
					})
			})
			.addSetting((setting) => {
				setting
					.setName(t('SETTINGS_DEBUG_MODE'))
					.setDesc(t('SETTINGS_DEBUG_MODE_DESC'))
					.addToggle((toggle) => {
						toggle.setValue(this.plugin.settings.debugMode).onChange((value) => {
							void this.plugin.settingsManager.editAndSave((settings) => {
								settings.debugMode = value
							}, true).then(() => {
								this.plugin.applyDebugMode()
								this.renderLegacy()
							})
						})
					})
			})
	}

	private renderAccountSection(el: HTMLElement): void {
		this.accountSectionEl = el
		el.empty()
		el.addClass('lj-settings-account')
		const app = this.plugin.app

		if (getToken(app) === null) {
			new ButtonComponent(el)
				.setButtonText(t('SESSION_LOGIN_BUTTON'))
				.setClass('lj-settings-account-signin')
				.onClick(() => {
					void startLogin(app)
				})
				.buttonEl.setAttribute('data-lj-action', 'signin')
			return
		}

		const profile = getProfile(app)
		const info = el.createDiv({ cls: 'lj-settings-account-info' })
		const avatar = info.createDiv({
			cls: 'lj-settings-account-avatar',
			attr: { 'data-lj-account': 'avatar' },
		})
		if (profile?.avatarUrl) {
			avatar.createEl('img', { attr: { src: profile.avatarUrl, alt: '' } })
		} else {
			avatar.setText(accountInitial(profile?.email))
		}
		if (profile?.email) {
			info.createDiv({
				cls: 'lj-settings-account-email',
				text: profile.email,
				attr: { 'data-lj-account': 'email' },
			})
		}

		new ButtonComponent(el)
			.setButtonText(t('SETTINGS_LOGOUT'))
			.setClass('lj-settings-account-logout')
			.onClick(() => {
				this.plugin.logout()
			})
			.buttonEl.setAttribute('data-lj-action', 'logout')
	}
}

function accountInitial(email: string | null | undefined): string {
	const ch = email?.trim().charAt(0)
	return ch ? ch.toUpperCase() : '?'
}
