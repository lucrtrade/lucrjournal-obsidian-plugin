import type { FieldDescriptor, FieldType, TableFieldLayout } from '../../domains/core/fields'
import type { App } from 'obsidian'
import type { ReactNode } from 'react'

export interface TableRenderContext {
	app: App
	extras?: Record<string, unknown>
}

export type TableRendererAlign = 'left' | 'center' | 'right'

type TableCellRenderer = (
	value: unknown,
	entry: { file: unknown; fm: unknown },
	field: FieldDescriptor<unknown>,
	context: TableRenderContext,
) => ReactNode

export type TableRendererEntry = {
	align: TableRendererAlign
	renderCell: TableCellRenderer
	renderFilterOption?: (value: string) => ReactNode
}

export type TableRendererRegistry<TFieldType extends FieldType = FieldType> = {
	[K in TFieldType]: TableRendererEntry
}

// Replace the old ColumnMeta augmentation from positions-table-columns.tsx
declare module '@tanstack/react-table' {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Type parameters required to match module declaration interface
	interface ColumnMeta<TData, TValue> {
		field?: FieldDescriptor<unknown>
		tableLayout?: TableFieldLayout
		align?: TableRendererAlign
	}
}
