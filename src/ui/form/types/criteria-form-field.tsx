/// <reference types="vitest/importMeta" />

import { useEffect, useRef, useState } from 'react'

import { normalizeCriteria } from '../../../domains/criteria'
import { normalizePlaybookConfluenceName } from '../../../domains/playbook'
import { InlineAutocomplete } from '../../primitives/inline-autocomplete'
import { ObsidianDropdown } from '../../primitives/obsidian-dropdown'
import { ObsidianIcon } from '../../primitives/obsidian-icon'

import type { FormTypeRenderer } from './index'

const ADD_SECTION_LABEL_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_ADD_SECTION'
const ADD_CONFLUENCE_LABEL_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_ADD_CONFLUENCE'
const DELETE_SECTION_LABEL_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_DELETE_SECTION'
const DELETE_CONFLUENCE_LABEL_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_DELETE_CONFLUENCE'
const SECTION_PLACEHOLDER_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_SECTION_PLACEHOLDER'
const CONFLUENCE_PLACEHOLDER_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_CONFLUENCE_PLACEHOLDER'
const SECTION_DRAG_LABEL_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_DRAG_SECTION'
const CONFLUENCE_DRAG_LABEL_KEY = 'DASHBOARD_PLAYBOOK_CRITERIA_DRAG_CONFLUENCE'
const DELETE_SECTION_ACTION = 'delete-section'
const SECTION_MENU_TRIGGER_CLASS_NAME = 'lj:inline-flex lj:size-11 lj:items-center lj:justify-center lj:rounded-lg lj:text-lj-c-muted lj:transition-colors hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong'
const SECTION_MENU_CLASS_NAME = 'lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:py-1 lj:shadow-xl'
const SECTION_MENU_OPTION_CLASS_NAME = 'lj:flex lj:w-full lj:items-center lj:gap-2 lj:px-3 lj:py-2 lj:text-sm lj:text-lj-c-danger lj:transition-colors hover:lj:bg-lj-alpha-5'

type DragState =
	| { type: 'section'; sectionIndex: number }
	| { type: 'confluence'; sectionIndex: number; confluenceIndex: number }
	| null

