import { setIcon } from 'obsidian'

import type { App, EventRef } from 'obsidian'

const LUCR_TYPE_PROPERTY_SELECTOR = 'div.metadata-property[data-property-key="lucr_type"]'
const LUCR_TYPE_VALUE_SELECTOR = '.metadata-property-value'
const EDITABLE_SELECTOR = 'input, textarea, select, button, [contenteditable="true"], [tabindex]'
const READONLY_CLASS = 'is-lucrjournal-readonly-property'
const ICON_CLASS = 'lucrjournal-lucr-type-icon'
const ICON_NAME_ATTRIBUTE = 'data-lucrjournal-lucr-type-icon'

type LucrTypeName =
	| 'account'
	| 'confluence'
	| 'criteria'
	| 'key_level'
	| 'market_analysis'
	| 'news'
	| 'platform'
	| 'playbook'
	| 'position'
	| 'symbol'
	| 'template'

type LucrTypeIconName =
	| 'book-open'
	| 'circle-dollar-sign'
	| 'crosshair'
	| 'file-code'
	| 'git-merge'
	| 'landmark'
	| 'list'
	| 'list-checks'
	| 'newspaper'
	| 'sunrise'
	| 'wallet'

const LUCR_TYPE_ICONS = {
	account: 'wallet',
	confluence: 'git-merge',
	criteria: 'list-checks',
	key_level: 'crosshair',
	market_analysis: 'sunrise',
	news: 'newspaper',
	platform: 'landmark',
	playbook: 'book-open',
	position: 'list',
	symbol: 'circle-dollar-sign',
	template: 'file-code',
} as const satisfies Record<LucrTypeName, LucrTypeIconName>

type ReadonlyLucrTypePropertyPlugin = {
	app: App
	register: (callback: () => void) => void
	registerEvent: (eventRef: EventRef) => void
}

export function registerReadonlyLucrTypeProperty(plugin: ReadonlyLucrTypePropertyPlugin): void {
	let timer = 0

	const clear = () => {
		if (timer === 0) {
			return
		}
		window.clearInterval(timer)
		timer = 0
	}

	const request = () => {
		clear()
		let count = 0
		timer = window.setInterval(() => {
			count++
			const applied = applyReadonlyLucrTypeProperties(activeDocument)
			if (applied > 0 || count >= 8) {
				clear()
			}
		}, 50)
	}

	plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', request))
	plugin.app.workspace.onLayoutReady(request)
	plugin.register(clear)
}

export function applyReadonlyLucrTypeProperties(root: ParentNode): number {
	let applied = 0

	for (const propertyEl of root.querySelectorAll<Element>(LUCR_TYPE_PROPERTY_SELECTOR)) {
		const alreadyApplied = propertyEl.classList.contains(READONLY_CLASS)
		if (!alreadyApplied) {
			propertyEl.classList.add(READONLY_CLASS)
			propertyEl.setAttribute('aria-readonly', 'true')
			applied++
		}
		syncLucrTypeIcon(propertyEl)
		disableEditableControls(propertyEl)
	}

	return applied
}

function syncLucrTypeIcon(propertyEl: Element): void {
	const valueEl = propertyEl.querySelector<HTMLElement>(LUCR_TYPE_VALUE_SELECTOR)
	if (!valueEl) {
		return
	}

	const iconName = resolveLucrTypeIconName(readLucrTypeValue(valueEl))
	if (iconName === null) {
		return
	}

	const existingIcon = valueEl.querySelector<HTMLElement>(`.${ICON_CLASS}`)
	if (existingIcon) {
		if (existingIcon.getAttribute(ICON_NAME_ATTRIBUTE) !== iconName) {
			setIcon(resolveIconTarget(existingIcon), iconName)
			existingIcon.setAttribute(ICON_NAME_ATTRIBUTE, iconName)
		}
		return
	}

	const iconEl = valueEl.ownerDocument.createElement('div')
	iconEl.classList.add(ICON_CLASS)
	iconEl.setAttribute('aria-hidden', 'true')
	iconEl.setAttribute(ICON_NAME_ATTRIBUTE, iconName)
	const iconTarget = valueEl.ownerDocument.createElement('span')
	iconEl.append(iconTarget)
	setIcon(iconTarget, iconName)
	valueEl.prepend(iconEl)
}

function resolveIconTarget(iconEl: HTMLElement): HTMLElement {
	return iconEl.querySelector('span') ?? iconEl
}

function readLucrTypeValue(valueEl: Element): string {
	return (valueEl.textContent ?? '').trim()
}

function resolveLucrTypeIconName(value: string): LucrTypeIconName | null {
	return isLucrTypeName(value) ? LUCR_TYPE_ICONS[value] : null
}

function isLucrTypeName(value: string): value is LucrTypeName {
	return Object.prototype.hasOwnProperty.call(LUCR_TYPE_ICONS, value)
}

function disableEditableControls(propertyEl: Element): void {
	for (const control of propertyEl.querySelectorAll<Element>(EDITABLE_SELECTOR)) {
		const tagName = control.tagName.toLowerCase()
		control.setAttribute('aria-readonly', 'true')
		control.setAttribute('tabindex', '-1')

		if (tagName === 'input' || tagName === 'textarea') {
			control.setAttribute('readonly', '')
			continue
		}

		if (tagName === 'select' || tagName === 'button') {
			control.setAttribute('disabled', '')
		}

		if (control.getAttribute('contenteditable') === 'true') {
			control.setAttribute('contenteditable', 'false')
		}
	}
}
