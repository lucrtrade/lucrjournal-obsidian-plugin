import { TFile } from 'obsidian'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { PlatformDomain, PositionDomain, SymbolDomain, resolveSymbolLogo, resolveSymbolName } from '../../../domains'
import { resolveIconDescriptor } from '../../../domains/core/icon-descriptor'
import { resolveHomepageFaviconUrl } from '../../../icon/homepage-favicon'
import { PLATFORM_FALLBACK_ICON_NAME } from '../../../icon/platform-icons'
import { t } from '../../../lang/helpers'
import { formatAmount, formatPercentage, formatSignedAmount, formatOpenedAtForDisplay, formatRelativeTimeFromNow } from '../../../utils'
import { AccountInlineValue } from '../../account-inline-value'
import { NewsSourcePreview } from '../../dashboard/news-source-preview'
import { renderPositionConfidenceContent } from '../../position-enum-fields'
import { PositionSymbolContent } from '../../position-symbol-field'
import { IconView } from '../../primitives/icon-view'
import { ObsidianDropdown } from '../../primitives/obsidian-dropdown'
import { ObsidianIcon } from '../../primitives/obsidian-icon'
import { ReadonlyTokenList } from '../../primitives/readonly-token-list'
import { StatusDot } from '../../primitives/status-dot'

import { EditableAccountNameCell } from './editable-account-name-cell'
import { EditableContractUnitCell } from './editable-contract-unit-cell'
import { EditableCriteriaLinksCell } from './editable-criteria-links-cell'
import { EditableEntryTitleCell } from './editable-entry-title-cell'
import { EditableFeeModelCell } from './editable-fee-model-cell'
import { EditableFrontmatterDatetimeCell } from './editable-frontmatter-datetime-cell'
import { EditableFrontmatterNumberCell } from './editable-frontmatter-number-cell'
import { EditableNewsSourceCell } from './editable-news-source-cell'
import { EditablePositionNumberCell } from './editable-position-number-cell'
import { EditableTagsCell } from './editable-tags-cell'
import { EnumBadge, resolveOptionLabel } from './enum-badge'
import { PositionLinkedGroupsCell, PositionPlaybooksCell } from './position-linked-table-cells'
import { ReadonlyWikilinkListCell } from './readonly-wikilink-list-cell'

import type { PositionTableLazyContent, PositionSymbolType } from '../../../domains'
import type { BaseFieldType, FieldDescriptor, TitleFieldValue } from '../../../domains/core/fields'
import type { SelectOption } from '../../../domains/core/form'
import type { DomainPersistedEntry } from '../../../domains/core/type'
import type { CriteriaOption } from '../../../domains/criteria'
import type { Position, PositionConfidence } from '../../../domains/position'
import type { SymbolContractUnitTableValue } from '../../../domains/symbol/position-model'
import type { LinkActivationEvent } from '../../../views/link-activation'
import type { TableRenderContext, TableRendererEntry, TableRendererRegistry } from '../types'

type TableActionContextExtras = {
	onDeleteRow?: (entry: DomainPersistedEntry<unknown>) => void
	onSelectAccountPositions?: (accountWikilink: string, event?: LinkActivationEvent) => void
	onSelectAccountSymbols?: (accountWikilink: string, event?: LinkActivationEvent) => void
	onSelectLinkedEntryPositions?: (filePath: string, event?: LinkActivationEvent) => void
	onSelectSymbolPositions?: (symbolWikilink: string, event?: LinkActivationEvent) => void
	tableLazyContent?: Record<string, PositionTableLazyContent>
	onSelectPlaybook?: (filePath: string, event?: LinkActivationEvent) => void
	editingFeeFilePath?: string | null
	setEditingFeeFilePath?: Dispatch<SetStateAction<string | null>>
}
type PositionNumberFieldKey = 'profit' | 'notional_value' | 'risk'

const READONLY_TAG_CHIP_CLASS_NAME = 'lj:max-w-[9rem] lj:min-w-0 lj:shrink lj:rounded-full lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2.5 lj:py-0.5 lj:text-[11px] lj:text-lj-c-secondary'

const STATUS_DOT_SIZE_CLASS_NAME = 'lj:size-2'

function resolveEnumBadgeVariant(display: string | undefined): 'default' | 'prominent' | 'side' {
	if (display === 'enum-badge-prominent') {
		return 'prominent'
	}
	if (display === 'enum-badge-side') {
		return 'side'
	}
	return 'default'
}

