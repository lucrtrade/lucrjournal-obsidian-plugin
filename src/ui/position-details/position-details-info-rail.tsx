/// <reference types="vitest/importMeta" />

import { Notice, type App, type TFile } from 'obsidian'
import { useCallback } from 'react'

import { PositionDomain, resolveSymbolInfo, type Position, type PositionUpdatePatch } from '../../domains'
import { SymbolDomain } from '../../domains/symbol'
import { resolvePositionSymbolModel } from '../../domains/symbol/position-model'
import { t } from '../../lang/helpers'
import { formatAmount, formatDuration, formatRatio, formatSignedAmount } from '../../utils'
import { DatetimeDisplay } from '../primitives/datetime-display'
import { EditableDatetimeField } from '../primitives/editable-datetime-field'
import { EditableField } from '../primitives/editable-field'
import { InfoTooltip } from '../primitives/info-tooltip'
import { ObsidianIcon } from '../primitives/obsidian-icon'

import { parsePositionFieldValue } from './position-field-value'

import type { PositionDetailsOverviewDensity } from './position-details-media-rail'
import type { PositionFieldBounds, PositionFieldValueKind } from './position-field-value'
import type { ReactNode } from 'react'

type PositionFieldName = keyof PositionUpdatePatch

type FormulaPart = {
	kind: 'op' | 'token'
	value: string
}

const DERIVED_METRIC_HEADING_CLASS_NAME = 'lj:text-[10px] lj:tracking-widest lj:text-lj-c-muted lj:uppercase'

type PositionDetailsInfoRailProps = {
	app: App
	density: PositionDetailsOverviewDensity
	onOpenAttachmentOcrImport: () => void
	onPositionUpdated: (position: Position) => void
	position: Position
	positionFile: TFile | null
	section?: 'full' | 'summary' | 'details'
}

