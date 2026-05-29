import { Notice, TFile, type App } from 'obsidian'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { normalizeCriteria, normalizeCriteriaLinks, parseCriteriaNames, type CriteriaOption } from '../../../domains/criteria'
import { cleanupOrphanCriteriaFiles } from '../../../domains/criteria/sync'
import { PlaybookDomain } from '../../../domains/playbook'
import { t } from '../../../lang/helpers'
import { CriteriaTokenInput } from '../../primitives/criteria-token-input'
import { ObsidianIcon } from '../../primitives/obsidian-icon'
import { ReadonlyTokenList } from '../../primitives/readonly-token-list'

export function EditableCriteriaLinksCell({
	app,
	file,
	value,
	criteriaOptions = [],
}: {
	app: App
	file: TFile
	value: readonly string[]
	criteriaOptions?: readonly CriteriaOption[]
}): ReactNode {
	const [isEditing, setIsEditing] = useState(false)
	const [committedCriteriaNames, setCommittedCriteriaNames] = useState(() => parseCriteriaNames(value))
	const [draftCriteriaNames, setDraftCriteriaNames] = useState(() => parseCriteriaNames(value))
	const [pendingQuery, setPendingQuery] = useState('')
	const [hasInvalidPendingQuery, setHasInvalidPendingQuery] = useState(false)
	const editorRef = useRef<HTMLDivElement>(null)
	const committedCriteriaNamesRef = useRef(committedCriteriaNames)

	useEffect(() => {
		const normalizedValue = parseCriteriaNames(value)
		setCommittedCriteriaNames(normalizedValue)
		committedCriteriaNamesRef.current = normalizedValue
		if (!isEditing) {
			setDraftCriteriaNames(normalizedValue)
			setPendingQuery('')
			setHasInvalidPendingQuery(false)
		}
	}, [isEditing, value])

	useEffect(() => {
		if (!isEditing) {
			return
		}

		setDraftCriteriaNames(committedCriteriaNames)

		const handlePointerDown = (event: MouseEvent) => {
			if (editorRef.current?.contains(event.target as Node)) {
				return
			}

			void save()
		}

		activeDocument.addEventListener('mousedown', handlePointerDown)
		return () => activeDocument.removeEventListener('mousedown', handlePointerDown)
	}, [committedCriteriaNames, isEditing])

	const persistCriteriaNames = async (nextCriteriaNames: string[]) => {
		const normalizedNextCriteriaNames = [...new Set(
			nextCriteriaNames
				.map((name) => normalizeCriteria(name))
				.filter((name) => name !== ''),
		)]
		const previousCriteriaNames = committedCriteriaNamesRef.current
		if (normalizedNextCriteriaNames.join('\n') === previousCriteriaNames.join('\n')) {
			return true
		}

		try {
			const nextCriteriaLinks = normalizeCriteriaLinks(normalizedNextCriteriaNames)
			await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter.criteria = nextCriteriaLinks.length === 0 ? null : nextCriteriaLinks
			})

			const removedCriteriaNames = previousCriteriaNames.filter((name) => !normalizedNextCriteriaNames.includes(name))
			if (removedCriteriaNames.length > 0) {
				await cleanupOrphanCriteriaFiles(
					app,
					await loadPlaybookMarkdowns(app),
					removedCriteriaNames,
				)
			}

			setCommittedCriteriaNames(normalizedNextCriteriaNames)
			committedCriteriaNamesRef.current = normalizedNextCriteriaNames
			return true
		} catch {
			new Notice(t('DASHBOARD_META_ANALYSIS_UPDATE_FAILED'))
			setDraftCriteriaNames(previousCriteriaNames)
			return false
		}
	}

	const save = async () => {
		if (hasInvalidPendingQuery) {
			return false
		}

		const nextCriteriaNames = [...new Set(
			[...draftCriteriaNames, pendingQuery]
				.map((name) => normalizeCriteria(name))
				.filter((name) => name !== ''),
		)]
		const didPersist = await persistCriteriaNames(nextCriteriaNames)
		if (didPersist) {
			setDraftCriteriaNames(nextCriteriaNames)
			setPendingQuery('')
			setHasInvalidPendingQuery(false)
			setIsEditing(false)
		}
		return didPersist
	}

	const criteria = committedCriteriaNames

	if (isEditing) {
		return (
			<div ref={editorRef} className="lj:w-full lj:px-1" onClick={(event) => event.stopPropagation()}>
				<CriteriaTokenInput
					value={draftCriteriaNames}
					onChange={(nextCriteriaNames) => {
						const normalizedNextCriteriaNames = [...new Set(
							nextCriteriaNames
								.map((name) => normalizeCriteria(name))
								.filter((name) => name !== ''),
						)]
						setDraftCriteriaNames(normalizedNextCriteriaNames)
						void persistCriteriaNames(normalizedNextCriteriaNames)
					}}
					suggestions={criteriaOptions}
					autoFocus
					compact
					borderless
					placeholder={t('DASHBOARD_ENTRY_FIELD_CRITERIA_PLACEHOLDER')}
					onQueryChange={setPendingQuery}
					onInvalidQueryChange={setHasInvalidPendingQuery}
					onEscape={() => {
						setDraftCriteriaNames(committedCriteriaNames)
						setPendingQuery('')
						setHasInvalidPendingQuery(false)
						setIsEditing(false)
					}}
				/>
			</div>
		)
	}

	return (
		<div className="lj:group lj:relative lj:w-full lj:px-1">
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					setIsEditing(true)
				}}
				className="lj:block lj:w-full lj:pr-6 lj:text-left"
			>
				{criteria.length === 0 ? (
					<span className="lj:px-1 lj:text-lj-c-muted-faint">-</span>
				) : (
					<ReadonlyTokenList items={criteria} />
				)}
			</button>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					setIsEditing(true)
				}}
				title={t('DASHBOARD_ENTRY_COLUMN_CRITERIA')}
				className="lj:absolute lj:right-0 lj:top-0.5 lj:inline-flex lj:items-center lj:justify-center lj:rounded-md lj:border lj:border-transparent lj:p-1 lj:text-lj-c-hint lj:opacity-0 lj:transition-all lj:group-hover:opacity-100 lj:focus-visible:opacity-100 hover:lj:border-lj-alpha-10 hover:lj:text-lj-c-strong"
			>
				<ObsidianIcon name="pencil" className="lj:size-3.5" />
			</button>
		</div>
	)
}

async function loadPlaybookMarkdowns(app: App): Promise<string[]> {
	const markdowns: string[] = []
	for (const playbookEntry of PlaybookDomain.totalEntries(app)) {
		if (!(playbookEntry.file instanceof TFile)) {
			continue
		}

		markdowns.push(await app.vault.cachedRead(playbookEntry.file))
	}
	return markdowns
}
