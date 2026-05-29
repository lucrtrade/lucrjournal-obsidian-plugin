import { Notice, type App, type TFile } from 'obsidian'
import { useState } from 'react'

import { removePositionSectionEntry, type PositionSectionKind } from '../../domains'
import { t } from '../../lang/helpers'
import { createLogger } from '../../logger'
import { getPersistedEntryDisplayName } from '../../utils'

import { addLinkedSectionEntry } from './linked-section-actions'

import type { LinkedSectionItem } from './linked-section-types'
import type { DomainPersistedEntry } from '../../domains/core/type'

type UseLinkedSectionPanelParams<Entry> = {
	app: App
	createEntry: (name: string) => Promise<DomainPersistedEntry<Entry>>
	kind: PositionSectionKind
	positionFile: TFile | null
	items: LinkedSectionItem<Entry>[]
	availableEntries: DomainPersistedEntry<Entry>[]
	onCreated?: () => void
}

const logger = createLogger('linked-section')

export function useLinkedSectionPanel<Entry>({
	app,
	createEntry,
	kind,
	positionFile,
	items,
	availableEntries,
	onCreated,
}: UseLinkedSectionPanelParams<Entry>) {
	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [pendingDeleteItem, setPendingDeleteItem] = useState<LinkedSectionItem<Entry> | null>(null)
	const linkedEntryPaths = items.map((item) => item.file.path)

	const handleSave = async (entryOptionValue: string) => {
		if (positionFile === null) {
			return
		}

		setIsSaving(true)
		try {
			const result = await addLinkedSectionEntry({
				app,
				createEntry,
				kind,
				entryOptionValue,
				positionFile,
				availableEntries,
			})
			setIsPickerOpen(false)
			if (result.appendResult === 'appended') {
				onCreated?.()
			}
		} catch (error) {
			logger.error('handleSave failed', { kind, entryOptionValue, error })
			throw error
		} finally {
			setIsSaving(false)
		}
	}

	const handleRemove = (item: LinkedSectionItem<Entry>) => {
		setPendingDeleteItem(item)
	}

	const confirmRemove = async () => {
		if (positionFile === null) {
			return
		}
		if (pendingDeleteItem === null) {
			return
		}

		setIsSaving(true)
		try {
			const removed = await removePositionSectionEntry({
				app,
				kind,
				linkpath: pendingDeleteItem.linkpath,
				sectionStart: pendingDeleteItem.sectionStart,
				positionFile,
			})
			const displayName = getPersistedEntryDisplayName(pendingDeleteItem.entry)
			if (removed) {
				new Notice(t('POSITION_DETAILS_CONTEXT_REMOVE_SUCCESS', { name: displayName }))
			} else {
				new Notice(t('POSITION_DETAILS_CONTEXT_REMOVE_MISSING', { name: displayName }))
			}
		} catch (error) {
			logger.error('confirmRemove failed', { kind, linkpath: pendingDeleteItem.linkpath, error })
			throw error
		} finally {
			setPendingDeleteItem(null)
			setIsSaving(false)
		}
	}

	return {
		confirmRemove,
		closeRemoveModal: () => {
			if (!isSaving) {
				setPendingDeleteItem(null)
			}
		},
		handleRemove,
		handleSave,
		isPickerOpen,
		isSaving,
		linkedEntryPaths,
		pendingDeleteItem,
		openPicker: () => setIsPickerOpen(true),
		closePicker: () => setIsPickerOpen(false),
	}
}
