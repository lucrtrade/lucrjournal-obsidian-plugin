import { beforeEach, describe, expect, it, vi } from 'vitest'

import { applyReadonlyLucrTypeProperties } from './readonly-lucr-type-property'

const setIcon = vi.hoisted(() => vi.fn((element: { setAttribute: (name: string, value: string) => void }, iconName: string) => {
	element.setAttribute('data-icon', iconName)
}))

vi.mock('obsidian', () => ({
	setIcon,
}))

const RAW_LUCR_TYPES = {
	custom: 'custom_type',
	playbook: 'playbook',
	position: 'position',
} as const

class FakeClassList {
	public values = new Set<string>()

	public add(value: string): void {
		this.values.add(value)
	}

	public contains(value: string): boolean {
		return this.values.has(value)
	}
}

class FakeElement {
	public readonly classList = new FakeClassList()
	public readonly children: FakeElement[] = []
	public readonly attributes = new Map<string, string>()
	public textContent = ''

	public constructor(
		public readonly tagName: string,
		private readonly selectorMatch: string[] = [],
		public readonly ownerDocument = fakeDocument,
	) {}

	public append(child: FakeElement): void {
		this.children.push(child)
	}

	public prepend(child: FakeElement): void {
		this.children.unshift(child)
	}

	public getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null
	}

	public setAttribute(name: string, value: string): void {
		this.attributes.set(name, value)
	}

	public querySelector(selector: string): FakeElement | null {
		return this.querySelectorAll(selector)[0] ?? null
	}

	public querySelectorAll(selector: string): FakeElement[] {
		const matches = this.matches(selector) ? [this] : []
		return this.children.reduce<FakeElement[]>((result, child) => {
			result.push(...child.querySelectorAll(selector))
			return result
		}, matches)
	}

	private matches(selector: string): boolean {
		return selector.startsWith('.')
			? this.classList.contains(selector.slice(1))
			: this.selectorMatch.includes(selector)
	}
}

const fakeDocument = {
	createElement(tagName: string) {
		return new FakeElement(tagName)
	},
}

describe('readonly lucr_type property', () => {
	beforeEach(() => {
		setIcon.mockClear()
	})

	it('marks only Obsidian lucr_type metadata rows readonly', () => {
		const root = new FakeElement('div')
		const lucrType = new FakeElement('div', ['div.metadata-property[data-property-key="lucr_type"]'])
		const title = new FakeElement('div')
		const input = new FakeElement('input', ['input, textarea, select, button, [contenteditable="true"], [tabindex]'])
		const button = new FakeElement('button', ['input, textarea, select, button, [contenteditable="true"], [tabindex]'])

		lucrType.append(input)
		title.append(button)
		root.append(lucrType)
		root.append(title)

		expect(applyReadonlyLucrTypeProperties(root as never)).toBe(1)
		expect(lucrType.classList.contains('is-lucrjournal-readonly-property')).toBe(true)
		expect(input.getAttribute('readonly')).toBe('')
		expect(input.getAttribute('tabindex')).toBe('-1')
		expect(button.getAttribute('disabled')).toBe(null)
	})

	it('prepends the lucide icon for the lucr_type value', () => {
		const root = new FakeElement('div')
		const lucrType = new FakeElement('div', ['div.metadata-property[data-property-key="lucr_type"]'])
		const value = new FakeElement('div')

		value.classList.add('metadata-property-value')
		value.textContent = RAW_LUCR_TYPES.position
		lucrType.append(value)
		root.append(lucrType)

		expect(applyReadonlyLucrTypeProperties(root as never)).toBe(1)
		expect(setIcon).toHaveBeenCalledWith(value.children[0]?.children[0], 'list')
		expect(value.children).toHaveLength(1)
		expect(value.children[0]?.classList.contains('lucrjournal-lucr-type-icon')).toBe(true)
		expect(value.children[0]?.getAttribute('aria-hidden')).toBe('true')
	})

	it('does not duplicate the type icon when synced again', () => {
		const root = new FakeElement('div')
		const lucrType = new FakeElement('div', ['div.metadata-property[data-property-key="lucr_type"]'])
		const value = new FakeElement('div')

		value.classList.add('metadata-property-value')
		value.textContent = RAW_LUCR_TYPES.playbook
		lucrType.append(value)
		root.append(lucrType)

		expect(applyReadonlyLucrTypeProperties(root as never)).toBe(1)
		expect(applyReadonlyLucrTypeProperties(root as never)).toBe(0)
		expect(value.children).toHaveLength(1)
		expect(setIcon).toHaveBeenCalledTimes(1)
		expect(value.children[0]?.children[0]?.getAttribute('data-icon')).toBe('book-open')
	})

	it('does not insert an icon for unknown lucr_type values', () => {
		const root = new FakeElement('div')
		const lucrType = new FakeElement('div', ['div.metadata-property[data-property-key="lucr_type"]'])
		const value = new FakeElement('div')

		value.classList.add('metadata-property-value')
		value.textContent = RAW_LUCR_TYPES.custom
		lucrType.append(value)
		root.append(lucrType)

		expect(applyReadonlyLucrTypeProperties(root as never)).toBe(1)
		expect(value.children).toHaveLength(0)
		expect(setIcon).not.toHaveBeenCalled()
	})

	it('does not count an already marked row again', () => {
		const root = new FakeElement('div')
		const lucrType = new FakeElement('div', ['div.metadata-property[data-property-key="lucr_type"]'])
		const input = new FakeElement('input', ['input, textarea, select, button, [contenteditable="true"], [tabindex]'])

		root.append(lucrType)

		expect(applyReadonlyLucrTypeProperties(root as never)).toBe(1)
		lucrType.append(input)
		expect(applyReadonlyLucrTypeProperties(root as never)).toBe(0)
		expect(input.getAttribute('readonly')).toBe('')
	})
})