export const CriteriaFormFieldRenderer: FormTypeRenderer<'criteria'> = ({
	value,
	onChange,
	options,
	criteriaOptions,
	localize,
}) => {
	const [draftSections, setDraftSections] = useState(value)
	const dragStateRef = useRef<DragState>(null)

	useEffect(() => {
		setDraftSections(value)
	}, [value])

	const replaceSections = (nextSections: typeof value) => {
		setDraftSections(nextSections)
	}

	// @story [[lucrjournal/form#^criteria-text-commit]] Commits completed criteria drafts through the outer form boundary
	const commitSections = (nextSections: typeof value) => {
		setDraftSections(nextSections)
		onChange(nextSections)
	}

	const addSection = () => {
		// @story [[lucrjournal/form#^criteria-add-section]] Appends and commits the canonical empty criteria section
		const nextSections = [
			...draftSections,
			{ criteriaName: '', confluences: [{ name: '' }] },
		]
		commitSections(nextSections)
	}

	const updateSection = (sectionIndex: number, nextSection: typeof value[number]) => {
		// @story [[lucrjournal/form#^criteria-text-commit]] Keeps section text changes local until explicit autocomplete commit
		replaceSections(draftSections.map((section, index) => index === sectionIndex ? nextSection : section))
	}

	const deleteSection = (sectionIndex: number) => {
		// @story [[lucrjournal/form#^criteria-structural-commit]] Commits section deletion to the outer form
		commitSections(draftSections.filter((_, index) => index !== sectionIndex))
	}

	const addConfluence = (sectionIndex: number) => {
		// @story [[lucrjournal/form#^criteria-structural-commit]] Commits confluence addition to the outer form
		const nextSections = draftSections.map((section, index) => index === sectionIndex
			? {
				...section,
				confluences: [...section.confluences, { name: '' }],
			}
			: section)
		commitSections(nextSections)
	}

	const updateConfluence = (sectionIndex: number, confluenceIndex: number, nextName: string) => {
		// @story [[lucrjournal/form#^criteria-text-commit]] Keeps typed confluence changes local until explicit commit
		const normalizedName = normalizePlaybookConfluenceName(nextName)
		replaceSections(draftSections.map((section, index) => index === sectionIndex
			? {
				...section,
				confluences: section.confluences.map((confluence, itemIndex) =>
					itemIndex === confluenceIndex ? { name: normalizedName } : confluence),
			}
			: section))
	}

	const deleteConfluence = (sectionIndex: number, confluenceIndex: number) => {
		// @story [[lucrjournal/form#^criteria-structural-commit]] Commits confluence deletion to the outer form
		commitSections(draftSections.map((section, index) => index === sectionIndex
			? {
				...section,
				confluences: section.confluences.filter((_, itemIndex) => itemIndex !== confluenceIndex),
			}
			: section))
	}

	const commitConfluence = (sectionIndex: number, confluenceIndex: number, nextName: string) => {
		// @story [[lucrjournal/form#^criteria-text-commit]] Commits the normalized confluence draft to the outer form
		const normalizedName = normalizePlaybookConfluenceName(nextName)
		commitSections(draftSections.map((candidateSection, candidateSectionIndex) => candidateSectionIndex === sectionIndex
			? {
				...candidateSection,
				confluences: candidateSection.confluences.map((candidateConfluence, candidateConfluenceIndex) =>
					candidateConfluenceIndex === confluenceIndex ? { name: normalizedName } : candidateConfluence),
			}
			: candidateSection))
	}

	const moveSection = (fromIndex: number, toIndex: number) => {
		if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= draftSections.length || toIndex >= draftSections.length) {
			return
		}

		const nextSections = [...draftSections]
		const movingSection = nextSections[fromIndex]
		if (movingSection === undefined) {
			return
		}
		nextSections.splice(fromIndex, 1)
		nextSections.splice(toIndex, 0, movingSection)
		// @story [[lucrjournal/form#^criteria-structural-commit]] Commits a valid section reorder to the outer form
		commitSections(nextSections)
	}

	const moveConfluence = (sectionIndex: number, fromIndex: number, toIndex: number) => {
		const section = draftSections[sectionIndex]
		if (section === undefined || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= section.confluences.length || toIndex >= section.confluences.length) {
			return
		}

		const nextConfluences = [...section.confluences]
		const movingConfluence = nextConfluences[fromIndex]
		if (movingConfluence === undefined) {
			return
		}
		nextConfluences.splice(fromIndex, 1)
		nextConfluences.splice(toIndex, 0, movingConfluence)
		updateSection(sectionIndex, {
			...section,
			confluences: nextConfluences,
		})
	}

	if (draftSections.length === 0) {
		return (
			<div className="lj:flex lj:flex-col lj:gap-3">
				<button
					type="button"
					onClick={addSection}
					className="lj:inline-flex lj:h-11 lj:w-fit lj:items-center lj:gap-2 lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-input lj:px-4 lj:text-sm lj:font-medium lj:text-lj-c-strong lj:transition-colors hover:lj:bg-lj-alpha-5"
				>
					<ObsidianIcon name="plus" className="lj:size-4" />
					{localize(ADD_SECTION_LABEL_KEY)}
				</button>
			</div>
		)
	}

	return (
		<div className="lj:flex lj:flex-col lj:gap-4 lj:flex-1 lj:min-h-0">
			<button
				type="button"
				onClick={addSection}
				className="lj:inline-flex lj:h-11 lj:shrink-0 lj:w-fit lj:items-center lj:gap-2 lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-input lj:px-4 lj:text-sm lj:font-medium lj:text-lj-c-strong lj:transition-colors hover:lj:bg-lj-alpha-5"
			>
				<ObsidianIcon name="plus" className="lj:size-4" />
				{localize(ADD_SECTION_LABEL_KEY)}
			</button>

			<div className="lj:flex lj:flex-col lj:gap-3 lj:overflow-y-auto lj:min-h-0 lj:flex-1 lj:p-1 lj:-m-1">
				{draftSections.map((section, sectionIndex) => {
					return (
						<section
							key={`section:${sectionIndex}`}
							onDragOver={(event) => {
								event.preventDefault()
								event.stopPropagation()
							}}
							onDrop={(event) => {
								event.preventDefault()
								event.stopPropagation()
								const dragPayload = dragStateRef.current
								if (dragPayload?.type === 'section') {
									moveSection(dragPayload.sectionIndex, sectionIndex)
								}
								dragStateRef.current = null
							}}
							className="lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:p-3 lj:sm:p-4"
						>
							<div className="lj:flex lj:items-center lj:gap-2">
								<div className="lj:min-w-0 lj:flex-1 lj:flex lj:flex-col lj:gap-2">
									<div className="lj:flex lj:items-center lj:gap-2">
										<div
											draggable
											onDragStart={(event) => {
												dragStateRef.current = { type: 'section', sectionIndex }
												event.dataTransfer.effectAllowed = 'move'
												event.stopPropagation()
											}}
											className="lj:flex lj:h-11 lj:w-6 lj:-ml-1 lj:items-center lj:justify-center lj:text-lj-c-hint lj:cursor-grab"
											aria-label={localize(SECTION_DRAG_LABEL_KEY)}
										>
											<ObsidianIcon name="grip-vertical" className="lj:size-4" />
										</div>
										<div className="lj:min-w-0 lj:flex-1">
											<InlineAutocomplete
												options={criteriaOptions
													.filter((option) =>
														normalizeCriteria(option.value) === normalizeCriteria(section.criteriaName)
													|| !draftSections.some((s, i) =>
														i !== sectionIndex && normalizeCriteria(s.criteriaName) === normalizeCriteria(option.value)))
													.map((option) => option.value)}
												value={section.criteriaName}
												onChange={(nextValue) => updateSection(sectionIndex, {
													...section,
													criteriaName: nextValue,
												})}
												onCommit={(nextValue) => commitSections(draftSections.map((candidateSection, index) => index === sectionIndex
													? {
														...candidateSection,
														criteriaName: nextValue,
													}
													: candidateSection))}
												placeholder={localize(SECTION_PLACEHOLDER_KEY)}
												className="lj:w-full lj:min-w-0 lj:border-none lj:bg-transparent lj:text-lg lj:font-medium lj:text-lj-c-strong lj:outline-none lj:placeholder:text-lj-c-hint"
												normalizeValue={normalizeCriteria}
											/>
										</div>
										<ObsidianDropdown
											options={[{
												value: DELETE_SECTION_ACTION,
												label: localize(DELETE_SECTION_LABEL_KEY),
												icon: <ObsidianIcon name="trash-2" className="lj:size-4 lj:shrink-0" />,
											}]}
											onChange={(nextValue) => {
												if (nextValue === DELETE_SECTION_ACTION) {
													deleteSection(sectionIndex)
												}
											}}
											align="right"
											minMenuWidth={168}
											showChevron={false}
											triggerAriaLabel={localize(DELETE_SECTION_LABEL_KEY)}
											triggerClassName={SECTION_MENU_TRIGGER_CLASS_NAME}
											menuClassName={SECTION_MENU_CLASS_NAME}
											optionClassName={() => SECTION_MENU_OPTION_CLASS_NAME}
											renderTriggerContent={() => (
												<ObsidianIcon name="ellipsis-vertical" className="lj:size-4" />
											)}
											renderOptionContent={(option) => (
												<>
													{option.icon}
													<span>{option.label}</span>
												</>
											)}
										/>
									</div>

									<div className="lj:flex lj:flex-col lj:gap-1 lj:pl-8">
										{section.confluences.map((confluence, confluenceIndex) => {
											const matchedOption = options.find((option) => option.value === confluence.name)

											return (
												<div
													key={`confluence:${sectionIndex}:${confluenceIndex}`}
													onDragOver={(event) => {
														event.preventDefault()
														event.stopPropagation()
													}}
													onDrop={(event) => {
														event.preventDefault()
														event.stopPropagation()
														const dragPayload = dragStateRef.current
														if (dragPayload?.type === 'confluence' && dragPayload.sectionIndex === sectionIndex) {
															moveConfluence(sectionIndex, dragPayload.confluenceIndex, confluenceIndex)
														}
														dragStateRef.current = null
													}}
													className="lj:flex lj:items-center lj:gap-2"
												>
													<div
														draggable
														onDragStart={(event) => {
															dragStateRef.current = { type: 'confluence', sectionIndex, confluenceIndex }
															event.dataTransfer.effectAllowed = 'move'
															event.stopPropagation()
														}}
														className="lj:flex lj:h-11 lj:w-6 lj:-ml-1 lj:items-center lj:justify-center lj:text-lj-c-hint lj:cursor-grab"
														aria-label={localize(CONFLUENCE_DRAG_LABEL_KEY)}
													>
														<ObsidianIcon name="grip-vertical" className="lj:size-4" />
													</div>
													<div className="lj:min-w-0 lj:flex-1">
														<InlineAutocomplete
															options={resolveConfluenceAutocompleteOptions(options, draftSections, sectionIndex, confluenceIndex)}
															value={confluence.name}
															onChange={(nextValue) => updateConfluence(sectionIndex, confluenceIndex, nextValue)}
															onCommit={(nextValue) => commitConfluence(sectionIndex, confluenceIndex, nextValue)}
															placeholder={localize(CONFLUENCE_PLACEHOLDER_KEY)}
															normalizeValue={normalizePlaybookConfluenceName}
														/>
													</div>
													<ConfluenceScopeBadge
														description={matchedOption?.description}
														iconName={matchedOption?.icon?.kind === 'lucide' ? matchedOption.icon.value : undefined}
														localize={localize}
													/>
													<button
														type="button"
														onClick={() => deleteConfluence(sectionIndex, confluenceIndex)}
														className="lj:inline-flex lj:h-11 lj:items-center lj:gap-2 lj:rounded-lg lj:px-3 lj:text-sm lj:text-lj-c-danger lj:transition-colors hover:lj:bg-lj-alpha-5"
													>
														<ObsidianIcon name="trash-2" className="lj:size-4" />
														<span>{localize(DELETE_CONFLUENCE_LABEL_KEY)}</span>
													</button>
												</div>
											)
										})}
									</div>

									<button
										type="button"
										onClick={() => addConfluence(sectionIndex)}
										className="lj:inline-flex lj:h-11 lj:w-fit lj:items-center lj:gap-2 lj:rounded-lg lj:px-3 lj:ml-8 lj:text-sm lj:text-lj-c-hint-vivid lj:transition-colors hover:lj:bg-lj-alpha-5 hover:lj:text-lj-c-strong"
									>
										<ObsidianIcon name="plus" className="lj:size-4" />
										<span>{localize(ADD_CONFLUENCE_LABEL_KEY)}</span>
									</button>
								</div>
							</div>
						</section>
					)
				})}
			</div>
		</div>
	)
}

