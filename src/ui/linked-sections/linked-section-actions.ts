import { Notice, type App, type TFile } from 'obsidian'

import {
	addPositionSectionEntry,
	getPositionSectionTitle,
	type PositionSectionKind,
} from '../../domains'
import { t } from '../../lang/helpers'

import type { DomainPersistedEntry } from '../../domains/core/type'

export async function addLinkedSectionEntry<Entry>({
	app,
	createEntry,
	kind,
	entryOptionValue,
	positionFile,
	availableEntries,
}: {
	app: App
	createEntry: (name: string) => Promise<DomainPersistedEntry<Entry>>
	kind: PositionSectionKind
	entryOptionValue: string
	positionFile: TFile
	availableEntries: DomainPersistedEntry<Entry>[]
}): Promise<{ entryFile: TFile; created: boolean; appendResult: 'appended' | 'exists' }> {
	const result = await addPositionSectionEntry({
		app,
		createEntry,
		entryOptionValue,
		positionFile,
		sectionTitle: getPositionSectionTitle(kind),
		availableEntries,
	})

	if (result.appendResult === 'exists') {
		new Notice(t('POSITION_DETAILS_CONTEXT_LINK_EXISTS', { name: result.entryFile.basename }))
	} else {
		new Notice(t('POSITION_DETAILS_CONTEXT_APPEND_SUCCESS', { name: result.entryFile.basename }))
	}

	return result
}
