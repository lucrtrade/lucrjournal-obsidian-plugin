import { t } from '../../lang/helpers'
import { toNullableTrimmedValue } from '../../utils'
import { coerceFrontmatterField, coerceLiteral, coerceNullableString, coerceStringArray, type CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import { BasenameDomainBase } from '../core/basename-domain'
import { applyDomainTimestampCoerce } from '../core/domain-timestamps'
import { type CreateEntryContext } from '../core/entry-writer'
import { TABLE_FIELD_DISPLAYS, type FieldDescriptor, type TitleFieldValue } from '../core/fields'
import { defineForm, type FormDefinition } from '../core/form'
import { collectVaultTagOptions } from '../core/tags'

import type { LinkedEntryStatsRow, LinkedEntryTableFieldType } from './linked-entry-stats'
import type { IconDescriptor } from '../core/icon-descriptor'
import type { type } from 'arktype'

export type SimpleAnalysisTableFieldDescriptor = FieldDescriptor<LinkedEntryStatsRow> & { type: LinkedEntryTableFieldType }

type SimpleAnalysisFormShape = {
	name: { type: 'text' }
	description: { type: 'text' }
}

export abstract class SimpleAnalysisDomainBase<
	const Name extends string,
	const Schema extends type.Any,
> extends BasenameDomainBase<Name, Schema, FormDefinition<SimpleAnalysisFormShape>> {
	protected abstract readonly defaultIcon: IconDescriptor
	override readonly formDefinition = defineForm<SimpleAnalysisFormShape>({
		name: {
			type: 'text',
			label: this.nameLabel(),
			required: true,
			validate: (value, _values, context) => this.validateNameField(value, context.app),
		},
		description: {
			type: 'text',
			label: 'DASHBOARD_ENTRY_COLUMN_DESCRIPTION',
		},
	} as const)

	// @story [[lucrjournal/analysis#^analysis-description-normalization]] Normalizes optional analysis descriptions at creation
	protected override buildPayloadFields(formValue: { name: string; description?: string }, _ctx: CreateEntryContext): Record<string, unknown> {
		return {
			description: toNullableTrimmedValue(formValue.description ?? ''),
		}
	}

	protected coerceSimpleAnalysisRecord(record: CoercibleFrontmatter<Schema['inferIn']>) {
		const nextRecord = record as Record<string, unknown>
		coerceFrontmatterField(nextRecord, 'lucr_type', (value) => coerceLiteral(value, this.name))
		applyDomainTimestampCoerce(record)
		coerceFrontmatterField(nextRecord, 'description', coerceNullableString)
		coerceFrontmatterField(nextRecord, 'icon', coerceNullableString)
		coerceFrontmatterField(nextRecord, 'tags', coerceStringArray)
		return record
	}

	override toDebugLabel(entry: { description?: string | null }) {
		return `${this.name}:${entry.description ?? '-'}`
	}

	protected tableCreatedField(): SimpleAnalysisTableFieldDescriptor {
		return {
			key: 'created',
			usages: ['Table'],
			type: 'datetime',
			label: () => t('DASHBOARD_ENTRY_COLUMN_DATE'),
			getValue: (entry) => entry.fm.entryStats.entry.fm.created,
			columnFilter: 'by_date',
			sortable: true,
			table: { width: 'lg', cellOverflow: 'clip', display: TABLE_FIELD_DISPLAYS.relativeDatetime },
		}
	}

	protected tableTitleField(): SimpleAnalysisTableFieldDescriptor {
		return {
			key: 'title',
			usages: ['Table'],
			type: 'title',
			label: () => t('DASHBOARD_ENTRY_COLUMN_TITLE'),
			searchable: true,
			getValue: (entry): TitleFieldValue => ({
				title: entry.fm.displayName,
				icon: entry.fm.entryStats.entry.fm.icon ?? this.defaultIcon,
				source: entry.fm.entryStats.entry.fm.source,
			}),
			sortable: true,
			compareFn: (left, right) => left.fm.displayName.localeCompare(right.fm.displayName),
			table: { width: 'fill', cellOverflow: 'clip' },
		}
	}

	protected tablePositionCountField(): SimpleAnalysisTableFieldDescriptor {
		return {
			key: 'positionCount',
			usages: ['Table'],
			type: 'number',
			label: () => t('DASHBOARD_ENTRY_COLUMN_POSITION_COUNT'),
			getValue: (entry) => entry.fm.positionCount,
			columnFilter: 'range',
			sortable: true,
			table: { width: 'sm', display: TABLE_FIELD_DISPLAYS.linkedPositionCount },
		}
	}

	// @story [[lucrjournal/fields#^tag-filter]] Defines normalized substring matching for analysis tags
	protected tableTagsField(): SimpleAnalysisTableFieldDescriptor {
		return {
			key: 'tags',
			usages: ['Table'],
			type: 'text',
			label: () => t('DASHBOARD_ENTRY_COLUMN_TAGS'),
			searchable: true,
			getValue: (entry) => entry.fm.entryStats.entry.fm.tags ?? [],
			dynamicTagOptions: (app) => collectVaultTagOptions(app),
			columnFilter: {
				fn: (value, filterValue) => {
					if (typeof filterValue !== 'string' || filterValue.trim() === '') {
						return true
					}
					if (!Array.isArray(value)) {
						return false
					}
					const normalizedFilter = filterValue.trim().toLowerCase().replace(/^#/, '')
					return value.some((tag) => String(tag).toLowerCase().replace(/^#/, '').includes(normalizedFilter))
				},
			},
			sortable: true,
			compareFn: (left, right) =>
				(left.fm.entryStats.entry.fm.tags ?? []).join(' ').localeCompare((right.fm.entryStats.entry.fm.tags ?? []).join(' ')),
			table: { width: 'xl', cellOverflow: 'visible', display: TABLE_FIELD_DISPLAYS.tagList },
		}
	}

	protected tableActionsField(): SimpleAnalysisTableFieldDescriptor {
		return {
			key: 'actions',
			usages: ['Table'],
			type: 'text',
			label: () => t('DASHBOARD_ENTRY_COLUMN_ACTIONS'),
			columnFilter: 'none',
			sortable: false,
			table: { width: 'action', display: TABLE_FIELD_DISPLAYS.rowActions },
		}
	}

	// @story [[lucrjournal/fields#^searchable-field-projections]] Defines title and tag search fields shared by simple analysis tables
	// @story [[lucrjournal/fields#^custom-sort-projections]] Defines locale ordering for analysis titles and joined tags
	tableFields(): SimpleAnalysisTableFieldDescriptor[] {
		return [
			this.tableCreatedField(),
			this.tableTitleField(),
			this.tablePositionCountField(),
			this.tableTagsField(),
			this.tableActionsField(),
		]
	}
}
