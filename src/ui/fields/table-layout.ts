import type { TableRendererAlign } from './types'
import type { TableColumnWidth, TableFieldLayout } from '../../domains/core/fields'

// @story [[lucrjournal/fields#^column-width-layout]] Defines fixed pixel weights for every bounded table width token
const WIDTH_PX_BY_TOKEN: Record<Exclude<TableColumnWidth, 'fill' | 'fill-secondary'>, number> = {
	icon: 40,
	action: 64,
	xs: 96,
	sm: 112,
	md: 128,
	lg: 176,
	xl: 192,
	'2xl': 208,
	'3xl': 224,
	'4xl': 288,
	'5xl': 352,
	'6xl': 384,
	'7xl': 448,
}

// @story [[lucrjournal/fields#^column-width-layout]] Defines the primary and secondary fill column weights
const FILL_COLUMN_MIN_WIDTH_PX = 320
const SECONDARY_FILL_COLUMN_WIDTH_PX = 224

const ALIGN_CLASS_BY_TOKEN: Record<TableRendererAlign, string> = {
	left: 'lj:text-left',
	center: 'lj:text-center',
	right: 'lj:text-right',
}

function joinClassNames(classes: Array<string | undefined>): string {
	return classes.filter((value) => value !== undefined && value !== '').join(' ')
}

function resolveTableColumnWidthPx(width: TableColumnWidth | undefined): number | null {
	if (width === undefined) {
		return null
	}
	if (width === 'fill') {
		return FILL_COLUMN_MIN_WIDTH_PX
	}
	if (width === 'fill-secondary') {
		return SECONDARY_FILL_COLUMN_WIDTH_PX
	}
	return WIDTH_PX_BY_TOKEN[width]
}

export function resolveTableColumnWeightPx(layout: TableFieldLayout | undefined): number {
	return resolveTableColumnWidthPx(layout?.width) ?? 0
}

export function resolveTableMinWidthPx(layouts: readonly (TableFieldLayout | undefined)[]): number {
	return layouts.reduce((total, layout) => total + (resolveTableColumnWidthPx(layout?.width) ?? 0), 0)
}

export function resolveTableHeaderClassName(layout: TableFieldLayout | undefined, align: TableRendererAlign): string {
	return joinClassNames([
		ALIGN_CLASS_BY_TOKEN[align],
		layout?.cellOverflow === 'clip' ? 'lj:overflow-hidden' : undefined,
		layout?.cellOverflow === 'visible' ? 'lj:overflow-visible' : undefined,
	])
}

export function resolveTableCellClassName(layout: TableFieldLayout | undefined, align: TableRendererAlign): string {
	return joinClassNames([
		ALIGN_CLASS_BY_TOKEN[align],
		layout?.cellOverflow === 'clip' ? 'lj:overflow-hidden' : undefined,
		layout?.cellOverflow === 'visible' ? 'lj:overflow-visible' : undefined,
	])
}
