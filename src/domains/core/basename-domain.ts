import { sanitizeObsidianFileName } from '../../utils'

import {
	assertNoPersistedEntryBasenameConflict,
	hasPersistedEntryBasenameConflict,
	PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR,
	type CreateEntryContext,
	type CreateEntryDescriptor,
} from './entry-writer'
import { DomainBase } from './factory'
import { defineForm, type AnyFormDefinition, type FormDefinition, type FormValues } from './form'

import type { DomainDefinitionOptions } from './type'
import type { type } from 'arktype'
import type { App } from 'obsidian'

type NameFormShape = {
	name: { type: 'text'; label: string; required?: boolean }
}

type BasenameFormDefinition = AnyFormDefinition & {
	name: { type: 'text' }
}

export abstract class BasenameDomainBase<
	const Name extends string,
	const Schema extends type.Any,
	const F extends BasenameFormDefinition = FormDefinition<NameFormShape>,
> extends DomainBase<Name, Schema, F> {
	abstract override readonly name: Name
	abstract override readonly schema: Schema
	abstract override readonly options: DomainDefinitionOptions
	protected abstract readonly folderName: string
	protected abstract readonly nameRequiredError: string
	override readonly formDefinition = defineForm<NameFormShape>({
		name: {
			type: 'text',
			label: this.nameLabel(),
			required: true,
			validate: (value, _values, context) => this.validateNameField(value, context.app),
		},
	} as const) as unknown as F
	// @story [[lucrjournal/domain-model#^basename-domain-identity]] Keeps basename-driven names out of payload and body content
	override readonly createEntryDescriptor = {
		buildId: () => this.name,
		buildPayload: (formValue: FormValues<F>, ctx: CreateEntryContext) => {
			this.assertName(formValue.name)
			return this.schema.assert({
				lucr_type: this.name,
				...this.buildPayloadFields(formValue, ctx),
			})
		},
		validate: (formValue: FormValues<F>, app: App) =>
			this.validateNameConflict(formValue.name, app),
		buildBody: () => '',
		buildFileName: (_entry: Schema['infer'], _ctx: CreateEntryContext, formValue: FormValues<F>) => {
			const fileBaseName = this.normalizeName(formValue.name)
			if (fileBaseName !== '') {
				return fileBaseName
			}
			throw new Error(this.nameRequiredError)
		},
	} satisfies CreateEntryDescriptor<FormValues<F>, Schema['infer']>

	protected buildPayloadFields(_formValue: FormValues<F>, _ctx: CreateEntryContext): Record<string, unknown> {
		return {}
	}

	protected nameLabel() {
		return 'DASHBOARD_ENTRY_FIELD_NAME_LABEL'
	}

	protected normalizeName(value: string) {
		return sanitizeObsidianFileName(value).trim()
	}

	protected validateNameField(value: string, app?: App) {
		if (this.normalizeName(value).length === 0) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_REQUIRED'
		}
		if (app !== undefined && hasPersistedEntryBasenameConflict(app, this.folderName, value)) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE'
		}
		return undefined
	}

	protected validateNameConflict(value: string, app: App) {
		assertNoPersistedEntryBasenameConflict(app, this.folderName, value)
	}

	override toCreateEntryErrorMessageKey(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === this.nameRequiredError) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_REQUIRED' as const
		}
		if (message === PERSISTED_ENTRY_BASENAME_CONFLICT_ERROR) {
			return 'DASHBOARD_ENTRY_FIELD_NAME_DUPLICATE' as const
		}
		return null
	}

	private assertName(value: string) {
		if (this.normalizeName(value).length === 0) {
			throw new Error(this.nameRequiredError)
		}
	}
}
