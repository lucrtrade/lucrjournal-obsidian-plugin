import moment from '../../node_modules/moment/min/moment-with-locales.js'

export { moment }

export function normalizePath(path) {
	return path.replaceAll(/\/+/g, '/')
}

export async function requestUrl() {
	throw new Error('requestUrl is not available in vitest mock')
}

export class Notice {
	constructor(message, timeout) {
		this.message = message
		this.timeout = timeout
	}

	hide() {}
}

export class Plugin {}

export class Component {
	load() {}

	addChild() {}
	unload() {}
}

class MockElement {
	textContent = ''
	children = []
	listeners = new Map()

	setText(text) {
		this.textContent = text
	}

	addClass(cls) {
		this.cls = cls
	}

	empty() {
		this.textContent = ''
		this.children = []
	}

	createDiv(options = {}) {
		const child = new MockElement()
		child.cls = options.cls
		this.children.push(child)
		return child
	}

	createEl(_tag, options = {}) {
		const child = new MockElement()
		child.textContent = options.text ?? ''
		this.children.push(child)
		return child
	}

	addEventListener(event, callback) {
		this.listeners.set(event, callback)
	}
}

export class ItemView {
	constructor(leaf) {
		this.leaf = leaf
		this.app = leaf?.app
		this.contentEl = new MockElement()
		this.containerEl = new MockElement()
	}

	addAction(icon, title, callback) {
		const action = new MockElement()
		action.icon = icon
		action.title = title
		action.callback = callback
		return action
	}

	registerEvent() {}
}

export class FileView extends ItemView {
	file = null
}

export class MarkdownView extends FileView {
	getState() {
		return {}
	}

	async setState() {}
}

export class WorkspaceLeaf {
	constructor(app) {
		this.app = app
	}

	async openFile() {}

	async setViewState() {}

	detach() {}
}

export class TFile {
	path = ''
	basename = ''
	extension = ''
	stat = {
		size: 0,
		mtime: 0,
	}
}

export class Modal {
	titleEl = new MockElement()
	contentEl = new MockElement()

	constructor(app) {
		this.app = app
	}

	close() {}
}

export const MarkdownRenderer = {
	async render(_app, markdown, el) {
		el.markdown = markdown
	},
}

export class PluginSettingTab {
	containerEl = {
		empty() {},
	}

	constructor(app, plugin) {
		this.app = app
		this.plugin = plugin
	}
}

export class SettingGroup {
	constructor(_containerEl) {}

	setHeading() {
		return this
	}

	addSetting(callback) {
		callback(new MockSetting())
		return this
	}
}

class MockSetting {
	setName() {
		return this
	}

	setDesc() {
		return this
	}

	addDropdown(callback) {
		callback(new MockDropdown())
		return this
	}
}

class MockDropdown {
	addOption() {
		return this
	}

	setValue() {
		return this
	}

	onChange() {
		return this
	}
}
