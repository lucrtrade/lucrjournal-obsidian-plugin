declare const __LUCRJOURNAL_CHART_VERSION__: string
declare const __LUCRJOURNAL_CHART_IFRAME_URL__: string
declare const __LUCRJOURNAL_APP_URL__: string
declare const __LUCRJOURNAL_BUILD_ENVIRONMENT__: 'development' | 'production'
declare const __LUCRJOURNAL_GIT_COMMIT_SHA__: string
declare const __LUCRJOURNAL_BUILD_TIMESTAMP__: string
declare const __LUCRJOURNAL_REPOSITORY__: string

import { createLogger } from './logger'

const logger = createLogger('build')

export const LUCR_JOURNAL_VIEW_TYPE = 'lucrjournal-view'
export const LUCR_POSITION_VIEW_TYPE = 'lucrjournal-position-view'
export const LUCR_PLAYBOOK_VIEW_TYPE = 'lucrjournal-playbook-view'
export const OPEN_JOURNAL_COMMAND_ID = 'open-journal'
export const LUCR_TRADE_ROOT_DIR = 'LucrJournal'
export const LUCR_TRADE_ATTACHMENTS_DIR = `${LUCR_TRADE_ROOT_DIR}/attachments`

export const APP_URL = typeof __LUCRJOURNAL_APP_URL__ === 'string'
	? __LUCRJOURNAL_APP_URL__
	: 'https://app.lucrtrade.com'

const LUCRCHART_URL = 'https://lucrchart.lucrtrade.com/'
export const LUCRCHART_IFRAME_URL = typeof __LUCRJOURNAL_CHART_IFRAME_URL__ === 'string'
	? __LUCRJOURNAL_CHART_IFRAME_URL__
	: `${LUCRCHART_URL.replace(/\/$/, '')}/lc/${__LUCRJOURNAL_CHART_VERSION__}`
export const LUCRCHART_ORIGIN = new URL(LUCRCHART_IFRAME_URL).origin

export const BUILD_INFO = {
	environment: typeof __LUCRJOURNAL_BUILD_ENVIRONMENT__ === 'string'
		? __LUCRJOURNAL_BUILD_ENVIRONMENT__
		: 'development',
	gitCommitSha: typeof __LUCRJOURNAL_GIT_COMMIT_SHA__ === 'string'
		? __LUCRJOURNAL_GIT_COMMIT_SHA__
		: 'unknown',
	buildTimestamp: typeof __LUCRJOURNAL_BUILD_TIMESTAMP__ === 'string'
		? __LUCRJOURNAL_BUILD_TIMESTAMP__
		: new Date(0).toISOString(),
	repository: typeof __LUCRJOURNAL_REPOSITORY__ === 'string'
		? __LUCRJOURNAL_REPOSITORY__
		: '',
} as const

export function logBuildInfo(version: string): void {
	logger.debug('build metadata', {
		version,
		environment: BUILD_INFO.environment,
		gitCommitSha: BUILD_INFO.gitCommitSha,
		buildTimestamp: BUILD_INFO.buildTimestamp,
		repository: BUILD_INFO.repository,
	})
}