export function PositionDetailsInfoRail({
	app,
	density,
	onOpenAttachmentOcrImport,
	onPositionUpdated,
	position,
	positionFile,
	section = 'full',
}: PositionDetailsInfoRailProps) {
	const profit = position.profit
	const notionalValue = position.notional_value
	const symbolEntry = SymbolDomain.resolveEntry(app, position)
	const symbolType = symbolEntry?.fm.type ?? null
	const symbolModel = resolvePositionSymbolModel(symbolType)
	const notionalAsset = position.notional_asset ?? 'usd'
	const notionalAmount = position.notional_amount ?? null
	const notionalSourceVisibility = symbolModel.notionalSourceVisibility
	const quantityFieldConfig = symbolModel.quantityFieldConfig
	const quantityFieldValue = quantityFieldConfig?.field === 'contract'
		? position.contract ?? null
		: position.lots ?? null
	const entryPrice = position.entry_price
	const exitPrice = position.exit_price
	const fee = position.fee
	const targetPrice = position.target_price
	const stopLoss = position.stop_loss
	const confidence = position.confidence
	const risk = resolveDisplayRisk(position)
	const isClosed = PositionDomain.isClosed(position)
	const isWin = profit !== null && profit !== undefined && profit > 0
	const duration = formatDuration(position.opened_at, position.closed_at)
	const plannedRr = PositionDomain.calculatePlannedRr(position)
	const realRr = PositionDomain.calculateRealRr(position)
	const cardPadding = density === 'narrow' ? 'lj:p-3' : density === 'compact' ? 'lj:p-3.5' : 'lj:p-4'
	const sectionPadding = density === 'narrow' ? 'lj:p-3' : 'lj:p-3.5'
	const heroValueClassName = density === 'wide'
		? 'lj:text-4xl'
		: density === 'compact'
			? 'lj:text-3xl'
			: 'lj:text-[1.75rem]'
	const formulaLines = buildFormulaLines()

	const savePatch = useCallback((patch: PositionUpdatePatch) => {
		if (positionFile === null) {
			return
		}

		void PositionDomain.updateFields(app, positionFile, patch)
			.then(onPositionUpdated)
			.catch((error: unknown) => {
				if (error instanceof Error && error.message === 'POSITION_RISK_DIRECTION_ERROR') {
					new Notice(t('POSITION_DETAILS_RISK_DIRECTION_INVALID'))
				}
			})
	}, [app, onPositionUpdated, positionFile])

	const saveField = useCallback((field: PositionFieldName, raw: string, kind: PositionFieldValueKind, bounds?: PositionFieldBounds) => {
		const value = parsePositionFieldValue(raw, kind, bounds)
		if (value === undefined) {
			return
		}

		savePatch({ [field]: value })
	}, [savePatch])

	const saveCryptoAmount = useCallback((raw: string) => {
		const value = parsePositionFieldValue(raw, 'number') as number | null | undefined
		if (value === undefined) {
			return
		}

		savePatch(resolveCryptoAmountPatch(notionalAsset, value))
	}, [notionalAsset, savePatch])

	return (
		<div data-lj-panel="position-details-sidebar" className="lj:flex lj:flex-col lj:gap-3">
			{section !== 'details' && (
				<>
					<div className={`lj:bg-lj-surf lj:border lj:border-lj-alpha-10 lj:rounded-md lj:shadow-sm ${cardPadding}`}>
						<div className="lj:mb-2">
							<DerivedMetricLabel
								label={buildHeroMetricSummary().netPnl.label}
								textClassName={DERIVED_METRIC_HEADING_CLASS_NAME}
							/>
						</div>
						{profit != null ? (
							<EditableField
								align="right"
								value={String(profit)}
								onSave={(v) => saveField('profit', v, 'number')}
								displayNode={
									<span className={getHeroMetricValueClassName(heroValueClassName, isWin)}>
										{formatSignedAmount(profit)}
									</span>
								}
							/>
						) : (
							<div className={`${heroValueClassName} lj:text-right lj:font-bold lj:tracking-tighter lj:text-lj-c-faint-dim`}>-</div>
						)}
					</div>

					<SidebarSection
						action={(
							<button
								type="button"
								onClick={onOpenAttachmentOcrImport}
								disabled={positionFile === null}
								data-lj-control="attachment-ocr-import-open"
								className={getAttachmentOcrTriggerClassName()}
							>
								{t('POSITION_DETAILS_ATTACHMENT_PASTE_ACTION')}
							</button>
						)}
						density={density}
						title={t('POSITION_DETAILS_EXECUTION_DETAILS')}
					>
						<div className={`${sectionPadding} lj:flex lj:flex-col lj:gap-3 lj:text-xs lj:font-mono`}>
							<SidebarRow label={t('POSITION_DETAILS_STATUS')}>
								<button
									type="button"
									onClick={() => savePatch({ status: isClosed ? 'open' : 'close' })}
									className="lj:group/status lj:-mr-1 lj:inline-flex lj:cursor-pointer lj:items-center lj:gap-1 lj:rounded lj:px-1 lj:transition-colors lj:hover:bg-lj-alpha-5"
								>
									<ObsidianIcon
										name="arrow-left-right"
										className="lj:size-3 lj:shrink-0 lj:text-lj-c-hint-faint lj:opacity-0 lj:transition-opacity lj:group-hover/status:opacity-100"
									/>
									<span className="lj:rounded lj:bg-lj-alpha-5-10 lj:px-2 lj:py-0.5 lj:text-lj-c-strong">
										{isClosed ? t('CLOSE') : t('OPEN')}
									</span>
								</button>
							</SidebarRow>
							<SidebarRow label={t('POSITION_DETAILS_ENTRY_PRICE')}>
								<NumberField value={entryPrice} onSave={(v) => saveField('entry_price', v, 'number')} />
							</SidebarRow>
							<SidebarRow label={t('POSITION_DETAILS_EXIT_PRICE')}>
								<NumberField value={exitPrice} onSave={(v) => saveField('exit_price', v, 'number')} />
							</SidebarRow>
							{notionalSourceVisibility.showCryptoAmount && (
								<SidebarRow
									label={(
										<SidebarRowLabelWithSecondary
											label={t('POSITION_DETAILS_AMOUNT')}
											secondary={formatPositionNotionalValuePreview(notionalValue)}
										/>
									)}
								>
									<CryptoAmountField
										entryPrice={entryPrice ?? null}
										nativeLabel={resolveCryptoNotionalAssetLabel(symbolEntry?.fm.name)}
										notionalAmount={notionalAmount}
										notionalAsset={notionalAsset}
										notionalValue={notionalValue ?? null}
										onAssetChange={(value) => saveField('notional_asset', value, 'string')}
										onValueSave={saveCryptoAmount}
									/>
								</SidebarRow>
							)}
							{quantityFieldConfig !== null && (
								<SidebarRow label={t(quantityFieldConfig.labelKey)}>
									<NumberField
										value={quantityFieldValue}
										onSave={(v) => saveField(quantityFieldConfig.field, v, quantityFieldConfig.valueKind, quantityFieldConfig)}
										integerOnly={quantityFieldConfig.integerOnly}
										min={quantityFieldConfig.min}
										step={quantityFieldConfig.step}
									/>
								</SidebarRow>
							)}
							<SidebarRow label={t('POSITION_DETAILS_FEE')}>
								<NumberField value={fee} onSave={(v) => saveField('fee', v, 'number')} step={0.0001} />
							</SidebarRow>
						</div>
					</SidebarSection>
				</>
			)}

			{section !== 'summary' && (
				<>
					<SidebarSection density={density} title={t('POSITION_DETAILS_TIMING')}>
						<div className={`${sectionPadding} lj:flex lj:flex-col lj:gap-3 lj:text-xs lj:font-mono`}>
							<SidebarRow label={t('POSITION_DETAILS_OPENED_AT')}>
								<EditableDatetimeField
									align="right"
									value={position.opened_at}
									onSave={(v) => saveField('opened_at', v, 'string')}
									renderDisplay={(v) => <DatetimeDisplay datetime={v} />}
									className="lj:-mr-2"
								/>
							</SidebarRow>
							<SidebarRow label={t('POSITION_DETAILS_CLOSED_AT')}>
								<EditableDatetimeField
									align="right"
									value={position.closed_at}
									onSave={(v) => saveField('closed_at', v, 'string')}
									renderDisplay={(v) => <DatetimeDisplay datetime={v} />}
									className="lj:-mr-2"
								/>
							</SidebarRow>
							{duration !== null && (
								<div className="lj:flex lj:justify-between lj:items-center lj:pt-2 lj:border-t lj:border-lj-alpha-5">
									<span className="lj:text-lj-c-muted">{t('POSITION_DETAILS_DURATION')}</span>
									<span className="lj:text-lj-c-strong">{duration}</span>
								</div>
							)}
						</div>
					</SidebarSection>

					<SidebarSection density={density} title={t('POSITION_DETAILS_RISK_AND_REWARD')}>
						<div className={`${sectionPadding} lj:flex lj:flex-col lj:gap-3 lj:text-xs lj:font-mono`}>
							<SidebarRow label={t('POSITION_DETAILS_TARGET_PRICE')}>
								<NumberField value={targetPrice} onSave={(v) => saveField('target_price', v, 'number')} />
							</SidebarRow>
							<SidebarRow label={t('POSITION_DETAILS_STOP_LOSS')}>
								<NumberField value={stopLoss} onSave={(v) => saveField('stop_loss', v, 'number')} />
							</SidebarRow>
							<SidebarRow label={t('POSITION_DETAILS_CONFIDENCE')}>
								<EditableField
									align="right"
									value={confidence != null ? String(confidence) : ''}
									onSave={(v) => saveField('confidence', v, 'number')}
									inputType="number"
									displayNode={<span className="lj:text-lj-c-strong">{confidence ?? '-'}</span>}
								/>
							</SidebarRow>
							<SidebarRow
								label={(
									<DerivedMetricLabel
										label={t('POSITION_DETAILS_RISK')}
										tooltipTitle={t('POSITION_DETAILS_RISK')}
										tooltipContent={<FormulaContent lines={formulaLines.risk} />}
									/>
								)}
							>
								<span className="lj:text-lj-c-strong">
									{risk != null ? `$${formatAmount(risk)}` : '-'}
								</span>
							</SidebarRow>
							<div className="lj:h-px lj:bg-lj-alpha-5 lj:my-1" />
							<SidebarRow
								label={(
									<DerivedMetricLabel
										label={t('POSITION_DETAILS_PLANNED_RR')}
										tooltipTitle={t('POSITION_DETAILS_PLANNED_RR')}
										tooltipContent={<FormulaContent lines={formulaLines.plannedRr} />}
									/>
								)}
							>
								<span className="lj:text-lj-c-strong">
									{plannedRr != null ? t('POSITION_DETAILS_RR_WITH_UNIT', { value: formatRatio(plannedRr) }) : '-'}
								</span>
							</SidebarRow>
							<SidebarRow
								label={(
									<DerivedMetricLabel
										label={t('POSITION_DETAILS_REAL_RR')}
										tooltipTitle={t('POSITION_DETAILS_REAL_RR')}
										tooltipContent={<FormulaContent lines={formulaLines.realRr} />}
									/>
								)}
							>
								<span className="lj:text-lj-c-strong">
									{realRr != null ? t('POSITION_DETAILS_RR_WITH_UNIT', { value: formatRatio(realRr) }) : '-'}
								</span>
							</SidebarRow>
						</div>
					</SidebarSection>
				</>
			)}
		</div>
	)
}

