import { moment } from 'obsidian'

import { LUCR_TRADE_ROOT_DIR } from '../constant'
import { getCurrentTimeZoneOffset } from '../utils/relative-time'

import type { App } from 'obsidian'

type DatetimePropertyContext = {
	onChange?: (value: string) => unknown
	sourcePath?: string
}

type DatetimePropertyWidget = {
	render: (element: HTMLElement, value: unknown, context: DatetimePropertyContext) => unknown
}

type AppWithMetadataTypeManager = App & {
	metadataTypeManager?: {
		getWidget?: (type: string) => DatetimePropertyWidget | undefined
	}
}

const DATETIME_INPUT_FORMATS = [
	'YYYY-MM-DD[T]HH:mm:ss.SSS',
	'YYYY-MM-DD[T]HH:mm:ss',
	'YYYY-MM-DD[T]HH:mm',
]

// @story [[lucrjournal/domain-model#^datetime-property-write-format]] Formats native datetime property edits with the configured timezone
export function registerDatetimePropertyFormat(
	app: App,
	getTimeZone: () => string,
): () => void {
	const widget = (app as AppWithMetadataTypeManager).metadataTypeManager?.getWidget?.('datetime')
	if (typeof widget?.render !== 'function') {
		return () => {}
	}

	const originalRender = widget.render
	const patchedRender: DatetimePropertyWidget['render'] = (element, value, context) => {
		if (
			typeof context.onChange === 'function'
			&& typeof context.sourcePath === 'string'
			&& context.sourcePath.startsWith(`${LUCR_TRADE_ROOT_DIR}/`)
			&& context.sourcePath.endsWith('.md')
		) {
			const onChange = context.onChange
			context.onChange = (nextValue) => onChange(formatDatetime(nextValue, getTimeZone()))
		}

		return originalRender.call(widget, element, value, context)
	}

	widget.render = patchedRender
	return () => {
		if (widget.render === patchedRender) {
			widget.render = originalRender
		}
	}
}

function formatDatetime(value: string, timeZone: string): string {
	if (value === '') {
		return value
	}

	const parsed = moment.parseZone(value, DATETIME_INPUT_FORMATS, true)
	if (!parsed.isValid()) {
		return value
	}

	const wallClock = parsed.format('YYYY-MM-DDTHH:mm:ss.SSS')
	const offset = getCurrentTimeZoneOffset(new Date(`${wallClock.slice(0, 19)}Z`), timeZone)
	return `${wallClock}${offset}`
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('registerDatetimePropertyFormat', () => {
		// @story [[lucrjournal/domain-model#^datetime-property-write-format]] Covers LucrJournal path scoping, configured timezone formatting, and widget restoration
		it('formats only LucrJournal Markdown datetime edits and restores the widget', () => {
			const writes: string[] = []
			const originalRender: DatetimePropertyWidget['render'] = (_element, value, context) => {
				context.onChange?.(String(value))
			}
			const widget: DatetimePropertyWidget = { render: originalRender }
			const app = {
				metadataTypeManager: {
					getWidget: () => widget,
				},
			} as unknown as App
			const cleanup = registerDatetimePropertyFormat(app, () => 'America/New_York')
			const onChange = (value: string) => writes.push(value)

			widget.render({} as HTMLElement, '2026-03-31T09:44:00', {
				onChange,
				sourcePath: 'LucrJournal/positions/POS-00001.md',
			})
			widget.render({} as HTMLElement, '2026-03-31T09:44:00', {
				onChange,
				sourcePath: 'Notes/example.md',
			})
			cleanup()

			expect(writes).toEqual([
				'2026-03-31T09:44:00.000-04:00',
				'2026-03-31T09:44:00',
			])
			expect(widget.render).toBe(originalRender)
		})
	})
}
