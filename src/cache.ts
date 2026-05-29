/// <reference types="vitest/importMeta" />

import { ArkErrors, type } from 'arktype'

type CacheEnvelope<TValue> = {
	value: TValue
	updatedAt: number
	expiresAt: number | null
}

type CacheGetPolicy = 'strict' | 'stale'

type CacheGetResult<TValue> = {
	hit: boolean
	value: TValue | null
	source: 'memory' | 'indexeddb' | 'miss'
	isExpired: boolean
}

type CacheSetOptions = {
	ttlMs?: number | null
}

type CacheGetOptions = {
	policy?: CacheGetPolicy
}

interface CacheRuntimeApp {
	appId?: string
	vault: object
}

interface CacheTableDefinition<
	KeySchema extends type.Any = type.Any,
	ValueSchema extends type.Any = type.Any,
> {
	key: KeySchema
	value: ValueSchema
	ttlMs?: number
	getExpiresAt?: (ctx: {
		key: KeySchema['infer']
		value: ValueSchema['infer']
		ttlMs: number | null
		updatedAt: number
	}) => number | null
}

type CacheTableMap = Record<string, CacheTableDefinition<type.Any, type.Any>>

type CacheTableKey<TTable extends CacheTableDefinition> = TTable['key']['infer']

type CacheTableValue<TTable extends CacheTableDefinition> = TTable['value']['infer']

type CacheTableMemoryEntry<TTable extends CacheTableDefinition> = {
	key: CacheTableKey<TTable>
	envelope: CacheEnvelope<CacheTableValue<TTable>>
}

type SupportedCacheKey = string | number | Date | SupportedCacheKey[]

interface CacheTableApi<TTable extends CacheTableDefinition = CacheTableDefinition> {
	get: (
		key: CacheTableKey<TTable>,
		options?: CacheGetOptions,
	) => Promise<CacheGetResult<CacheTableValue<TTable>>>
	set: (
		key: CacheTableKey<TTable>,
		value: CacheTableValue<TTable>,
		options?: CacheSetOptions,
	) => Promise<CacheEnvelope<CacheTableValue<TTable>>>
	delete: (key: CacheTableKey<TTable>) => Promise<void>
	clear: () => Promise<void>
	clearExpired: () => Promise<number>
}

interface CacheRuntime<TTables extends CacheTableMap = CacheTableMap> {
	dbName: string
	mode: 'memory-only' | 'indexeddb'
	tables: {
		[TableName in keyof TTables]: CacheTableApi<TTables[TableName]>
	}
}

interface CacheRegistry<TTables extends CacheTableMap = CacheTableMap> {
	dbName: string
	version: number
	tableDefinitions: TTables
	tables: {
		[TableName in keyof TTables]: CacheTableApi<TTables[TableName]>
	}
	bindRuntime: (app: CacheRuntimeApp) => CacheRuntime<TTables>
}
 
export function buildCacheRegistry<const DbName extends string>(
	dbName: DbName,
	options: { version?: number } = {},
) {
	return <const Tables extends CacheTableMap>(
		buildTables: (helpers: {
			table: <TTable extends CacheTableDefinition>(definition: TTable) => TTable
		}) => Tables,
	): CacheRegistry<Tables> => {
		const tableDefinitions = buildTables({
			table: <TTable extends CacheTableDefinition>(definition: TTable) => definition,
		})

		let boundRuntime: CacheRuntime<Tables> | null = null

		const requireBoundRuntime = (): CacheRuntime<Tables> => {
			if (boundRuntime === null) {
				throw new Error(`${dbName}: bindRuntime() must be called before using cache tables`)
			}

			return boundRuntime
		}

		const tables = Object.fromEntries(
			Object.keys(tableDefinitions).map((tableName) => [
				tableName,
				{
					get(key: unknown, getOptions?: CacheGetOptions) {
						return requireBoundRuntime().tables[tableName as keyof Tables].get(
							key,
							getOptions,
						)
					},
					set(key: unknown, value: unknown, setOptions?: CacheSetOptions) {
						return requireBoundRuntime().tables[tableName as keyof Tables].set(
							key,
							value,
							setOptions,
						)
					},
					delete(key: unknown) {
						return requireBoundRuntime().tables[tableName as keyof Tables].delete(
							key,
						)
					},
					clear() {
						return requireBoundRuntime().tables[tableName as keyof Tables].clear()
					},
					clearExpired() {
						return requireBoundRuntime().tables[tableName as keyof Tables].clearExpired()
					},
				},
			]),
		) as CacheRegistry<Tables>['tables']

		const registry: CacheRegistry<Tables> = {
			dbName,
			version: options.version ?? 1,
			tableDefinitions,
			tables,
			bindRuntime(app: CacheRuntimeApp) {
				boundRuntime = createCacheRuntime(app, registry)
				return boundRuntime
			},
		}

		return registry
	}
}

