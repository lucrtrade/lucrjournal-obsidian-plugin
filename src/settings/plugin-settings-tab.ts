import { ButtonComponent, PluginSettingTab, SettingGroup } from 'obsidian'

import { globalScreenshot } from '../global-screenshot'
import { getCurrentLocale, t } from '../lang/helpers'
import { isSessionClaimPending, startLogin } from '../session/login'
import { getAccountContext, getToken } from '../session/storage'

import {
	DOMAIN_MODIFIED_UPDATE_MODES,
	getTimeZoneOffset,
	LANGUAGES,
	TIMEZONES,
} from './plugin-settings'

import type LucrJournalPlugin from '../main'
import type { AccountContext, AccountPlanKey } from '../session/account.generated'
import type { App, SettingDefinitionItem } from 'obsidian'

type PluginSettingsControlKey =
	| 'lang'
	| 'timeZone'
	| 'debugMode'
	| 'enableAutoModifiedUpdate'
	| 'modifiedUpdateMode'
	| 'showReleaseNotes'

export class PluginSettingsTab extends PluginSettingTab {
	private accountSectionEl: HTMLElement | null = null
	private globalShortcutRecordingCleanup: (() => void) | null = null

	public constructor(public plugin: LucrJournalPlugin) {
		super(plugin.app, plugin)
	}

