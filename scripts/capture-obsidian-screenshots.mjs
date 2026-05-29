import { execFileSync } from 'node:child_process'
import { existsSync as nodeExistsSync, mkdirSync as nodeMkdirSync, readFileSync, writeFileSync as nodeWriteFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createJiti } from 'jiti'

const projectRootPath = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_POLL_MS = 100
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_WAIT_MS = 500
const OBSIDIAN_CLI_TIMEOUT_MS = 120000
const SCREENSHOT_CLIP_SCALE = 0.5
const ACTIVE_VIEW_SELECTOR = '.workspace-leaf.mod-active .view-content'
const SCREENSHOT_CLEANUP_STYLE_ID = 'lucrjournal-screenshot-cleanup'
const SCREENSHOT_CLEANUP_CSS = `
.notice-container,
.notice,
.status-bar,
.sync-status-icon,
.workspace-sync-status-icon,
.workspace-drawer-vault-actions,
[aria-label="Open sync log"],
[aria-label="Sync status"],
[aria-label*="Sync"] {
	display: none !important;
	opacity: 0 !important;
	visibility: hidden !important;
	pointer-events: none !important;
}
`

const DEFAULT_SCREENSHOT_CONFIG = {
	vault: 'Obsidian Sandbox',
	defaults: {
		beforeCommands: [
			[
				'eval',
				"code=(async()=>{await app.workspace.detachLeavesOfType('lucrjournal-view');return 1})()",
			],
		],
		mobile: false,
		page: 'journal',
		waitMs: 500,
	},
	screenshots: buildDefaultScreenshotDefinitions(),
}

function buildDefaultScreenshotDefinitions() {
	const definitions = [
		{
			slug: 'overview',
			waitFor: '[data-lj-panel="overview"]',
		},
		{
			slug: 'positions',
			click: '[data-lj-tab="Positions"]',
			waitFor: '[data-lj-tab="Positions"][data-lj-active="true"]',
		},
		{
			slug: 'news',
			click: '[data-lj-tab="News"]',
			waitFor: '[data-lj-panel="meta:News"]',
		},
		{
			slug: 'key-level',
			click: '[data-lj-tab="Analysis"]',
			waitFor: '[data-lj-panel="meta:Key Levels"]',
		},
		{
			slug: 'confluence',
			eval: buildDashboardAnalysisScript('Confluence'),
			waitFor: '[data-lj-panel="meta:Confluence"]',
		},
		{
			slug: 'market-analysis',
			eval: buildDashboardAnalysisScript('Market Analysis'),
			waitFor: '[data-lj-panel="meta:Market Analysis"]',
		},
		{
			slug: 'playbook',
			click: '[data-lj-tab="Playbook"]',
			waitFor: '[data-lj-panel="playbook"]',
		},
		{
			slug: 'settings-accounts',
			click: '[data-lj-control="settings-toggle"]',
			waitFor: '[data-lj-panel="settings"]',
		},
		{
			slug: 'settings-symbols',
			eval: buildSettingsSymbolsScript(),
			waitFor: '[data-lj-tab="Symbols"][data-lj-active="true"]',
		},
		...buildPositionDetailDefinitions('crypto', 'BTCUSDT', true),
		...buildPositionDetailDefinitions('future', 'MES', false),
		...buildPositionDetailDefinitions('cfd', 'EURUSD', false),
		{
			slug: 'playbook-detail-full',
			eval: buildOpenFirstPlaybookScript(),
			waitFor: '[data-lj-panel="playbook-details"]',
		},
		{
			slug: 'playbook-detail-criteria',
			eval: buildOpenFirstPlaybookScript(),
			clipSelector: '[data-lj-panel="playbook-details-criteria"]',
			waitFor: '[data-lj-panel="playbook-details-criteria"]',
		},
		{
			slug: 'new-position-modal',
			eval: buildNewPositionModalScript(),
			clipSelector: '[data-lj-panel="new-position-modal"]',
			waitFor: '[data-lj-panel="new-position-modal"]',
		},
		{
			slug: 'position-table-filters',
			eval: buildPositionTableFiltersScript(),
			waitFor: '[data-lj-panel="table-filter-popover"]',
		},
		{
			slug: 'linked-entry-picker',
			eval: buildLinkedEntryPickerScript(),
			clipSelector: '[data-lj-panel="linked-entry-picker"]',
			waitFor: '[data-lj-panel="linked-entry-picker"]',
		},
		{
			slug: 'attachment-preview',
			eval: buildAttachmentPreviewScript(),
			waitFor: '[data-lj-panel="attachment-lightbox"]',
		},
		{
			slug: 'ocr-import-modal',
			eval: buildOcrImportModalScript(),
			clipSelector: '[data-lj-panel="attachment-ocr-import"]',
			waitFor: '[data-lj-panel="attachment-ocr-import"]',
		},
		{
			slug: 'position-template-detail',
			eval: buildPositionTemplateDetailScript(),
			waitFor: '[data-lj-panel="position-template-details"]',
		},
		{
			slug: 'mobile-overview',
			mobile: true,
			waitFor: '[data-lj-panel="overview"]',
			waitMs: 1000,
		},
		{
			slug: 'mobile-position-detail-crypto',
			eval: buildOpenPositionBySymbolScript('BTCUSDT', true, true),
			mobile: true,
			waitFor: '[data-lj-panel="position-details"]',
			waitMs: 1000,
		},
		{
			slug: 'mobile-position-detail-future',
			eval: buildOpenPositionBySymbolScript('MES', false, true),
			mobile: true,
			waitFor: '[data-lj-panel="position-details"]',
			waitMs: 1000,
		},
		{
			slug: 'mobile-position-detail-cfd',
			eval: buildOpenPositionBySymbolScript('EURUSD', false, true),
			mobile: true,
			waitFor: '[data-lj-panel="position-details"]',
			waitMs: 1000,
		},
		{
			slug: 'mobile-playbook-detail',
			eval: buildOpenFirstPlaybookScript(),
			mobile: true,
			waitFor: '[data-lj-panel="playbook-details"]',
			waitMs: 1000,
		},
	]

	return ['en', 'zh'].flatMap((lang) => ['dark', 'light'].flatMap((theme) => definitions.map(({ slug, ...definition }) => ({
		...definition,
		fileName: `screenshot-${slug}.png`,
		lang,
		name: `${lang}-${theme}-${slug}`,
		slug,
		theme,
	}))))
}

