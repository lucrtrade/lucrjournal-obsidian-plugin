import { Domains } from '../domains'
import { createLogger } from '../logger'

import type { ObsidianPropertyType } from '../domains'
import type { App } from 'obsidian'

const logger = createLogger('metadata')

type MetadataTypeManager = {
	setType: (property: string, type: ObsidianPropertyType) => void;
}

type AppWithMetadataTypeManager = App & {
	metadataTypeManager?: MetadataTypeManager;
}

const LUCR_JOURNAL_PROPERTIES = Domains.flatMap((domain) =>
	flattenBuiltinProperties(domain.builtinProperties()),
)

export function registerPropertyTypes(app: App): void {
	const metadataAwareApp = app as AppWithMetadataTypeManager
	const metadataTypeManager = metadataAwareApp.metadataTypeManager
	if (!metadataTypeManager) {
		logger.warn('metadataTypeManager unavailable; skipped property type registration', {
			properties: LUCR_JOURNAL_PROPERTIES.length,
		})
		return
	}

	for (const property of LUCR_JOURNAL_PROPERTIES) {
		metadataTypeManager.setType(property.property, property.type)
	}

	logger.debug('registered property types', {
		properties: LUCR_JOURNAL_PROPERTIES,
	})
}

function entriesOf<const TObject extends object>(object: TObject) {
	return Object.entries(object) as {
		[Key in keyof TObject]-?: [Key, TObject[Key]]
	}[keyof TObject][]
}

function flattenBuiltinProperties(properties: Record<string, ObsidianPropertyType | undefined>): ReadonlyArray<{
	property: string
	type: ObsidianPropertyType
}> {
	return entriesOf(properties).flatMap(([property, type]) => {
		if (type === undefined) {
			return []
		}

		return [{ property: String(property), type }] as const
	})
}
