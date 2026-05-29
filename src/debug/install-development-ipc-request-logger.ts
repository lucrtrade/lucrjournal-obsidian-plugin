import { BUILD_INFO } from '../build-info'
import { createLogger } from '../logger'

const INSTALL_MARKER = '__lucrjournalDevelopmentIpcRequestLoggerInstalled__'
const logger = createLogger('debug-ipc')

type IpcListener = (event: unknown, ...args: unknown[]) => unknown

type IpcRendererLike = {
	send(channel: string, ...args: unknown[]): boolean;
	on(channel: string, listener: IpcListener): IpcRendererLike;
}

type ElectronLike = {
	ipcRenderer?: IpcRendererLike;
}

type PendingRequest = {
	data: RequestData | undefined;
	startTime: number;
}

type RequestData = {
	body?: unknown;
	headers?: Record<string, unknown>;
	method?: string;
	url?: string;
}

type ResponseData = {
	body?: ArrayLike<number>;
	headers?: Record<string, string | undefined>;
	status?: number;
}
 
type GlobalInstallState = typeof window & {
	[INSTALL_MARKER]?: boolean;
}

type RequireLike = (id: string) => unknown

export function installDevelopmentIpcRequestLogger(): () => void {
	if (BUILD_INFO.environment !== 'development') {
		return () => {}
	}
	 
	const installState = window as GlobalInstallState
	if (installState[INSTALL_MARKER] === true) {
		return () => {}
	}

	const runtimeRequire = getRuntimeRequire()
	const electron = runtimeRequire('electron') as ElectronLike
	const ipcRenderer = electron.ipcRenderer
	if (ipcRenderer === undefined) {
		throw new Error('electron.ipcRenderer is unavailable in development environment')
	}

	installState[INSTALL_MARKER] = true

	const originalSend = ipcRenderer.send.bind(ipcRenderer)
	const originalOn = ipcRenderer.on.bind(ipcRenderer)
	const pendingRequests = new Map<string, PendingRequest>()

	ipcRenderer.send = (channel, ...args) => {
		if (channel !== 'request-url') {
			return originalSend(channel, ...args)
		}

		const requestId = typeof args[0] === 'string' ? args[0] : null
		const requestData = isRequestData(args[1]) ? args[1] : undefined
		if (requestId === null) {
			throw new Error('request-url IPC call must provide a string request id')
		}

		logger.debug('ipc request started', {
			summary: formatRequestSummary({
				method: requestData?.method,
				url: requestData?.url,
			}),
		})

		pendingRequests.set(requestId, {
			data: requestData,
			startTime: Date.now(),
		})

		return originalSend(channel, ...args)
	}

	ipcRenderer.on = (channel, listener) => {
		const wrappedListener: IpcListener = (event, ...args) => {
			if (pendingRequests.has(channel)) {
				const pendingRequest = pendingRequests.get(channel)
				if (pendingRequest === undefined) {
					throw new Error(`pending request disappeared for channel ${channel}`)
				}

				pendingRequests.delete(channel)
				logRequestResponseGroup(pendingRequest, parseResponseData(args[0]))
			}

			return listener(event, ...args)
		}

		return originalOn(channel, wrappedListener)
	}

	logger.debug('development ipc request logger installed')

	return () => {
		ipcRenderer.send = originalSend
		ipcRenderer.on = originalOn
		pendingRequests.clear()
		installState[INSTALL_MARKER] = false
		logger.debug('development ipc request logger removed')
	}
}

function logRequestResponseGroup(
	pendingRequest: PendingRequest,
	response: ResponseData | undefined,
): void {
	const requestData = pendingRequest.data
	const method = requestData?.method ?? 'GET'
	const url = requestData?.url ?? '<unknown url>'
	const duration = Date.now() - pendingRequest.startTime
	const status = response?.status
	const bodyPreview = getBodyPreview(response)
	const closeGroup = logger.groupCollapsed('ipc request completed', {
		summary: formatResponseSummary({
			durationMs: duration,
			method,
			status,
			url,
		}),
		durationMs: duration,
		method,
		status: status ?? 'unknown',
		url,
	})

	const closeRequestGroup = logger.group('request', {
		method,
		body: requestData?.body,
		headers: requestData?.headers,
		url,
	})
	closeRequestGroup()

	const closeResponseGroup = logger.group('response', {
		body: bodyPreview,
		contentType: readHeaderValue(response?.headers, 'content-type'),
		headers: response?.headers,
		status,
	})
	closeResponseGroup()

	closeGroup()
}

function getBodyPreview(response: ResponseData | undefined): unknown {
	if (response?.body === undefined) {
		return null
	}

	const contentType = readHeaderValue(response.headers, 'content-type') ?? ''
	const text = decodeUtf8(response.body)
	if (text === null) {
		return `[Binary: ${response.body.length} bytes]`
	}

	if (contentType.includes('application/json')) {
		return safeJsonParse(text.slice(0, 1000)) ?? text.slice(0, 1000)
	}

	if (
		contentType.includes('text/')
		|| contentType.includes('xml')
		|| contentType.includes('charset=')
		|| contentType.includes('application/vnd.github')
	) {
		return text.slice(0, 1000)
	}

	return `[Binary: ${response.body.length} bytes]`
}

function formatRequestSummary(request: {
	method?: string;
	url?: string;
}): string {
	return `${request.method ?? 'GET'} ${request.url ?? '<unknown url>'}`
}

function formatResponseSummary(response: {
	durationMs: number;
	method: string;
	status?: number;
	url: string;
}): string {
	return `${response.method} ${response.status ?? 'unknown'} ${response.durationMs}ms ${response.url}`
}

function decodeUtf8(body: ArrayLike<number>): string | null {
	try {
		return new TextDecoder('utf-8').decode(Uint8Array.from(body))
	} catch {
		return null
	}
}

function safeJsonParse(value: string): unknown {
	try {
		return JSON.parse(value) as unknown
	} catch {
		return null
	}
}

function getRuntimeRequire(): RequireLike {
	const runtimeRequire = Reflect.get(window, 'require')
	if (typeof runtimeRequire !== 'function') {
		throw new Error('globalThis.require is unavailable in development environment')
	}

	return runtimeRequire as RequireLike
}

function isRequestData(value: unknown): value is RequestData {
	return isRecord(value)
}

function parseResponseData(value: unknown): ResponseData | undefined {
	return isRecord(value) ? value : undefined
}

function readHeaderValue(
	headers: Record<string, string | undefined> | undefined,
	headerName: string,
): string | null {
	if (headers === undefined) {
		return null
	}

	const normalizedHeaderName = headerName.toLowerCase()
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === normalizedHeaderName) {
			return value ?? null
		}
	}

	return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