function buildDashboardAnalysisScript(label) {
	return buildAsyncScript(
		waitHelperStatement(),
		clickTabStatement('Analysis'),
		clickTabStatement(`Analysis:${label}`),
	)
}

function buildSettingsSymbolsScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		clickControlStatement('settings-toggle'),
		clickTabStatement('Symbols'),
	)
}

function buildPositionDetailDefinitions(kind, symbol, waitForChart) {
	const openScript = buildOpenPositionBySymbolScript(symbol, waitForChart)
	const openScriptWithAttachment = buildOpenPositionBySymbolScript(symbol, waitForChart, true)

	return [
		{
			slug: `position-detail-${kind}-full`,
			eval: openScriptWithAttachment,
			waitFor: '[data-lj-panel="position-details"]',
		},
		{
			slug: `position-detail-${kind}-overview`,
			eval: openScript,
			clipSelector: '[data-lj-panel="position-details-overview"]',
			waitFor: '[data-lj-panel="position-details-overview"]',
		},
		{
			slug: `position-detail-${kind}-info`,
			eval: openScript,
			clipSelector: '[data-lj-panel="position-details-sidebar"]',
			waitFor: '[data-lj-panel="position-details-sidebar"]',
		},
		{
			slug: `position-detail-${kind}-media`,
			eval: openScriptWithAttachment,
			clipSelector: '[data-lj-panel="position-details-media"]',
			waitFor: '[data-lj-panel="position-details-media"]',
		},
		{
			slug: `position-detail-${kind}-notes`,
			eval: openScript,
			clipSelector: '[data-lj-panel="position-details-bottom"]',
			waitFor: '[data-lj-panel="note-editor"]',
		},
		{
			slug: `position-detail-${kind}-linked-context`,
			eval: buildOpenPositionBottomTabBySymbolScript(symbol, 'position-details:news', waitForChart),
			clipSelector: '[data-lj-panel="position-details-bottom"]',
			waitFor: '[data-lj-panel="position-details-bottom"]',
		},
		{
			slug: `position-detail-${kind}-playbook`,
			eval: buildOpenPositionBottomTabBySymbolScript(symbol, 'position-details:playbook', waitForChart),
			clipSelector: '[data-lj-panel="position-details-bottom"]',
			waitFor: '[data-lj-panel="position-details-bottom"]',
		},
	]
}

function buildOpenPositionBySymbolScript(symbol, waitForChart, withAttachment = false) {
	return buildAsyncScript(
		waitHelperStatement(),
		withAttachment ? ensureScreenshotAttachmentStatement(symbol) : '',
		clickTabStatement('Positions'),
		setDashboardSearchStatement(symbol),
		`const row=await waitForText("tbody tr",${JSON.stringify(symbol)})`,
		'row.click()',
		'await new Promise(requestAnimationFrame)',
		'await waitFor("[data-lj-panel=\\"position-details\\"]")',
		waitForChart ? 'await waitFor("[data-lj-control=\\"chart-iframe\\"][data-lj-ready=\\"true\\"]")' : '',
	)
}

