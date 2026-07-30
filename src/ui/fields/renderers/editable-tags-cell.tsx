import { Notice } from 'obsidian'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { t } from '../../../lang/helpers'
import { ObsidianIcon } from '../../primitives/obsidian-icon'
import { ReadonlyTokenList } from '../../primitives/readonly-token-list'
import { TagTokenInput, normalizeTags } from '../../primitives/tag-token-input'

import type { TagOption } from '../../../domains/core/tags'
import type { App, TFile } from 'obsidian'

const READONLY_TAG_CHIP_CLASS_NAME = 'lj:max-w-[9rem] lj:min-w-0 lj:shrink lj:rounded-full lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-2.5 lj:py-0.5 lj:text-[11px] lj:text-lj-c-secondary'

export function EditableTagsCell({
	app,
	file,
	value,
	tagOptions = [],
}: {
	app: App
	file: TFile
	value: string[]
	tagOptions?: readonly TagOption[]
}): ReactNode {
	const [isEditing, setIsEditing] = useState(false)
	const [committedTags, setCommittedTags] = useState(() => normalizeTags(value))
	const [draftTags, setDraftTags] = useState(() => normalizeTags(value))
	const [pendingQuery, setPendingQuery] = useState('')
	const [hasInvalidPendingQuery, setHasInvalidPendingQuery] = useState(false)
	const editorRef = useRef<HTMLDivElement>(null)
	const committedTagsRef = useRef(committedTags)

	useEffect(() => {
		const normalizedValue = normalizeTags(value)
		setCommittedTags(normalizedValue)
		committedTagsRef.current = normalizedValue
		if (!isEditing) {
			setDraftTags(normalizedValue)
			setPendingQuery('')
			setHasInvalidPendingQuery(false)
		}
	}, [isEditing, value])

	useEffect(() => {
		if (!isEditing) {
			return
		}

		setDraftTags(committedTags)

		const handlePointerDown = (event: MouseEvent) => {
			if (editorRef.current?.contains(event.target as Node)) {
				return
			}

			void save()
		}

		activeDocument.addEventListener('mousedown', handlePointerDown)
		return () => activeDocument.removeEventListener('mousedown', handlePointerDown)
	}, [committedTags, isEditing])

	// @story [[lucrjournal/fields#^tag-cell-writeback]] Persists normalized tags and restores the last committed value on failure
	// @story [[lucrjournal/fields#^writeback-failure-state]] Keeps tag editing open with the prior committed value after failure
	const persistTags = async (nextTags: string[]) => {
		const normalizedNextTags = normalizeTags(nextTags)
		const previousTags = committedTagsRef.current
		if (normalizedNextTags.join('\n') === previousTags.join('\n')) {
			return true
		}

		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter.tags = normalizedNextTags.length === 0 ? null : normalizedNextTags
			})
			setCommittedTags(normalizedNextTags)
			committedTagsRef.current = normalizedNextTags
			return true
		} catch {
			new Notice(t('DASHBOARD_META_ANALYSIS_UPDATE_FAILED'))
			setDraftTags(previousTags)
			return false
		}
	}

	const save = async () => {
		if (hasInvalidPendingQuery) {
			return false
		}

		const nextTags = normalizeTags([...draftTags, pendingQuery])
		const didPersist = await persistTags(nextTags)
		if (didPersist) {
			setDraftTags(nextTags)
			setPendingQuery('')
			setHasInvalidPendingQuery(false)
			setIsEditing(false)
		}
		return didPersist
	}

	const tags = committedTags

	if (isEditing) {
		return (
			<div ref={editorRef} className="lj:w-full lj:px-1" onClick={(event) => event.stopPropagation()}>
				<TagTokenInput
					value={draftTags}
					onChange={(nextTags) => {
						const normalizedNextTags = normalizeTags(nextTags)
						setDraftTags(normalizedNextTags)
						void persistTags(normalizedNextTags)
					}}
					suggestions={tagOptions}
					autoFocus
					compact
					borderless
					placeholder={t('DASHBOARD_ENTRY_FIELD_TAGS_PLACEHOLDER')}
					onQueryChange={setPendingQuery}
					onInvalidQueryChange={setHasInvalidPendingQuery}
					invalidMessage={t('DASHBOARD_ENTRY_FIELD_TAGS_INVALID')}
					onEscape={() => {
						setDraftTags(committedTags)
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
				{tags.length === 0 ? (
					<span className="lj:px-1 lj:text-lj-c-muted-faint">-</span>
				) : (
					<ReadonlyTokenList
						items={tags}
						displayValue={(tag) => `#${tag.replace(/^#/, '')}`}
						chipClassName={READONLY_TAG_CHIP_CLASS_NAME}
					/>
				)}
			</button>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					setIsEditing(true)
				}}
				title={t('DASHBOARD_ENTRY_COLUMN_TAGS')}
				className="lj:absolute lj:right-0 lj:top-0.5 lj:inline-flex lj:items-center lj:justify-center lj:rounded-md lj:border lj:border-transparent lj:p-1 lj:text-lj-c-hint lj:opacity-0 lj:transition-all lj:group-hover:opacity-100 lj:focus-visible:opacity-100 hover:lj:border-lj-alpha-10 hover:lj:text-lj-c-strong"
			>
				<ObsidianIcon name="pencil" className="lj:size-3.5" />
			</button>
		</div>
	)
}