function EntryRowActionsMenu({ onDelete }: { onDelete: () => void }) {
	const [isOpen, setIsOpen] = useState(false)
	const menuRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isOpen) {
			return 
		}
		const handlePointerDown = (event: MouseEvent) => {
			if (!menuRef.current?.contains(event.target as Node)) {
				setIsOpen(false) 
			}
		}
		activeDocument.addEventListener('mousedown', handlePointerDown)
		return () => activeDocument.removeEventListener('mousedown', handlePointerDown)
	}, [isOpen])

	return (
		// @story [[lucrjournal/fields#^table-row-action-isolation]] Keeps row action menus from activating parent row navigation
		<div ref={menuRef} className="lj:relative lj:inline-flex" onClick={(event) => event.stopPropagation()}>
			<button type="button" onClick={() => setIsOpen((value) => !value)} className="lj:p-1.5 lj:rounded-md lj:text-lj-c-muted-half lj:hover:text-lj-c-strong lj:hover:bg-lj-surf-button-hover lj:transition-colors">
				<ObsidianIcon name="more-horizontal" className="lj:size-4" />
			</button>
			{isOpen && (
				<div className="lj:absolute lj:right-0 lj:top-full lj:mt-1 lj:z-50 lj:min-w-[120px] lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:py-1 lj:shadow-xl">
					<button type="button" onClick={() => {
						setIsOpen(false); onDelete() 
					}} className="lj:flex lj:w-full lj:items-center lj:gap-2 lj:rounded-none lj:px-3 lj:py-2 lj:text-left lj:text-xs lj:text-lj-c-danger lj:hover:bg-lj-alpha-5 lj:hover:text-lj-c-danger-strong lj:transition-colors">
						<ObsidianIcon name="trash-2" className="lj:size-3.5" />
						{t('DASHBOARD_MANAGED_ENTRY_DELETE')}
					</button>
				</div>
			)}
		</div>
	)
}

function resolveFieldTagOptions(
	field: FieldDescriptor<unknown>,
	entry: DomainPersistedEntry<unknown>,
	context: TableRenderContext,
) {
	if (field.dynamicTagOptions !== undefined) {
		return field.dynamicTagOptions(context.app, entry)
	}

	return field.tagOptions ?? []
}

function resolveFieldCriteriaOptions(
	field: FieldDescriptor<unknown>,
	entry: DomainPersistedEntry<unknown>,
	context: TableRenderContext,
): CriteriaOption[] {
	if (field.dynamicCriteriaOptions !== undefined) {
		return field.dynamicCriteriaOptions(context.app, entry)
	}

	return field.criteriaOptions ?? []
}

function EditableDescriptionCell({
	app,
	file,
	value,
}: {
	app: { fileManager: { processFrontMatter: (file: TFile, updater: (frontmatter: Record<string, unknown>) => void) => Promise<void> } }
	file: TFile
	value: string
}) {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(value)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		if (!isEditing) {
			return 
		}
		setDraft(value)
		const timer = window.setTimeout(() => {
			textareaRef.current?.focus()
			textareaRef.current?.select()
		}, 0)
		return () => window.clearTimeout(timer)
	}, [isEditing, value])

	const save = async () => {
		const nextValue = draft.trim()
		if (nextValue === value.trim()) {
			setIsEditing(false)
			return
		}

		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter.description = nextValue === '' ? null : nextValue
		})
		setIsEditing(false)
	}

	return isEditing ? (
		<div className="lj:px-1" onClick={(event) => event.stopPropagation()}>
			<textarea
				ref={textareaRef}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					void save() 
				}}
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						event.preventDefault()
						setDraft(value)
						setIsEditing(false)
					}
					if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
						event.preventDefault()
						void save()
					}
				}}
				rows={3}
				className="lj:w-full lj:resize-none lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2 lj:py-1 lj:text-xs lj:text-lj-c-strong lj:outline-none lj:shadow-sm"
			/>
		</div>
	) : (
		<button
			type="button"
			onClick={(event) => {
				event.stopPropagation()
				setIsEditing(true)
			}}
			className="lj:block lj:w-full lj:px-1 lj:text-left lj:text-lj-c-tertiary lj:transition-colors hover:lj:text-lj-c-strong"
		>
			{value.trim() === '' ? '-' : value}
		</button>
	)
}

// @story [[lucrjournal/fields#^position-cell-writeback]] Routes editable position numbers through descriptor writeback field names
function renderEditablePositionNumberCell(
	entry: { file: unknown; fm: unknown },
	field: FieldDescriptor<unknown>,
	context: TableRenderContext,
	value: unknown,
	fallbackFieldKey: PositionNumberFieldKey,
	formatDisplay: (value: number | null) => { text: string; valueClassName: string },
) {
	return (
		<EditablePositionNumberCell
			app={context.app}
			row={entry as DomainPersistedEntry<Position>}
			fieldKey={(field.writeback?.field ?? fallbackFieldKey) as PositionNumberFieldKey}
			value={value as number | string | null | undefined}
			formatDisplay={formatDisplay}
		/>
	)
}