function buildOpenPositionBottomTabBySymbolScript(symbol, tab, waitForChart) {
	return buildAsyncScript(
		waitHelperStatement(),
		clickTabStatement('Positions'),
		setDashboardSearchStatement(symbol),
		`const row=await waitForText("tbody tr",${JSON.stringify(symbol)})`,
		'row.click()',
		'await waitFor("[data-lj-panel=\\"position-details-bottom\\"]")',
		waitForChart ? 'await waitFor("[data-lj-control=\\"chart-iframe\\"][data-lj-ready=\\"true\\"]")' : '',
		`(await waitFor(${JSON.stringify(`[data-lj-tab="${tab}"]`)})).click()`,
		'await new Promise(requestAnimationFrame)',
	)
}

function buildOpenFirstPlaybookScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		clickTabStatement('Playbook'),
		clickControlStatement('dashboard-playbook-open'),
	)
}

function buildNewPositionModalScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		clickControlStatement('new-position'),
	)
}

function buildPositionTableFiltersScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		clickTabStatement('Positions'),
		clickControlStatement('dashboard-table-filter'),
	)
}

function buildLinkedEntryPickerScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		clickTabStatement('Positions'),
		setDashboardSearchStatement('BTCUSDT'),
		'const row=await waitForText("tbody tr","BTCUSDT")',
		'row.click()',
		'await waitFor("[data-lj-panel=\\"position-details-bottom\\"]")',
		'(await waitFor("[data-lj-tab=\\"position-details:news\\"]")).click()',
		'await new Promise(requestAnimationFrame)',
		clickControlStatement('linked-entry-picker-open'),
	)
}

function buildAttachmentPreviewScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		ensureScreenshotAttachmentStatement('BTCUSDT'),
		clickTabStatement('Positions'),
		setDashboardSearchStatement('BTCUSDT'),
		'const row=await waitForText("tbody tr","BTCUSDT")',
		'row.click()',
		'await waitFor("[data-lj-control=\\"open-attachment-preview\\"]")',
		clickControlStatement('open-attachment-preview'),
	)
}

function buildOcrImportModalScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		clickTabStatement('Positions'),
		setDashboardSearchStatement('BTCUSDT'),
		'const row=await waitForText("tbody tr","BTCUSDT")',
		'row.click()',
		'await waitFor("[data-lj-control=\\"attachment-ocr-import-open\\"]")',
		clickControlStatement('attachment-ocr-import-open'),
	)
}

function buildPositionTemplateDetailScript() {
	return buildAsyncScript(
		waitHelperStatement(),
		clickControlStatement('new-position-template-menu'),
		clickControlStatement('new-position-template-edit'),
	)
}

function waitHelperStatement() {
	return 'const waitFor=async(selector)=>{for(let i=0;i<150;i+=1){const el=document.querySelector(selector);if(el!==null){return el}await new Promise((resolve)=>setTimeout(resolve,100))}throw new Error("Missing screenshot selector: "+selector)};const waitForText=async(selector,text)=>{for(let i=0;i<150;i+=1){const el=[...document.querySelectorAll(selector)].find((item)=>item.textContent?.includes(text));if(el!==undefined){return el}await new Promise((resolve)=>setTimeout(resolve,100))}throw new Error("Missing screenshot text selector: "+selector+" "+text)}'
}

function clickTabStatement(tab) {
	return `(await waitFor(${JSON.stringify(`[data-lj-tab="${tab}"]`)})).click();await new Promise(requestAnimationFrame)`
}

function clickControlStatement(control) {
	return `(await waitFor(${JSON.stringify(`[data-lj-control="${control}"]`)})).click();await new Promise(requestAnimationFrame)`
}

function setDashboardSearchStatement(query) {
	return `const search=await waitFor("[data-lj-control=\\"dashboard-table-search\\"]");search.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(search,${JSON.stringify(query)});search.dispatchEvent(new Event("input",{bubbles:true}));search.dispatchEvent(new Event("change",{bubbles:true}));await new Promise((resolve)=>setTimeout(resolve,250))`
}

