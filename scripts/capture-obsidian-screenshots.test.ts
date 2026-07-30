import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
	buildDefaultScreenshotPlan,
	buildScreenshotPlan,
	captureScreenshotPlan,
	filterScreenshotPlan,
	parseScreenshotCliArgs,
} from './capture-obsidian-screenshots.ts'

describe('capture Obsidian screenshots', () => {
	// @story [[lucrjournal/tooling#^screenshot-matrix]] Covers the complete language theme and slug matrix
	it('keeps the fixed dashboard screenshot definitions in the helper', () => {
		const plan = buildDefaultScreenshotPlan({
			pluginId: 'lucrjournal',
			openJournalCommandId: 'open-journal',
		})

		const slugs = [
			'overview',
			'positions',
			'news',
			'key-level',
			'confluence',
			'market-analysis',
			'playbook',
			'settings-accounts',
			'settings-symbols',
			'position-detail-crypto-full',
			'position-detail-crypto-overview',
			'position-detail-crypto-info',
			'position-detail-crypto-media',
			'position-detail-crypto-notes',
			'position-detail-crypto-linked-context',
			'position-detail-crypto-playbook',
			'position-detail-future-full',
			'position-detail-future-overview',
			'position-detail-future-info',
			'position-detail-future-media',
			'position-detail-future-notes',
			'position-detail-future-linked-context',
			'position-detail-future-playbook',
			'position-detail-cfd-full',
			'position-detail-cfd-overview',
			'position-detail-cfd-info',
			'position-detail-cfd-media',
			'position-detail-cfd-notes',
			'position-detail-cfd-linked-context',
			'position-detail-cfd-playbook',
			'playbook-detail-full',
			'playbook-detail-criteria',
			'new-position-modal',
			'position-table-filters',
			'linked-entry-picker',
			'attachment-preview',
			'ocr-import-modal',
			'position-template-detail',
			'mobile-overview',
			'mobile-position-detail-crypto',
			'mobile-position-detail-future',
			'mobile-position-detail-cfd',
			'mobile-playbook-detail',
		]

		expect(plan.screenshots.map((screenshot) => screenshot.fileName)).toEqual(
			['en', 'zh'].flatMap(() => ['dark', 'light'].flatMap(() => slugs.map((slug) => `screenshot-${slug}.png`))),
		)
		expect(plan.screenshots).toHaveLength(172)
		expect(new Set(plan.screenshots.map((screenshot) => screenshot.fileName)).size).toBe(43)
		expect(plan.screenshots.find((screenshot) => screenshot.name === 'en-dark-position-detail-crypto-info')).toMatchObject({
			clipSelector: '[data-lj-panel="position-details-sidebar"]',
			fileName: 'screenshot-position-detail-crypto-info.png',
			lang: 'en',
			outputPath: join(process.cwd(), 'document/assets/en/dark/screenshot-position-detail-crypto-info.png'),
			waitFor: '[data-lj-panel="position-details-sidebar"]',
		})
		expect(plan.screenshots.find((screenshot) => screenshot.name === 'zh-light-mobile-overview')).toMatchObject({
			clipSelector: '.workspace-leaf.mod-active .view-content',
			fileName: 'screenshot-mobile-overview.png',
			lang: 'zh',
			outputPath: join(process.cwd(), 'document/assets/zh/light/screenshot-mobile-overview.png'),
			theme: 'light',
			mobile: true,
		})
		const cryptoDetail = plan.screenshots.find((screenshot) => screenshot.name === 'en-dark-position-detail-crypto-full')
		const futureDetail = plan.screenshots.find((screenshot) => screenshot.name === 'en-dark-position-detail-future-full')
		const futureMedia = plan.screenshots.find((screenshot) => screenshot.name === 'en-dark-position-detail-future-media')
		const cfdDetail = plan.screenshots.find((screenshot) => screenshot.name === 'en-dark-position-detail-cfd-full')
		expect(cryptoDetail.eval.join('\n')).toContain('BTCUSDT')
		expect(cryptoDetail.eval.join('\n')).toContain('POS-screenshot-fixture.svg')
		expect(cryptoDetail.eval.join('\n')).toContain('chart-iframe')
		expect(cryptoDetail.eval.join('\n')).toContain('data-lj-ready')
		expect(futureDetail.eval.join('\n')).toContain('M6E')
		expect(futureDetail.eval.join('\n')).not.toContain('chart-iframe')
		expect(futureMedia.eval.join('\n')).toContain('POS-screenshot-fixture.svg')
		expect(cfdDetail.eval.join('\n')).toContain('AUDCHF')
		expect(cfdDetail.eval.join('\n')).not.toContain('chart-iframe')
	})

	it('filters default screenshots by language, theme, slug, and match text', () => {
		const plan = buildDefaultScreenshotPlan({
			pluginId: 'lucrjournal',
			openJournalCommandId: 'open-journal',
		})
		const filters = parseScreenshotCliArgs([
			'--lang',
			'zh',
			'--theme=light',
			'--slug',
			'screenshot-position-detail-cfd-full.png',
			'--match',
			'cfd',
		])
		const filtered = filterScreenshotPlan(plan, filters)

		expect(filtered.screenshots.map((screenshot) => screenshot.name)).toEqual([
			'zh-light-position-detail-cfd-full',
		])
		expect(filtered.screenshots[0]?.outputPath).toBe(join(process.cwd(), 'document/assets/zh/light/screenshot-position-detail-cfd-full.png'))
	})

	it('builds screenshot paths and page commands from definitions', () => {
		const plan = buildScreenshotPlan({
			vault: 'Obsidian Sandbox',
			defaults: {
				theme: 'dark',
				waitFor: '[data-lj-root="journal-view"]',
				waitMs: 25,
			},
			screenshots: [
				{
					fileName: 'dashboard-overview.png',
					name: 'dashboard overview',
					page: 'journal',
				},
				{
					fileName: 'settings.png',
					page: 'workspace:settings',
					lang: 'zh',
					theme: 'light',
					mobile: true,
				},
			],
		}, {
			pluginId: 'lucrjournal',
			openJournalCommandId: 'open-journal',
		})

		expect(plan.outputDir).toBe(join(process.cwd(), 'document/assets'))
		expect(plan.screenshots[0]).toMatchObject({
			clipSelector: '.workspace-leaf.mod-active .view-content',
			fileName: 'dashboard-overview.png',
			name: 'dashboard overview',
			outputPath: join(process.cwd(), 'document/assets/dark/dashboard-overview.png'),
			pageCommands: [['command', 'id=lucrjournal:open-journal']],
			theme: 'dark',
			vaultName: 'Obsidian Sandbox',
			waitFor: '[data-lj-root="journal-view"]',
			waitMs: 25,
		})
		expect(plan.screenshots[1]).toMatchObject({
			clipSelector: '.workspace-leaf.mod-active .view-content',
			fileName: 'settings.png',
			name: 'settings.png',
			outputPath: join(process.cwd(), 'document/assets/zh/light/settings.png'),
			pageCommands: [['command', 'id=workspace:settings']],
			lang: 'zh',
			theme: 'light',
			mobile: true,
		})
	})

	// @story [[lucrjournal/tooling#^screenshot-capture]] Covers selector clips scaled CDP capture and output writes
	it('uses selector-based CDP clips and writes screenshots one by one', async () => {
		const calls = []
		const writes = []
		const plan = buildScreenshotPlan({
			vault: 'Obsidian Sandbox',
			defaults: {
				beforeCommands: [['eval', 'code=app.workspace.detachLeavesOfType("lucrjournal-view")']],
				waitFor: '[data-lj-panel="overview"]',
				waitMs: 0,
			},
			screenshots: [
				{
					fileName: 'overview.png',
					name: 'overview',
					page: 'journal',
					lang: 'zh',
					theme: 'dark',
					click: '[data-lj-tab="Positions"]',
					clipSelector: '[data-lj-panel="position-details-sidebar"]',
					eval: 'document.body.dataset.test = "1"',
				},
			],
		}, {
			pluginId: 'lucrjournal',
			openJournalCommandId: 'open-journal',
		})

		await captureScreenshotPlan(plan, {
			existsSync: () => true,
			mkdirSync: () => {},
			runObsidianCommand: (args, options) => {
				calls.push({ args, vaultName: options.vaultName })
				if (args[0] === 'dev:cdp' && args[1] === 'method=Runtime.evaluate') {
					return JSON.stringify({
						result: {
							value: {
								height: 700,
								width: 900,
								x: 10,
								y: 20,
							},
						},
					})
				}
				if (args[0] === 'dev:cdp' && args[1] === 'method=Page.captureScreenshot') {
					return JSON.stringify({ data: Buffer.from('png').toString('base64') })
				}
				return '=> 1'
			},
			sleep: async () => {},
			writeFileSync: (filePath, bytes) => {
				writes.push({ bytes, filePath })
			},
		})

		expect(calls).toEqual([
			{
				args: ['eval', expect.stringContaining('plugins.sync.disable')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['dev:debug', 'on'],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['dev:cdp', 'method=Emulation.clearDeviceMetricsOverride'],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', 'code=app.workspace.detachLeavesOfType("lucrjournal-view")'],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', expect.stringContaining('settingsManager.editAndSave')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['command', 'id=lucrjournal:open-journal'],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', expect.stringContaining('theme-dark')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', expect.stringContaining('data-lj-tab')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', 'code=document.body.dataset.test = "1"'],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', expect.stringContaining('document.querySelector("[data-lj-panel=\\"overview\\"]")')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', expect.stringContaining('scrollIntoView')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', expect.stringContaining('.notice-container')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['dev:cdp', 'method=Runtime.evaluate', expect.stringContaining('position-details-sidebar')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['dev:cdp', 'method=Page.captureScreenshot', expect.stringContaining('"clip":{"x":10,"y":20,"width":900,"height":700,"scale":0.5}')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['eval', expect.stringContaining('lucrjournal-screenshot-cleanup')],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['dev:cdp', 'method=Emulation.clearDeviceMetricsOverride'],
				vaultName: 'Obsidian Sandbox',
			},
			{
				args: ['dev:debug', 'off'],
				vaultName: 'Obsidian Sandbox',
			},
		])
		expect(calls[0].args[1]).toContain('.notice-container')
		expect(calls[0].args[1]).toContain('.status-bar')
		expect(calls[0].args[1]).toContain('.mobile-navbar')
		expect(calls[0].args[1]).toContain('scrollbar-width')
		expect(calls[0].args[1]).toContain('plugins.sync.disable')
		expect(writes).toHaveLength(1)
		expect(writes[0].filePath).toBe(join(process.cwd(), 'document/assets/zh/dark/overview.png'))
		expect(writes[0].bytes.toString()).toBe('png')
	})

	// @story [[lucrjournal/tooling#^screenshot-cleanup]] Covers ordered teardown of overlays debug metrics and mobile mode
	it('restores screenshot styles before turning mobile emulation off', async () => {
		const calls = []
		const plan = buildScreenshotPlan({
			vault: 'Obsidian Sandbox',
			defaults: {
				mobile: true,
				waitMs: 0,
			},
			screenshots: [
				{
					fileName: 'mobile.png',
					name: 'mobile',
					page: 'journal',
				},
			],
		}, {
			pluginId: 'lucrjournal',
			openJournalCommandId: 'open-journal',
		})

		await captureScreenshotPlan(plan, {
			existsSync: () => true,
			mkdirSync: () => {},
			runObsidianCommand: (args, options) => {
				calls.push({ args, vaultName: options.vaultName })
				if (args[0] === 'dev:cdp' && args[1] === 'method=Runtime.evaluate') {
					return JSON.stringify({
						result: {
							value: {
								height: 700,
								width: 900,
								x: 10,
								y: 20,
							},
						},
					})
				}
				if (args[0] === 'dev:cdp' && args[1] === 'method=Page.captureScreenshot') {
					return JSON.stringify({ data: Buffer.from('png').toString('base64') })
				}
				return '=> 1'
			},
			sleep: async () => {},
			writeFileSync: () => {},
		})

		const restoreIndex = calls.findIndex((call) => call.args[0] === 'eval' && call.args[1].includes('lucrjournal-screenshot-cleanup")?.remove'))
		const setMetricsIndex = calls.findIndex((call) => call.args[0] === 'dev:cdp' && call.args[1] === 'method=Emulation.setDeviceMetricsOverride')
		const commandIndex = calls.findIndex((call) => call.args[0] === 'command' && call.args[1] === 'id=lucrjournal:open-journal')
		const clearMetricsIndex = calls.findLastIndex((call) => call.args[0] === 'dev:cdp' && call.args[1] === 'method=Emulation.clearDeviceMetricsOverride')
		const debugOffIndex = calls.findIndex((call) => call.args[0] === 'dev:debug' && call.args[1] === 'off')
		const mobileOffIndex = calls.findIndex((call) => call.args[0] === 'dev:mobile' && call.args[1] === 'off')

		expect(setMetricsIndex).toBeGreaterThan(-1)
		expect(commandIndex).toBeGreaterThan(-1)
		expect(clearMetricsIndex).toBeGreaterThan(-1)
		expect(restoreIndex).toBeGreaterThan(-1)
		expect(debugOffIndex).toBeGreaterThan(-1)
		expect(mobileOffIndex).toBeGreaterThan(-1)
		expect(calls[setMetricsIndex]?.args[2]).toContain('"width":393')
		expect(calls[setMetricsIndex]?.args[2]).toContain('"height":852')
		expect(setMetricsIndex).toBeLessThan(commandIndex)
		expect(restoreIndex).toBeLessThan(debugOffIndex)
		expect(clearMetricsIndex).toBeLessThan(debugOffIndex)
		expect(debugOffIndex).toBeLessThan(mobileOffIndex)
	})

	it('fails when the Obsidian CLI returns an error', async () => {
		const plan = buildScreenshotPlan({
			screenshots: [
				{
					fileName: 'overview.png',
					name: 'overview',
					page: 'journal',
				},
			],
		}, {
			pluginId: 'lucrjournal',
			openJournalCommandId: 'open-journal',
		})

		await expect(captureScreenshotPlan(plan, {
			existsSync: () => true,
			mkdirSync: () => {},
			runObsidianCommand: () => 'Error: screenshot failed',
		})).rejects.toThrow('Obsidian CLI failed')
	})
})
