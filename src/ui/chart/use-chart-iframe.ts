import { Platform } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { formatChartResolution } from '../../charts/chart-model'
import { fetchBarsWithCache } from '../../charts/ohlcv-fetch'
import { LUCRCHART_URL } from '../../constant'
import {
	computePositionChartTimeframe,
	isPositionChartSupported,
	resolvePositionChartVisibleMarks,
	resolvePositionExchangeId,
	resolvePositionSymbol,
} from '../../domains/position/chart'
import { t } from '../../lang/helpers'
import { createLogger } from '../../logger'

import { resolveChartThemeColors, resolveCurrentThemeColors } from './chart-theme'

import type {
	ChartConfig,
	InboundMessage,
	MinimalChartState,
	OutboundMessage,
} from '../../charts/protocol'
import type { Position } from '../../domains'
import type { App, TFile } from 'obsidian'
import type { RefObject } from 'react'

const logger = createLogger('chart-iframe')

// Strip trailing slash once for exact origin comparison in postMessage handler
const lucrviewOrigin = LUCRCHART_URL.replace(/\/$/, '')

type UseChartIframeParams = {
	app: App
	position: Position
	positionFile: TFile | null
	onSnapshot?: (base64: string) => void
}

type UseChartIframeReturn = {
	iframeRef: RefObject<HTMLIFrameElement | null>
	isChartAvailable: boolean
	isChartReady: boolean
	resolution: string
	requestSnapshot: () => Promise<string>
}

export function useChartIframe({
	app,
	position,
	positionFile,
	onSnapshot,
}: UseChartIframeParams): UseChartIframeReturn {
	const iframeRef = useRef<HTMLIFrameElement | null>(null)
	const [isChartReady, setIsChartReady] = useState(false)
	const [isDarkMode, setIsDarkMode] = useState(() => activeDocument.body.classList.contains('theme-dark'))
	const snapshotResolverRef = useRef<((base64: string) => void) | null>(null)

	const isChartAvailable = isPositionChartSupported(app, position)
	const timeframe = computePositionChartTimeframe(position)
	const chartMarks = buildChartMarks(position)
	const chartMarksSignature = chartMarks
		.map((mark) => `${mark.id}:${mark.time}:${mark.color}:${mark.label}`)
		.join('|')
	const resolution = formatChartResolution(timeframe.resolution)

	const postToIframe = useCallback((msg: InboundMessage) => {
		iframeRef.current?.contentWindow?.postMessage(msg, lucrviewOrigin)
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

	const buildChartConfig = useCallback((): ChartConfig | null => {
		const symbol = resolvePositionSymbol(app, position)
		const exchange = resolvePositionExchangeId(app, position)
		if (symbol === null || exchange === null) {
			return null 
		}

		return {
			kind: 'position',
			symbol,
			exchange,
			debug: false,
			marks: buildChartMarks(position),
			timeframe: {
				resolution: timeframe.resolution,
				left_edge_time: timeframe.leftEdgeTime,
				right_edge_time: timeframe.rightEdgeTime,
			},
			theme: isDarkMode ? 'dark' : 'light',
			maxBarsOnSwitch: 500,
			savedState: readSavedState(),
			colors: resolveChartThemeColors(),
		}
	}, [chartMarksSignature, position, timeframe, isDarkMode, readSavedState])

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

	// Send UPDATE_SETTINGS when theme changes after widget is ready
	useEffect(() => {
		if (!isChartReady) {
			return
		}

		postToIframe({
			type: 'REFRESH_MARKS',
			payload: {
				marks: buildChartMarks(position),
			},
		})
	}, [chartMarksSignature, isChartReady, position, postToIframe])

	useEffect(() => {
		if (!isChartReady) {
			return
		}

		postToIframe({
			type: 'UPDATE_SETTINGS',
			payload: {
				theme: isDarkMode ? 'dark' : 'light',
				colors: resolveCurrentThemeColors(),
			},
		})
	}, [isDarkMode, isChartReady, postToIframe])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== lucrviewOrigin) {
				return
			}

			const msg = event.data as OutboundMessage
			if (!msg || typeof msg.type !== 'string') {
				return
			}

			switch (msg.type) {
				case 'BRIDGE_READY': {
					const config = buildChartConfig()
					if (config === null) {
						logger.debug('skipping INIT_WIDGET - unsupported symbol type, missing symbol, or missing exchange', {
							positionFile: positionFile?.path,
						})
						return
					}
					postToIframe({ type: 'INIT_WIDGET', payload: config })
					break
				}

				case 'WIDGET_READY':
					setIsChartReady(true)
					break

				case 'REQ_HISTORY': {
					const { symbol, resolution: reqRes, from, to, reqId } = msg.payload

					if (Platform.isMobile) {
						postToIframe({
							type: 'RECEIVE_HISTORY',
							payload: { reqId, bars: [], noData: true },
						})
						return
					}

					const exchange = resolvePositionExchangeId(app, position)
					if (exchange === null) {
						postToIframe({
							type: 'RECEIVE_HISTORY',
							payload: { reqId, bars: [], noData: true },
						})
						return
					}

					void fetchBarsWithCache({
						exchangeId: exchange,
						symbol,
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
								symbol,
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
					if (snapshotResolverRef.current !== null) {
						snapshotResolverRef.current(base64)
						snapshotResolverRef.current = null
					} else {
						onSnapshot?.(base64)
					}
					break
				}

				case 'REQ_SUBSCRIBE':
				case 'REQ_UNSUBSCRIBE':
				case 'ON_MARK_CLICK':
				case 'DELETE_SNAPSHOT':
				case 'RESET_VIEW':
					break
				default:
					msg satisfies never
					throw new Error('Unknown outbound chart message type')
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [position, positionFile, buildChartConfig, postToIframe, writeSavedState, onSnapshot])

	const requestSnapshot = useCallback((): Promise<string> => {
		if (!isChartAvailable) {
			return Promise.reject(new Error('Chart is not available for this symbol type'))
		}
		return new Promise((resolve) => {
			snapshotResolverRef.current = resolve
			postToIframe({ type: 'SAVE_CHART', payload: {} })
		})
	}, [isChartAvailable, postToIframe])

	return { iframeRef, isChartAvailable, isChartReady, resolution, requestSnapshot }
}

function buildChartMarks(position: Position): NonNullable<ChartConfig['marks']> {
	const colors = resolveCurrentThemeColors()

	return resolvePositionChartVisibleMarks(position).map((mark) => ({
		id: mark.kind,
		time: mark.time,
		color: mark.kind === 'open' ? colors.buyColor : colors.sellColor,
		text: mark.kind === 'open'
			? t('POSITION_DETAILS_OPENED_AT')
			: t('POSITION_DETAILS_CLOSED_AT'),
		label: mark.kind === 'open' ? t('OPEN') : t('CLOSE'),
		labelFontColor: colors.textOnColor,
		minSize: 18,
	}))
}