function ensureScreenshotAttachmentStatement(symbol) {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101214"/><stop offset="1" stop-color="#272b32"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><path d="M80 390 C210 230 315 315 420 210 S660 230 880 120" fill="none" stroke="#f5f5f5" stroke-width="10" stroke-linecap="round"/><path d="M80 410 C230 300 330 360 430 285 S650 310 880 210" fill="none" stroke="#8a8f98" stroke-width="6" stroke-linecap="round"/><circle cx="420" cy="210" r="14" fill="#f5f5f5"/><circle cx="880" cy="120" r="14" fill="#f5f5f5"/></svg>'
	const symbolMatch = symbol === undefined ? 'true' : `String(frontmatter?.symbol??"").includes(${JSON.stringify(symbol)})`

	return `const attachmentDir="LucrJournal/attachments";const attachmentPath=attachmentDir+"/POS-screenshot-fixture.svg";const token="[["+attachmentPath+"|Screenshot fixture]]";if(app.vault.getAbstractFileByPath(attachmentDir)===null){await app.vault.createFolder(attachmentDir)}if(app.vault.getAbstractFileByPath(attachmentPath)===null){await app.vault.createBinary(attachmentPath,new TextEncoder().encode(${JSON.stringify(svg)}).buffer)}const files=app.vault.getMarkdownFiles().filter((file)=>{if(!file.path.startsWith("LucrJournal/positions/")){return false}const frontmatter=app.metadataCache.getFileCache(file)?.frontmatter;return ${symbolMatch}});await Promise.all(files.map((file)=>app.fileManager.processFrontMatter(file,(frontmatter)=>{const current=Array.isArray(frontmatter.attachments)?frontmatter.attachments.map(String):[];if(!current.includes(token)){frontmatter.attachments=[token,...current]}})));await new Promise((resolve)=>setTimeout(resolve,300))`
}

function buildAsyncScript(...statements) {
	return `(async()=>{${statements.join(';')};return 1})()`
}

export function buildDefaultScreenshotPlan(options) {
	return buildScreenshotPlan(DEFAULT_SCREENSHOT_CONFIG, options)
}

export function buildScreenshotPlan(config, options) {
	const outputDir = path.join(options.projectRootPath ?? projectRootPath, 'document/assets')
	const defaults = config.defaults ?? {}
	const screenshots = config.screenshots ?? config.shots

	if (!Array.isArray(screenshots)) {
		throw new Error('[obsidian-screenshot] config.screenshots must be an array.')
	}

	const seenOutputPaths = new Set()

	return {
		outputDir,
		screenshots: screenshots.map((entry) => {
			const definition = { ...defaults, ...entry }
			const fileName = normalizeFileName(definition.fileName)
			const name = definition.name ?? fileName

			if (typeof name !== 'string' || name.trim() === '') {
				throw new Error('[obsidian-screenshot] screenshot.name must be a non-empty string.')
			}

			const lang = normalizeLang(definition.lang)
			const theme = normalizeTheme(definition.theme)
			const outputPath = path.join(outputDir, ...buildOutputPathParts(lang, theme), fileName)
			if (seenOutputPaths.has(outputPath)) {
				throw new Error(`[obsidian-screenshot] duplicate screenshot output path: ${outputPath}`)
			}
			seenOutputPaths.add(outputPath)

			return {
				fileName,
				name,
				outputPath,
				slug: normalizeOptionalString(definition.slug),
				pageCommands: resolvePageCommands(definition.page, options),
				beforeCommands: normalizeCommands(definition.beforeCommands),
				commands: normalizeCommands(definition.commands),
				click: normalizeStringList(definition.click),
				clipSelector: normalizeOptionalString(definition.clipSelector) ?? ACTIVE_VIEW_SELECTOR,
				cssTheme: normalizeOptionalString(definition.cssTheme),
				eval: normalizeStringList(definition.eval),
				lang,
				mobile: normalizeOptionalBoolean(definition.mobile),
				pollMs: normalizeNumber(definition.pollMs, DEFAULT_POLL_MS),
				theme,
				timeoutMs: normalizeNumber(definition.timeoutMs, DEFAULT_TIMEOUT_MS),
				vaultName: normalizeOptionalString(definition.vault ?? config.vault),
				waitFor: normalizeOptionalString(definition.waitFor),
				waitMs: normalizeNumber(definition.waitMs, DEFAULT_WAIT_MS),
			}
		}),
	}
}

export function filterScreenshotPlan(plan, filters) {
	const langs = normalizeFilterSet(filters.lang)
	const themes = normalizeFilterSet(filters.theme)
	const slugs = normalizeFilterSet(filters.slug)
	const matches = normalizeFilterSet(filters.match)
	const screenshots = plan.screenshots.filter((screenshot) => (
		matchesFilter(langs, screenshot.lang)
		&& matchesFilter(themes, screenshot.theme)
		&& matchesFilter(slugs, screenshot.slug)
		&& matchesTextFilter(matches, [
			screenshot.fileName,
			screenshot.name,
			screenshot.outputPath,
			screenshot.slug,
		])
	))

	return {
		...plan,
		screenshots,
	}
}

