import { MarkdownView, TFile, type App, type ViewStateResult } from 'obsidian'
import { useEffect, useState } from 'react'

import { t } from '../../lang/helpers'
import { PositionStructuredContentPanel, type PositionStructuredContentTabId, buildPositionStructuredContentTabs, resolveVisiblePositionStructuredContentTab } from '../position-content/position-structured-content-panel'
import { usePositionDetailsContextModel } from '../position-details/use-position-details-context-model'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import type { PositionTemplateSummary } from '../../domains'

const TEMPLATE_EDITOR_STATE = { mode: 'source', source: false }
const TEMPLATE_EDITOR_STATE_RESULT = { history: false } satisfies ViewStateResult

type DashboardPositionTemplateDetailsProps = {
	app: App
	template: PositionTemplateSummary
}

export function DashboardPositionTemplateDetails({
	app,
	template,
}: DashboardPositionTemplateDetailsProps) {
	const [activeTab, setActiveTab] = useState<PositionStructuredContentTabId>('notes')
	const [pendingTab, setPendingTab] = useState<PositionStructuredContentTabId | null>(null)
	const templateFile = resolveTemplateFile(app, template.filePath)
	const {
		newsGroup,
		keyLevelGroup,
		confluenceGroup,
		marketAnalysisGroup,
		playbookGroup,
	} = usePositionDetailsContextModel({
		app,
		positionFile: templateFile,
	})

	useEffect(() => {
		setActiveTab('notes')
		setPendingTab(null)
	}, [template.filePath])

	useEffect(() => {
		const visibleTabs = buildPositionStructuredContentTabs({
			newsGroup,
			keyLevelGroup,
			confluenceGroup,
			marketAnalysisGroup,
		})

		if (pendingTab !== null) {
			const isPendingTabVisible = pendingTab === 'playbook' || visibleTabs.some((tab) => tab.id === pendingTab)
			if (isPendingTabVisible) {
				if (activeTab !== pendingTab) {
					setActiveTab(pendingTab)
				}
				setPendingTab(null)
			}
			return
		}

		const nextTab = resolveVisiblePositionStructuredContentTab(activeTab, visibleTabs)
		if (nextTab !== activeTab) {
			setActiveTab(nextTab)
		}
	}, [
		activeTab,
		pendingTab,
		newsGroup,
		keyLevelGroup,
		confluenceGroup,
		marketAnalysisGroup,
	])

	return (
		<main
			className="lj:mx-auto lj:flex lj:min-h-full lj:w-full lj:max-w-7xl lj:flex-col lj:px-4 lj:sm:px-8 lj:pt-6 lj:sm:pt-8 lj:pb-[calc(env(safe-area-inset-bottom)+10.5rem)] lj:sm:pb-24"
			data-lj-panel="position-template-details"
		>
			<div className="lj:flex lj:flex-col lj:gap-8">
				<div className="lj:flex lj:flex-wrap lj:items-start lj:justify-between lj:gap-4">
					<div className="lj:flex lj:flex-col lj:gap-4">
						<div className="lj:flex lj:flex-col lj:gap-2">
							<span className="lj:text-[11px] lj:font-medium lj:tracking-[0.28em] lj:text-lj-c-muted lj:uppercase">
								{t('DASHBOARD_POSITION_TEMPLATE_TYPE_LABEL')}
							</span>
							<h1 className="lj:text-4xl lj:sm:text-5xl lj:font-light lj:tracking-tight lj:text-lj-c-strong">
								{template.name ?? t('DASHBOARD_NEW_POSITION_TEMPLATE_UNTITLED')}
							</h1>
							{template.description !== null && template.description.length > 0 ? (
								<p className="lj:max-w-3xl lj:text-sm lj:leading-7 lj:text-lj-c-muted">
									{template.description}
								</p>
							) : null}
						</div>
					</div>

					<button
						type="button"
						className="lj:inline-flex lj:items-center lj:gap-2 lj:rounded-xl lj:border lj:border-lj-alpha-10 lj:bg-lj-surf lj:px-4 lj:py-2.5 lj:text-sm lj:font-medium lj:text-lj-c-strong lj:transition-[border-color,transform] lj:hover:border-lj-alpha-15 lj:hover:-translate-y-px"
						onClick={() => {
							if (templateFile === null) {
								return
							}
							void openTemplateFileForEditing(app, templateFile)
						}}
						disabled={templateFile === null}
					>
						<ObsidianIcon className="lj:size-4" name="square-arrow-out-up-right" />
						{t('DASHBOARD_POSITION_TEMPLATE_OPEN_FILE')}
					</button>
				</div>

				<PositionStructuredContentPanel
					app={app}
					file={templateFile}
					activeTab={activeTab}
					newsGroup={newsGroup}
					keyLevelGroup={keyLevelGroup}
					confluenceGroup={confluenceGroup}
					marketAnalysisGroup={marketAnalysisGroup}
					playbookGroup={playbookGroup}
					onSelectTab={(tab) => {
						setPendingTab(null)
						setActiveTab(tab)
					}}
					onRevealTab={(tab) => {
						setPendingTab(tab)
						setActiveTab(tab)
					}}
				/>
			</div>
		</main>
	)
}

function resolveTemplateFile(app: App, filePath: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(filePath)
	return file instanceof TFile ? file : null
}

async function openTemplateFileForEditing(app: App, file: TFile): Promise<void> {
	const leaf = app.workspace.getLeaf('tab')
	await leaf.openFile(file)

	if (leaf.view instanceof MarkdownView) {
		await leaf.view.setState(TEMPLATE_EDITOR_STATE, TEMPLATE_EDITOR_STATE_RESULT)
	}
}