function formatProfitCellDisplay(currentValue: number | null) {
	if (currentValue == null) {
		return { text: '-', valueClassName: 'lj:text-lj-c-tertiary-muted' }
	}

	return {
		text: formatSignedAmount(currentValue),
		valueClassName: currentValue > 0
			? 'lj:text-lj-profit-text'
			: currentValue < 0
				? 'lj:text-lj-loss-text'
				: 'lj:text-lj-c-muted',
	}
}

// @story [[lucrjournal/fields#^position-cell-writeback]] Routes position enum values through the position domain writer
// @story [[lucrjournal/fields#^symbol-cell-writeback]] Routes symbol enum values through the symbol domain writer
// @story [[lucrjournal/fields#^writeback-failure-state]] Starts enum writeback without an optimistic persisted value or rejection handler
function updateEnumField(
	entry: { fm: unknown },
	field: FieldDescriptor<unknown>,
	context: TableRenderContext,
	file: TFile,
	value: string | number | null,
) {
	const fieldName = field.writeback!.field
	const lucrType = (entry as DomainPersistedEntry<{ lucr_type?: string | null }>).fm.lucr_type
	if (lucrType === 'position') {
		void PositionDomain.updateFields(context.app, file, { [fieldName]: value })
		return
	}
	if (lucrType === 'symbol') {
		void SymbolDomain.updateFields(context.app, file, { [fieldName]: value })
		return
	}
	void context.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		frontmatter[fieldName] = value
	})
}

