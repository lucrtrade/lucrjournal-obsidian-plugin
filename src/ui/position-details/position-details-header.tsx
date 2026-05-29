import { useEffect, useRef, useState } from 'react'

import { SymbolDomain, derivePositionAccountWikilink, resolveSymbolLogo, resolveSymbolName } from '../../domains'
import { t } from '../../lang/helpers'
import { openMarkdownFile } from '../../views/link-activation'
import { AccountInlineValue } from '../account-inline-value'
import { EnumBadge } from '../fields/renderers/enum-badge'
import { ObsidianIcon } from '../primitives/obsidian-icon'
import { SymbolIcon } from '../primitives/symbol-icon'

import type { Position } from '../../domains'
import type { SelectOption } from '../../domains/core/form'
import type { App, TFile } from 'obsidian'

const POSITION_DETAILS_ACCOUNT_ICON_CLASS_NAME = 'lj:size-3.5'
const POSITION_DETAILS_ACCOUNT_FALLBACK_ICON_CLASS_NAME = 'lj:size-3 lj:shrink-0 lj:text-lj-c-hint'

type PositionDetailsHeaderProps = {
	app: App
	positionFile: TFile | null
	position: Position
	onBack?: () => void
	onDeletePosition: () => void
}

export function PositionDetailsHeader({
	app,
	positionFile,
	position,
	onBack,
	onDeletePosition,
}: PositionDetailsHeaderProps) {
	const [isActionsOpen, setIsActionsOpen] = useState(false)
	const actionsRef = useRef<HTMLDivElement>(null)
	const symbol = resolveSymbolName(app, position) ?? '-'
	const symbolLogo = resolveSymbolLogo(app, position)
	const side = position.side
	const symbolTypeOption = resolvePositionSymbolTypeOption(app, position)
	const positionId = position.id ?? '-'
	const displayedPositionId = `${positionId}`
	const canDeletePosition = positionFile !== null

	const handleOpenSourceFile = () => {
		if (positionFile === null) {
			return
		}

		void openMarkdownFile(app, positionFile, null, { sourceMode: true })
	}

	useEffect(() => {
		if (!isActionsOpen) {
			return
		}

		const handlePointerDown = (event: MouseEvent) => {
			if (!actionsRef.current?.contains(event.target as Node)) {
				setIsActionsOpen(false)
			}
		}

		activeDocument.addEventListener('mousedown', handlePointerDown)
		return () => activeDocument.removeEventListener('mousedown', handlePointerDown)
	}, [isActionsOpen])

	return (
		<div className="lj:flex lj:items-center lj:justify-between lj:mb-8">
			<div className="lj:flex lj:items-center lj:gap-4">
				{onBack !== undefined && (
					<button onClick={onBack} className="lj:p-2 lj:hover:bg-lj-alpha-5 lj:rounded-full lj:transition-colors">
						<ObsidianIcon name="arrow-left" className="lj:size-5 lj:text-lj-c-tertiary" />
					</button>
				)}
				<div className="lj:flex lj:items-center lj:gap-3">
					<div className="lj:flex lj:size-8 lj:items-center lj:justify-center">
						<SymbolIcon
							logo={symbolLogo}
							className="lj:size-5"
						/>
					</div>
					<div>
						<div className="lj:flex lj:items-center lj:gap-3">
							<h2 className="lj:text-xl lj:font-bold lj:text-lj-c-strong">{symbol}</h2>
							<span
								title={t('DASHBOARD_TABLE_SIDE')}
								aria-label={t('DASHBOARD_TABLE_SIDE')}
								className="lj:-ml-1 lj:inline-flex lj:items-center lj:rounded lj:px-1"
							>
								<span className={getPositionSideBadgeClassName(side)}>
									{side == null ? '-' : t(side)}
								</span>
							</span>
							{symbolTypeOption !== undefined && (
								<span
									title={t('DASHBOARD_SYMBOLS_TABLE_TYPE')}
									aria-label={t('DASHBOARD_SYMBOLS_TABLE_TYPE')}
									className="lj:inline-flex lj:items-center"
								>
									<EnumBadge option={symbolTypeOption} variant="side" />
								</span>
							)}
						</div>
						<div className="lj:flex lj:items-center lj:gap-1.5 lj:text-xs lj:text-lj-c-muted lj:font-mono lj:mt-0.5">
							<span>{t('POSITION_DETAILS_ID_LABEL')}:</span>
							{positionFile !== null ? (
								<button
									type="button"
									onClick={handleOpenSourceFile}
									title={t('POSITION_DETAILS_OPEN_SOURCE_FILE')}
									aria-label={t('POSITION_DETAILS_OPEN_SOURCE_FILE')}
									data-lj-control="open-position-source-file"
									className="lj:text-lj-c-tertiary lj:hover:text-lj-c-strong lj:hover:underline lj:underline-offset-2 lj:transition-colors"
								>
									{displayedPositionId}
								</button>
							) : (
								<span>{displayedPositionId}</span>
							)}
							<span aria-hidden="true">•</span>
							<AccountInlineValue
								app={app}
								value={derivePositionAccountWikilink(app, position)}
								className="lj:max-w-[12rem] lj:text-xs lj:text-lj-c-muted"
								iconClassName={POSITION_DETAILS_ACCOUNT_ICON_CLASS_NAME}
								fallbackIconClassName={POSITION_DETAILS_ACCOUNT_FALLBACK_ICON_CLASS_NAME}
							/>
						</div>
					</div>
				</div>
			</div>
			<div className="lj:flex lj:items-center lj:gap-2">
				<div ref={actionsRef} className="lj:relative">
					<button
						type="button"
						onClick={() => setIsActionsOpen((open) => !open)}
						title={t('POSITION_DETAILS_MORE_ACTIONS')}
						aria-label={t('POSITION_DETAILS_MORE_ACTIONS')}
						aria-expanded={isActionsOpen}
						aria-haspopup="menu"
						className="lj:p-1.5 lj:rounded-md lj:border lj:border-lj-alpha-10 lj:text-lj-c-tertiary lj:hover:text-lj-c-strong lj:hover:bg-lj-surf-button-hover lj:transition-colors"
					>
						<ObsidianIcon name="more-horizontal" className="lj:size-4" />
					</button>
					{isActionsOpen && (
						<div className="lj:absolute lj:right-0 lj:top-full lj:z-40 lj:mt-2 lj:min-w-[11rem] lj:overflow-hidden lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-popover lj:p-1 lj:shadow-xl lj:backdrop-blur-xl">
							<button
								type="button"
								disabled={!canDeletePosition}
								onClick={() => {
									setIsActionsOpen(false)
									onDeletePosition()
								}}
								className={`lj:flex lj:w-full lj:items-center lj:gap-3 lj:rounded-none lj:px-3 lj:py-2.5 lj:text-left lj:text-sm lj:transition-colors ${
									canDeletePosition
										? 'lj:text-lj-c-danger lj:hover:bg-lj-alpha-5-8 lj:hover:text-lj-c-danger-strong'
										: 'lj:cursor-not-allowed lj:text-lj-c-disabled'
								}`}
							>
								<ObsidianIcon name="trash-2" className="lj:size-4 lj:shrink-0" />
								<span className="lj:min-w-0 lj:flex-1 lj:truncate">{t('POSITION_DETAILS_DELETE_ACTION')}</span>
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

function resolvePositionSymbolTypeOption(app: App, position: Position): SelectOption | undefined {
	const symbolType = SymbolDomain.resolveEntry(app, position)?.fm.type ?? null
	if (symbolType === null) {
		return undefined
	}

	return SymbolDomain.typeOptions().find((option) => option.value === symbolType)
}

function getPositionSideBadgeClassName(side: Position['side']) {
	return `lj:inline-block lj:w-14 lj:text-center lj:py-0.5 lj:rounded lj:text-[10px] lj:tracking-wider lj:font-mono lj:font-bold ${
		side === 'LONG'
			? 'lj:bg-lj-fill-contrast lj:text-lj-c-inv'
			: side === 'SHORT'
				? 'lj:bg-lj-alpha-6-8 lj:text-lj-c-secondary'
				: 'lj:bg-lj-alpha-5 lj:text-lj-c-muted'
	}`
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('getPositionSideBadgeClassName', () => {
		it('uses the high-contrast badge treatment for long positions', () => {
			expect(getPositionSideBadgeClassName('LONG')).toContain('lj:bg-lj-fill-contrast')
			expect(getPositionSideBadgeClassName('LONG')).toContain('lj:text-lj-c-inv')
		})

		it('uses the muted badge treatment for short positions', () => {
			expect(getPositionSideBadgeClassName('SHORT')).toContain('lj:bg-lj-alpha-6-8')
			expect(getPositionSideBadgeClassName('SHORT')).toContain('lj:text-lj-c-secondary')
		})
	})
}