function buildHeroMetricSummary() {
	return {
		netPnl: {
			label: t('POSITION_DETAILS_NET_PNL'),
			tooltipLines: null,
		},
		roi: null,
	} as const
}

function buildFormulaLines() {
	const notionalValueLabel = t('POSITION_DETAILS_FORMULA_NOTIONAL_VALUE')
	const directionLabel = t('POSITION_DETAILS_FORMULA_DIRECTION')
	const directionValueLabel = `${t('LONG')} = +1，${t('SHORT')} = -1`

	return {
		risk: [
			[
				formulaToken(t('POSITION_DETAILS_RISK')),
				formulaOp('='),
				formulaOp('('),
				formulaToken(t('POSITION_DETAILS_ENTRY_PRICE')),
				formulaOp('-'),
				formulaToken(t('POSITION_DETAILS_STOP_LOSS')),
				formulaOp(')'),
				formulaOp('×'),
				formulaToken(directionLabel),
				formulaOp('×'),
				formulaOp('('),
				formulaToken(notionalValueLabel),
				formulaOp('/'),
				formulaToken(t('POSITION_DETAILS_ENTRY_PRICE')),
				formulaOp(')'),
			],
			[
				formulaToken(directionLabel),
				formulaOp('='),
				formulaToken(directionValueLabel),
			],
		],
		plannedRr: [
			[
				formulaToken(t('POSITION_DETAILS_PLANNED_RR')),
				formulaOp('='),
				formulaOp('('),
				formulaOp('('),
				formulaToken(t('POSITION_DETAILS_TARGET_PRICE')),
				formulaOp('-'),
				formulaToken(t('POSITION_DETAILS_ENTRY_PRICE')),
				formulaOp(')'),
				formulaOp('×'),
				formulaToken(directionLabel),
				formulaOp('×'),
				formulaOp('('),
				formulaToken(notionalValueLabel),
				formulaOp('/'),
				formulaToken(t('POSITION_DETAILS_ENTRY_PRICE')),
				formulaOp(')'),
				formulaOp(')'),
				formulaOp('/'),
				formulaToken(t('POSITION_DETAILS_RISK')),
			],
			[
				formulaToken(directionLabel),
				formulaOp('='),
				formulaToken(directionValueLabel),
			],
		],
		realRr: [
			[
				formulaToken(t('POSITION_DETAILS_REAL_RR')),
				formulaOp('='),
				formulaOp('('),
				formulaOp('('),
				formulaToken(t('POSITION_DETAILS_EXIT_PRICE')),
				formulaOp('-'),
				formulaToken(t('POSITION_DETAILS_ENTRY_PRICE')),
				formulaOp(')'),
				formulaOp('×'),
				formulaToken(directionLabel),
				formulaOp('×'),
				formulaOp('('),
				formulaToken(notionalValueLabel),
				formulaOp('/'),
				formulaToken(t('POSITION_DETAILS_ENTRY_PRICE')),
				formulaOp(')'),
				formulaOp(')'),
				formulaOp('/'),
				formulaToken(t('POSITION_DETAILS_RISK')),
			],
			[
				formulaToken(directionLabel),
				formulaOp('='),
				formulaToken(directionValueLabel),
			],
		],
	}
}

