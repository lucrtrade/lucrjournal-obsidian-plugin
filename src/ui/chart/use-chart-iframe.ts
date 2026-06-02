import { Platform } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { formatChartResolution } from '../../charts/chart-model'
import { fetchBarsWithCache } from '../../charts/ohlcv-fetch'
import { YAHOO_INTRADAY_MAX_AGE_SECONDS, YAHOO_SUPPORTED_RESOLUTIONS } from '../../charts/yahoo-ohlcv'
import { LUCRCHART_URL } from '../../constant'
import {
	computePositionChartTimeframe,
	resolvePositionChartSource,
	resolvePositionChartVisibleMarks,
} from '../../domains/position/chart'
import { t } from '../../lang/helpers'
import { createLogger } from '../../logger'

import { resolveChartThemeColors, resolveCurrentThemeColors } from './chart-theme'

import type {
	ChartConfig,
	ChartMarkColor,
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

	const source = resolvePositionChartSource(app, position)
	const supportedResolutions = source?.provider === 'yahoo' ? YAHOO_SUPPORTED_RESOLUTIONS : undefined
	const minIntradayTime = source?.provider === 'yahoo'
		? Math.floor(Date.now() / 1000) - YAHOO_INTRADAY_MAX_AGE_SECONDS
		: undefined
	const timeframe = computePositionChartTimeframe(position, { minIntradayTime, supportedResolutions })
	const chartMarks = buildChartMarks(position)
	const chartMarksSignature = chartMarks
		.map((mark) => `${mark.id}:${mark.time}:${mark.color.border}:${mark.color.background}:${mark.label}`)
		.join('|')
	const resolution = formatChartResolution(timeframe.resolution)
	const [chartProbe, setChartProbe] = useState<'probing' | 'available' | 'unavailable'>('probing')

	useEffect(() => {
		let cancelled = false
		setChartProbe('probing')

		const chartSource = resolvePositionChartSource(app, position)
		if (chartSource === null) {
			setChartProbe('unavailable')
			return
		}

		void fetchBarsWithCache({
			...chartSource,
			resolution: timeframe.resolution,
			fromSeconds: timeframe.leftEdgeTime,
			toSeconds: timeframe.rightEdgeTime,
		})
			.then((bars) => {
				if (!cancelled) {
					setChartProbe(bars.length > 0 ? 'available' : 'unavailable')
				}
			})
			.catch((err: unknown) => {
				logger.warn('failed to probe OHLCV availability for chart', {
					err,
					chartSource,
					resolution: timeframe.resolution,
				})
				if (!cancelled) {
					setChartProbe('unavailable')
				}
			})

		return () => {
			cancelled = true
		}
	}, [app, position, positionFile?.path, resolution, timeframe.leftEdgeTime, timeframe.rightEdgeTime])

	const isChartAvailable = chartProbe === 'available'

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
		const chartSource = resolvePositionChartSource(app, position)
		if (chartSource === null) {
			return null 
		}

		return {
			kind: 'position',
			symbol: chartSource.symbol,
			exchange: chartSource.provider === 'exchange' ? chartSource.exchangeId : '',
			supportedResolutions: chartSource.provider === 'yahoo' ? YAHOO_SUPPORTED_RESOLUTIONS : undefined,
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
	}, [app, chartMarksSignature, position, timeframe, isDarkMode, readSavedState])

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
					const { resolution: reqRes, from, to, reqId } = msg.payload

					if (Platform.isMobile) {
						postToIframe({
							type: 'RECEIVE_HISTORY',
							payload: { reqId, bars: [], noData: true },
						})
						return
					}

					const chartSource = resolvePositionChartSource(app, position)
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
	}, [app, position, positionFile, buildChartConfig, postToIframe, writeSavedState, onSnapshot])

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
		color: toChartMarkColor(mark.kind === 'open' ? colors.buyColor : colors.sellColor),
		text: mark.kind === 'open'
			? t('POSITION_DETAILS_OPENED_AT')
			: t('POSITION_DETAILS_CLOSED_AT'),
		label: mark.kind === 'open' ? t('OPEN') : t('CLOSE'),
		labelFontColor: colors.textOnColor,
		minSize: 18,
	}))
}

function toChartMarkColor(color: string): ChartMarkColor {
	return { border: color, background: color }
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it, vi } = import.meta.vitest

	describe('buildChartMarks', () => {
		afterEach(() => {
			vi.unstubAllGlobals()
		})

		it('uses TradingView custom mark color objects', () => {
			vi.stubGlobal('activeDocument', {
				body: {
					classList: {
						contains: () => false,
					},
				},
			})
			vi.stubGlobal('getComputedStyle', () => ({
				getPropertyValue: (name: string) => {
					if (name === '--lj-profit-text') {
						return '#111111'
					}
					if (name === '--lj-loss-text') {
						return 'rgba(17, 17, 17, 0.38)'
					}
					return ''
				},
			}))

			const marks = buildChartMarks({
				lucr_type: 'position',
				opened_at: '2026-03-20T16:31:05+08:00',
				closed_at: '2026-03-21T18:45:00+08:00',
			} as Position)

			expect(marks.map((mark) => mark.color)).toEqual([
				{ border: '#111111', background: '#111111' },
				{ border: 'rgba(17, 17, 17, 0.38)', background: 'rgba(17, 17, 17, 0.38)' },
			])
		})
	})
}
