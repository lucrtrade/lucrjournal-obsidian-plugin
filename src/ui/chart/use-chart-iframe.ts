import { useCallback, useEffect, useRef, useState } from 'react'

import { render } from '../../charts/lucrchart-host'
import { fetchBarsWithCache } from '../../charts/ohlcv-fetch'
import {
	buildPositionChartConfig,
	resolveCurrentChartThemeColors,
	resolvePositionChartSource,
} from '../../charts/position-chart'
import { LUCRCHART_IFRAME_URL, LUCRCHART_ORIGIN } from '../../constant'
import { getCurrentLocale } from '../../lang/helpers'
import { createLogger } from '../../logger'

import type { Position } from '../../domains'
import type LucrJournalPlugin from '../../main'
import type { App, TFile } from 'obsidian'
import type { RefObject } from 'react'

const logger = createLogger('chart-iframe')

type MinimalChartState = {
	chartType?: number
	sources?: Record<string, unknown>
	groups?: Record<string, unknown>
	symbol?: string
	timeframe?: {
		resolution: string
		right_edge_time: number
		left_edge_time: number
	}
}

type UseChartIframeParams = {
	plugin: LucrJournalPlugin
	position: Position
	positionFile: TFile | null
	onSnapshot?: (base64: string) => void
}

type UseChartIframeReturn = {
	iframeRef: RefObject<HTMLIFrameElement | null>
	isChartAvailable: boolean
	isChartReady: boolean
}

export function useChartIframe({
	plugin,
	position,
	positionFile,
	onSnapshot,
}: UseChartIframeParams): UseChartIframeReturn {
	const app: App = plugin.app
	const iframeRef = useRef<HTMLIFrameElement | null>(null)
	const hostRef = useRef<ReturnType<typeof render> | null>(null)
	const buildOptionsRef = useRef<((frame: HTMLIFrameElement) => Parameters<typeof render>[0]) | null>(null)
	const [isChartAvailable, setIsChartAvailable] = useState(true)
	const [isChartReady, setIsChartReady] = useState(false)
	const [isDarkMode, setIsDarkMode] = useState(() => activeDocument.body.classList.contains('theme-dark'))

	// @story [[lucrjournal/chart#^chart-state-read]] Accepts only object state from the current position file.
	const readSavedState = useCallback((): MinimalChartState | undefined => {
		if (positionFile === null) {
			return undefined
		}
		const fm = app.metadataCache.getFileCache(positionFile)?.frontmatter
		const raw: unknown = fm?.chart_state
		if (raw === null || typeof raw !== 'object') {
			return undefined
		}
		return raw
	}, [app, positionFile])

	// @story [[lucrjournal/chart#^chart-state-write]] Persists host state only through the current position frontmatter.
	const writeSavedState = useCallback((state: MinimalChartState) => {
		if (positionFile === null) {
			return
		}
		void app.fileManager.processFrontMatter(positionFile, (fm) => {
			;(fm as Record<string, unknown>).chart_state = state
		})
	}, [app, positionFile])

	// @story [[lucrjournal/chart#^config-excludes-runtime-state]] Supplies settings and state as independent host callbacks.
	const buildOptions = useCallback((frame: HTMLIFrameElement): Parameters<typeof render>[0] => ({
		frame,
		src: LUCRCHART_IFRAME_URL,
		origin: LUCRCHART_ORIGIN,
		buildConfig: () => buildPositionChartConfig(plugin, position),
		// @story [[lucrjournal/chart#^chart-theme-settings]] Reads theme and colors from the active document on demand.
		readSettings: () => ({
			theme: activeDocument.body.classList.contains('theme-dark') ? 'dark' : 'light',
			locale: getCurrentLocale(),
			timezone: plugin.settings.timeZone,
			colors: resolveCurrentChartThemeColors(),
		}),
		readState: readSavedState,
		writeState: writeSavedState,
		writeScreenshot: (base64) => onSnapshot?.(base64),
		fetchHistory: async ({ resolution, from, to }) => {
			const source = resolvePositionChartSource(plugin, position)
			// @story [[lucrjournal/market-data#^missing-source-skips-fetch]] Avoids network access for unsupported chart sources.
			if (source === null) {
				return []
			}
			return await fetchBarsWithCache({
				...source,
				resolution,
				fromSeconds: from,
				toSeconds: to,
			})
		},
		onReady: setIsChartReady,
		// @story [[lucrjournal/chart#^unavailable-chart-keeps-local-content]] Exposes chart availability without failing the details view.
		onAvailable: setIsChartAvailable,
		onError: (error) => logger.warn('lucrchart host error', { error, positionFile: positionFile?.path }),
	}), [onSnapshot, plugin, plugin.settings.timeZone, position, positionFile?.path, readSavedState, writeSavedState])

	// @story [[lucrjournal/chart#^chart-input-refresh]] Keeps refreshHost pointed at the latest render inputs.
	buildOptionsRef.current = buildOptions

	const refreshHost = useCallback(() => {
		const frame = iframeRef.current
		const build = buildOptionsRef.current
		if (frame === null || build === null) {
			return
		}
		hostRef.current?.update(build(frame))
		hostRef.current?.refresh()
	}, [])

	useEffect(() => {
		const frame = iframeRef.current
		const build = buildOptionsRef.current
		if (frame === null || build === null) {
			return
		}
		// @story [[lucrjournal/chart#^host-mount-cleanup]] Creates one host for the mounted iframe and cleans it up on unmount.
		const host = render(build(frame))
		hostRef.current = host
		return () => {
			host.cleanup()
			hostRef.current = null
		}
	}, [])

	useEffect(() => {
		// @story [[lucrjournal/chart#^position-change-resets-chart]] Resets availability and readiness when the position file changes.
		setIsChartAvailable(true)
		setIsChartReady(false)
	}, [positionFile?.path])

	useEffect(() => {
		// @story [[lucrjournal/chart#^chart-input-refresh]] Refreshes after every chart input that can affect config or callbacks.
		refreshHost()
	}, [position, positionFile?.path, plugin.settings.lang, plugin.settings.timeZone, isDarkMode, onSnapshot, refreshHost])

	useEffect(() => {
		// @story [[lucrjournal/chart#^theme-class-refresh]] Observes document theme class changes and refreshes the host.
		const updateTheme = () => {
			setIsDarkMode(activeDocument.body.classList.contains('theme-dark'))
			refreshHost()
		}
		const observer = new MutationObserver(updateTheme)
		observer.observe(activeDocument.body, {
			attributes: true,
			attributeFilter: ['class'],
		})
		return () => observer.disconnect()
	}, [refreshHost])

	return { iframeRef, isChartAvailable, isChartReady }
}
