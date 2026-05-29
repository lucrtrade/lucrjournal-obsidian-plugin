import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const obsidianMockPath = fileURLToPath(new URL('./test/mocks/obsidian.js', import.meta.url))
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const chartVersion = packageJson.chart_version

export default defineConfig({
	test: {
		environment: 'node',
		includeSource: ['src/**/*.{ts,tsx}'],
	},
	define: {
		__LUCRJOURNAL_CHART_VERSION__: JSON.stringify(chartVersion),
		__LUCRJOURNAL_CHART_IFRAME_URL__: JSON.stringify(`https://lucrchart.lucrtrade.com/lv/${chartVersion}`),
	},
	resolve: {
		alias: {
			obsidian: obsidianMockPath,
		},
	},
})