export function bindCacheRuntime<TTables extends CacheTableMap>(
	app: CacheRuntimeApp,
	registry: CacheRegistry<TTables>,
): CacheRuntime<TTables> {
	return registry.bindRuntime(app)
}

function createCacheRuntime<TTables extends CacheTableMap>(
	app: CacheRuntimeApp,
	registry: CacheRegistry<TTables>,
): CacheRuntime<TTables> {
	const appId = resolveCacheAppId(app)

	const dbName = `lucrjournal_${appId}_${registry.dbName}`
	const indexedDb = getIndexedDb()
	const dbPromise = indexedDb === null
		? null
		: openCacheDatabase(indexedDb, dbName, registry.version, Object.keys(registry.tableDefinitions))

	const memoryStores = Object.fromEntries(
		Object.keys(registry.tableDefinitions).map((tableName) => [tableName, new Map()]),
	) as {
		[TableName in keyof TTables]: Map<
			string,
			CacheTableMemoryEntry<TTables[TableName]>
		>
	}

	const tables = Object.fromEntries(
		objectEntries(registry.tableDefinitions).map(([tableName, definition]) => [
			tableName,
			createRuntimeTable(definition, memoryStores[tableName], String(tableName), dbPromise),
		]),
	) as unknown as CacheRuntime<TTables>['tables']

	return {
		dbName,
		mode: dbPromise === null ? 'memory-only' : 'indexeddb',
		tables,
	}
}

function resolveCacheAppId(app: CacheRuntimeApp): string {
	const fromApp = app.appId?.trim()
	if (fromApp !== undefined && fromApp.length > 0) {
		return fromApp
	}

	const vault = app.vault as {
		getName?: () => string
	}
	const fromVaultName = vault.getName?.().trim()
	if (fromVaultName !== undefined && fromVaultName.length > 0) {
		return fromVaultName
	}

	return 'default'
}

