import * as Obsidian from 'obsidian'

import { toSymbolLogoUrl } from '../domains/symbol/catalog'

const SYMBOL_LOGO_CACHE_PREFIX = 'lucrjournal:symbol-logo:'
const PendingSymbolLogoFetches = new Map<string, Promise<string | null>>()

type SymbolLogoRuntime = typeof window & {
	localStorage?: Storage
	window?: Window & typeof window
}

export function getTradingViewSymbolLogoUrl(logo: string | null | undefined): string | null {
	return toSymbolLogoUrl(logo)
}

export function readCachedSymbolLogoSrc(logo: string | null | undefined): string | null {
	const logoUrl = getTradingViewSymbolLogoUrl(logo)
	const storage = getSymbolLogoStorage()
	if (logoUrl === null || storage === null) {
		return null
	}

	return storage.getItem(symbolLogoCacheKey(logoUrl))
}

export function loadCachedSymbolLogoSrc(logo: string | null | undefined): Promise<string | null> {
	const logoUrl = getTradingViewSymbolLogoUrl(logo)
	if (logoUrl === null) {
		return Promise.resolve(null)
	}

	const cachedLogoSrc = readCachedSymbolLogoSrc(logoUrl)
	if (cachedLogoSrc !== null) {
		return Promise.resolve(cachedLogoSrc)
	}

	const pendingLogoFetch = PendingSymbolLogoFetches.get(logoUrl)
	if (pendingLogoFetch !== undefined) {
		return pendingLogoFetch
	}

	const logoFetch = fetchSymbolLogoDataUrl(logoUrl)
		.then((logoSrc) => {
			if (logoSrc !== null) {
				getSymbolLogoStorage()?.setItem(symbolLogoCacheKey(logoUrl), logoSrc)
			}

			return logoSrc
		})
		.catch(() => null)
		.finally(() => PendingSymbolLogoFetches.delete(logoUrl))

	PendingSymbolLogoFetches.set(logoUrl, logoFetch)
	return logoFetch
}

function symbolLogoCacheKey(logoUrl: string): string {
	return `${SYMBOL_LOGO_CACHE_PREFIX}${logoUrl}`
}

function getSymbolLogoStorage(): Storage | null {
	return getSymbolLogoRuntime().localStorage ?? null
}

function getSymbolLogoRuntime(): SymbolLogoRuntime {
	return window
}

async function fetchSymbolLogoDataUrl(logoUrl: string): Promise<string | null> {
	const response = await Obsidian.requestUrl({
		method: 'GET',
		throw: false,
		url: logoUrl,
	})
	if (response.status < 200 || response.status >= 300) {
		return null
	}

	return `data:image/svg+xml;base64,${arrayBufferToBase64(response.arrayBuffer)}`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	}

	return btoa(binary)
}

if (import.meta.vitest) {
	const { afterEach, beforeEach, describe, expect, it, vi } = import.meta.vitest

	const logoUrl = 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100.svg'

	function installLocalStorage() {
		const values = new Map<string, string>()
		const runtime = getSymbolLogoRuntime()
		Object.defineProperty(runtime, 'localStorage', {
			configurable: true,
			value: {
				clear: () => values.clear(),
				getItem: (key: string) => values.get(key) ?? null,
				key: (index: number) => Array.from(values.keys())[index] ?? null,
				removeItem: (key: string) => values.delete(key),
				setItem: (key: string, value: string) => values.set(key, value),
				get length() {
					return values.size
				},
			},
		})
		return values
	}

	function installRequestUrl() {
		return vi.spyOn(Obsidian, 'requestUrl').mockResolvedValue({
			arrayBuffer: new TextEncoder().encode('<svg/>').buffer,
			headers: { 'content-type': 'image/svg+xml' },
			status: 200,
		} as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>)
	}

	beforeEach(() => {
		vi.stubGlobal('window', {})
		installLocalStorage()
		installRequestUrl()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	describe('getTradingViewSymbolLogoUrl', () => {
		it('returns persisted TradingView symbol logo URL', () => {
			expect(getTradingViewSymbolLogoUrl(logoUrl)).toBe(logoUrl)
		})

		it('returns null when logo metadata is empty', () => {
			expect(getTradingViewSymbolLogoUrl('')).toBeNull()
			expect(getTradingViewSymbolLogoUrl(null)).toBeNull()
		})
	})

	describe('loadCachedSymbolLogoSrc', () => {
		it('dedupes concurrent logo URL fetches', async () => {
			const [firstLogoSrc, secondLogoSrc] = await Promise.all([
				loadCachedSymbolLogoSrc(logoUrl),
				loadCachedSymbolLogoSrc(logoUrl),
			])

			expect(firstLogoSrc).toBe('data:image/svg+xml;base64,PHN2Zy8+')
			expect(secondLogoSrc).toBe(firstLogoSrc)
			expect(Obsidian.requestUrl).toHaveBeenCalledTimes(1)
			expect(Obsidian.requestUrl).toHaveBeenCalledWith({
				method: 'GET',
				throw: false,
				url: logoUrl,
			})
		})

		it('uses localStorage before fetching', async () => {
			const cachedLogoSrc = 'data:image/svg+xml;base64,cached'
			const runtime = getSymbolLogoRuntime()
			runtime.localStorage?.setItem(symbolLogoCacheKey(logoUrl), cachedLogoSrc)

			await expect(loadCachedSymbolLogoSrc(logoUrl)).resolves.toBe(cachedLogoSrc)
			expect(Obsidian.requestUrl).not.toHaveBeenCalled()
		})
	})
}