function formulaToken(value: string): FormulaPart {
	return { kind: 'token', value }
}

function formulaOp(value: string): FormulaPart {
	return { kind: 'op', value }
}

function resolveDisplayRisk(position: Position): number | null {
	return position.risk ?? PositionDomain.calculateRisk(position)
}

function resolveCryptoAmountFieldConfig(
	notionalAsset: 'native' | 'usd',
	notionalAmount: number | null,
	notionalValue: number | null,
	entryPrice: number | null,
) {
	if (notionalAsset === 'native') {
		return {
			field: 'notional_amount' as const,
			value: resolveCryptoAmountDisplayValue(notionalAsset, notionalAmount, notionalValue, entryPrice),
			unit: notionalAsset,
		}
	}

	return {
		field: 'notional_value' as const,
		value: notionalValue,
		unit: notionalAsset,
	}
}

function resolveCryptoAmountDisplayValue(
	notionalAsset: 'native' | 'usd',
	notionalAmount: number | null,
	notionalValue: number | null,
	entryPrice: number | null,
) {
	if (notionalAsset !== 'native') {
		return notionalValue
	}
	if (notionalAmount !== null) {
		return notionalAmount
	}
	if (notionalValue === null || entryPrice === null || entryPrice <= 0) {
		return null
	}
	return notionalValue / entryPrice
}