export function parseScreenshotCliArgs(args) {
	const filters = {
		lang: [],
		list: false,
		match: [],
		slug: [],
		theme: [],
	}

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]
		if (arg === '--list') {
			filters.list = true
			continue
		}
		if (arg === '--help' || arg === '-h') {
			filters.help = true
			continue
		}

		const [key, inlineValue] = arg.split('=', 2)
		if (!isFilterArg(key)) {
			throw new Error(`[obsidian-screenshot] unknown argument: ${arg}`)
		}

		const value = inlineValue ?? args[index + 1]
		if (value === undefined || value.startsWith('--')) {
			throw new Error(`[obsidian-screenshot] missing value for ${key}`)
		}
		if (inlineValue === undefined) {
			index += 1
		}

		pushFilterValues(filters, key, value)
	}

	return filters
}

function isFilterArg(key) {
	return key === '--lang'
		|| key === '--theme'
		|| key === '--slug'
		|| key === '--match'
		|| key === '--name'
		|| key === '--part'
		|| key === '--only'
}

function pushFilterValues(filters, key, value) {
	const values = value.split(',').map((item) => item.trim()).filter((item) => item !== '')
	if (values.length === 0) {
		throw new Error(`[obsidian-screenshot] empty value for ${key}`)
	}

	switch (key) {
		case '--lang':
			filters.lang.push(...values)
			break
		case '--theme':
			filters.theme.push(...values)
			break
		case '--slug':
			filters.slug.push(...values.map((item) => item.replace(/^screenshot-/, '').replace(/\.png$/, '')))
			break
		case '--match':
		case '--part':
		case '--only':
		case '--name':
			filters.match.push(...values)
			break
		default:
			throw new Error(`[obsidian-screenshot] unknown argument: ${key}`)
	}
}

function normalizeFilterSet(values) {
	return values.length === 0 ? null : new Set(values)
}

function matchesFilter(set, value) {
	return set === null || (value !== undefined && set.has(value))
}

function matchesTextFilter(set, values) {
	if (set === null) {
		return true
	}

	return [...set].some((match) => values.some((value) => value?.includes(match)))
}

function printScreenshotPlan(plan) {
	for (const screenshot of plan.screenshots) {
		console.log([
			screenshot.lang ?? '-',
			screenshot.theme ?? '-',
			screenshot.slug ?? screenshot.fileName,
			screenshot.outputPath,
		].join('\t'))
	}
}

function printUsage() {
	console.log(`Usage: node scripts/capture-obsidian-screenshots.mjs [filters]

Filters:
  --lang en|zh          Filter by language. Repeat or use comma values.
  --theme dark|light    Filter by theme. Repeat or use comma values.
  --slug <slug>         Filter exact screenshot slug. "screenshot-" and ".png" are optional.
  --match <text>        Match text in slug, name, fileName, or output path.
  --part <text>         Alias for --match.
  --only <text>         Alias for --match.
  --list                Print selected screenshots without capturing.
`)
}

export async function captureScreenshotPlan(plan, dependencies = {}) {
	const existsSync = dependencies.existsSync ?? nodeExistsSync
	const mkdirSync = dependencies.mkdirSync ?? nodeMkdirSync
	const run = dependencies.runObsidianCommand ?? runObsidianCommand
	const sleep = dependencies.sleep ?? sleepMs
	const writeFileSync = dependencies.writeFileSync ?? nodeWriteFileSync
	let currentLang
	let currentMobile

	mkdirSync(plan.outputDir, { recursive: true })
	callObsidian(run, { vaultName: plan.screenshots[0]?.vaultName }, ['eval', `code=${buildCleanScreenshotOverlaysScript()}`])
	callObsidian(run, { vaultName: plan.screenshots[0]?.vaultName }, ['dev:debug', 'on'])

	try {
		for (const screenshot of plan.screenshots) {
			for (const command of screenshot.beforeCommands) {
				callObsidian(run, screenshot, command)
			}

			if (screenshot.cssTheme !== undefined) {
				callObsidian(run, screenshot, ['theme:set', `name=${screenshot.cssTheme}`])
			}

			if (screenshot.mobile !== undefined && screenshot.mobile !== currentMobile) {
				callObsidian(run, screenshot, ['dev:mobile', screenshot.mobile ? 'on' : 'off'])
				currentMobile = screenshot.mobile
				await sleep(screenshot.waitMs)
			}

			if (screenshot.lang !== undefined && screenshot.lang !== currentLang) {
				callObsidian(run, screenshot, ['eval', `code=${buildSetLanguageScript(screenshot.lang)}`])
				currentLang = screenshot.lang
				await sleep(screenshot.waitMs)
			}

			for (const command of screenshot.pageCommands) {
				callObsidian(run, screenshot, command)
			}

			await sleep(screenshot.waitMs)

			if (screenshot.theme !== undefined) {
				callObsidian(run, screenshot, ['eval', `code=${buildThemeScript(screenshot.theme)}`])
			}

			for (const command of screenshot.commands) {
				callObsidian(run, screenshot, command)
			}

			for (const selector of screenshot.click) {
				callObsidian(run, screenshot, ['eval', `code=${buildClickScript(selector)}`])
			}

			for (const script of screenshot.eval) {
				callObsidian(run, screenshot, ['eval', `code=${script}`])
			}

			if (screenshot.waitFor !== undefined) {
				await waitForSelector(run, sleep, screenshot)
			}

			if (screenshot.clipSelector !== ACTIVE_VIEW_SELECTOR) {
				callObsidian(run, screenshot, ['eval', `code=${buildScrollClipSelectorScript(screenshot.clipSelector)}`])
				await sleep(screenshot.waitMs)
			}

			mkdirSync(path.dirname(screenshot.outputPath), { recursive: true })
			callObsidian(run, screenshot, ['eval', `code=${buildCleanScreenshotOverlaysScript()}`])
			captureCurrentViewScreenshot(run, writeFileSync, screenshot)

			if (!existsSync(screenshot.outputPath)) {
				throw new Error(`[obsidian-screenshot] screenshot was not written: ${screenshot.outputPath}`)
			}

			console.log(`[obsidian-screenshot] Captured ${screenshot.name}: ${screenshot.outputPath}`)
		}
	} finally {
		try {
			try {
				callObsidian(run, { vaultName: plan.screenshots[0]?.vaultName }, ['eval', `code=${buildRestoreScreenshotOverlaysScript()}`])
			} finally {
				callObsidian(run, { vaultName: plan.screenshots[0]?.vaultName }, ['dev:debug', 'off'])
			}
		} finally {
			if (currentMobile === true) {
				callObsidian(run, { vaultName: plan.screenshots[0]?.vaultName }, ['dev:mobile', 'off'])
			}
		}
	}
}

