/// <reference types="vitest/importMeta" />

import { type } from 'arktype'

import { DOMAIN_TIMESTAMP_FIELDS } from '../core/domain-timestamps'
import { defineFields } from '../core/fields'

import {
	listEntriesWithPositionStats,
	type LinkedPositionSectionDefinition,
	toLinkedEntryStatsTableEntry,
} from './linked-entry-stats'
import { SimpleAnalysisDomainBase } from './simple-analysis-domain'

import type { CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import type { DomainValue } from '../core/type'
import type { App } from 'obsidian'

const MarketAnalysisType = type({
	lucr_type: '"market_analysis"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'description?': 'string | null',
	'icon?': 'string | null',
	'tags?': 'string[] | null',
})

const MARKET_ANALYSIS_FOLDER_NAME = 'analyses'
const MARKET_ANALYSIS_NAME_REQUIRED_ERROR = 'MARKET_ANALYSIS_NAME_REQUIRED_ERROR'

class MarketAnalysisDomainDefinition extends SimpleAnalysisDomainBase<'market_analysis', typeof MarketAnalysisType> {
	override readonly name = 'market_analysis' as const
	override readonly schema = MarketAnalysisType
	protected override readonly folderName = MARKET_ANALYSIS_FOLDER_NAME
	protected override readonly nameRequiredError = MARKET_ANALYSIS_NAME_REQUIRED_ERROR
	protected override readonly defaultIcon = { kind: 'lucide', value: 'sunrise' } as const
	override readonly options = { persisted: { folderName: MARKET_ANALYSIS_FOLDER_NAME } }
	override coerce(record: CoercibleFrontmatter<typeof MarketAnalysisType['inferIn']>) {
		return this.coerceSimpleAnalysisRecord(record)
	}
}
export const MarketAnalysisDomain = new MarketAnalysisDomainDefinition()

export type MarketAnalysis = DomainValue<typeof MarketAnalysisDomain>
// @story [[lucrjournal/analysis#^position-linked-entry-defaults]] Creates position-linked market analyses without a description
async function createLinkedMarketAnalysisEntry(app: App, name: string) {
	const result = await MarketAnalysisDomain.createEntry(app, { name, description: '' })
	return { file: result.file, fm: result.entry }
}
function listMarketAnalysisEntriesWithStats(app: App) {
	return listEntriesWithPositionStats(app, MarketAnalysisDomain.totalEntries(app))
}
export function listMarketAnalysisTableEntries(app: App) {
	return listMarketAnalysisEntriesWithStats(app).map(toLinkedEntryStatsTableEntry)
}
export const marketAnalysisLinkedPositionSection = {
	kind: 'market_analysis',
	icon: 'sunrise',
	titleKey: 'TAB_MARKET_ANALYSIS',
	createLinkedEntry: createLinkedMarketAnalysisEntry,
} as const satisfies LinkedPositionSectionDefinition<MarketAnalysis>
export const marketAnalysisTableFields = defineFields(MarketAnalysisDomain.tableFields())
if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('MarketAnalysisDomain', () => {
		it('accepts the stable persisted fields', () => {
			expect(MarketAnalysisType.allows({
				lucr_type: 'market_analysis',
				description: 'Market sample',
				icon: 'sunrise',
			})).toBe(true)
		})

		// @story [[lucrjournal/analysis#^analysis-description-normalization]] Covers trimmed and empty market analysis descriptions
		it('creates entries with optional description frontmatter', () => {
			expect(Reflect.has(MarketAnalysisDomain.formDefinition, 'description')).toBe(true)
			expect(MarketAnalysisDomain.createEntryDescriptor.buildPayload({
				name: 'BTC weekly plan',
				description: '  Liquidity sweep scenario  ',
			}, {})).toMatchObject({
				lucr_type: 'market_analysis',
				description: 'Liquidity sweep scenario',
			})
			expect(MarketAnalysisDomain.createEntryDescriptor.buildPayload({
				name: 'ETH weekly plan',
				description: '   ',
			}, {})).toMatchObject({
				description: null,
			})
		})
	})
}
