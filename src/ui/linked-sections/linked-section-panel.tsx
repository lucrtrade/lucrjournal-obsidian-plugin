import { useState } from 'react'

import { t } from '../../lang/helpers'
import { getCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import { buildIsoDatetimeInTimeZone, getPersistedEntryDisplayName } from '../../utils'
import { getFileTags } from '../file-tags'
import { PositionDetailsContextEntryDeleteModal } from '../position-details/position-details-context-entry-delete-modal'
import { PositionDetailsContextEntryPickerModal } from '../position-details/position-details-context-entry-picker-modal'
import { DatetimeDisplay } from '../primitives/datetime-display'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import { LinkedEntryTitle } from './linked-entry-title'
import { useLinkedSectionPanel } from './use-linked-section-panel'

import type { LinkedSectionItem } from './linked-section-types'
import type { PositionSectionKind } from '../../domains'
import type { DomainPersistedEntry } from '../../domains/core/type'
import type { App, TFile } from 'obsidian'

type LinkedSectionPanelProps<Entry extends { icon?: string | null }> = {
	app: App
	createEntry: (name: string) => Promise<DomainPersistedEntry<Entry>>
	kind: PositionSectionKind
	title: string
	positionFile: TFile | null
	items: LinkedSectionItem<Entry>[]
	availableEntries: DomainPersistedEntry<Entry>[]
	onCreated?: () => void
	onCreateRequest?: (inputValue: string) => void
}

export function LinkedSectionPanel<Entry extends { icon?: string | null }>({
	app,
	createEntry,
	kind,
	title,
	positionFile,
	items,
	availableEntries,
	onCreated,
	onCreateRequest,
}: LinkedSectionPanelProps<Entry>) {
	const {
		confirmRemove,
		closeRemoveModal,
		handleRemove,
		handleSave,
		isPickerOpen,
		isSaving,
		linkedEntryPaths,
		pendingDeleteItem,
		openPicker,
		closePicker,
	} = useLinkedSectionPanel({
		app,
		createEntry,
		kind,
		positionFile,
		items,
		availableEntries,
		onCreated,
	})
	const panelLabel = title

	if (items.length === 0) {
		return (
			<>
				<div className="lj:flex lj:flex-col lj:p-4">
					<button
						type="button"
						disabled={positionFile === null || isSaving}
						onClick={openPicker}
						data-lj-control="linked-entry-picker-open"
						className="lj:inline-flex lj:items-center lj:gap-2 lj:self-start lj:px-3 lj:py-2 lj:text-xs lj:font-medium lj:uppercase lj:tracking-wider lj:text-lj-c-hint lj:transition-colors lj:hover:text-lj-c-secondary lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
					>
						<ObsidianIcon name="plus" className="lj:size-3" />
						{t('POSITION_DETAILS_CONTEXT_ADD_CATEGORY', { category: panelLabel })}
					</button>
				</div>
				<PositionDetailsContextEntryPickerModal
					app={app}
					isOpen={isPickerOpen}
					isSaving={isSaving}
					label={t('POSITION_DETAILS_CONTEXT_PICKER_TITLE', { category: panelLabel })}
					category={panelLabel}
					placeholder={t('POSITION_DETAILS_CONTEXT_PICKER_PLACEHOLDER', { category: panelLabel.toLowerCase() })}
					entries={availableEntries}
					linkedEntryPaths={linkedEntryPaths}
					onClose={closePicker}
					onSave={handleSave}
					onCreateRequest={onCreateRequest === undefined
						? undefined
						: (value) => {
							closePicker()
							onCreateRequest(value)
						}}
				/>
			</>
		)
	}

	return (
		<>
			<div className="lj:flex lj:flex-col lj:gap-1">
				{items.map((item) => (
					<LinkedSectionListRow
						key={item.id}
						app={app}
						item={item}
						isSaving={isSaving}
						onRemove={handleRemove}
					/>
				))}

				<button
					type="button"
					disabled={positionFile === null || isSaving}
					onClick={openPicker}
					data-lj-control="linked-entry-picker-open"
					className="lj:mt-2 lj:inline-flex lj:items-center lj:gap-2 lj:self-start lj:px-3 lj:py-2 lj:text-xs lj:font-medium lj:uppercase lj:tracking-wider lj:text-lj-c-hint lj:transition-colors lj:hover:text-lj-c-secondary lj:disabled:cursor-not-allowed lj:disabled:opacity-50"
				>
					<ObsidianIcon name="plus" className="lj:size-3" />
					{t('POSITION_DETAILS_CONTEXT_ADD_CATEGORY', { category: panelLabel })}
				</button>
			</div>
			<PositionDetailsContextEntryPickerModal
				app={app}
				isOpen={isPickerOpen}
				isSaving={isSaving}
				label={t('POSITION_DETAILS_CONTEXT_PICKER_TITLE', { category: panelLabel })}
				category={panelLabel}
				placeholder={t('POSITION_DETAILS_CONTEXT_PICKER_PLACEHOLDER', { category: panelLabel.toLowerCase() })}
				entries={availableEntries}
				linkedEntryPaths={linkedEntryPaths}
				onClose={closePicker}
				onSave={handleSave}
				onCreateRequest={onCreateRequest === undefined
					? undefined
					: (value) => {
						closePicker()
						onCreateRequest(value)
					}}
			/>
			<PositionDetailsContextEntryDeleteModal
				isOpen={pendingDeleteItem !== null}
				isDeleting={isSaving}
				contextHeading={pendingDeleteItem === null ? null : `## [[${pendingDeleteItem.linkpath}]]`}
				linkedFilePath={pendingDeleteItem?.file.path ?? null}
				onClose={closeRemoveModal}
				onConfirm={() => {
					void confirmRemove()
				}}
			/>
		</>
	)
}

function LinkedSectionListRow<Entry>({
	app,
	item,
	isSaving,
	onRemove,
}: {
	app: App
	item: LinkedSectionItem<Entry>
	isSaving: boolean
	onRemove: (item: LinkedSectionItem<Entry>) => void
}) {
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const entryTitle = getPersistedEntryDisplayName(item.entry)
	const timeZone = getCurrentTimeZoneSetting()
	const isoDatetime = buildIsoDatetimeInTimeZone(new Date(item.file.stat.ctime), timeZone)
	const tags = getFileTags(app, item.file)

	return (
		<article
			className="lj:group lj:rounded-xl lj:border lj:border-lj-alpha-8-10 lj:bg-lj-surf-deep lj:px-4 lj:py-3 lj:transition-colors lj:hover:border-lj-alpha-10"
		>
			<div className="lj:flex lj:items-start lj:justify-between lj:gap-3">
				<div className="lj:min-w-0 lj:flex-1">
					<button
						type="button"
						onClick={() => {
							void openLinkedEntryFile(app, item.file)
						}}
						className="lj:text-sm lj:font-medium lj:text-lj-c-accent lj:hover:underline lj:text-left lj:truncate lj:max-w-full lj:block"
					>
						<LinkedEntryTitle
							entry={item.entry as DomainPersistedEntry<{ lucr_type?: string; icon?: string | null; source?: string | null; impact?: 'high' | 'medium' | 'low' | null }>}
							title={entryTitle}
						/>
					</button>
					<div className="lj:mt-1.5 lj:flex lj:flex-wrap lj:items-center lj:gap-2">
						<DatetimeDisplay datetime={isoDatetime} />
						{tags.map((tag) => (
							<span
								key={tag}
								className="lj:inline-flex lj:items-center lj:rounded lj:bg-lj-alpha-5-10 lj:px-1.5 lj:py-0.5 lj:text-[11px] lj:font-medium lj:text-lj-c-muted"
							>
								#{tag}
							</span>
						))}
					</div>
				</div>

				<div className="lj:relative lj:shrink-0">
					<button
						type="button"
						onClick={() => setIsMenuOpen(!isMenuOpen)}
						className="lj:p-1 lj:rounded-md lj:text-lj-c-hint lj:opacity-0 lj:group-hover:opacity-100 lj:transition-opacity lj:hover:text-lj-c-secondary lj:hover:bg-lj-alpha-5"
					>
						<ObsidianIcon name="more-vertical" className="lj:size-4" />
					</button>

					{isMenuOpen && (
						<>
							<div className="lj:fixed lj:inset-0 lj:z-30" onClick={() => setIsMenuOpen(false)} />
							<div className="lj:absolute lj:top-full lj:right-0 lj:mt-1 lj:w-36 lj:bg-lj-surf-popover lj:backdrop-blur-xl lj:border lj:border-lj-alpha-10 lj:rounded-md lj:shadow-xl lj:overflow-hidden lj:z-40 lj:py-1">
								<button
									type="button"
									disabled={isSaving}
									onClick={() => {
										setIsMenuOpen(false)
										onRemove(item)
									}}
									className="lj:flex lj:w-full lj:items-center lj:gap-2 lj:rounded-none lj:text-left lj:px-3 lj:py-2 lj:text-xs lj:text-lj-c-danger lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-danger-strong lj:transition-colors lj:disabled:opacity-50"
								>
									<ObsidianIcon name="trash-2" className="lj:size-3.5" />
									{t('POSITION_DETAILS_CONTEXT_REMOVE_LINK')}
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</article>
	)
}

async function openLinkedEntryFile(app: App, file: TFile) {
	const leaf = app.workspace.getLeaf('tab')
	await leaf.openFile(file)
}
