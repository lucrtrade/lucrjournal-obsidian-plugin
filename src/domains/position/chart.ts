/// <reference types="vitest/importMeta" />

import { TFile } from 'obsidian'

import { PlatformDomain } from '../platform'
import { SymbolDomain } from '../symbol'
import { resolvePositionSymbolModel } from '../symbol/position-model'

import { derivePositionPlatformWikilink } from './index'

import type { Position } from './index'
import type { DomainRuntimeApp } from '../core/type'
import type { App } from 'obsidian'

type PositionMarker = {
	datetime: string
}

type PositionChartVisibleMark = {
	kind: 'close' | 'open'
	time: number
}

type PositionRecord = Position & Record<string, unknown>

type ResolutionOption = {
	seconds: number
	value: string
}

const DEFAULT_RESOLUTION = '60'
const PREFER_BARS = 300
const PADDING_BARS = 25

const RESOLUTIONS: ResolutionOption[] = [
	{ value: '1', seconds: 60 },
	{ value: '5', seconds: 300 },
	{ value: '15', seconds: 900 },
	{ value: '30', seconds: 1800 },
	{ value: '60', seconds: 3600 },
	{ value: '120', seconds: 7200 },
	{ value: '240', seconds: 14400 },
	{ value: 'D', seconds: 86400 },
	{ value: 'W', seconds: 604800 },
	{ value: 'M', seconds: 2592000 },
]

function extractPositionMarkers(position: Position): PositionMarker[] {
	const record = position as PositionRecord
	const orders = asArray(record.orders)

	if (orders.length > 0) {
		const markers = orders
			.map((order) => extractOrderMarker(order))
			.filter((marker): marker is PositionMarker => marker !== null)

		if (markers.length > 0) {
			return markers
		}
	}

	const markers: PositionMarker[] = []
	const openedAt = readStringField(record, 'opened_at')
	const closedAt = readStringField(record, 'closed_at')

	if (openedAt !== null) {
		markers.push({ datetime: toIsoDatetime(openedAt) })
	}

	if (closedAt !== null) {
		markers.push({ datetime: toIsoDatetime(closedAt) })
	}

	return markers
}

export function computePositionChartTimeframe(position: Position): {
	leftEdgeTime: number
	resolution: string
	rightEdgeTime: number
} {
	const markers = extractPositionMarkers(position)
	const now = Math.floor(Date.now() / 1000)
	const defaultIntervalSeconds = getResolutionSeconds(DEFAULT_RESOLUTION)

	if (markers.length === 0) {
		const rightEdgeTime = now
		return {
			resolution: DEFAULT_RESOLUTION,
			leftEdgeTime: rightEdgeTime - PREFER_BARS * defaultIntervalSeconds,
			rightEdgeTime,
		}
	}

	const timestamps = markers
		.map((marker) => Math.floor(new Date(marker.datetime).getTime() / 1000))
		.filter((timestamp) => Number.isFinite(timestamp))

	if (timestamps.length === 0) {
		const rightEdgeTime = now
		return {
			resolution: DEFAULT_RESOLUTION,
			leftEdgeTime: rightEdgeTime - PREFER_BARS * defaultIntervalSeconds,
			rightEdgeTime,
		}
	}

	const from = Math.min(...timestamps)
	const to = timestamps.length === 1
		? now
		: Math.min(Math.max(...timestamps), now)
	const span = to - from

	if (span === 0) {
		const half = Math.floor(PREFER_BARS / 2)
		const rightEdgeTime = Math.min(to + half * defaultIntervalSeconds, now)
		return {
			resolution: DEFAULT_RESOLUTION,
			leftEdgeTime: rightEdgeTime - PREFER_BARS * defaultIntervalSeconds,
			rightEdgeTime,
		}
	}

	let chosen = RESOLUTIONS.find((option) => option.value === DEFAULT_RESOLUTION) ?? RESOLUTIONS[0]!
	for (const option of RESOLUTIONS) {
		if (span / option.seconds <= PREFER_BARS) {
			chosen = option
			break
		}
	}

	if (span / chosen.seconds > PREFER_BARS) {
		chosen = RESOLUTIONS[RESOLUTIONS.length - 1]!
	}

	const spanBars = Math.ceil(span / chosen.seconds)
	const padding = Math.max(PADDING_BARS, Math.floor((PREFER_BARS - spanBars) / 2))
	const rightEdgeTime = Math.min(to + padding * chosen.seconds, now)

	return {
		resolution: chosen.value,
		leftEdgeTime: from - padding * chosen.seconds,
		rightEdgeTime,
	}
}