function resolveCryptoAmountPatch(
	notionalAsset: 'native' | 'usd',
	value: number | null,
): PositionUpdatePatch {
	return notionalAsset === 'native'
		? { notional_amount: value }
		: { notional_value: value }
}

function resolveCryptoNotionalAssetLabel(symbolName: string | null | undefined) {
	return symbolName == null ? t('POSITION_DETAILS_NOTIONAL_ASSET_NATIVE') : (resolveSymbolInfo(symbolName).asset ?? t('POSITION_DETAILS_NOTIONAL_ASSET_NATIVE'))
}

function formatPositionNotionalValuePreview(value: number | null | undefined) {
	return value != null ? `$${formatAmount(value)}` : '-'
}

function SidebarRowLabelWithSecondary({
	label,
	secondary,
}: {
	label: string
	secondary: string
}) {
	return (
		<div className="lj:inline-flex lj:min-w-0 lj:items-baseline lj:gap-1.5">
			<span className="lj:text-lj-c-muted">{label}</span>
			<span className="lj:text-[10px] lj:text-lj-c-hint">{secondary}</span>
		</div>
	)
}

function CryptoAmountField({
	entryPrice,
	nativeLabel,
	notionalAmount,
	notionalAsset,
	notionalValue,
	onAssetChange,
	onValueSave,
}: {
	entryPrice: number | null
	nativeLabel: string
	notionalAmount: number | null
	notionalAsset: 'native' | 'usd'
	notionalValue: number | null
	onAssetChange: (value: 'native' | 'usd') => void
	onValueSave: (value: string) => void
}) {
	const activeField = resolveCryptoAmountFieldConfig(notionalAsset, notionalAmount, notionalValue, entryPrice)

	return (
		<div className="lj:flex lj:min-w-0 lj:items-center lj:justify-end lj:gap-2">
			<div className="lj:min-w-0 lj:w-24">
				<NumberField value={activeField.value} onSave={onValueSave} />
			</div>
			<NotionalAssetUnitButton
				label={resolveNotionalAssetUnitLabel(notionalAsset, nativeLabel)}
				onClick={() => onAssetChange(resolveNextNotionalAsset(notionalAsset))}
			/>
		</div>
	)
}

function resolveNotionalAssetUnitLabel(
	notionalAsset: 'native' | 'usd',
	nativeLabel: string,
) {
	return notionalAsset === 'native' ? nativeLabel : '$'
}

function resolveNextNotionalAsset(notionalAsset: 'native' | 'usd'): 'native' | 'usd' {
	return notionalAsset === 'native' ? 'usd' : 'native'
}

function NotionalAssetUnitButton({
	label,
	onClick,
}: {
	label: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={getNotionalAssetUnitButtonClassName()}
		>
			<span>{label}</span>
			<ObsidianIcon name="chevron-down" className="lj:size-3 lj:text-lj-c-hint" />
		</button>
	)
}

function getNotionalAssetUnitButtonClassName() {
	return 'lj:inline-flex lj:shrink-0 lj:items-center lj:gap-1.5 lj:rounded-md lj:bg-lj-surf-input lj:px-2.5 lj:py-1 lj:text-[11px] lj:font-semibold lj:text-lj-c-strong lj:transition-[background-color,color] lj:hover:bg-lj-surf-button-hover lj:hover:text-lj-c-strong'
}

