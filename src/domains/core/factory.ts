import { ArkErrors } from 'arktype'
import { type App } from 'obsidian'

import { cloneFrontmatterRecord, normalizeLucrTypeName } from '../../utils/frontmatter-coerce'

import { executeCreateEntry, type CreateEntryContext, type CreateEntryDescriptor } from './entry-writer'
import {
	type AnyFormDefinition,
	buildInitialFormValues as buildInitialFormValuesFromDefinition,
	synchronizeControlledFormValues,
	type FormCopyContext,
	type FormValues,
} from './form'

import type { DatetimeType } from './constant'
import type {
	DomainDefinitionOptions,
	DomainPersistedEntry,
	DomainRuntimeApp,
} from './type'
import type { CoercibleFrontmatter } from '../../utils/frontmatter-coerce'
import type { type } from 'arktype'
import type { TFile } from 'obsidian'

export type TypedFormEntry<F extends AnyFormDefinition> = {
	[K in keyof F]-?: [K, F[K]]
}[keyof F]

export type ObsidianPropertyType =
  | 'text'
  | 'multitext'
  | 'checkbox'
  | 'datetime'
  | 'number'

type DatetimeBrand = typeof DatetimeType.infer

type PropertyTypeForValue<Value> =
	[Exclude<Value, null | undefined>] extends [DatetimeBrand]
		? 'datetime'
		: [Exclude<Value, null | undefined>] extends [boolean]
			? 'checkbox'
			: [Exclude<Value, null | undefined>] extends [number]
				? 'number'
				: [Exclude<Value, null | undefined>] extends [string]
					? 'text'
					: [Exclude<Value, null | undefined>] extends [readonly string[]]
						? 'multitext'
						: never

type BuiltinPropertiesForSchema<TSchema extends type.Any> = Partial<{
	[Key in keyof TSchema['infer'] as
	PropertyTypeForValue<TSchema['infer'][Key]> extends never
		? never
		: Key
	]: PropertyTypeForValue<TSchema['infer'][Key]>
}>

type BeforeSaveArgs<Patch extends Record<string, unknown>> = {
	app: App
	file: TFile
	previousRecord: Record<string, unknown>
	record: Record<string, unknown>
	patch: Patch
}

export function typedFormEntries<F extends AnyFormDefinition>(definition: F): TypedFormEntry<F>[] {
	return Object.entries(definition) as TypedFormEntry<F>[]
}

// @story [[lucrjournal/domain-model#^domain-descriptor-contract]] Defines the required contract shared by every domain descriptor
export abstract class DomainBase<
	const Name extends string,
	const Schema extends type.Any,
	const F extends AnyFormDefinition,