export function resolvePositionExchangeId(app: DomainRuntimeApp, position: Position): string | null {
	const platform = derivePositionPlatformWikilink(app, position)
	if (platform === null) {
		return null
	}

	return PlatformDomain.resolveCcxtExchangeId(platform)
}

export function resolvePositionSymbol(app: DomainRuntimeApp, position: Position): string | null {
	const symbolEntry = SymbolDomain.resolveEntry(app, position)
	if (symbolEntry == null) {
		return null
	}

	return resolvePositionSymbolModel(symbolEntry.fm.type).resolveChartSymbolName(symbolEntry.fm.name)
}

export function isPositionChartSupported(app: DomainRuntimeApp, position: Position): boolean {
	return resolvePositionSymbol(app, position) !== null
}

export function resolvePositionChartVisibleMarks(position: Position): PositionChartVisibleMark[] {
	const record = position as PositionRecord
	const marks: PositionChartVisibleMark[] = []
	const openedAt = readStringField(record, 'opened_at')
	const closedAt = readStringField(record, 'closed_at')

	if (openedAt !== null) {
		const timestamp = Math.floor(new Date(toIsoDatetime(openedAt)).getTime() / 1000)
		if (Number.isFinite(timestamp)) {
			marks.push({
				kind: 'open',
				time: timestamp,
			})
		}
	}

	if (closedAt !== null) {
		const timestamp = Math.floor(new Date(toIsoDatetime(closedAt)).getTime() / 1000)
		if (Number.isFinite(timestamp)) {
			marks.push({
				kind: 'close',
				time: timestamp,
			})
		}
	}

	return marks
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function extractOrderMarker(order: unknown): PositionMarker | null {
	if (!isRecord(order)) {
		return null
	}

	const datetime = readStringField(order, 'datetime')
	if (datetime !== null) {
		return { datetime: toIsoDatetime(datetime) }
	}

	const lastTradeTimestamp = order.lastTradeTimestamp
	if (typeof lastTradeTimestamp === 'number' && Number.isFinite(lastTradeTimestamp)) {
		return { datetime: new Date(lastTradeTimestamp).toISOString() }
	}

	const timestamp = order.timestamp
	if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
		return { datetime: new Date(timestamp).toISOString() }
	}

	return null
}

function getResolutionSeconds(resolution: string): number {
	return RESOLUTIONS.find((option) => option.value === resolution)?.seconds
		?? RESOLUTIONS.find((option) => option.value === DEFAULT_RESOLUTION)!.seconds
}

function toIsoDatetime(value: string): string {
	return new Date(value).toISOString()
}

