type ConsoleLogMethod = 'debug' | 'error' | 'warn'
type ConsoleGroupMethod = 'group' | 'groupCollapsed'

interface LoggerSpan {
	end(context?: unknown): void;
	fail(message?: string, context?: unknown): void;
}

interface LoggerSpanOptions {
	collapsed?: boolean;
	completionMessage?: string;
}

export interface Logger {
	readonly module: string;
	debug(message: string, context?: unknown): void;
	warn(message: string, context?: unknown): void;
	error(message: string, context?: unknown): void;
	group(message: string, context?: unknown): () => void;
	groupCollapsed(message: string, context?: unknown): () => void;
	groupEnd(): void;
	span(message: string, context?: unknown, options?: LoggerSpanOptions): LoggerSpan;
}

const LOGGER_NAME = 'lucrjournal'
const LOGGER_STYLE = [
	'background:#111827',
	'border-radius:999px',
	'color:#f8fafc',
	'font-weight:700',
	'padding:1px 6px',
].join(';')
const TIMESTAMP_STYLE = 'color:#64748b;font-weight:500;'
const MESSAGE_STYLE = 'color:inherit;'

const consoleApi = console
const moduleStyles = new Map<string, string>()
let debugLoggingEnabled = false

export function createLogger(module: string): Logger {
	return {
		module,
		debug: (message, context) => {
			writeLog('debug', module, message, context)
		},
		warn: (message, context) => {
			writeLog('warn', module, message, context)
		},
		error: (message, context) => {
			writeLog('error', module, message, context)
		},
		group: (message, context) => openGroup('group', module, message, context),
		groupCollapsed: (message, context) => openGroup('groupCollapsed', module, message, context),
		groupEnd: () => {
			if (debugLoggingEnabled) {
				consoleApi.groupEnd()
			}
		},
		span: (message, context, options) => createSpan(module, message, context, options),
	}
}

export function setDebugLoggingEnabled(enabled: boolean): void {
	debugLoggingEnabled = enabled
}

function createSpan(
	module: string,
	message: string,
	context?: unknown,
	options?: LoggerSpanOptions,
): LoggerSpan {
	const startedAt = Date.now()
	const closeGroup = options?.collapsed === false
		? openGroup('group', module, message, context)
		: openGroup('groupCollapsed', module, message, context)

	return {
		end: (spanContext) => {
			writeLog(
				'debug',
				module,
				options?.completionMessage ?? `${message} completed`,
				appendDuration(spanContext, startedAt),
			)
			closeGroup()
		},
		fail: (spanMessage, spanContext) => {
			writeLog(
				'error',
				module,
				spanMessage ?? `${message} failed`,
				appendDuration(spanContext, startedAt),
			)
			closeGroup()
		},
	}
}

function openGroup(
	method: ConsoleGroupMethod,
	module: string,
	message: string,
	context?: unknown,
): () => void {
	if (!debugLoggingEnabled) {
		return () => {}
	}

	writeLog(method, module, message, context)

	let closed = false
	return () => {
		if (closed) {
			return
		}

		closed = true
		consoleApi.groupEnd()
	}
}

function writeLog(
	method: ConsoleGroupMethod | ConsoleLogMethod,
	module: string,
	message: string,
	context?: unknown,
): void {
	// @story [[lucrjournal/runtime#^logger-level-gate]] Gates debug groups while leaving warning and error output visible.
	// @story [[lucrjournal/session#^auth-errors-always-visible]] Suppresses debug output without suppressing error output.
	if (!debugLoggingEnabled && (method === 'debug' || method === 'group' || method === 'groupCollapsed')) {
		return
	}

	// @story [[lucrjournal/runtime#^structured-log-context]] Formats every shared log with its module, timestamp, message, and optional context.
	const timestamp = new Date().toISOString()
	const [template, styles] = formatHeader(module, timestamp, message)

	if (context === undefined) {
		consoleApi[method](template, ...styles)
		return
	}

	consoleApi[method](template, ...styles, context)
}

function formatHeader(module: string, timestamp: string, message: string): [string, string[]] {
	return [
		`%c[${LOGGER_NAME}]%c[${module}]%c ${timestamp}%c ${message}`,
		[LOGGER_STYLE, getModuleStyle(module), TIMESTAMP_STYLE, MESSAGE_STYLE],
	]
}

function getModuleStyle(module: string): string {
	const existingStyle = moduleStyles.get(module)
	if (existingStyle) {
		return existingStyle
	}

	const hue = hashModule(module) % 360
	const style = `color:hsl(${hue} 70% 45%);font-weight:700;`
	moduleStyles.set(module, style)
	return style
}

function hashModule(module: string): number {
	let hash = 0
	for (const char of module) {
		hash = ((hash << 5) - hash) + char.charCodeAt(0)
		hash |= 0
	}

	return Math.abs(hash)
}

function appendDuration(context: unknown, startedAt: number): unknown {
	const durationMs = Date.now() - startedAt
	const meta = { durationMs }

	if (context === undefined) {
		return meta
	}

	if (isRecord(context)) {
		return {
			...context,
			...meta,
		}
	}

	return {
		context,
		...meta,
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

if (import.meta.vitest) {
	const { afterEach, describe, expect, it, vi } = import.meta.vitest

	describe('logger', () => {
		afterEach(() => {
			vi.restoreAllMocks()
			setDebugLoggingEnabled(false)
		})

		it('does not write debug logs by default', () => {
			// @story [[lucrjournal/runtime#^logger-level-gate]] Covers suppressed debug output while logging is disabled.
			const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})

			createLogger('test').debug('hidden')

			expect(debug).not.toHaveBeenCalled()
		})

		it('writes debug logs when debug logging is enabled', () => {
			// @story [[lucrjournal/runtime#^logger-level-gate]] Covers visible debug output while logging is enabled.
			const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
			setDebugLoggingEnabled(true)

			createLogger('test').debug('visible')

			expect(debug).toHaveBeenCalledTimes(1)
		})
	})
}
