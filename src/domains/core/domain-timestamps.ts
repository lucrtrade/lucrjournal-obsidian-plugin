import { getCurrentTimeZoneSetting } from '../../settings/plugin-settings'
import {
	coerceDatetime,
	coerceFrontmatterField,
	type CoercibleFrontmatter,
} from '../../utils/frontmatter-coerce'
import { buildIsoDatetimeInTimeZone } from '../../utils/relative-time'

import { DatetimeType } from './constant'

export const DOMAIN_TIMESTAMP_FIELDS = {
	'created?': DatetimeType.or('null'),
	'modified?': DatetimeType.or('null'),
} as const

export function applyDomainTimestampCoerce<T extends Record<string, unknown>>(
	record: CoercibleFrontmatter<T>,
) {
	coerceFrontmatterField(record, 'created' as Extract<keyof T, string>, coerceDatetime)
	coerceFrontmatterField(record, 'modified' as Extract<keyof T, string>, coerceDatetime)
	return record
}

export function buildDomainTimestamp(date: Date = new Date()): string {
	return buildIsoDatetimeInTimeZone(date, getCurrentTimeZoneSetting())
}

export function buildDomainTimestamps(date: Date = new Date()) {
	const timestamp = buildDomainTimestamp(date)
	return {
		created: timestamp,
		modified: timestamp,
	} as const
}