const textRenderer: TableRendererEntry = {
	align: 'left',
	renderCell: (value, entry, field, context) => {
		const extras = context.extras as TableActionContextExtras | undefined
		const file = entry.file
		const display = field.table?.display

		switch (display) {
			case 'status-dot': {
				const row = entry as DomainPersistedEntry<{ closed_at?: string | null; status?: string | null; profit?: number | null }>
				const profit = row.fm.profit ?? 0
				const tone = row.fm.closed_at != null || row.fm.status === 'close'
					? profit > 0 ? 'highlight' : profit < 0 ? 'muted' : 'faint'
					: 'outline'
				return (
					<div className="lj:text-center">
						<StatusDot sizeClassName={STATUS_DOT_SIZE_CLASS_NAME} tone={tone} className="lj:mx-auto" emphasized={tone === 'highlight'} />
					</div>
				)
			}
			case 'position-symbol': {
				const symbolWikilink = typeof value === 'string' ? value : null
				return (
					<PositionSymbolContent
						symbol={resolveSymbolName(context.app, symbolWikilink)}
						logo={resolveSymbolLogo(context.app, symbolWikilink)}
						className="lj:text-lj-c-strong-soft"
					/>
				)
			}
			case 'account-inline': {
				return <AccountInlineValue app={context.app} value={typeof value === 'string' ? value : null} />
			}
			case 'platform-inline': {
				const platformName = typeof value === 'string' ? value : null
				const icon = platformName == null ? null : PlatformDomain.resolveIcon(context.app, platformName)
				return (
					<div className="lj:flex lj:min-w-0 lj:items-center lj:gap-2 lj:px-1 lj:text-lj-c-tertiary">
						{icon == null
							? <ObsidianIcon name={PLATFORM_FALLBACK_ICON_NAME} className="lj:size-3.5 lj:shrink-0 lj:text-lj-c-hint" />
							: <IconView icon={icon} className="lj:size-3.5" />}
						<span className="lj:min-w-0 lj:flex-1 lj:truncate">{platformName ?? '-'}</span>
					</div>
				)
			}
			case 'editable-account-name':
				// @story [[lucrjournal/fields#^account-name-writeback]] Dispatches persisted account rows to the account rename cell
				if (!(file instanceof TFile)) {
					return <div className="lj:px-1 lj:truncate lj:text-lj-c-tertiary">{typeof value === 'string' && value !== '' ? value : '-'}</div>
				}
				return <EditableAccountNameCell app={context.app} file={file} value={typeof value === 'string' ? value : ''} />
			case 'editable-description':
				if (!(file instanceof TFile)) {
					return null
				}
				return <EditableDescriptionCell app={context.app} file={file} value={typeof value === 'string' ? value : ''} />
			case 'source-preview':
				// @story [[lucrjournal/fields#^news-source-writeback]] Dispatches persisted news rows to the source writeback cell
				if (!(file instanceof TFile)) {
					return <NewsSourcePreview url={typeof value === 'string' ? value : null} compact />
				}
				return <EditableNewsSourceCell app={context.app} file={file} value={typeof value === 'string' ? value : null} />
			case 'tag-list': {
				// @story [[lucrjournal/fields#^tag-cell-writeback]] Dispatches persisted tag lists to normalized frontmatter writeback
				const tags = Array.isArray(value) ? value.map((tag) => String(tag)) : []
				if (!(file instanceof TFile)) {
					return (
						<ReadonlyTokenList
							items={tags}
							displayValue={(tag) => `#${tag.replace(/^#/, '')}`}
							chipClassName={READONLY_TAG_CHIP_CLASS_NAME}
						/>
					)
				}
				return <EditableTagsCell app={context.app} file={file} value={tags} tagOptions={resolveFieldTagOptions(field, entry as DomainPersistedEntry<unknown>, context)} />
			}
			case 'row-actions':
				return (
					<div className="lj:flex lj:justify-center">
						<EntryRowActionsMenu onDelete={() => extras?.onDeleteRow?.(entry as DomainPersistedEntry<unknown>)} />
					</div>
				)
			case 'linked-playbooks': {
				const content = file instanceof TFile && extras?.tableLazyContent != null ? extras.tableLazyContent[file.path] : undefined
				return <PositionPlaybooksCell content={content} onSelectPlaybook={extras?.onSelectPlaybook} />
			}
			case 'linked-groups': {
				const content = file instanceof TFile && extras?.tableLazyContent != null ? extras.tableLazyContent[file.path] : undefined
				return <PositionLinkedGroupsCell content={content} />
			}
			case 'editable-value':
				return renderEditablePositionNumberCell(entry, field, context, value, 'notional_value', (currentValue) => ({
					text: currentValue == null ? '-' : String(currentValue),
					valueClassName: 'lj:text-lj-c-tertiary',
				}))
			case 'editable-fee-model':
				// @story [[lucrjournal/fields#^symbol-cell-writeback]] Writes fee edits only for persisted symbol rows
				if (
					file instanceof TFile
					&& (entry as DomainPersistedEntry<{ lucr_type?: string | null; fee_value?: number | null }>).fm.lucr_type === 'symbol'
				) {
					const row = entry as DomainPersistedEntry<{ fee_value?: number | null; type?: PositionSymbolType | null }>
					const editingFeeFilePath = extras?.editingFeeFilePath
					const setEditingFeeFilePath = extras?.setEditingFeeFilePath
					const isEditing = editingFeeFilePath === file.path
					return (
						<EditableFeeModelCell
							feeValue={row.fm.fee_value ?? null}
							symbolType={row.fm.type ?? null}
							isEditing={isEditing}
							canEdit={setEditingFeeFilePath !== undefined && (editingFeeFilePath == null || isEditing)}
							onEditStart={() => setEditingFeeFilePath?.(file.path)}
							onEditEnd={() => setEditingFeeFilePath?.((current) => current === file.path ? null : current)}
							onSave={async (nextValue) => {
								await SymbolDomain.updateFields(context.app, file, nextValue)
							}}
						/>
					)
				}
				return (
					<div className="lj:px-1 lj:truncate lj:text-lj-c-tertiary">
						-
					</div>
				)
			case 'editable-contract-unit':
				// @story [[lucrjournal/fields#^symbol-cell-writeback]] Writes contract-unit edits only for persisted symbol rows
				if (
					file instanceof TFile
					&& (entry as DomainPersistedEntry<{ lucr_type?: string | null; contract_unit?: SymbolContractUnitTableValue }>).fm.lucr_type === 'symbol'
				) {
					const row = entry as DomainPersistedEntry<{ contract_unit: SymbolContractUnitTableValue }>
					return (
						<EditableContractUnitCell
							value={row.fm.contract_unit.value}
							editable={row.fm.contract_unit.editable}
							source={row.fm.contract_unit.source}
							onSave={async (nextValue) => {
								await SymbolDomain.updateFields(context.app, file, { contract_unit: nextValue })
							}}
						/>
					)
				}
				return (
					<div className="lj:px-1 lj:truncate lj:text-lj-c-tertiary">
						-
					</div>
				)
			case undefined:
			case 'enum-badge-prominent':
			case 'enum-badge-side':
			case 'relative-datetime':
			case 'confidence-ring':
			case 'editable-profit-currency':
			case 'editable-number':
			case 'editable-currency':
			case 'percentage':
			case 'currency':
			case 'profit-currency':
			case 'linked-position-count':
			case 'linked-symbol-count':
				return (
					<div className="lj:px-1 lj:truncate lj:text-lj-c-tertiary">
						{/* eslint-disable-next-line @typescript-eslint/no-base-to-string -- Explicit String conversion for fallback rendering */}
						{value == null ? '-' : String(value)}
					</div>
				)
			default:
				display satisfies never
				throw new Error('Unknown text table display')
		}
	},
}

