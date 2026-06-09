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

type FakeNode = {
	children: FakeNode[]
	textContent: string
	cls?: string
	attrs: Record<string, string>
	onClick?: () => void
	empty: () => void
	addClass: () => void
	setText: (text: string) => void
	setAttribute: (name: string, value: string) => void
	createDiv: (opts?: { cls?: string, text?: string, attr?: Record<string, string> }) => FakeNode
	createEl: (tag: string, opts?: { text?: string, attr?: Record<string, string> }) => FakeNode
}

function applyAttrs(node: FakeNode, attr: Record<string, string>): void {
	for (const [key, value] of Object.entries(attr)) {
		node.setAttribute(key, value)
	}
}

function fakeEl(): FakeNode {
	const node: FakeNode = {
		children: [],
		textContent: '',
		attrs: {},
		empty() {
			node.children = []
		},
		addClass() {},
		setText(text) {
			node.textContent = text
		},
		setAttribute(name, value) {
			node.attrs[name] = value
		},
		createDiv(opts = {}) {
			const child = fakeEl()
			if (opts.cls != null) {
				child.cls = opts.cls 
			}
			if (opts.text != null) {
				child.textContent = opts.text 
			}
			if (opts.attr) {
				applyAttrs(child, opts.attr) 
			}
			node.children.push(child)
			return child
		},
		createEl(_tag, opts = {}) {
			const child = fakeEl()
			if (opts.text != null) {
				child.textContent = opts.text 
			}
			if (opts.attr) {
				applyAttrs(child, opts.attr) 
			}
			node.children.push(child)
			return child
		},
	}
	return node
}

function attrValue(node: FakeNode, name: string): string | undefined {
	for (const [key, value] of Object.entries(node.attrs)) {
		if (key === name) {
			return value 
		}
	}
	return undefined
}

function collect(node: FakeNode, out: FakeNode[] = []): FakeNode[] {
	for (const child of node.children) {
		out.push(child)
		collect(child, out)
	}
	return out
}

function appWith(token: string, profile: unknown) {
	return { secretStorage: { getSecret: () => token }, loadLocalStorage: () => profile }
}

function renderAccount(tab: PluginSettingsTab, el: FakeNode, reRender: () => void): void {
	(tab as unknown as { renderAccountSection: (el: FakeNode, reRender: () => void) => void })
		.renderAccountSection(el, reRender)
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

	it('puts an Account group first with a profile render row', () => {
		setCurrentLocaleSetting('en')
		const { plugin } = createPlugin()
		const tab = new PluginSettingsTab(plugin)
		const groups = tab.getSettingDefinitions() as Array<{
			heading: string
			items: Array<{ render?: unknown }>
		}>
		expect(groups[0]?.heading).toBe('Account')
		expect(typeof groups[0]?.items[0]?.render).toBe('function')
	})

	it('renders avatar, email and a logout button when signed in', () => {
		setCurrentLocaleSetting('en')
		const { plugin } = createPlugin()
		const logout = vi.fn()
		Object.assign(plugin, {
			app: appWith('lj_token', {
				userId: 'u1',
				username: 'alice',
				displayName: 'Alice',
				avatarUrl: 'https://img/a.png',
				email: 'alice@example.com',
			}),
			logout,
		})
		const tab = new PluginSettingsTab(plugin)
		const el = fakeEl()
		const reRender = vi.fn()
		renderAccount(tab, el, reRender)

		const all = collect(el)
		const email = all.find((node) => attrValue(node, 'data-lj-account') === 'email')
		expect(email?.textContent).toBe('alice@example.com')
		const avatar = all.find((node) => attrValue(node, 'data-lj-account') === 'avatar')
		expect(avatar?.children.length).toBe(1)
		const logoutButton = all.find((node) => attrValue(node, 'data-lj-action') === 'logout')
		expect(logoutButton).toBeTruthy()

		logoutButton?.onClick?.()
		expect(logout).toHaveBeenCalledTimes(1)
		expect(reRender).toHaveBeenCalledTimes(1)
	})

	it('renders a sign-in button and no email when signed out', () => {
		setCurrentLocaleSetting('en')
		const { plugin } = createPlugin()
		Object.assign(plugin, { app: appWith('', null) })
		const tab = new PluginSettingsTab(plugin)
		const el = fakeEl()
		renderAccount(tab, el, vi.fn())

		const all = collect(el)
		expect(all.find((node) => attrValue(node, 'data-lj-action') === 'signin')).toBeTruthy()
		expect(all.find((node) => attrValue(node, 'data-lj-account') === 'email')).toBeUndefined()
	})
})