function readStringField(record: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === 'string' && value.trim().length > 0) {
			return value
		}
	}

	return null
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('computePositionChartTimeframe', () => {
		it('uses order markers before fallback timestamps', () => {
			const result = computePositionChartTimeframe({
				lucr_type: 'position',
				opened_at: '2026-03-20T16:31:05+08:00',
				orders: [
					{ lastTradeTimestamp: new Date('2026-03-19T16:31:00Z').getTime() },
					{ lastTradeTimestamp: new Date('2026-03-21T16:31:00Z').getTime() },
				],
			} as unknown as Position)

			expect(result.leftEdgeTime).toBeLessThan(new Date('2026-03-19T16:31:00Z').getTime() / 1000)
			expect(result.rightEdgeTime).toBeGreaterThan(new Date('2026-03-21T16:31:00Z').getTime() / 1000)
		})

		it('falls back to the default timeframe when no markers exist', () => {
			const result = computePositionChartTimeframe({
				lucr_type: 'position',
				symbol: 'BTC/USDT',
			} as unknown as Position)

			expect(result.resolution).toBe('60')
			expect(result.rightEdgeTime - result.leftEdgeTime).toBe(300 * 3600)
		})
	})

	describe('resolvePositionExchangeId', () => {
		it('maps platform wikilinks to ccxt exchange ids', () => {
			const symbolFile = Object.assign(new TFile(), { path: 'LucrJournal/symbols/SBL-Main-BTCUSDT.md' })
			const accountFile = Object.assign(new TFile(), { path: 'LucrJournal/accounts/ACC-Main.md' })
			const app = {
				vault: { getMarkdownFiles: () => [symbolFile, accountFile] },
				metadataCache: {
					getFileCache: (file: TFile) => file.path.endsWith('/SBL-Main-BTCUSDT.md')
						? {
							frontmatter: {
								lucr_type: 'symbol',
								name: 'BTCUSDT',
								account: '[[ACC-Main]]',
							},
						}
						: {
							frontmatter: {
								lucr_type: 'account',
								name: 'Main',
								platform: '[[Binance]]',
							},
						},
				},
			} as unknown as App
			expect(resolvePositionExchangeId(app, {
				lucr_type: 'position',
				symbol: '[[SBL-Main-BTCUSDT]]',
			} as unknown as Position)).toBe('binance')
		})
	})

	describe('resolvePositionSymbol', () => {
		function createChartSymbolApp(type: string | null, name: string) {
			const symbolFile = Object.assign(new TFile(), { path: 'LucrJournal/symbols/SBL-Main-BTCUSDT.md' })
			return {
				vault: { getMarkdownFiles: () => [symbolFile] },
				metadataCache: {
					getFileCache: () => ({
						frontmatter: {
							lucr_type: 'symbol',
							name,
							account: '[[ACC-Main]]',
							type,
						},
					}),
				},
			} as unknown as App
		}

		it('resolves crypto perp and spot chart symbols', () => {
			expect(resolvePositionSymbol(createChartSymbolApp('Crypto_Perp', 'BTCUSDT.P'), {
				lucr_type: 'position',
				symbol: '[[SBL-Main-BTCUSDT]]',
			} as unknown as Position)).toBe('BTCUSDT.P')
			expect(resolvePositionSymbol(createChartSymbolApp('Crypto_Spot', 'BTCUSDT'), {
				lucr_type: 'position',
				symbol: '[[SBL-Main-BTCUSDT]]',
			} as unknown as Position)).toBe('BTCUSDT')
		})

		it('uses crypto perp chart fallback for null symbol type', () => {
			expect(resolvePositionSymbol(createChartSymbolApp(null, 'BTCUSDT.P'), {
				lucr_type: 'position',
				symbol: '[[SBL-Main-BTCUSDT]]',
			} as unknown as Position)).toBe('BTCUSDT.P')
		})

		it('keeps future and cfd symbols unsupported for chart', () => {
			for (const type of ['Future', 'CFD']) {
				expect(resolvePositionSymbol(createChartSymbolApp(type, 'BTCUSDT'), {
					lucr_type: 'position',
					symbol: '[[SBL-Main-BTCUSDT]]',
				} as unknown as Position)).toBeNull()
			}
		})
	})

	describe('resolvePositionChartVisibleMarks', () => {
		it('returns open and close marks when both timestamps exist', () => {
			expect(resolvePositionChartVisibleMarks({
				lucr_type: 'position',
				opened_at: '2026-03-20T16:31:05+08:00',
				closed_at: '2026-03-21T18:45:00+08:00',
			} as unknown as Position)).toEqual([
				{
					kind: 'open',
					time: Math.floor(new Date('2026-03-20T08:31:05.000Z').getTime() / 1000),
				},
				{
					kind: 'close',
					time: Math.floor(new Date('2026-03-21T10:45:00.000Z').getTime() / 1000),
				},
			])
		})
	})
}