// @story [[lucrjournal/form#^confluence-option-uniqueness]] Excludes canonically duplicated confluence options while preserving the current row
function resolveConfluenceAutocompleteOptions(
	options: readonly { value: string }[],
	sections: readonly { confluences: readonly { name: string }[] }[],
	sectionIndex: number,
	confluenceIndex: number,
) {
	const currentName = sections[sectionIndex]?.confluences[confluenceIndex]?.name ?? ''
	const currentKey = toConfluenceAutocompleteKey(currentName)

	return options
		.filter((option) => {
			const optionKey = toConfluenceAutocompleteKey(option.value)
			return optionKey === currentKey
			|| !sections.some((section, candidateSectionIndex) =>
				section.confluences.some((confluence, candidateConfluenceIndex) =>
					(candidateSectionIndex !== sectionIndex || candidateConfluenceIndex !== confluenceIndex)
					&& toConfluenceAutocompleteKey(confluence.name) === optionKey))
		})
		.map((option) => option.value)
}

function toConfluenceAutocompleteKey(value: string) {
	return normalizePlaybookConfluenceName(value).toLocaleLowerCase()
}

function ConfluenceScopeBadge({
	description,
	iconName,
	localize,
}: {
	description?: string
	iconName?: string
	localize: (key: string, params?: Record<string, string | number | boolean>) => string
}) {
	if (iconName === undefined) {
		return null
	}

	const title = description === undefined ? undefined : localize(description)

	return (
		<span
			className="lj:inline-flex lj:size-8 lj:shrink-0 lj:items-center lj:justify-center lj:text-lj-c-muted"
			title={title}
			aria-label={title}
		>
			<ObsidianIcon name={iconName} className="lj:size-3.5 lj:shrink-0" />
		</span>
	)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('resolveConfluenceAutocompleteOptions', () => {
		// @story [[lucrjournal/form#^confluence-option-uniqueness]] Covers exclusion of values selected in another row
		it('hides confluences already used elsewhere in the same playbook', () => {
			expect(resolveConfluenceAutocompleteOptions(
				[
					{ value: 'Gamma Wall Magnet' },
					{ value: 'Weekly Level Plus Intraday Trigger' },
					{ value: 'VWAP Reclaim With Positive Delta Asia Session' },
				],
				[
					{
						confluences: [
							{ name: 'Gamma Wall Magnet' },
							{ name: 'VWAP Reclaim With Positive Delta Asia Session' },
						],
					},
					{
						confluences: [
							{ name: '' },
						],
					},
				],
				1,
				0,
			)).toEqual(['Weekly Level Plus Intraday Trigger'])
		})

		// @story [[lucrjournal/form#^confluence-option-uniqueness]] Covers preservation of the current row option
		it('keeps the current row value available while editing', () => {
			expect(resolveConfluenceAutocompleteOptions(
				[
					{ value: 'Gamma Wall Magnet' },
					{ value: 'Weekly Level Plus Intraday Trigger' },
				],
				[
					{
						confluences: [
							{ name: 'Gamma Wall Magnet' },
						],
					},
				],
				0,
				0,
			)).toEqual(['Gamma Wall Magnet', 'Weekly Level Plus Intraday Trigger'])
		})

		// @story [[lucrjournal/form#^confluence-option-uniqueness]] Covers canonical duplicate matching across rows
		it('matches selected confluences by canonical basename key', () => {
			expect(resolveConfluenceAutocompleteOptions(
				[
					{ value: 'Confluence∕A' },
					{ value: 'Confluence B' },
				],
				[
					{
						confluences: [
							{ name: 'confluence/a' },
						],
					},
					{
						confluences: [
							{ name: '' },
						],
					},
				],
				1,
				0,
			)).toEqual(['Confluence B'])
		})
	})
}
