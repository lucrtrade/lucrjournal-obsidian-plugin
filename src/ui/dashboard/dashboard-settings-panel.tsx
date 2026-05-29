import { TFile, type App } from 'obsidian'
import { useMemo, useState } from 'react'

import {
	AccountDomain,
	accountSettingsTableFields,
	deleteAccount,
	gatherAccountDeletionScope,
	listAccountTableEntries,
	type AccountDeletionScope,
} from '../../domains'
import { t } from '../../lang/helpers'
import { tableRenderers, useDomainTable } from '../fields'

import { AccountDeleteModal } from './account-delete-modal'
import { DashboardSymbolsPanel } from './dashboard-symbols-panel'
import { DashboardTableLayout } from './dashboard-table-layout'

import type { DashboardSettingsTabId } from './dashboard-constants'
import type { AccountSettingsTableFieldDescriptor } from '../../domains'
import type { DomainPersistedEntry } from '../../domains/core/type'
import type { LinkActivationEvent } from '../../views/link-activation'
import type { TableRendererRegistry } from '../fields'

type DashboardSettingsPanelProps = {
	activeTab: DashboardSettingsTabId
	app: App
	dataRevision: number
	onNewAccount: () => void
	onSelectAccountPositions: (accountWikilink: string, event?: LinkActivationEvent) => void
	onSelectAccountSymbols: (accountWikilink: string, event?: LinkActivationEvent) => void
	onSelectSymbolPositions: (symbolWikilink: string, event?: LinkActivationEvent) => void
	preferredAccount?: string
	symbolsAccountFilter: string | null
}

type AccountEntry = ReturnType<typeof AccountDomain.totalEntries>[number]

export function DashboardSettingsPanel({
	activeTab,
	app,
	dataRevision,
	onNewAccount,
	onSelectAccountPositions,
	onSelectAccountSymbols,
	onSelectSymbolPositions,
	preferredAccount,
	symbolsAccountFilter,
}: DashboardSettingsPanelProps) {
	return (
		<div className="lj:flex lj:min-h-full lj:w-full lj:flex-col" data-lj-panel="settings">
			{activeTab === 'Accounts'
				? (
					<AccountSettingsTablePanel
						app={app}
						dataRevision={dataRevision}
						onSelectAccountPositions={onSelectAccountPositions}
						onSelectAccountSymbols={onSelectAccountSymbols}
						onNewAccount={onNewAccount}
					/>
				)
				: (
					<DashboardSymbolsPanel
						app={app}
						dataRevision={dataRevision}
						accountFilter={symbolsAccountFilter}
						onSelectSymbolPositions={onSelectSymbolPositions}
						preferredAccount={preferredAccount}
					/>
				)}
		</div>
	)
}

function AccountSettingsTablePanel({
	app,
	dataRevision,
	onNewAccount,
	onSelectAccountPositions,
	onSelectAccountSymbols,
}: {
	app: App
	dataRevision: number
	onNewAccount: () => void
	onSelectAccountPositions: (accountWikilink: string, event?: LinkActivationEvent) => void
	onSelectAccountSymbols: (accountWikilink: string, event?: LinkActivationEvent) => void
}) {
	const [deleteScope, setDeleteScope] = useState<AccountDeletionScope | null>(null)
	const [deletingEntry, setDeletingEntry] = useState<AccountEntry | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)
	const accountEntries = useMemo(() => listAccountTableEntries(app), [app, dataRevision])
	const registry = useMemo(() => tableRenderers as TableRendererRegistry<AccountSettingsTableFieldDescriptor['type']>, [])
	const tableContext = useMemo(
		() => ({
			app,
			extras: {
				onSelectAccountPositions,
				onSelectAccountSymbols,
				onDeleteRow: (rowEntry: DomainPersistedEntry<unknown>) => {
					if (!(rowEntry.file instanceof TFile)) {
						return
					}

					const accountEntry = AccountDomain.totalEntries(app)
						.find((entry) => entry.file instanceof TFile && entry.file.path === rowEntry.file.path)
					if (accountEntry === undefined) {
						return
					}

					const scope = gatherAccountDeletionScope(app, accountEntry)
					if (scope === null) {
						return
					}
					setDeletingEntry(accountEntry)
					setDeleteScope(scope)
				},
			},
		}),
		[app, onSelectAccountPositions, onSelectAccountSymbols],
	)
	const { table } = useDomainTable(
		accountSettingsTableFields,
		accountEntries,
		registry,
		tableContext,
	)

	const handleCancelDelete = () => {
		setDeletingEntry(null)
		setDeleteScope(null)
	}

	const handleConfirmDelete = async () => {
		if (deleteScope === null) {
			return
		}
		setIsDeleting(true)
		await deleteAccount(app, deleteScope)
		setIsDeleting(false)
		setDeletingEntry(null)
		setDeleteScope(null)
	}

	return (
		<>
			<DashboardTableLayout
				app={app}
				table={table}
				searchPlaceholder={t('DASHBOARD_SETTINGS_ACCOUNTS_SEARCH_PLACEHOLDER')}
				onNew={onNewAccount}
				newLabel={t('DASHBOARD_SETTINGS_ADD_ACCOUNT_BUTTON')}
				showColumnVisibilityControl={false}
			/>

			<AccountDeleteModal
				isOpen={deleteScope !== null}
				isDeleting={isDeleting}
				accountDisplayName={deletingEntry !== null ? AccountDomain.toDisplayName(deletingEntry.fm) : ''}
				accountFile={deleteScope?.accountFile ?? null}
				symbolFiles={deleteScope?.symbolFiles ?? []}
				positionFiles={deleteScope?.positionFiles ?? []}
				platformFile={deleteScope?.platformFile ?? null}
				onClose={handleCancelDelete}
				onConfirm={() => void handleConfirmDelete()}
			/>
		</>
	)
}