function SidebarSection({
	action,
	children,
	density,
	title,
}: {
	action?: ReactNode
	children: ReactNode
	density: PositionDetailsOverviewDensity
	title: string
}) {
	return (
		<div className="lj:bg-lj-surf lj:border lj:border-lj-alpha-10 lj:rounded-md lj:overflow-hidden lj:shadow-sm">
			<div className={`${density === 'narrow' ? 'lj:px-3 lj:py-2' : 'lj:px-3.5 lj:py-2.5'} lj:flex lj:items-center lj:justify-between lj:gap-3 lj:border-b lj:border-lj-alpha-5 lj:text-[10px] lj:font-bold lj:tracking-widest lj:text-lj-c-strong lj:uppercase`}>
				<span>{title}</span>
				{action ?? null}
			</div>
			{children}
		</div>
	)
}

function SidebarRow({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="lj:flex lj:items-center lj:gap-4">
			<div className="lj:min-w-0">
				{typeof label === 'string'
					? <span className="lj:text-lj-c-muted">{label}</span>
					: label}
			</div>
			<div className={getSidebarRowValueClassName()}>{children}</div>
		</div>
	)
}

function DerivedMetricLabel({
	label,
	tooltipTitle,
	tooltipContent,
	textClassName = 'lj:text-lj-c-muted',
}: {
	label: string
	tooltipTitle?: string
	tooltipContent?: ReactNode
	textClassName?: string
}) {
	return (
		<div className="lj:inline-flex lj:min-w-0 lj:items-center lj:gap-1.5">
			<span className={textClassName}>{label}</span>
			{tooltipTitle != null && tooltipContent != null
				? (
					<InfoTooltip title={tooltipTitle}>
						{tooltipContent}
					</InfoTooltip>
				)
				: null}
		</div>
	)
}

function FormulaContent({ lines }: { lines: FormulaPart[][] }) {
	return (
		<>
			{lines.map((line, lineIndex) => (
				<FormulaLine key={lineIndex}>
					{line.map((part, partIndex) => part.kind === 'token'
						? <FormulaToken key={`${lineIndex}-${partIndex}`}>{part.value}</FormulaToken>
						: <FormulaOp key={`${lineIndex}-${partIndex}`}>{part.value}</FormulaOp>)}
				</FormulaLine>
			))}
		</>
	)
}

function FormulaLine({ children }: { children: ReactNode }) {
	return (
		<div className="lj:flex lj:flex-wrap lj:items-center lj:gap-x-1.5 lj:gap-y-1">
			{children}
		</div>
	)
}

function FormulaToken({ children }: { children: ReactNode }) {
	return (
		<span className="lj:rounded-md lj:border lj:border-lj-alpha-10 lj:bg-lj-alpha-5 lj:px-1.5 lj:py-0.5 lj:font-mono lj:text-[11px] lj:text-lj-c-strong">
			{children}
		</span>
	)
}

function FormulaOp({ children }: { children: ReactNode }) {
	return (
		<span className="lj:font-mono lj:text-[11px] lj:text-lj-c-hint">
			{children}
		</span>
	)
}

function getHeroMetricValueClassName(heroValueClassName: string, isWin: boolean) {
	return `${heroValueClassName} lj:block lj:w-full lj:text-right lj:font-bold lj:tracking-tighter ${isWin ? 'lj:text-lj-c-strong' : 'lj:text-lj-c-hint'}`
}

function getSidebarRowValueClassName() {
	return 'lj:min-w-0 lj:flex-1 lj:flex lj:justify-end lj:text-right'
}

function getAttachmentOcrTriggerClassName() {
	return 'lj:inline-flex lj:items-center lj:rounded lj:border lj:border-lj-c-strong lj:bg-lj-c-strong lj:px-2 lj:py-1 lj:text-[10px] lj:font-bold lj:tracking-widest lj:text-lj-c-inv lj:uppercase lj:transition-opacity lj:hover:opacity-90 disabled:lj:cursor-default disabled:lj:opacity-50'
}

