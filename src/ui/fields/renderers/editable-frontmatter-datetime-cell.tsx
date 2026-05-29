import { TFile, type App } from 'obsidian'

import { EditableDatetimeField } from '../../primitives/editable-datetime-field'

import type { DomainPersistedEntry } from '../../../domains/core/type'
import type { ReactNode } from 'react'

interface EditableFrontmatterDatetimeCellProps<Schema> {
	app: App
	row: DomainPersistedEntry<Schema>
	fieldKey: string
	value: string | null | undefined
	renderDisplay: (value: string | null | undefined) => ReactNode
}

export function EditableFrontmatterDatetimeCell<Schema>({
	app,
	row,
	fieldKey,
	value,
	renderDisplay,
}: EditableFrontmatterDatetimeCellProps<Schema>): ReactNode {
	const handleSave = async (nextValue: string) => {
		const trimmedValue = nextValue.trim()
		const previousValue = value ?? ''
		if (trimmedValue === previousValue) {
			return
		}
		if (!(row.file instanceof TFile)) {
			return
		}

		await app.fileManager.processFrontMatter(row.file, (frontmatter: Record<string, unknown>) => {
			if (trimmedValue === '') {
				delete frontmatter[fieldKey]
				return
			}

			frontmatter[fieldKey] = trimmedValue
		})
	}

	return (
		<div className="lj:px-1">
			<EditableDatetimeField
				value={value}
				onSave={(newValue) => {
					void handleSave(newValue)
				}}
				className="lj:truncate"
				renderDisplay={renderDisplay}
			/>
		</div>
	)
}