function createRuntimeTable<TTable extends CacheTableDefinition>(
	definition: TTable,
	memoryStore: Map<string, CacheTableMemoryEntry<TTable>>,
	tableName: string,
	dbPromise: Promise<IDBDatabase> | null,
): CacheTableApi<TTable> {
	return {
		async get(inputKey, options = {}) {
			const policy = options.policy ?? 'strict'
			const key = assertCacheKey(definition, inputKey)
			const memoryKey = toMemoryKey(key)
			const now = Date.now()
			const memoryEntry = memoryStore.get(memoryKey) ?? null

			if (memoryEntry !== null) {
				const envelope = refineEnvelope(definition, memoryEntry.envelope)
				if (envelope === null) {
					memoryStore.delete(memoryKey)
					if (dbPromise !== null) {
						await idbDelete(await dbPromise, tableName, key)
					}

					return toMissResult()
				}

				if (!isExpiredEnvelope(envelope, now) || policy === 'stale') {
					return toHitResult(envelope, 'memory', now)
				}

				memoryStore.delete(memoryKey)
				if (dbPromise !== null) {
					await idbDelete(await dbPromise, tableName, key)
				}

				return toMissResult()
			}

			if (dbPromise === null) {
				return toMissResult()
			}

			const storedEnvelope = await idbGet(await dbPromise, tableName, key)
			if (storedEnvelope === null) {
				return toMissResult()
			}

			const envelope = refineEnvelope(definition, storedEnvelope)
			if (envelope === null) {
				await idbDelete(await dbPromise, tableName, key)
				return toMissResult()
			}

			if (isExpiredEnvelope(envelope, now) && policy === 'strict') {
				await idbDelete(await dbPromise, tableName, key)
				return toMissResult()
			}

			memoryStore.set(memoryKey, { key, envelope })
			return toHitResult(envelope, 'indexeddb', now)
		},
		async set(inputKey, inputValue, options = {}) {
			const key = assertCacheKey(definition, inputKey)
			const value = definition.value.assert(inputValue) as unknown as CacheTableValue<TTable>
			const updatedAt = Date.now()
			const envelope = assertEnvelope(definition, {
				value,
				updatedAt,
				expiresAt: resolveExpiresAt(definition, key, value, updatedAt, options.ttlMs),
			})

			memoryStore.set(toMemoryKey(key), { key, envelope })
			if (dbPromise !== null) {
				await idbPut(await dbPromise, tableName, key, envelope)
			}

			return envelope
		},
		async delete(inputKey) {
			const key = assertCacheKey(definition, inputKey)
			memoryStore.delete(toMemoryKey(key))
			if (dbPromise !== null) {
				await idbDelete(await dbPromise, tableName, key)
			}
		},
		async clear() {
			memoryStore.clear()
			if (dbPromise !== null) {
				await idbClear(await dbPromise, tableName)
			}
		},
		async clearExpired() {
			const now = Date.now()
			const deletedKeys = new Set<string>()

			for (const [memoryKey, entry] of memoryStore.entries()) {
				const envelope = refineEnvelope(definition, entry.envelope)
				if (envelope === null) {
					memoryStore.delete(memoryKey)
					deletedKeys.add(memoryKey)
					continue
				}

				if (!isExpiredEnvelope(envelope, now)) {
					continue
				}

				memoryStore.delete(memoryKey)
				deletedKeys.add(memoryKey)
			}

			if (dbPromise === null) {
				return deletedKeys.size
			}

			const db = await dbPromise
			const keys = await idbGetAllKeys(db, tableName)
			for (const key of keys) {
				const assertedKey = assertCacheKey(definition, key)
				const storedEnvelope = await idbGet(db, tableName, assertedKey)
				const envelope = refineEnvelope(definition, storedEnvelope)
				if (envelope === null) {
					await idbDelete(db, tableName, assertedKey)
					deletedKeys.add(toMemoryKey(assertedKey))
					continue
				}

				if (!isExpiredEnvelope(envelope, now)) {
					continue
				}

				await idbDelete(db, tableName, assertedKey)
				deletedKeys.add(toMemoryKey(assertedKey))
			}

			return deletedKeys.size
		},
	}
}

function resolveExpiresAt<TTable extends CacheTableDefinition>(
	definition: TTable,
	key: CacheTableKey<TTable>,
	value: CacheTableValue<TTable>,
	updatedAt: number,
	overrideTtlMs?: number | null,
): number | null {
	const ttlMs = overrideTtlMs ?? definition.ttlMs ?? null
	if (definition.getExpiresAt !== undefined) {
		return definition.getExpiresAt({
			key,
			value,
			ttlMs,
			updatedAt,
		})
	}

	if (ttlMs === null) {
		return null
	}

	return updatedAt + ttlMs
}

