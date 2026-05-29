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

const KeyLevelType = type({
	lucr_type: '"key_level"',
	...DOMAIN_TIMESTAMP_FIELDS,
	'description?': 'string | null',
	'icon?': 'string | null',
	'tags?': 'string[] | null',
})

const KEY_LEVEL_FOLDER_NAME = 'analyses'
const KEY_LEVEL_NAME_REQUIRED_ERROR = 'KEY_LEVEL_NAME_REQUIRED_ERROR'

class KeyLevelDomainDefinition extends SimpleAnalysisDomainBase<'key_level', typeof KeyLevelType> {
	override readonly name = 'key_level' as const
	override readonly schema = KeyLevelType
	protected override readonly folderName = KEY_LEVEL_FOLDER_NAME
	protected override readonly nameRequiredError = KEY_LEVEL_NAME_REQUIRED_ERROR
	protected override readonly defaultIcon = { kind: 'lucide', value: 'crosshair' } as const
	override readonly options = { persisted: { folderName: KEY_LEVEL_FOLDER_NAME } }
	override coerce(record: CoercibleFrontmatter<typeof KeyLevelType['inferIn']>) {
		return this.coerceSimpleAnalysisRecord(record)
	}
}
export const KeyLevelDomain = new KeyLevelDomainDefinition()

export type KeyLevel = DomainValue<typeof KeyLevelDomain>
async function createLinkedKeyLevelEntry(app: App, name: string) {
	const result = await KeyLevelDomain.createEntry(app, { name, description: '' })
	return { file: result.file, fm: result.entry }
}
function listKeyLevelEntriesWithStats(app: App) {
	return listEntriesWithPositionStats(app, KeyLevelDomain.totalEntries(app))
}
export function listKeyLevelTableEntries(app: App) {
	return listKeyLevelEntriesWithStats(app).map(toLinkedEntryStatsTableEntry)
}
export const keyLevelLinkedPositionSection = {
	kind: 'key_level',
	icon: 'crosshair',
	titleKey: 'TAB_KEY_LEVEL',
	createLinkedEntry: createLinkedKeyLevelEntry,
} as const satisfies LinkedPositionSectionDefinition<KeyLevel>
export const keyLevelTableFields = defineFields(KeyLevelDomain.tableFields())
if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('KeyLevelDomain', () => {
		it('accepts the stable persisted fields', () => {
			expect(KeyLevelType.allows({
				lucr_type: 'key_level',
				description: 'Key level sample',
				icon: 'crosshair',
			})).toBe(true)
		})

		it('creates entries with optional description frontmatter', () => {
			expect(Reflect.has(KeyLevelDomain.formDefinition, 'description')).toBe(true)
			expect(KeyLevelDomain.createEntryDescriptor.buildPayload({
				name: 'BTC range high',
				description: '  HTF supply  ',
			}, {})).toMatchObject({
				lucr_type: 'key_level',
				description: 'HTF supply',
			})
			expect(KeyLevelDomain.createEntryDescriptor.buildPayload({
				name: 'BTC range low',
				description: '   ',
			}, {})).toMatchObject({
				description: null,
			})
		})
	})
}