> {
	abstract readonly name: Name
	abstract readonly schema: Schema
	abstract readonly options: DomainDefinitionOptions
	abstract readonly formDefinition: F
	abstract readonly createEntryDescriptor: CreateEntryDescriptor<FormValues<F>, Schema['infer']>
	abstract toDebugLabel(input: Schema['infer']): string

	toCreateEntryErrorMessageKey(_error: unknown): string | null {
		return null
	}

	// @story [[lucrjournal/domain-model#^register-domain-property-types]] Supplies the common persisted datetime property types
	builtinProperties(): BuiltinPropertiesForSchema<Schema> {
		if (this.options.persisted === null) {
			return {}
		}

		return {
			created: 'datetime',
			modified: 'datetime',
		} as BuiltinPropertiesForSchema<Schema>
	}

	coerce?(record: CoercibleFrontmatter<Schema['inferIn']>): CoercibleFrontmatter<Schema['inferIn']>

	beforeSave?<Patch extends Record<string, unknown>>(
		args: BeforeSaveArgs<Patch>,
	): void

	protected applyCoerce(input: unknown): unknown {
		if (!this.coerce) {
			return input 
		}
		const record = cloneFrontmatterRecord<Schema['inferIn']>(input)
		return record === null ? input : this.coerce(record)
	}

	refine(input: unknown): Schema['infer'] | null {
		return refineSchema(this.schema, this.applyCoerce(input))
	}

	buildInitialFormValues(context: FormCopyContext = {}): FormValues<F> {
		return synchronizeControlledFormValues(
			this.formDefinition,
			buildInitialFormValuesFromDefinition(this.formDefinition),
			context,
		)
	}

	synchronizeFormValues(values: FormValues<F>, context: FormCopyContext = {}): FormValues<F> {
		return synchronizeControlledFormValues(this.formDefinition, values, context)
	}

	async createEntry(
		app: App,
		formValue: FormValues<F>,
		ctx?: CreateEntryContext,
	) {
		return await executeCreateEntry(this, this.createEntryDescriptor, app, formValue, ctx)
	}

	// @story [[lucrjournal/domain-model#^read-domain-entries]] Routes cached frontmatter through type matching, coercion, and schema refinement
	totalEntries(app: DomainRuntimeApp): DomainPersistedEntry<Schema['infer']>[] {
		return app.vault
			.getMarkdownFiles()
			.flatMap((file) => {
				const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter
				if (!hasMatchingLucrType(frontmatter, this.name)) {
					return [] 
				}
				const refined = refineSchema(this.schema, this.applyCoerce(frontmatter))
				if (refined === null) {
					return [] 
				}
				return [{ file, fm: refined }]
			})
	}

	normalizePatch(patch: Record<string, unknown>): Record<string, unknown> {
		return patch
	}

	async updateFields<Patch extends Record<string, unknown>>(
		app: App,
		file: TFile,
		patch: Patch,
	): Promise<Schema['infer']> {
		return await this.updateFrontmatterWithPatch(app, file, this.normalizePatch(patch))
	}

	// @story [[lucrjournal/domain-model#^update-domain-entry]] Applies patches atomically against the latest frontmatter and validates before replacement
	protected async updateFrontmatterWithPatch<Patch extends Record<string, unknown>>(
		app: App,
		file: TFile,
		patch: Patch,
	): Promise<Schema['infer']> {
		let nextValue: Schema['infer'] | null = null

		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			const previousRecord = isRecord(frontmatter) ? { ...frontmatter } : {}
			const nextRecord = {
				...previousRecord,
				...patch,
			}

			const coercedRecord = this.applyCoerce(nextRecord)
			if (isRecord(coercedRecord)) {
				assignRecord(nextRecord, coercedRecord)
			}

			this.beforeSave?.({
				app,
				file,
				previousRecord,
				record: nextRecord,
				patch,
			})

			const refined = this.refine(nextRecord)
			if (refined === null) {
				throw new Error(`Invalid ${this.name} frontmatter after update`)
			}

			replaceRecord(frontmatter as Record<string, unknown>, nextRecord)
			nextValue = refined
		})

		if (nextValue === null) {
			throw new Error(`${this.name} update did not produce a value`)
		}

		return nextValue
	}
}

function refineSchema<Schema extends type.Any>(
	schema: Schema,
	input: unknown,
): Schema['infer'] | null {
	const refined = (schema as unknown as (value: unknown) => Schema['infer'] | ArkErrors)(input)
	return refined instanceof ArkErrors ? null : refined
}

function hasMatchingLucrType(
	frontmatter: unknown,
	name: string,
): frontmatter is Record<string, unknown> {
	if (!isRecord(frontmatter)) {
		return false 
	}
	return normalizeLucrTypeName(frontmatter.lucr_type) === normalizeLucrTypeName(name)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assignRecord(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
) {
	for (const key of Object.keys(target)) {
		delete target[key]
	}
	Object.assign(target, source)
}

function replaceRecord(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
) {
	for (const key of Object.keys(target)) {
		if (!Object.prototype.hasOwnProperty.call(source, key)) {
			delete target[key]
		}
	}
	Object.assign(target, source)
}