function normalizeFileName(fileName) {
	if (typeof fileName !== 'string' || fileName.trim() === '') {
		throw new Error('[obsidian-screenshot] screenshot.fileName must be a non-empty PNG file name.')
	}

	if (fileName !== fileName.trim() || fileName.includes('/') || fileName.includes('\\') || path.isAbsolute(fileName)) {
		throw new Error(`[obsidian-screenshot] invalid screenshot fileName: ${fileName}`)
	}

	if (!fileName.endsWith('.png')) {
		throw new Error(`[obsidian-screenshot] screenshot.fileName must end with .png: ${fileName}`)
	}

	return fileName
}

function resolvePageCommands(page, options) {
	if (page === undefined) {
		return []
	}

	if (typeof page === 'string') {
		switch (page) {
			case 'journal':
				return [['command', `id=${options.pluginId}:${options.openJournalCommandId}`]]
			default:
				return [['command', `id=${page}`]]
		}
	}

	if (typeof page !== 'object' || page === null) {
		throw new Error('[obsidian-screenshot] screenshot.page must be a string or object.')
	}

	if (typeof page.command === 'string') {
		return [['command', `id=${page.command}`]]
	}

	if (typeof page.path === 'string') {
		return [openFileCommand('path', page.path, page)]
	}

	if (typeof page.file === 'string') {
		return [openFileCommand('file', page.file, page)]
	}

	if (typeof page.view === 'string') {
		return [['tab:open', `view=${page.view}`]]
	}

	throw new Error('[obsidian-screenshot] unsupported screenshot.page object.')
}

function openFileCommand(kind, value, page) {
	const args = ['open', `${kind}=${value}`]

	if (page.newtab === true) {
		args.push('newtab')
	}

	return args
}

function normalizeCommands(commands) {
	if (commands === undefined) {
		return []
	}

	if (!Array.isArray(commands)) {
		throw new Error('[obsidian-screenshot] screenshot.commands must be an array.')
	}

	return commands.map((command) => {
		if (!Array.isArray(command) || command.some((arg) => typeof arg !== 'string')) {
			throw new Error('[obsidian-screenshot] each screenshot.commands item must be a string array.')
		}

		if (command.length === 0) {
			throw new Error('[obsidian-screenshot] screenshot.commands item cannot be empty.')
		}

		return command
	})
}

function normalizeStringList(value) {
	if (value === undefined) {
		return []
	}

	if (typeof value === 'string') {
		return [value]
	}

	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return value
	}

	throw new Error('[obsidian-screenshot] expected a string or string array.')
}

function normalizeOptionalString(value) {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'string') {
		throw new Error('[obsidian-screenshot] expected a string value.')
	}

	return value
}

function normalizeOptionalBoolean(value) {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'boolean') {
		throw new Error('[obsidian-screenshot] expected a boolean value.')
	}

	return value
}