// @story [[lucrjournal/fields#^entry-title-writeback]] Dispatches persisted title cells to filename and heading writeback
const titleRenderer: TableRendererEntry = {
	align: 'left',
	renderCell: (value, entry, _field, context) => {
		if (!(entry.file instanceof TFile)) {
			return null
		}

		const titleValue = isTitleFieldValue(value)
			? value
			: { title: typeof value === 'string' ? value : entry.file.basename }
		const sourceFaviconUrl = resolveHomepageFaviconUrl(titleValue.source)
		const icon = titleValue.icon != null
			? typeof titleValue.icon === 'string'
				? resolveIconDescriptor(titleValue.icon, { fallbackImageName: titleValue.icon }) ?? { kind: 'image' as const, value: titleValue.icon }
				: titleValue.icon
			: sourceFaviconUrl == null
				? undefined
				: { kind: 'url' as const, value: sourceFaviconUrl }

		return (
			<EditableEntryTitleCell
				app={context.app}
				file={entry.file}
				icon={icon}
				value={titleValue.title.trim() !== '' ? titleValue.title : entry.file.basename}
			/>
		)
	},
}

function isTitleFieldValue(value: unknown): value is TitleFieldValue {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as Partial<TitleFieldValue>).title === 'string'
}

const numberRenderer: TableRendererEntry = {
	align: 'right',
	renderCell: (value, entry, field, context) => {
		const display = field.table?.display

		switch (display) {
			case 'percentage':
				return (
					<div className="lj:px-1 lj:text-right lj:font-mono lj:text-lj-c-tertiary">
						{value == null ? '-' : formatPercentage(Number(value))}
					</div>
				)
			case 'profit-currency': {
				if (value == null) {
					return <div className="lj:px-1 lj:text-right lj:font-mono lj:text-lj-c-tertiary-muted">-</div>
				}
				const numericValue = Number(value)
				const valueClassName = numericValue > 0 ? 'lj:text-lj-profit-text' : numericValue < 0 ? 'lj:text-lj-loss-text' : 'lj:text-lj-c-muted'
				return (
					<div className={`lj:px-1 lj:text-right lj:font-mono ${valueClassName}`}>
						{formatSignedAmount(numericValue)}
					</div>
				)
			}
			case 'currency':
				return (
					<div className="lj:px-1 lj:text-right lj:font-mono lj:text-lj-c-tertiary">
						{value == null ? '-' : `$${formatAmount(Number(value))}`}
					</div>
				)
			case 'editable-profit-currency':
				return renderEditablePositionNumberCell(entry, field, context, value, 'profit', formatProfitCellDisplay)
			case 'editable-currency':
				return renderEditablePositionNumberCell(entry, field, context, value, 'risk', (currentValue) => ({
					text: currentValue == null ? '-' : `$${formatAmount(currentValue)}`,
					valueClassName: 'lj:text-lj-c-tertiary',
				}))
			case 'editable-number':
				if (entry.file instanceof TFile && (entry as DomainPersistedEntry<{ lucr_type?: string | null }>).fm.lucr_type === 'symbol') {
					const file = entry.file
					return (
						<EditableFrontmatterNumberCell
							value={value as number | null | undefined}
							onSave={async (nextValue) => {
								await SymbolDomain.updateFields(context.app, file, {
									[field.writeback?.field ?? field.key]: nextValue,
								})
							}}
							/* eslint-disable i18next/no-literal-string -- Display format specifier contains non-user facing fallback text */
							formatDisplay={(currentValue) => ({
								text: currentValue == null ? '-' : String(currentValue),
								valueClassName: 'lj:text-lj-c-tertiary',
							})}
							/* eslint-enable i18next/no-literal-string -- Resume literal string check */
						/>
					)
				}
				return (
					<div className="lj:px-1 lj:text-right lj:font-mono lj:text-lj-c-tertiary">
						{/* eslint-disable-next-line @typescript-eslint/no-base-to-string -- Explicit String conversion for fallback rendering */}
						{value == null ? '-' : String(value)}
					</div>
				)
			case 'linked-symbol-count': {
				const extras = context.extras as TableActionContextExtras | undefined
				const row = entry as DomainPersistedEntry<{
					account_wikilink?: string | null
					display_name?: string | null
				}>
				const accountWikilink = row.fm.account_wikilink
				const count = Number(value ?? 0)

				if (typeof accountWikilink !== 'string' || extras?.onSelectAccountSymbols === undefined) {
					return (
						<div className="lj:px-1 lj:text-right lj:font-mono lj:text-lj-c-tertiary">
							{count}
						</div>
					)
				}

				const label = t('DASHBOARD_SETTINGS_ACCOUNT_SYMBOL_COUNT_OPEN_SYMBOLS', {
					account: row.fm.display_name ?? accountWikilink,
				})

				return (
					<button
						type="button"
						aria-label={label}
						title={label}
						onClick={(event) => {
							event.stopPropagation()
							extras.onSelectAccountSymbols?.(accountWikilink, event)
						}}
						className="lj:ml-auto lj:flex lj:min-w-8 lj:appearance-none lj:items-center lj:justify-end lj:rounded-md lj:border-0 lj:bg-transparent lj:px-2 lj:py-1 lj:text-right lj:font-mono lj:text-lj-c-strong-soft lj:shadow-none lj:transition-colors lj:hover:bg-lj-alpha-10 lj:hover:text-lj-c-strong"
					>
						{count}
					</button>
				)
			}
			case 'linked-position-count': {
				const extras = context.extras as TableActionContextExtras | undefined
				const row = entry as DomainPersistedEntry<{
					account_wikilink?: string | null
					display_name?: string | null
					entryStats?: { entry?: { file?: { path?: string; basename?: string } } }
					symbol?: string | null
					symbol_wikilink?: string | null
				}>
				const accountWikilink = row.fm.account_wikilink
				const linkedEntryFile = row.fm.entryStats?.entry?.file
				const linkedEntryPath = linkedEntryFile?.path
				const symbolWikilink = row.fm.symbol_wikilink
				const count = Number(value ?? 0)
				let label = ''
				let linkValue = ''
				let onClick: ((value: string, event?: LinkActivationEvent) => void) | undefined

				if (typeof symbolWikilink === 'string') {
					label = t('DASHBOARD_SYMBOLS_TABLE_POSITION_COUNT_OPEN_POSITIONS', {
						symbol: row.fm.symbol ?? symbolWikilink,
					})
					linkValue = symbolWikilink
					onClick = extras?.onSelectSymbolPositions
				} else if (typeof accountWikilink === 'string') {
					label = t('DASHBOARD_SETTINGS_ACCOUNT_POSITION_COUNT_OPEN_POSITIONS', {
						account: row.fm.display_name ?? accountWikilink,
					})
					linkValue = accountWikilink
					onClick = extras?.onSelectAccountPositions
				} else if (typeof linkedEntryPath === 'string') {
					label = t('DASHBOARD_ENTRY_COLUMN_POSITION_COUNT_OPEN_POSITIONS', {
						entry: linkedEntryFile?.basename ?? row.fm.display_name ?? linkedEntryPath,
					})
					linkValue = linkedEntryPath
					onClick = extras?.onSelectLinkedEntryPositions
				}

				if (onClick === undefined) {
					return (
						<div className="lj:px-1 lj:text-right lj:font-mono lj:text-lj-c-tertiary">
							{count}
						</div>
					)
				}

				return (
					<button
						type="button"
						aria-label={label}
						title={label}
						onClick={(event) => {
							event.stopPropagation()
							onClick(linkValue, event)
						}}
						className="lj:ml-auto lj:flex lj:min-w-8 lj:appearance-none lj:items-center lj:justify-end lj:rounded-md lj:border-0 lj:bg-transparent lj:px-2 lj:py-1 lj:text-right lj:font-mono lj:text-lj-c-strong-soft lj:shadow-none lj:transition-colors lj:hover:bg-lj-alpha-10 lj:hover:text-lj-c-strong"
					>
						{count}
					</button>
				)
			}
			case undefined:
			case 'enum-badge-prominent':
			case 'relative-datetime':
			case 'status-dot':
			case 'position-symbol':
			case 'account-inline':
			case 'platform-inline':
			case 'enum-badge-side':
			case 'confidence-ring':
			case 'editable-value':
			case 'editable-account-name':
			case 'editable-description':
			case 'editable-fee-model':
			case 'editable-contract-unit':
			case 'source-preview':
			case 'tag-list':
			case 'row-actions':
			case 'linked-playbooks':
			case 'linked-groups':
				return (
					<div className="lj:px-1 lj:text-right lj:font-mono lj:text-lj-c-tertiary">
						{/* eslint-disable-next-line @typescript-eslint/no-base-to-string -- Explicit String conversion for fallback rendering */}
						{value == null ? '-' : String(value)}
					</div>
				)
			default:
				display satisfies never
				throw new Error('Unknown number table display')
		}
	},
}