function assertEnvelope<TTable extends CacheTableDefinition>(
	definition: TTable,
	input: unknown,
): CacheEnvelope<CacheTableValue<TTable>> {
	const envelope = refineEnvelope(definition, input)
	if (envelope === null) {
		throw new Error('cache envelope is invalid')
	}

	return envelope
}

function refineEnvelope<TTable extends CacheTableDefinition>(
	definition: TTable,
	input: unknown,
): CacheEnvelope<CacheTableValue<TTable>> | null {
	if (!isRecord(input)) {
		return null
	}

	const updatedAt = input.updatedAt
	const expiresAt = input.expiresAt
	if (typeof updatedAt !== 'number') {
		return null
	}
	if (expiresAt !== null && typeof expiresAt !== 'number') {
		return null
	}

	const parseValue = definition.value as unknown as (value: unknown) => CacheTableValue<TTable> | ArkErrors
	const refinedValue = parseValue(input.value)
	if (refinedValue instanceof ArkErrors) {
		return null
	}

	return {
		value: refinedValue,
		updatedAt,
		expiresAt,
	}
}

function assertCacheKey<TTable extends CacheTableDefinition>(
	definition: TTable,
	input: unknown,
): CacheTableKey<TTable> {
	const key = definition.key.assert(input) as unknown as CacheTableKey<TTable>
	if (!isValidCacheKey(key)) {
		throw new Error('cache key must be a valid IndexedDB key')
	}

	return key
}

function toHitResult<TValue>(
	envelope: CacheEnvelope<TValue>,
	source: 'memory' | 'indexeddb',
	now: number,
): CacheGetResult<TValue> {
	return {
		hit: true,
		value: envelope.value,
		source,
		isExpired: isExpiredEnvelope(envelope, now),
	}
}

function toMissResult<TValue>(): CacheGetResult<TValue> {
	return {
		hit: false,
		value: null,
		source: 'miss',
		isExpired: false,
	}
}

function isExpiredEnvelope<TValue>(envelope: CacheEnvelope<TValue>, now: number): boolean {
	return envelope.expiresAt !== null && envelope.expiresAt <= now
}

function isValidCacheKey(input: unknown): input is SupportedCacheKey {
	if (typeof input === 'string' || typeof input === 'number') {
		return true
	}

	if (input instanceof Date) {
		return !Number.isNaN(input.getTime())
	}

	if (!Array.isArray(input)) {
		return false
	}

	return input.every((item) => isValidCacheKey(item))
}

function toMemoryKey(key: SupportedCacheKey): string {
	return JSON.stringify(serializeCacheKey(key))
}

function serializeCacheKey(key: SupportedCacheKey): unknown {
	if (typeof key === 'string' || typeof key === 'number') {
		return key
	}

	if (key instanceof Date) {
		return {
			type: 'date',
			value: key.toISOString(),
		}
	}

	return serializeCacheKeyArray(key)
}

function serializeCacheKeyArray(key: readonly SupportedCacheKey[]): unknown[] {
	const serialized: unknown[] = []
	for (const item of key) {
		serialized.push(serializeCacheKey(item))
	}

	return serialized
}

function getIndexedDb(): IDBFactory | null {
	return typeof window === 'undefined' || typeof window.indexedDB === 'undefined' ? null : window.indexedDB
}

function openCacheDatabase(
	indexedDb: IDBFactory,
	name: string,
	version: number,
	storeNames: string[],
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDb.open(name, version)

		request.onerror = () => {
			reject(request.error ?? new Error(`failed to open IndexedDB database: ${name}`))
		}

		request.onupgradeneeded = () => {
			const db = request.result
			for (const storeName of Array.from(db.objectStoreNames)) {
				if (!storeNames.includes(storeName)) {
					db.deleteObjectStore(storeName)
				}
			}

			for (const storeName of storeNames) {
				if (!db.objectStoreNames.contains(storeName)) {
					db.createObjectStore(storeName)
				}
			}
		}

		request.onsuccess = () => {
			resolve(request.result)
		}
	})
}