function normalizeLang(lang) {
	if (lang === undefined) {
		return undefined
	}

	if (lang !== 'en' && lang !== 'zh') {
		throw new Error('[obsidian-screenshot] screenshot.lang must be "en" or "zh".')
	}

	return lang
}

function normalizeNumber(value, fallback) {
	if (value === undefined) {
		return fallback
	}

	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new Error('[obsidian-screenshot] expected a non-negative number.')
	}

	return value
}

function normalizeTheme(theme) {
	if (theme === undefined) {
		return undefined
	}

	if (theme !== 'light' && theme !== 'dark') {
		throw new Error('[obsidian-screenshot] screenshot.theme must be "light" or "dark". Use cssTheme for installed Obsidian themes.')
	}

	return theme
}

function buildOutputPathParts(lang, theme) {
	const parts = []
	if (lang !== undefined) {
		parts.push(lang)
	}
	if (theme !== undefined) {
		parts.push(theme)
	}
	return parts
}

function buildThemeScript(theme) {
	return `document.body.classList.remove('theme-light','theme-dark');document.body.classList.add('theme-${theme}');1`
}

function buildSetLanguageScript(lang) {
	return `(async()=>{const plugin=app.plugins.plugins.lucrjournal;if(plugin===undefined){throw new Error("LucrJournal plugin is not loaded")}await plugin.settingsManager.editAndSave((settings)=>{settings.lang=${JSON.stringify(lang)}});plugin.refreshLocalizedUi();return 1})()`
}

function buildClickScript(selector) {
	return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el === null) { throw new Error('Missing screenshot click selector') } el.click(); return 1 })()`
}

function buildScrollClipSelectorScript(selector) {
	return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el === null) { throw new Error('Missing screenshot clip selector') } el.scrollIntoView({ block: 'center', inline: 'center' }); return 1 })()`
}

function buildCleanScreenshotOverlaysScript() {
	return `(async()=>{const sync=app.internalPlugins.plugins.sync;if(sync?.enabled){await app.internalPlugins.plugins.sync.disable()}document.querySelectorAll('.notice-container,.notice').forEach((el)=>el.remove());let style=document.getElementById(${JSON.stringify(SCREENSHOT_CLEANUP_STYLE_ID)});if(style===null){style=document.createElement('style');style.id=${JSON.stringify(SCREENSHOT_CLEANUP_STYLE_ID)};style.textContent=${JSON.stringify(SCREENSHOT_CLEANUP_CSS)};document.head.append(style)}return 1})()`
}

function buildRestoreScreenshotOverlaysScript() {
	return `document.getElementById(${JSON.stringify(SCREENSHOT_CLEANUP_STYLE_ID)})?.remove();1`
}

function captureCurrentViewScreenshot(run, writeFileSync, screenshot) {
	const clip = readScreenshotClip(run, screenshot)
	const data = captureClipPng(run, screenshot, clip)
	writeFileSync(screenshot.outputPath, Buffer.from(data, 'base64'))
}

function readScreenshotClip(run, screenshot) {
	const output = callObsidian(run, screenshot, [
		'dev:cdp',
		'method=Runtime.evaluate',
		`params=${JSON.stringify({
			expression: buildActiveViewClipScript(screenshot.clipSelector),
			returnByValue: true,
		})}`,
	])
	const value = JSON.parse(output).result?.value

	if (!isClip(value)) {
		throw new Error(`[obsidian-screenshot] invalid screenshot clip: ${output}`)
	}

	return {
		x: value.x,
		y: value.y,
		width: value.width,
		height: value.height,
		scale: SCREENSHOT_CLIP_SCALE,
	}
}

function captureClipPng(run, screenshot, clip) {
	const output = callObsidian(run, screenshot, [
		'dev:cdp',
		'method=Page.captureScreenshot',
		`params=${JSON.stringify({
			clip,
			format: 'png',
			fromSurface: true,
			optimizeForSpeed: true,
		})}`,
	])
	const data = JSON.parse(output).data

	if (typeof data !== 'string' || data.length === 0) {
		throw new Error(`[obsidian-screenshot] invalid screenshot payload: ${output}`)
	}

	return data
}