// @story [[lucrjournal/fields#^writable-renderer-gates]] Enables enum editing only for writable persisted descriptors
const enumRenderer: TableRendererEntry = {
	align: 'left',
	renderCell: (value, entry, field, context) => {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string -- Explicit String conversion for enum normalization
		const normalizedValue = value == null ? null : String(value)
		const selectedOption = normalizedValue == null
			? field.options?.find((option) => option.value === '')
			: field.options?.find((option) => option.value === normalizedValue)
		const badgeVariant = resolveEnumBadgeVariant(field.table?.display)

		if (field.table?.display === 'confidence-ring' && field.readonly !== true && field.writeback?.editable === true && entry.file instanceof TFile && field.options !== undefined) {
			const file = entry.file
			const options = field.options.map((option) => ({
				value: option.value,
				label: resolveOptionLabel(option),
			}))

			return (
				<div className="lj:px-1" onClick={(event) => event.stopPropagation()}>
					<ObsidianDropdown
						options={options}
						value={normalizedValue ?? undefined}
						onChange={(nextValue) => {
							const resolvedValue = Number(nextValue)
							if (resolvedValue === value) {
								return 
							}
							updateEnumField(entry, field, context, file, resolvedValue)
						}}
						align="left"
						showChevron={false}
						/* eslint-disable i18next/no-literal-string -- Tailwind CSS class strings for confidence dropdown */
						triggerClassName="lj:flex lj:w-full lj:min-w-[88px] lj:items-center lj:justify-center lj:px-2 lj:py-1 lj:rounded-lg lj:border lj:border-transparent lj:hover:border-lj-alpha-10 lj:transition-all"
						menuClassName="lj:bg-lj-surf-popover lj:border lj:border-lj-alpha-10 lj:rounded-xl lj:shadow-xl lj:py-1 lj:min-w-[80px]"
						optionClassName={(selected) => `lj:flex lj:w-full lj:items-center lj:justify-center lj:px-3 lj:py-2 lj:transition-colors ${selected ? 'lj:bg-lj-alpha-10' : 'lj:hover:bg-lj-alpha-5'}`}
						/* eslint-enable i18next/no-literal-string -- Resume literal string check */
						renderTriggerContent={() => value == null ? <span className="lj:text-lj-c-muted">-</span> : renderPositionConfidenceContent(Number(value) as PositionConfidence)}
						renderOptionContent={(option) => renderPositionConfidenceContent(Number(option.value) as PositionConfidence)}
					/>
				</div>
			)
		}

		if (field.readonly !== true && field.writeback?.editable === true && entry.file instanceof TFile && field.options !== undefined) {
			const file = entry.file
			const options = field.options.map((option) => ({
				value: option.value,
				label: resolveOptionLabel(option),
			}))

			return (
				<div className="lj:px-1" onClick={(event) => event.stopPropagation()}>
					<ObsidianDropdown
						options={options}
						value={normalizedValue ?? undefined}
						onChange={(nextValue) => {
							const nextPersistedValue = nextValue === '' ? null : nextValue
							if (nextPersistedValue === normalizedValue) {
								return 
							}
							updateEnumField(entry, field, context, file, nextPersistedValue)
						}}
						align="left"
						showChevron={false}
						/* eslint-disable i18next/no-literal-string -- Tailwind CSS class strings for enum dropdown */
						triggerClassName={`lj:flex lj:w-full lj:items-center lj:justify-center lj:border lj:border-transparent lj:transition-all lj:hover:border-lj-alpha-10 ${
							field.table?.display === 'enum-badge-side'
								? 'lj:min-w-12 lj:rounded lj:px-0 lj:py-0'
								: 'lj:min-w-[88px] lj:rounded-lg lj:px-2 lj:py-1'
						}`}
						menuClassName="lj:min-w-[80px] lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:py-1 lj:shadow-xl"
						optionClassName={(selected) => `lj:flex lj:w-full lj:items-center lj:justify-center lj:px-3 lj:py-2 lj:transition-colors ${selected ? 'lj:bg-lj-alpha-10' : 'lj:hover:bg-lj-alpha-5'}`}
						/* eslint-enable i18next/no-literal-string -- Resume literal string check */
						renderTriggerContent={() => renderEnumBadgeTriggerContent(selectedOption, normalizedValue, badgeVariant)}
						renderOptionContent={(option) => {
							const rendererOption = field.options?.find((item) => item.value === option.value)
							return <EnumBadge option={rendererOption} fallbackValue={option.value} variant={badgeVariant} />
						}}
					/>
				</div>
			)
		}

		return (
			<div className="lj:px-1">
				{renderEnumBadgeTriggerContent(selectedOption, normalizedValue, badgeVariant)}
			</div>
		)
	},
}