function idbGet(db: IDBDatabase, tableName: string, key: IDBValidKey): Promise<unknown> {
	return waitForRequest(db.transaction(tableName, 'readonly').objectStore(tableName).get(key))
}

function idbPut(
	db: IDBDatabase,
	tableName: string,
	key: IDBValidKey,
	envelope: CacheEnvelope<unknown>,
): Promise<void> {
	return waitForRequest(db.transaction(tableName, 'readwrite').objectStore(tableName).put(envelope, key)).then(() => undefined)
}

function idbDelete(db: IDBDatabase, tableName: string, key: IDBValidKey): Promise<void> {
	return waitForRequest(db.transaction(tableName, 'readwrite').objectStore(tableName).delete(key)).then(() => undefined)
}

function idbClear(db: IDBDatabase, tableName: string): Promise<void> {
	return waitForRequest(db.transaction(tableName, 'readwrite').objectStore(tableName).clear()).then(() => undefined)
}

function idbGetAllKeys(db: IDBDatabase, tableName: string): Promise<IDBValidKey[]> {
	return waitForRequest(db.transaction(tableName, 'readonly').objectStore(tableName).getAllKeys())
}

function waitForRequest<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
	return new Promise((resolve, reject) => {
		request.onerror = () => {
			reject(request.error ?? new Error('IndexedDB request failed'))
		}
		request.onsuccess = () => {
			resolve(request.result)
		}
	})
}

function objectEntries<T extends Record<string, unknown>>(input: T): Array<{
	[K in keyof T]: [K, T[K]]
}[keyof T]> {
	return Object.entries(input) as Array<{
		[K in keyof T]: [K, T[K]]
	}[keyof T]>
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === 'object' && input !== null && !Array.isArray(input)
}

