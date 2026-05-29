declare const __LUCRJOURNAL_BUILD_ENVIRONMENT__: 'development' | 'production'
declare const __LUCRJOURNAL_GIT_COMMIT_SHA__: string
declare const __LUCRJOURNAL_BUILD_TIMESTAMP__: string
declare const __LUCRJOURNAL_REPOSITORY__: string

import { createLogger } from './logger'

const logger = createLogger('build')

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