function renderEnumBadgeTriggerContent(
	selectedOption: SelectOption | undefined,
	normalizedValue: string | null,
	badgeVariant: 'default' | 'prominent' | 'side',
) {
	if (selectedOption?.value === '' && normalizedValue === null) {
		return null
	}

	return <EnumBadge option={selectedOption} fallbackValue={normalizedValue} variant={badgeVariant} />
}

// @story [[lucrjournal/fields#^writable-renderer-gates]] Enables datetime editing only for writable persisted descriptors
// @story [[lucrjournal/fields#^position-cell-writeback]] Routes the current editable datetime descriptor to its frontmatter field
const datetimeRenderer: TableRendererEntry = {
	align: 'left',
	renderCell: (value, entry, field, context) => {
		if (field.table?.display === 'relative-datetime') {
			const datetimeValue = value as string | null | undefined

			if (field.readonly !== true && field.writeback?.editable === true && entry.file instanceof TFile) {
				return (
					<EditableFrontmatterDatetimeCell
						app={context.app}
						row={entry as DomainPersistedEntry<unknown>}
						fieldKey={field.writeback.field}
						value={datetimeValue}
						renderDisplay={(currentValue) => (
							<>
								<span className="lj:shrink-0 lj:whitespace-nowrap lj:font-mono lj:text-[13px] lj:text-lj-c-secondary-half">
									{formatOpenedAtForDisplay(currentValue) ?? '-'}
								</span>
								<span className="lj:ml-2 lj:shrink-0 lj:text-[10px] lj:text-lj-c-hint-faint">
									{formatRelativeTimeFromNow(currentValue) ?? '-'}
								</span>
							</>
						)}
					/>
				)
			}

			return (
				<div className="lj:px-1 lj:inline-flex lj:items-center lj:truncate">
					<span className="lj:shrink-0 lj:whitespace-nowrap lj:font-mono lj:text-[13px] lj:text-lj-c-secondary-half">
						{formatOpenedAtForDisplay(datetimeValue) ?? '-'}
					</span>
					<span className="lj:ml-2 lj:shrink-0 lj:text-[10px] lj:text-lj-c-hint-faint">
						{formatRelativeTimeFromNow(datetimeValue) ?? '-'}
					</span>
				</div>
			)
		}

		return (
			<div className="lj:px-1 lj:font-mono lj:text-lj-c-tertiary-muted lj:text-[11px]">
				{/* eslint-disable-next-line @typescript-eslint/no-base-to-string -- Explicit String conversion for fallback rendering */}
				{value == null ? '-' : String(value)}
			</div>
		)
	},
}