function NumberField({
	value,
	onSave,
	prefix,
	absolute,
	integerOnly,
	min,
	step,
}: {
	value: number | null | undefined
	onSave: (v: string) => void
	prefix?: string
	absolute?: boolean
	integerOnly?: boolean
	min?: number | string
	step?: number | string
}) {
	const formattedValue = value != null
		? integerOnly
			? formatIntegerFieldValue(absolute ? Math.abs(value) : value)
			: formatAmount(absolute ? Math.abs(value) : value)
		: null
	const display = value != null
		? `${prefix ?? ''}${formattedValue}`
		: '-'

	return (
		<EditableField
			align="right"
			value={value != null ? String(value) : ''}
			onSave={onSave}
			inputType="number"
			inputMode={integerOnly ? 'numeric' : 'decimal'}
			min={min}
			step={integerOnly ? 1 : step}
			displayNode={<span className="lj:text-lj-c-strong">{display}</span>}
		/>
	)
}

function formatIntegerFieldValue(value: number) {
	return formatAmount(value).replace(/\.00$/u, '')
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('buildHeroMetricSummary', () => {
		it('omits ROI and removes Net PnL tooltip affordance', () => {
			const summary = buildHeroMetricSummary()

			expect(summary.netPnl.tooltipLines).toBeNull()
			expect(summary.roi).toBeNull()
		})
	})

	describe('getHeroMetricValueClassName', () => {
		it('keeps pnl hero metrics right aligned when the trade is profitable', () => {
			expect(getHeroMetricValueClassName('lj:text-4xl', true)).toContain('lj:w-full')
			expect(getHeroMetricValueClassName('lj:text-4xl', true)).toContain('lj:text-right')
			expect(getHeroMetricValueClassName('lj:text-4xl', true)).toContain('lj:text-lj-c-strong')
		})

		it('keeps pnl hero metrics right aligned when the trade is losing', () => {
			expect(getHeroMetricValueClassName('lj:text-4xl', false)).toContain('lj:text-right')
			expect(getHeroMetricValueClassName('lj:text-4xl', false)).toContain('lj:text-lj-c-hint')
		})
	})

	describe('getSidebarRowValueClassName', () => {
		it('uses a shared trailing-edge value column for sidebar rows', () => {
			expect(getSidebarRowValueClassName()).toContain('lj:flex-1')
			expect(getSidebarRowValueClassName()).toContain('lj:flex')
			expect(getSidebarRowValueClassName()).toContain('lj:justify-end')
			expect(getSidebarRowValueClassName()).toContain('lj:text-right')
		})
	})

	describe('getAttachmentOcrTriggerClassName', () => {
		it('uses an inverted light and dark theme fill', () => {
			const className = getAttachmentOcrTriggerClassName()

			expect(className).toContain('lj:bg-lj-c-strong')
			expect(className).toContain('lj:text-lj-c-inv')
			expect(className).toContain('lj:border-lj-c-strong')
		})
	})

	describe('resolveDisplayRisk', () => {
		it('falls back to a virtual risk when persisted risk is empty but source fields are complete', () => {
			expect(resolveDisplayRisk({
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				stop_loss: 95,
				notional_value: 2,
				risk: null,
			})).toBe(0.1)
		})

		it('keeps the persisted risk when it is already present', () => {
			expect(resolveDisplayRisk({
				lucr_type: 'position',
				side: 'LONG',
				entry_price: 100,
				stop_loss: 95,
				notional_value: 2,
				risk: 12,
			})).toBe(12)
		})
	})

	describe('formatIntegerFieldValue', () => {
		it('drops trailing amount decimals for integer-only fields', () => {
			expect(formatIntegerFieldValue(2)).toBe('2')
			expect(formatIntegerFieldValue(2000)).toBe('2,000')
		})
	})

	describe('position symbol notional source model', () => {
		it('shows the unified amount row for crypto perps and spots', () => {
			expect(resolvePositionSymbolModel('Crypto_Perp').notionalSourceVisibility).toEqual({
				showCryptoAmount: true,
			})
			expect(resolvePositionSymbolModel('Crypto_Perp').quantityFieldConfig).toBeNull()
			expect(resolvePositionSymbolModel('Crypto_Spot').notionalSourceVisibility).toEqual({
				showCryptoAmount: true,
			})
			expect(resolvePositionSymbolModel('Crypto_Spot').quantityFieldConfig).toBeNull()
		})

		it('shows contract row for futures and lots row for cfd with type-specific validation', () => {
			expect(resolvePositionSymbolModel('Future').notionalSourceVisibility).toEqual({
				showCryptoAmount: false,
			})
			expect(resolvePositionSymbolModel('Future').quantityFieldConfig).toEqual({
				field: 'contract',
				integerOnly: true,
				labelKey: 'POSITION_DETAILS_CONTRACT',
				max: 20,
				min: 1,
				step: 1,
				valueKind: 'positive-integer',
			})
			expect(resolvePositionSymbolModel('CFD').notionalSourceVisibility).toEqual({
				showCryptoAmount: false,
			})
			expect(resolvePositionSymbolModel('CFD').quantityFieldConfig).toEqual({
				field: 'lots',
				integerOnly: false,
				labelKey: 'POSITION_DETAILS_LOTS',
				max: 20,
				min: 0.01,
				step: 0.01,
				valueKind: 'bounded-lots',
			})
		})

		it('treats unknown symbol type as crypto fallback', () => {
			expect(resolvePositionSymbolModel(null).notionalSourceVisibility).toEqual({
				showCryptoAmount: true,
			})
		})
	})

	describe('resolveCryptoAmountFieldConfig', () => {
		it('shows native mode from persisted notional_amount', () => {
			expect(resolveCryptoAmountFieldConfig('native', 1.5, 300, 100)).toEqual({
				field: 'notional_amount',
				value: 1.5,
				unit: 'native',
			})
		})

		it('falls back to derived native display when notional_amount is missing', () => {
			expect(resolveCryptoAmountFieldConfig('native', null, 300, 100)).toEqual({
				field: 'notional_amount',
				value: 3,
				unit: 'native',
			})
		})

		it('shows usd mode as notional_value directly', () => {
			expect(resolveCryptoAmountFieldConfig('usd', 1.5, 300, 100)).toEqual({
				field: 'notional_value',
				value: 300,
				unit: 'usd',
			})
		})

		it('keeps native mode empty without a usable entry_price', () => {
			expect(resolveCryptoAmountFieldConfig('native', null, 300, null)).toEqual({
				field: 'notional_amount',
				value: null,
				unit: 'native',
			})
		})
	})

	describe('resolveCryptoAmountPatch', () => {
		it('routes usd input to notional_value', () => {
			expect(resolveCryptoAmountPatch('usd', 300)).toEqual({ notional_value: 300 })
		})

		it('routes native input to notional_amount', () => {
			expect(resolveCryptoAmountPatch('native', 3)).toEqual({ notional_amount: 3 })
		})

		it('clears the active persisted amount field when the input is empty', () => {
			expect(resolveCryptoAmountPatch('native', null)).toEqual({ notional_amount: null })
		})
	})

	describe('resolveCryptoNotionalAssetLabel', () => {
		it('returns the base symbol asset when the symbol can be parsed', () => {
			expect(resolveCryptoNotionalAssetLabel('BTC/USDT:USDT')).toBe('BTC')
		})

		it('falls back to the Native label when the symbol is missing', () => {
			expect(resolveCryptoNotionalAssetLabel(null)).toBe(t('POSITION_DETAILS_NOTIONAL_ASSET_NATIVE'))
		})
	})

	describe('formatPositionNotionalValuePreview', () => {
		it('always formats the preview as a dollar amount', () => {
			expect(formatPositionNotionalValuePreview(300)).toBe('$300.00')
		})

		it('returns a placeholder when notional value is empty', () => {
			expect(formatPositionNotionalValuePreview(null)).toBe('-')
		})
	})

	describe('resolveNotionalAssetUnitLabel', () => {
		it('returns the native asset label for native mode', () => {
			expect(resolveNotionalAssetUnitLabel('native', 'BTC')).toBe('BTC')
		})

		it('returns the dollar symbol for usd mode', () => {
			expect(resolveNotionalAssetUnitLabel('usd', 'BTC')).toBe('$')
		})
	})

	describe('resolveNextNotionalAsset', () => {
		it('toggles from native to usd and back', () => {
			expect(resolveNextNotionalAsset('native')).toBe('usd')
			expect(resolveNextNotionalAsset('usd')).toBe('native')
		})
	})

	describe('getNotionalAssetUnitButtonClassName', () => {
		it('uses a borderless clickable unit button instead of a segmented switch', () => {
			const className = getNotionalAssetUnitButtonClassName()

			expect(className).toContain('lj:hover:bg-lj-surf-button-hover')
			expect(className).toContain('lj:text-lj-c-strong')
			expect(className).not.toContain('lj:border')
		})
	})
}
