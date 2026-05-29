import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

import { t } from '../../lang/helpers'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import type { PositionTemplateSummary } from '../../domains'
import type { LinkActivationEvent } from '../../views/link-activation'

type DashboardFloatingNavProps = {
	label: string
	onAction: () => void
	onEditTemplate?: (template: PositionTemplateSummary, event?: LinkActivationEvent) => void
	onSelectTemplate?: (template: PositionTemplateSummary) => void
	onCreateTemplate?: (name: string) => Promise<void> | void
	templates?: PositionTemplateSummary[]
}

export function DashboardFloatingNav({
	label,
	onAction,
	onEditTemplate,
	onSelectTemplate,
	onCreateTemplate,
	templates,
}: DashboardFloatingNavProps) {
	const hasTemplates = templates !== undefined
	const [isTemplateOpen, setIsTemplateOpen] = useState(false)
	const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
	const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false)
	const [templateName, setTemplateName] = useState('')
	const templateMenuRef = useRef<HTMLDivElement>(null)
	const templateNameInputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!isTemplateOpen) {
			setIsCreatingTemplate(false)
			setIsSubmittingTemplate(false)
			setTemplateName('')
			return
		}

		const handlePointerDown = (event: MouseEvent) => {
			if (!templateMenuRef.current?.contains(event.target as Node)) {
				setIsTemplateOpen(false)
			}
		}

		activeDocument.addEventListener('mousedown', handlePointerDown)
		return () => activeDocument.removeEventListener('mousedown', handlePointerDown)
	}, [isTemplateOpen])

	useEffect(() => {
		if (!isCreatingTemplate) {
			return
		}

		templateNameInputRef.current?.focus()
		templateNameInputRef.current?.select()
	}, [isCreatingTemplate])

	const closeTemplateCreation = () => {
		setIsCreatingTemplate(false)
		setTemplateName('')
	}

	const editTemplate = (template: PositionTemplateSummary, event: ReactMouseEvent<HTMLButtonElement>) => {
		onEditTemplate?.(template, event)
		setIsTemplateOpen(false)
	}

	const submitTemplateCreation = async () => {
		const nextName = templateName.trim()
		if (nextName.length === 0 || isSubmittingTemplate) {
			return
		}

		setIsSubmittingTemplate(true)
		try {
			await onCreateTemplate?.(nextName)
			closeTemplateCreation()
			setIsTemplateOpen(false)
		} finally {
			setIsSubmittingTemplate(false)
		}
	}

	return (
		<div className="lj:fixed lj:bottom-[calc(env(safe-area-inset-bottom)+6rem)] lj:sm:bottom-6 lj:left-1/2 lj:-translate-x-1/2 lj:z-50">
			<div
				ref={templateMenuRef}
				className="lj-dashboard-floating-nav-shell lj:relative lj:flex lj:h-[60px] lj:items-center lj:rounded-full lj:bg-lj-c-strong lj:text-lj-c-inv lj:transition-[scale,translate,box-shadow] lj:duration-[200ms] lj:ease-out lj:hover:delay-[500ms] lj:hover:-translate-y-0.5 lj:hover:scale-[1.02]"
			>
				<button
					type="button"
					onClick={onAction}
					data-lj-control="new-position"
					className={`lj:group lj:flex lj:h-[60px] lj:min-h-0 lj:appearance-none lj:items-center lj:justify-start lj:gap-3 lj:border-0 lj:bg-transparent lj:px-8 lj:py-0 lj:leading-none lj:shadow-none ${hasTemplates ? 'lj:rounded-l-full' : 'lj:rounded-full'} lj:hover:bg-lj-alpha-inv-5 lj:transition-colors lj:duration-1000`}
				>
					<div className="lj:relative lj:flex lj:h-[18px] lj:w-[18px] lj:items-center lj:justify-center">
						<ObsidianIcon name="plus" className="lj:absolute lj:size-[18px] lj:transition-transform lj:duration-900 lj:group-hover:rotate-90" />
					</div>
					<span className="lj:mt-0.5 lj:text-xs lj:font-bold lj:tracking-[0.2em] lj:uppercase">
						{label}
					</span>
				</button>

				{hasTemplates && (
					<>
						<div className="lj:h-9 lj:w-px lj:self-center lj:bg-lj-surf-on-accent" />

						<button
							type="button"
							onClick={() => setIsTemplateOpen((open) => !open)}
							aria-label={t('DASHBOARD_NEW_POSITION_TEMPLATES')}
							data-lj-control="new-position-template-menu"
							className="lj:flex lj:h-[60px] lj:w-[60px] lj:min-h-0 lj:appearance-none lj:items-center lj:justify-center lj:self-center lj:rounded-r-full lj:border-0 lj:bg-transparent lj:p-0 lj:leading-none lj:shadow-none lj:hover:bg-lj-alpha-inv-5 lj:transition-colors"
						>
							<ObsidianIcon
								name="chevron-down"
								className={`lj:size-4 lj:transition-transform lj:duration-300 ${isTemplateOpen ? 'lj:rotate-180' : ''}`}
							/>
						</button>

						{isTemplateOpen && (
							<div className="lj:absolute lj:bottom-[calc(100%+16px)] lj:left-0 lj:w-full lj:min-w-full lj:bg-lj-surf-popover lj:backdrop-blur-xl lj:border lj:border-lj-alpha-10 lj:rounded-2xl lj:shadow-2xl lj:overflow-hidden lj:z-50 lj:py-2">
								{templates.length > 0 ? (
									templates.map((template, index) => (
										<div key={`${template.filePath}-${index}`} className="lj:flex lj:h-11 lj:w-full lj:items-stretch">
											<button
												onClick={() => {
													onSelectTemplate?.(template)
													setIsTemplateOpen(false)
												}}
												title={template.name ?? t('DASHBOARD_NEW_POSITION_TEMPLATE_UNTITLED')}
												className="lj:flex lj:h-full lj:min-w-0 lj:flex-1 lj:items-center lj:justify-start lj:gap-3 lj:px-4 lj:text-left lj:hover:bg-lj-alpha-5 lj:transition-colors"
											>
												<ObsidianIcon name="layout-template" className="lj:size-4 lj:shrink-0 lj:text-lj-c-hint-vivid" />
												<span className="lj:min-w-0 lj:flex-1 lj:truncate lj:text-sm lj:text-lj-c-secondary">
													{template.name ?? t('DASHBOARD_NEW_POSITION_TEMPLATE_UNTITLED')}
												</span>
											</button>
											<button
												type="button"
												onClick={(event) => editTemplate(template, event)}
												title={t('DASHBOARD_NEW_POSITION_EDIT_TEMPLATE')}
												aria-label={t('DASHBOARD_NEW_POSITION_EDIT_TEMPLATE')}
												data-lj-control="new-position-template-edit"
												className="lj:flex lj:h-full lj:w-11 lj:shrink-0 lj:items-center lj:justify-center lj:text-lj-c-hint-dim lj:hover:bg-lj-surf-button-hover-soft lj:hover:text-lj-c-secondary lj:focus-visible:bg-lj-surf-button-hover-soft lj:focus-visible:text-lj-c-secondary lj:transition-[background-color,color] lj:duration-150"
											>
												<ObsidianIcon name="pencil" className="lj:size-4" />
											</button>
										</div>
									))
								) : (
									<div className="lj:px-6 lj:py-4 lj:text-sm lj:text-lj-c-muted">
										{t('DASHBOARD_NEW_POSITION_TEMPLATES_EMPTY')}
									</div>
								)}
								<div className="lj:h-px lj:bg-lj-alpha-5-10 lj:my-2 lj:mx-3" />
								{isCreatingTemplate ? (
									<form
										onSubmit={(event) => {
											event.preventDefault()
											void submitTemplateCreation()
										}}
										className="lj:flex lj:h-11 lj:w-full lj:items-stretch"
									>
										<div className="lj:flex lj:h-full lj:min-w-0 lj:flex-1 lj:items-center lj:justify-start lj:gap-3 lj:px-4 lj:text-left lj:bg-lj-alpha-5">
											<ObsidianIcon name="plus" className="lj:size-4 lj:shrink-0 lj:text-lj-c-hint-vivid" />
											<div className="lj-scrollbar-hidden lj:min-w-0 lj:flex-1 lj:overflow-x-auto lj:overflow-y-hidden">
												<input
													ref={templateNameInputRef}
													value={templateName}
													onChange={(event) => setTemplateName(event.currentTarget.value)}
													disabled={isSubmittingTemplate}
													onKeyDown={(event) => {
														if (event.key === 'Escape') {
															event.preventDefault()
															closeTemplateCreation()
														}
													}}
													placeholder={t('DASHBOARD_NEW_POSITION_CREATE_TEMPLATE_PLACEHOLDER')}
													aria-label={t('DASHBOARD_NEW_POSITION_CREATE_TEMPLATE')}
													className="lj:block lj:h-full lj:w-full lj:min-w-0 lj:border-0 lj:bg-transparent lj:px-0 lj:text-sm lj:text-lj-c-strong lj:outline-none lj:ring-0 lj:placeholder:text-lj-c-muted"
												/>
											</div>
										</div>
										<button
											type="submit"
											disabled={templateName.trim().length === 0 || isSubmittingTemplate}
											aria-label={t('DASHBOARD_NEW_POSITION_CREATE_TEMPLATE')}
											className="lj:flex lj:h-full lj:w-11 lj:shrink-0 lj:items-center lj:justify-center lj:text-lj-c-hint-dim lj:hover:bg-lj-surf-button-hover-soft lj:hover:text-lj-c-secondary lj:focus-visible:bg-lj-surf-button-hover-soft lj:focus-visible:text-lj-c-secondary lj:transition-[background-color,color,opacity] lj:duration-150 lj:disabled:cursor-default lj:disabled:opacity-40"
										>
											{isSubmittingTemplate ? (
												<span className="lj:inline-block lj:size-3.5 lj:animate-spin lj:rounded-full lj:border-2 lj:border-current lj:border-t-transparent" />
											) : (
												<ObsidianIcon name="check" className="lj:size-4" />
											)}
										</button>
									</form>
								) : (
									<button
										onClick={() => {
											setIsCreatingTemplate(true)
										}}
										className="lj:flex lj:h-11 lj:w-full lj:items-center lj:justify-start lj:gap-3 lj:px-4 lj:text-left lj:text-sm lj:text-lj-c-strong lj:hover:bg-lj-alpha-5 lj:transition-colors lj:font-medium"
									>
										<ObsidianIcon name="plus" className="lj:size-4 lj:shrink-0 lj:text-lj-c-hint-vivid" />
										<span className="lj:flex-1 lj:text-left">{t('DASHBOARD_NEW_POSITION_CREATE_TEMPLATE')}</span>
									</button>
								)}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	)
}