const wikilinkRenderer: TableRendererEntry = {
	align: 'left',
	renderCell: (value) => {
		if (value == null) {
			return <span className="lj:text-lj-c-muted-faint lj:px-1">-</span> 
		}
		const v = value as { name?: string }
		const name = v.name ?? '-'
		return (
			<div className="lj:px-1">
				<span className="lj:inline-flex lj:min-w-0 lj:max-w-full lj:items-center lj:rounded-full lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2.5 lj:py-1 lj:text-[11px] lj:text-lj-c-secondary">
					<span className="lj:truncate">{name}</span>
				</span>
			</div>
		)
	},
}

// @story [[lucrjournal/fields#^criteria-readonly-gate]] Requires writable criteria options before dispatching the editable criteria cell
const wikilinkArrayRenderer: TableRendererEntry = {
	align: 'left',
	renderCell: (value, entry, field, context) => {
		const file = entry.file
		const items = (value as Array<{ name?: string; link?: string }> | null | undefined) ?? []

		if (file instanceof TFile && field.readonly !== true && field.writeback?.type === 'wikilink-array' && field.writeback.editable && (field.dynamicCriteriaOptions !== undefined || field.criteriaOptions !== undefined)) {
			return (
				<EditableCriteriaLinksCell
					app={context.app}
					file={file}
					value={items.map((item) => item.link ?? item.name ?? '').filter((item) => item !== '')}
					criteriaOptions={resolveFieldCriteriaOptions(field, entry as DomainPersistedEntry<unknown>, context)}
				/>
			)
		}

		if (field.readonly === true) {
			return (
				<ReadonlyWikilinkListCell
					app={context.app}
					items={items.map((item) => ({ name: item.name ?? '-', link: item.link ?? item.name ?? '' }))}
				/>
			)
		}

		if (items.length === 0) {
			return <span className="lj:text-lj-c-muted-faint lj:px-1">-</span>
		}
		return <ReadonlyTokenList items={items.map((item) => item.name ?? '-')} />
	},
}

// @story [[lucrjournal/fields#^renderer-dispatch]] Registers exactly one renderer for every base field type
export const genericTableRenderers = {
	title: titleRenderer,
	text: textRenderer,
	number: numberRenderer,
	enum: enumRenderer,
	datetime: datetimeRenderer,
	wikilink: wikilinkRenderer,
	'wikilink-array': wikilinkArrayRenderer,
} satisfies TableRendererRegistry<BaseFieldType>