function buildActiveViewClipScript(selector) {
	return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el === null) { throw new Error('Missing screenshot clip selector: ${selector}') } const rect = el.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })()`
}

function isClip(value) {
	return typeof value === 'object'
		&& value !== null
		&& typeof value.x === 'number'
		&& typeof value.y === 'number'
		&& typeof value.width === 'number'
		&& typeof value.height === 'number'
		&& Number.isFinite(value.x)
		&& Number.isFinite(value.y)
		&& Number.isFinite(value.width)
		&& Number.isFinite(value.height)
		&& value.width > 0
		&& value.height > 0
}

async function waitForSelector(run, sleep, screenshot) {
	const attempts = Math.max(1, Math.ceil(screenshot.timeoutMs / screenshot.pollMs))

	for (let index = 0; index <= attempts; index += 1) {
		const output = callObsidian(run, screenshot, [
			'eval',
			`code=Number(document.querySelector(${JSON.stringify(screenshot.waitFor)})!==null)`,
		])
		const total = Number.parseInt(normalizeEvalOutput(output), 10)

		if (!Number.isFinite(total)) {
			throw new Error(`[obsidian-screenshot] invalid dev:dom total output: ${output}`)
		}

		if (total > 0) {
			return
		}

		await sleep(screenshot.pollMs)
	}

	throw new Error(`[obsidian-screenshot] selector did not appear before timeout: ${screenshot.waitFor}`)
}

function normalizeEvalOutput(output) {
	return output.startsWith('=>') ? output.slice(2).trim() : output.trim()
}

function callObsidian(run, screenshot, args) {
	const output = run(args, { vaultName: screenshot.vaultName })
	assertObsidianOutput(output, args)
	return output
}

function runObsidianCommand(args, options = {}) {
	const commandArgs = options.vaultName === undefined
		? args
		: [`vault=${options.vaultName}`, ...args]
	const maxAttempts = args[0] === 'dev:cdp' ? 2 : 1

	console.debug('[obsidian-screenshot] obsidian', args)

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			return execFileSync('obsidian', commandArgs, {
				encoding: 'utf8',
				killSignal: 'SIGKILL',
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: OBSIDIAN_CLI_TIMEOUT_MS,
			}).trim()
		} catch (error) {
			const timedOutOutput = readTimedOutCommandOutput(error, args)
			if (timedOutOutput !== undefined) {
				return timedOutOutput
			}

			if (attempt < maxAttempts && isTimeoutError(error)) {
				console.warn(`[obsidian-screenshot] Retrying timed out Obsidian CLI command: ${args.join(' ')}`)
				continue
			}

			if (isTimeoutError(error)) {
				throw new Error(`[obsidian-screenshot] timed out Obsidian CLI command: ${args.join(' ')}`)
			}

			throw error
		}
	}

	throw new Error('[obsidian-screenshot] unreachable Obsidian CLI retry state.')
}

function assertObsidianOutput(output, args) {
	if (output.startsWith('Error:')) {
		throw new Error(`[obsidian-screenshot] Obsidian CLI failed for "${args.join(' ')}": ${output}`)
	}
}

function isTimeoutError(error) {
	return typeof error === 'object'
		&& error !== null
		&& ('signal' in error || 'code' in error)
		&& (error.signal === 'SIGKILL' || error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT')
}

function readTimedOutCommandOutput(error, args) {
	if (!isTimeoutError(error) || typeof error.stdout !== 'string') {
		return undefined
	}

	const output = error.stdout.trim()
	if (output === '' || output.startsWith('Error:')) {
		return undefined
	}

	if (args[0] === 'dev:cdp') {
		try {
			JSON.parse(output)
		} catch {
			return undefined
		}
	}

	console.warn('[obsidian-screenshot] Using stdout from timed out Obsidian CLI command.')
	return output
}

function sleepMs(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

function readProjectDefaults() {
	const manifest = JSON.parse(readFileSync(path.join(projectRootPath, 'manifest.json'), 'utf8'))
	const packageJson = JSON.parse(readFileSync(path.join(projectRootPath, 'package.json'), 'utf8'))
	globalThis.__LUCRJOURNAL_CHART_VERSION__ = packageJson.chart_version
	globalThis.__LUCRJOURNAL_CHART_IFRAME_URL__ = `https://lucrchart.lucrtrade.com/lv/${packageJson.chart_version}`
	const jiti = createJiti(import.meta.url)
	const {
		OPEN_JOURNAL_COMMAND_ID,
	} = jiti('../src/constant.ts')

	if (typeof manifest.id !== 'string' || manifest.id === '') {
		throw new Error('[obsidian-screenshot] manifest.json is missing an id.')
	}

	return {
		openJournalCommandId: OPEN_JOURNAL_COMMAND_ID,
		pluginId: manifest.id,
	}
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const filters = parseScreenshotCliArgs(process.argv.slice(2))
	if (filters.help) {
		printUsage()
		process.exit(0)
	}

	const plan = filterScreenshotPlan(buildDefaultScreenshotPlan(readProjectDefaults()), filters)
	if (plan.screenshots.length === 0) {
		throw new Error('[obsidian-screenshot] filters selected no screenshots.')
	}

	if (filters.list) {
		printScreenshotPlan(plan)
		process.exit(0)
	}

	await captureScreenshotPlan(plan)
	console.log(`[obsidian-screenshot] Captured ${plan.screenshots.length} screenshot(s) in ${plan.outputDir}.`)
}
