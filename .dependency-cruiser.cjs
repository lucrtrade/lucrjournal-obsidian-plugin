/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: 'no-circular',
			severity: 'error',
			from: {
				path: '^src/',
			},
			to: {
				circular: true,
			},
		},
		{
			name: 'domains-not-to-runtime-ui',
			severity: 'error',
			from: {
				path: '^src/domains/',
			},
			to: {
				path: '^src/(editor|metadata|ui|views)/',
			},
		},
		{
			name: 'editor-not-to-ui',
			severity: 'error',
			from: {
				path: '^src/editor/',
			},
			to: {
				path: '^src/(ui|views)/',
			},
		},
		{
			name: 'metadata-not-to-runtime-ui',
			severity: 'error',
			from: {
				path: '^src/metadata/',
			},
			to: {
				path: '^src/(editor|ui|views)/',
			},
		},
	],
	options: {
		doNotFollow: {
			path: 'node_modules',
		},
		includeOnly: '^src/',
		moduleSystems: ['es6', 'cjs'],
		tsConfig: {
			fileName: 'tsconfig.json',
		},
		tsPreCompilationDeps: false,
		skipAnalysisNotInRules: true,
	},
}