if (import.meta.vitest) {
	const { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } = import.meta.vitest

	const UserType = type({
		name: 'string',
	})

	function createDemoRegistry() {
		return buildCacheRegistry('demo')(({ table }) => ({
			users: table({
				key: type('string'),
				value: UserType,
				ttlMs: 1_000,
			}),
		}))
	}

	describe('cache registry', () => {
		let originalIndexedDb: IDBFactory | undefined

		beforeEach(() => {
			originalIndexedDb = typeof window === 'undefined' ? undefined : window.indexedDB
			vi.stubGlobal('window', { indexedDB: originalIndexedDb })
		})

		afterEach(() => {
			vi.restoreAllMocks()
			if (originalIndexedDb === undefined) {
				vi.unstubAllGlobals()
				return
			}

			window.indexedDB = originalIndexedDb
			vi.unstubAllGlobals()
		})

		it('preserves table key and value types', async () => {
			const registry = createDemoRegistry()
			expectTypeOf(registry.tables.users.get).toExtend<
				(key: string, options?: CacheGetOptions) => Promise<CacheGetResult<{ name: string }>>
			>()
			expectTypeOf(registry.tables.users.set).toExtend<
				(key: string, value: { name: string }, options?: CacheSetOptions) => Promise<CacheEnvelope<{ name: string }>>
			>()
			expect(registry.dbName).toBe('demo')
		})

		it('falls back to memory-only mode when IndexedDB is unavailable', async () => {
			delete (window as unknown as Record<string, unknown>).indexedDB
			const registry = createDemoRegistry()
			const runtime = bindCacheRuntime({ appId: 'vault-a', vault: {} }, registry)

			expect(runtime.mode).toBe('memory-only')
			await registry.tables.users.set('alpha', { name: 'Alice' })

			await expect(registry.tables.users.get('alpha')).resolves.toEqual({
				hit: true,
				value: { name: 'Alice' },
				source: 'memory',
				isExpired: false,
			})
		})

		it('falls back to IndexedDB after memory miss and backfills memory', async () => {
			window.indexedDB = new FakeIndexedDB() as unknown as IDBFactory

			const firstRegistry = createDemoRegistry()
			bindCacheRuntime({ appId: 'vault-a', vault: {} }, firstRegistry)
			await firstRegistry.tables.users.set('alpha', { name: 'Alice' })

			const secondRegistry = createDemoRegistry()
			bindCacheRuntime({ appId: 'vault-a', vault: {} }, secondRegistry)

			await expect(secondRegistry.tables.users.get('alpha')).resolves.toEqual({
				hit: true,
				value: { name: 'Alice' },
				source: 'indexeddb',
				isExpired: false,
			})

			await expect(secondRegistry.tables.users.get('alpha')).resolves.toEqual({
				hit: true,
				value: { name: 'Alice' },
				source: 'memory',
				isExpired: false,
			})
		})

		it('treats expired entries as miss in strict mode and clears them', async () => {
			window.indexedDB = new FakeIndexedDB() as unknown as IDBFactory
			const registry = createDemoRegistry()
			bindCacheRuntime({ appId: 'vault-a', vault: {} }, registry)

			vi.spyOn(Date, 'now').mockReturnValue(1_000)
			await registry.tables.users.set('alpha', { name: 'Alice' })

			vi.spyOn(Date, 'now').mockReturnValue(2_500)
			await expect(registry.tables.users.get('alpha', { policy: 'strict' })).resolves.toEqual({
				hit: false,
				value: null,
				source: 'miss',
				isExpired: false,
			})

			const reloadedRegistry = createDemoRegistry()
			bindCacheRuntime({ appId: 'vault-a', vault: {} }, reloadedRegistry)

			await expect(reloadedRegistry.tables.users.get('alpha')).resolves.toEqual({
				hit: false,
				value: null,
				source: 'miss',
				isExpired: false,
			})
		})

		it('returns stale entries when stale policy is requested', async () => {
			window.indexedDB = new FakeIndexedDB() as unknown as IDBFactory
			const registry = createDemoRegistry()
			bindCacheRuntime({ appId: 'vault-a', vault: {} }, registry)

			vi.spyOn(Date, 'now').mockReturnValue(1_000)
			await registry.tables.users.set('alpha', { name: 'Alice' })

			vi.spyOn(Date, 'now').mockReturnValue(2_500)
			await expect(registry.tables.users.get('alpha', { policy: 'stale' })).resolves.toEqual({
				hit: true,
				value: { name: 'Alice' },
				source: 'memory',
				isExpired: true,
			})
		})

		it('allows per-entry ttl override', async () => {
			delete (window as unknown as Record<string, unknown>).indexedDB
			const registry = createDemoRegistry()
			bindCacheRuntime({ appId: 'vault-a', vault: {} }, registry)

			vi.spyOn(Date, 'now').mockReturnValue(1_000)
			await registry.tables.users.set('alpha', { name: 'Alice' }, { ttlMs: 5_000 })

			vi.spyOn(Date, 'now').mockReturnValue(4_000)
			await expect(registry.tables.users.get('alpha')).resolves.toEqual({
				hit: true,
				value: { name: 'Alice' },
				source: 'memory',
				isExpired: false,
			})
		})

		it('falls back to vault name when appId is missing', () => {
			const registry = createDemoRegistry()
			const runtime = bindCacheRuntime({
				vault: {
					getName: () => 'MyVault',
				},
			}, registry)
			expect(runtime.dbName).toBe('lucrjournal_MyVault_demo')
		})

		it('falls back to default when appId and vault name are both missing', () => {
			const registry = createDemoRegistry()
			const runtime = bindCacheRuntime({ vault: {} }, registry)
			expect(runtime.dbName).toBe('lucrjournal_default_demo')
		})
	})

	class FakeRequest {
		result!: unknown
		error: DOMException | null = null
		onsuccess: ((this: IDBRequest, ev: Event) => unknown) | null = null
		onerror: ((this: IDBRequest, ev: Event) => unknown) | null = null
	}

	class FakeOpenRequest extends FakeRequest {
		declare onupgradeneeded: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null
	}

	class FakeIndexedDB {
		private readonly databases = new Map<string, FakeDatabase>()

		open(name: string, version?: number): IDBOpenDBRequest {
			const request = new FakeOpenRequest()
			queueMicrotask(() => {
				const currentVersion = version ?? 1
				let database = this.databases.get(name) ?? null
				const needsUpgrade = database?.version !== currentVersion

				if (database === null) {
					database = new FakeDatabase(name, currentVersion)
					this.databases.set(name, database)
				} else if (needsUpgrade) {
					database.version = currentVersion
				}

				request.result = database
				if (needsUpgrade && request.onupgradeneeded) {
					request.onupgradeneeded.call(
						request as unknown as IDBOpenDBRequest,
						new Event('upgradeneeded') as IDBVersionChangeEvent,
					)
				}
				request.onsuccess?.call(request as unknown as IDBRequest, new Event('success'))
			})

			return request as unknown as IDBOpenDBRequest
		}
	}

	class FakeDatabase {
		public readonly objectStoreNames = new FakeDomStringList()

		public constructor(
			public readonly name: string,
			public version: number,
		) {}

		private readonly stores = new Map<string, Map<string, unknown>>()

		createObjectStore(name: string): IDBObjectStore {
			if (!this.stores.has(name)) {
				this.stores.set(name, new Map())
				this.objectStoreNames.add(name)
			}

			return new FakeObjectStore(this.stores.get(name)!, name) as unknown as IDBObjectStore
		}

		deleteObjectStore(name: string): void {
			this.stores.delete(name)
			this.objectStoreNames.delete(name)
		}

		transaction(name: string): IDBTransaction {
			const store = this.stores.get(name)
			if (store === undefined) {
				throw new Error(`missing object store: ${name}`)
			}

			return {
				objectStore: () => new FakeObjectStore(store, name) as unknown as IDBObjectStore,
			} as unknown as IDBTransaction
		}
	}

	class FakeDomStringList {
		private readonly values = new Set<string>()

		get length(): number {
			return this.values.size
		}

		[Symbol.iterator](): IterableIterator<string> {
			return this.values.values()
		}

		add(value: string): void {
			this.values.add(value)
		}

		delete(value: string): void {
			this.values.delete(value)
		}

		contains(value: string): boolean {
			return this.values.has(value)
		}

		item(index: number): string | null {
			return Array.from(this.values)[index] ?? null
		}
	}

	class FakeObjectStore {
		public constructor(
			private readonly store: Map<string, unknown>,
			private readonly name: string,
		) {}

		get(key: IDBValidKey): IDBRequest {
			return createStoreRequest(this.store.get(toMemoryKey(key as SupportedCacheKey)) ?? null) as unknown as IDBRequest
		}

		put(value: unknown, key: IDBValidKey): IDBRequest {
			this.store.set(toMemoryKey(key as SupportedCacheKey), value)
			return createStoreRequest(key) as unknown as IDBRequest
		}

		delete(key: IDBValidKey): IDBRequest {
			this.store.delete(toMemoryKey(key as SupportedCacheKey))
			return createStoreRequest(undefined) as unknown as IDBRequest
		}

		clear(): IDBRequest {
			this.store.clear()
			return createStoreRequest(undefined) as unknown as IDBRequest
		}

		getAllKeys(): IDBRequest {
			const keys = Array.from(this.store.keys()).map((key) => JSON.parse(key) as IDBValidKey)
			return createStoreRequest(keys) as unknown as IDBRequest
		}
	}

	function createStoreRequest(result: unknown): FakeRequest {
		const request = new FakeRequest()
		queueMicrotask(() => {
			request.result = result
			request.onsuccess?.call(request as unknown as IDBRequest, new Event('success'))
		})
		return request
	}
}
