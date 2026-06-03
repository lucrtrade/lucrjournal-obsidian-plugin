import { Platform } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchBarsWithCache } from '../../charts/ohlcv-fetch'
import {
	buildPositionChartConfig,
	buildPositionChartContext,
	LUCRCHART_ORIGIN,
	resolveCurrentChartThemeColors,
	resolvePositionChartSource,
} from '../../charts/position-chart'
import { createLogger } from '../../logger'

import type {
	ChartConfig,
	InboundMessage,
	MinimalChartState,
	OutboundMessage,
} from '../../charts/protocol'
import type { Position } from '../../domains'
import type LucrJournalPlugin from '../../main'
import type { App, TFile } from 'obsidian'
import type { RefObject } from 'react'

const logger = createLogger('chart-iframe')

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
	resolution: string
}

export function useChartIframe({
	plugin,
	position,
	positionFile,
	onSnapshot,
}: UseChartIframeParams): UseChartIframeReturn {
	const app: App = plugin.app
	const iframeRef = useRef<HTMLIFrameElement | null>(null)
	const [isChartReady, setIsChartReady] = useState(false)
	const [isDarkMode, setIsDarkMode] = useState(() => activeDocument.body.classList.contains('theme-dark'))
	const lastInitSignatureRef = useRef<string | null>(null)
	const timeframeNowRef = useRef<{ path: string | null; seconds: number } | null>(null)
	const positionPath = positionFile?.path ?? null

	if (timeframeNowRef.current?.path !== positionPath) {
		timeframeNowRef.current = {
			path: positionPath,
			seconds: Math.floor(Date.now() / 1000),
		}
	}

	const chartContext = buildPositionChartContext(plugin, position, timeframeNowRef.current.seconds)
	const chartConfigSignature = chartContext === null
		? null
		: JSON.stringify({
			entry: chartContext.entry,
			exchange: chartContext.source.provider === 'exchange' ? chartContext.source.exchangeId : '',
			exit: chartContext.exit,
			source: chartContext.source.symbol,
			timeframe: {
				resolution: chartContext.timeframe.resolution,
				left_edge_time: chartContext.timeframe.leftEdgeTime,
				right_edge_time: chartContext.timeframe.rightEdgeTime,
			},
		})
	const resolution = chartContext?.resolution ?? '1h'
	const [chartProbe, setChartProbe] = useState<'probing' | 'available' | 'unavailable'>('probing')

	useEffect(() => {
		let cancelled = false
		setChartProbe('probing')

		const context = buildPositionChartContext(plugin, position, timeframeNowRef.current!.seconds)
		if (context === null) {
			setChartProbe('unavailable')
			return
		}

		void fetchBarsWithCache({
			...context.source,
			resolution: context.timeframe.resolution,
			fromSeconds: context.timeframe.leftEdgeTime,
			toSeconds: context.timeframe.rightEdgeTime,
		})
			.then((bars) => {
				if (!cancelled) {
					setChartProbe(bars.length > 0 ? 'available' : 'unavailable')
				}
			})
			.catch((err: unknown) => {
				logger.warn('failed to probe OHLCV availability for chart', {
					err,
					chartSource: context.source,
					resolution: context.timeframe.resolution,
				})
				if (!cancelled) {
					setChartProbe('unavailable')
				}
			})

		return () => {
			cancelled = true
		}
	}, [plugin, position, positionFile?.path, resolution])

	const isChartAvailable = chartProbe === 'available'

	const postToIframe = useCallback((msg: InboundMessage) => {
		iframeRef.current?.contentWindow?.postMessage(msg, LUCRCHART_ORIGIN)
	}, [])

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

	const writeSavedState = useCallback((state: MinimalChartState) => {
		if (positionFile === null) {
			return 
		}
		void app.fileManager.processFrontMatter(positionFile, (fm) => {
			;(fm as Record<string, unknown>).chart_state = state
		})
	}, [app, positionFile])

	const clearSavedState = useCallback(() => {
		if (positionFile === null) {
			return
		}
		void app.fileManager.processFrontMatter(positionFile, (fm) => {
			delete (fm as Record<string, unknown>).chart_state
		})
	}, [app, positionFile])

	const buildChartConfig = useCallback((savedState: MinimalChartState | undefined): ChartConfig | null => {
		return buildPositionChartConfig(plugin, position, {
			isDarkMode,
			nowSeconds: timeframeNowRef.current!.seconds,
			savedState,
		})
	}, [plugin, position, isDarkMode])

	const sendInitWidget = useCallback((savedState: MinimalChartState | undefined, resetReady: boolean) => {
		const config = buildChartConfig(savedState)
		if (config === null) {
			logger.debug('skipping INIT_WIDGET - unsupported symbol type, missing symbol, or missing exchange', {
				positionFile: positionFile?.path,
			})
			return
		}

		if (resetReady) {
			setIsChartReady(false)
		}
		lastInitSignatureRef.current = buildInitSignature(config)
		postToIframe({ type: 'INIT_WIDGET', payload: config })
	}, [buildChartConfig, positionFile?.path, postToIframe])

	// Observe Obsidian theme changes via body class
	useEffect(() => {
		const updateTheme = () => {
			setIsDarkMode(activeDocument.body.classList.contains('theme-dark'))
		}

		updateTheme()

		const observer = new MutationObserver(updateTheme)
		observer.observe(activeDocument.body, {
			attributes: true,
			attributeFilter: ['class'],
		})

		return () => observer.disconnect()
	}, [])

	// Reset ready state when position file changes
	useEffect(() => {
		setIsChartReady(false)
	}, [isChartAvailable, positionFile?.path])

	useEffect(() => {
		if (!isChartReady) {
			return
		}

		if (chartConfigSignature === null || chartConfigSignature === lastInitSignatureRef.current) {
			return
		}

		sendInitWidget(readSavedState(), true)
	}, [chartConfigSignature, isChartReady, readSavedState, sendInitWidget])

	useEffect(() => {
		if (!isChartReady) {
			return
		}

		postToIframe({
			type: 'UPDATE_SETTINGS',
			payload: {
				theme: isDarkMode ? 'dark' : 'light',
				colors: resolveCurrentChartThemeColors(),
			},
		})
	}, [isDarkMode, isChartReady, postToIframe])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== LUCRCHART_ORIGIN) {
				return
			}

			const msg = event.data as OutboundMessage
			if (!msg || typeof msg.type !== 'string') {
				return
			}

			switch (msg.type) {
				case 'BRIDGE_READY': {
					sendInitWidget(readSavedState(), false)
					break
				}

				case 'WIDGET_READY':
					setIsChartReady(true)
					break

				case 'REQ_HISTORY': {
					const { resolution: reqRes, from, to, reqId } = msg.payload

					if (Platform.isMobile) {
						postToIframe({
							type: 'RECEIVE_HISTORY',
							payload: { reqId, bars: [], noData: true },
						})
						return
					}

					const chartSource = resolvePositionChartSource(plugin, position)
					if (chartSource === null) {
						postToIframe({
							type: 'RECEIVE_HISTORY',
							payload: { reqId, bars: [], noData: true },
						})
						return
					}

					void fetchBarsWithCache({
						...chartSource,
						resolution: reqRes,
						fromSeconds: from,
						toSeconds: to,
					})
						.then((bars) => {
							postToIframe({
								type: 'RECEIVE_HISTORY',
								payload: { reqId, bars, noData: bars.length === 0 },
							})
						})
						.catch((err: unknown) => {
							logger.warn('failed to fetch OHLCV for chart', {
								err,
								chartSource,
								resolution: reqRes,
							})
							postToIframe({
								type: 'RECEIVE_HISTORY',
								payload: { reqId, bars: [], noData: true, error: String(err) },
							})
						})
					break
				}

				case 'SAVE_STATE':
					writeSavedState(msg.payload)
					break

				case 'SAVE_SNAPSHOT': {
					const { base64 } = msg.payload
					onSnapshot?.(base64)
					break
				}

				case 'RESET_VIEW':
					clearSavedState()
					sendInitWidget(undefined, true)
					break

				case 'REQ_SUBSCRIBE':
				case 'REQ_UNSUBSCRIBE':
				case 'ON_MARK_CLICK':
					break
				default:
					msg satisfies never
					throw new Error('Unknown outbound chart message type')
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [plugin, position, positionFile, clearSavedState, postToIframe, readSavedState, sendInitWidget, writeSavedState, onSnapshot])

	return { iframeRef, isChartAvailable, isChartReady, resolution }
}

function buildInitSignature(config: ChartConfig): string {
	return JSON.stringify({
		entry: config.entry,
		exchange: config.exchange,
		exit: config.exit,
		source: config.symbol,
		timeframe: config.timeframe,
	})
}