	public override getSettingDefinitions(): SettingDefinitionItem<PluginSettingsControlKey>[] {
		return [
			{
				type: 'group',
				heading: t('SETTINGS_ACCOUNT'),
				cls: 'lj-settings-account-group',
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
				heading: t('SETTINGS_GLOBAL_SCREENSHOT'),
				items: [{
					name: t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT'),
					desc: t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_DESC'),
					render: (setting) => this.renderGlobalShortcutSetting(setting.controlEl),
				}],
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
		this.globalShortcutRecordingCleanup?.()
		this.globalShortcutRecordingCleanup = null
		containerEl.empty()

		new SettingGroup(containerEl)
			.addClass('lj-settings-account-group')
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
			.setHeading(t('SETTINGS_GLOBAL_SCREENSHOT'))
			.addSetting((setting) => {
				setting
					.setName(t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT'))
					.setDesc(t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_DESC'))
				this.globalShortcutRecordingCleanup = this.renderGlobalShortcutSetting(setting.controlEl)
			})

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

	private renderGlobalShortcutSetting(el: HTMLElement): () => void {
		// @story [[lucrjournal/ocr#^global-screenshot-ocr]] Saves a captured accelerator only after global registration validation
		el.empty()
		el.addClass('lj-global-shortcut-control')
		const record = new ButtonComponent(el)
		record.buttonEl.addClass('lj-global-shortcut-record')
		const remove = new ButtonComponent(el)
		remove
			.setButtonText('×')
			.setTooltip(t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_REMOVE'))
		remove.buttonEl.addClass('lj-global-shortcut-remove')
		remove.buttonEl.setAttribute('aria-label', t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_REMOVE'))
		const status = el.createDiv({ cls: 'lj-global-shortcut-status' })
		const recordingWindow = el.ownerDocument.defaultView ?? activeWindow
		let isRecording = false
		let conflict: { owner: string; shortcut: string } | null = null

		const render = () => {
			const shortcut = this.plugin.settings.globalScreenshotShortcut
			const hasShortcut = shortcut !== ''
			const displayText = isRecording
				? t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_RECORDING')
				: conflict !== null
					? formatAcceleratorForDisplay(conflict.shortcut)
					: hasShortcut
						? formatAcceleratorForDisplay(shortcut)
						: t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_RECORD')

			record.setButtonText(displayText)
			record.buttonEl.toggleClass('is-recording', isRecording)
			record.buttonEl.toggleClass('is-failed', conflict !== null)
			record.buttonEl.toggleClass('has-shortcut', hasShortcut && !isRecording && conflict === null)
			remove.buttonEl.toggleClass('is-hidden', isRecording || !hasShortcut)
			status.toggleClass('is-hidden', conflict === null)
			status.setText(conflict === null ? '' : t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_IN_USE', { owner: conflict.owner }))
		}

		const stopRecording = () => {
			recordingWindow.removeEventListener('keydown', captureShortcut, true)
			isRecording = false
		}
		const captureShortcut = (event: KeyboardEvent) => {
			const shortcut = acceleratorFromKeyboardEvent(event)
			if (shortcut === null) {
				if (event.key === 'Escape') {
					event.preventDefault()
					stopRecording()
					render()
				}
				return
			}
			event.preventDefault()
			event.stopPropagation()
			stopRecording()
			const owner = shortcutConflictOwner(this.plugin.app, event, shortcut)
			if (owner !== null) {
				conflict = { owner, shortcut }
				render()
				return
			}
			conflict = null
			void this.plugin.updateGlobalScreenshotShortcut(shortcut).then((didSave) => {
				conflict = didSave ? null : { owner: t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_OWNER_APP'), shortcut }
				render()
			})
		}

		record.onClick(() => {
			if (isRecording) {
				return
			}
			conflict = null
			isRecording = true
			render()
			record.buttonEl.blur()
			recordingWindow.addEventListener('keydown', captureShortcut, true)
		})
		remove.onClick(() => {
			stopRecording()
			conflict = null
			void this.plugin.clearGlobalScreenshotShortcut().then(render)
		})
		render()
		return stopRecording
	}

	private renderAccountSection(el: HTMLElement): void {
		this.accountSectionEl = el
		el.empty()
		el.addClass('lj-settings-account')
		const app = this.plugin.app

		// @story [[lucrjournal/session#^claim-loading]] Shows claim progress in Settings before rendering an account state.
		if (isSessionClaimPending()) {
			el.createDiv({
				cls: 'lj-settings-account-status',
				text: t('SESSION_CLAIM_LOADING_TITLE'),
				attr: {
					'aria-busy': 'true',
					'data-lj-screen': 'claim-loading',
				},
			})
			return
		}

		// @story [[lucrjournal/entitlement#^settings-identity-only]] Uses token presence, not journal entitlement, for the Settings account identity.
		if (getToken(app) === null) {
			const header = el.createDiv({ cls: 'lj-settings-account-header' })
			const info = header.createDiv({ cls: 'lj-settings-account-info' })
			const details = info.createDiv({ cls: 'lj-settings-account-details' })
			details.createDiv({ cls: 'setting-item-name', text: 'LucrTrade' })
			details.createDiv({
				cls: 'setting-item-description',
				text: t('SESSION_LOGIN_DESCRIPTION'),
			})
			new ButtonComponent(header)
				.setButtonText(t('SESSION_LOGIN_TITLE'))
				.setCta()
				.setClass('lj-settings-account-signin')
				.onClick(() => {
					void startLogin(app)
				})
				.buttonEl.setAttribute('data-lj-action', 'signin')
			return
		}

		// @story [[lucrjournal/entitlement#^settings-account-details]] Renders cached profile and plan details for a token-bearing account.
		const context = getAccountContext(app)
		const profile = context?.profile
		const header = el.createDiv({ cls: 'lj-settings-account-header' })
		const info = header.createDiv({ cls: 'lj-settings-account-info' })
		const avatar = info.createDiv({
			cls: 'lj-settings-account-avatar',
			attr: { 'data-lj-account': 'avatar' },
		})
		if (profile?.avatarUrl) {
			avatar.createEl('img', { attr: { src: profile.avatarUrl, alt: '' } })
		} else {
			avatar.setText(accountInitial(profile?.email))
		}
		const details = info.createDiv({ cls: 'lj-settings-account-details' })
		if (profile?.email) {
			details.createDiv({
				cls: 'lj-settings-account-email',
				text: profile.email,
				attr: { 'data-lj-account': 'email' },
			})
		}
		if (context) {
			const planRow = details.createDiv({ cls: 'lj-settings-account-plan-row' })
			planRow.createDiv({
				cls: 'lj-settings-account-plan',
				text: accountPlanText(context),
				attr: { 'data-lj-account': 'plan' },
			})
			if (context.plan !== null) {
				planRow.createDiv({
					cls: 'lj-settings-account-plan-badge',
					text: t('SETTINGS_ACCOUNT_PLAN_BADGE_PREMIUM'),
					attr: { 'data-lj-account': 'plan-badge' },
				})
			}
		}

		new ButtonComponent(header)
			.setButtonText(t('SETTINGS_LOGOUT'))
			.setClass('lj-settings-account-logout')
			.onClick(() => {
				this.plugin.logout()
			})
			.buttonEl.setAttribute('data-lj-action', 'logout')
	}
}

function acceleratorFromKeyboardEvent(event: KeyboardEvent): string | null {
	if (!event.metaKey && !event.ctrlKey && !event.altKey) {
		return null
	}
	if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) {
		return null
	}
	const key = event.code.startsWith('Key')
		? event.code.slice('Key'.length)
		: event.code.startsWith('Digit')
			? event.code.slice('Digit'.length)
			: event.key.length === 1 ? event.key.toUpperCase() : event.key
	const modifiers = [
		...(event.metaKey ? ['Command'] : event.ctrlKey ? ['Control'] : []),
		...(event.altKey ? ['Alt'] : []),
		...(event.shiftKey ? ['Shift'] : []),
	]
	return [...modifiers, key].join('+')
}

function shortcutConflictOwner(app: App, event: KeyboardEvent, shortcut: string): string | null {
	const command = obsidianCommandName(app, event)
	if (command !== null) {
		return command
	}
	const availability = globalScreenshot.availabilityOf(shortcut)
	if (availability === 'available') {
		return null
	}
	if (availability === 'system') {
		return t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_OWNER_SYSTEM')
	}
	if (availability === 'app-menu') {
		return t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_OWNER_MENU')
	}
	return t('SETTINGS_GLOBAL_SCREENSHOT_SHORTCUT_OWNER_APP')
}

function obsidianCommandName(app: App, event: KeyboardEvent): string | null {
	const key = (event.code.startsWith('Key')
		? event.code.slice('Key'.length)
		: event.code.startsWith('Digit')
			? event.code.slice('Digit'.length)
			: event.key).toUpperCase()
	const modifiers = [
		...(event.metaKey ? ['Meta'] : []),
		...(event.ctrlKey ? ['Ctrl'] : []),
		...(event.altKey ? ['Alt'] : []),
		...(event.shiftKey ? ['Shift'] : []),
	].sort().join(',')
	const internals = app as unknown as {
		hotkeyManager?: { bakedHotkeys?: Array<{ key: unknown; modifiers: string }>; bakedIds?: string[] }
		commands?: { commands?: Record<string, { name?: string }> }
	}
	const index = internals.hotkeyManager?.bakedHotkeys?.findIndex((hotkey) =>
		String(hotkey.key).toUpperCase() === key
		&& hotkey.modifiers.split(',').sort().join(',') === modifiers,
	) ?? -1
	if (index < 0) {
		return null
	}
	const id = internals.hotkeyManager?.bakedIds?.[index]
	return (id === undefined ? undefined : internals.commands?.commands?.[id]?.name) ?? id ?? null
}

function accountInitial(email: string | null | undefined): string {
	const ch = email?.trim().charAt(0)
	return ch ? ch.toUpperCase() : '?'
}

const accountPlanNames = {
	lucrtrade: 'LucrTrade',
	lucrjournal: 'LucrJournal',
} as const satisfies Record<AccountPlanKey, string>

// @story [[lucrjournal/entitlement#^settings-account-details]] Formats plan interval and renewal or expiry details from the account context.
function accountPlanText(context: AccountContext): string {
	if (context.plan === null) {
		return t('SETTINGS_ACCOUNT_PLAN_FREE')
	}
	const planName = accountPlanNames[context.plan.key]
	if (context.subscription === null) {
		return planName
	}
	const interval = context.subscription.interval === 'month'
		? t('SETTINGS_ACCOUNT_PLAN_INTERVAL_MONTH')
		: context.subscription.interval === 'half_year'
			? t('SETTINGS_ACCOUNT_PLAN_INTERVAL_HALF_YEAR')
			: t('SETTINGS_ACCOUNT_PLAN_INTERVAL_YEAR')
	const plan = t('SETTINGS_ACCOUNT_PLAN_INTERVAL', {
		plan: planName,
		interval,
	})
	if (context.subscription.currentPeriodEnd === null) {
		return plan
	}
	const date = new Intl.DateTimeFormat(getCurrentLocale() === 'zh' ? 'zh-CN' : 'en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(new Date(context.subscription.currentPeriodEnd))
	return t(
		context.subscription.cancelAtPeriodEnd
			? 'SETTINGS_ACCOUNT_PLAN_VALID_UNTIL'
			: 'SETTINGS_ACCOUNT_PLAN_RENEWS_ON',
		{ plan, date },
	)
}

function formatAcceleratorForDisplay(accelerator: string): string {
	const trimmed = accelerator.trim()
	if (trimmed === '') {
		return ''
	}
	return trimmed
		.split('+')
		.map((part) => {
			switch (part.trim().toLowerCase()) {
				case 'command':
				case 'cmd':
					return '⌘'
				case 'shift':
					return '⇧'
				case 'control':
				case 'ctrl':
					return '⌃'
				case 'alt':
				case 'option':
				case 'opt':
					return '⌥'
				default:
					return part.trim()
			}
		})
		.join(' ')
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('global screenshot shortcut recording', () => {
		it('names the Obsidian command already bound to a captured accelerator', () => {
			expect(obsidianCommandName({
				commands: { commands: { 'workspace:next-tab': { name: 'Go to next tab' } } },
				hotkeyManager: {
					bakedHotkeys: [{ key: '2', modifiers: 'Meta,Shift' }],
					bakedIds: ['workspace:next-tab'],
				},
			} as unknown as App, {
				altKey: false,
				code: 'Digit2',
				ctrlKey: false,
				key: '@',
				metaKey: true,
				shiftKey: true,
			} as KeyboardEvent)).toBe('Go to next tab')
		})

		it('records Command+Shift+2 with the same macOS accelerator spelling as the default', () => {
			expect(acceleratorFromKeyboardEvent({
				altKey: false,
				code: 'Digit2',
				ctrlKey: false,
				key: '@',
				metaKey: true,
				shiftKey: true,
			} as KeyboardEvent)).toBe('Command+Shift+2')
		})

		it('formats accelerator string into clean display symbols', () => {
			expect(formatAcceleratorForDisplay('Command+Shift+2')).toBe('⌘ ⇧ 2')
			expect(formatAcceleratorForDisplay('Control+Alt+S')).toBe('⌃ ⌥ S')
			expect(formatAcceleratorForDisplay('')).toBe('')
		})
	})
}
