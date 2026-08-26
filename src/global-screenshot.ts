import { Platform } from 'obsidian'

import { IconsSvg } from './icons'
import { getCurrentLocale, t } from './lang/helpers'

import type LucrJournalPlugin from './main'

type ScreenshotCard = {
	close(): void
	isDestroyed(): boolean
	loadURL(url: string): Promise<void>
	on(event: 'closed', listener: () => void): void
	showInactive(): void
	webContents: {
		executeJavaScript(code: string): Promise<unknown>
		setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void
	}
}

type ElectronRemote = {
	BrowserWindow: new (options: Record<string, unknown>) => ScreenshotCard
	getCurrentWindow(): { focus(): void }
	Menu?: {
		getApplicationMenu(): ElectronMenu | null
	}
	globalShortcut: {
		isRegistered(accelerator: string): boolean
		register(accelerator: string, callback: () => void): boolean
		unregister(accelerator: string): void
	}
	screen: {
		getPrimaryDisplay(): { workArea: { height: number; width: number; x: number; y: number } }
	}
}

type ElectronMenu = {
	accelerator?: string | null
	items?: ElectronMenu[]
	submenu?: ElectronMenu
}

let card: ScreenshotCard | null = null
let cardAction: (() => void) | null = null
let isCapturing = false
let registeredShortcut: string | null = null
let registeredCallback: (() => void) | null = null

export type GlobalShortcutAvailability = 'available' | 'system' | 'app-menu' | 'taken' | 'invalid'

export const globalScreenshot = {
	// @story [[lucrjournal/ocr#^global-screenshot-ocr]] Registers only an available global accelerator and starts macOS area capture
	register(plugin: LucrJournalPlugin): () => void {
		if (!Platform.isDesktopApp) {
			return () => {}
		}
		const remote = getRemote()
		if (remote === null) {
			return () => {}
		}
		const callback = () => {
			void capture(plugin, remote)
		}
		registeredCallback = callback
		const shortcut = plugin.settings.globalScreenshotShortcut.trim()
		if (shortcut !== '' && remote.globalShortcut.register(shortcut, callback)) {
			registeredShortcut = shortcut
		}
		return () => {
			if (registeredShortcut !== null) {
				remote.globalShortcut.unregister(registeredShortcut)
			}
			registeredShortcut = null
			registeredCallback = null
			closeCard()
		}
	},
	update(shortcut: string): boolean {
		const remote = getRemote()
		const nextShortcut = shortcut.trim()
		if (remote === null || registeredCallback === null || this.availabilityOf(nextShortcut) !== 'available') {
			return false
		}
		const previous = registeredShortcut
		if (previous !== null) {
			remote.globalShortcut.unregister(previous)
		}
		if (!remote.globalShortcut.register(nextShortcut, registeredCallback)) {
			if (previous !== null) {
				remote.globalShortcut.register(previous, registeredCallback)
			}
			return false
		}
		registeredShortcut = nextShortcut
		return true
	},
	clear(): void {
		const remote = getRemote()
		if (remote !== null && registeredShortcut !== null) {
			remote.globalShortcut.unregister(registeredShortcut)
		}
		registeredShortcut = null
	},
	// Reports why an accelerator cannot become the global capture shortcut, or 'available'.
	// A stale in-process registration (dev reload, probe tooling) is reclaimed rather than
	// reported as a conflict; real macOS, app-menu and cross-app conflicts still block.
	availabilityOf(shortcut: string): GlobalShortcutAvailability {
		const remote = getRemote()
		const accelerator = shortcut.trim()
		if (remote === null || accelerator === '') {
			return 'invalid'
		}
		if (accelerator === registeredShortcut) {
			return 'available'
		}
		if (isSystemShortcut(accelerator)) {
			return 'system'
		}
		if (isMenuShortcut(remote.Menu?.getApplicationMenu() ?? null, accelerator)) {
			return 'app-menu'
		}
		try {
			if (remote.globalShortcut.isRegistered(accelerator)) {
				remote.globalShortcut.unregister(accelerator)
			}
			if (!remote.globalShortcut.register(accelerator, () => {})) {
				return 'taken'
			}
			remote.globalShortcut.unregister(accelerator)
			return 'available'
		} catch {
			return 'invalid'
		}
	},
	setProgress(message: string): void {
		setCardState(t('OCR_POSITION_COMMAND'), message, 'progress')
	},
	setSuccess(action: () => void): void {
		cardAction = action
		setCardState(
			t('OCR_POSITION_CARD_SUCCESS_TITLE'),
			t('OCR_POSITION_CARD_OPEN_POSITION'),
			'success',
			t('OCR_POSITION_CARD_TAG_SUCCESS'),
		)
	},
	setIncomplete(action: () => void, fields: string[]): void {
		cardAction = action
		const fieldLabels = fields.map((field) => {
			if (field === 'symbol') {
				return t('POSITION_SYMBOL')
			}
			if (field === 'side') {
				return t('POSITION_SIDE')
			}
			return field
		})
		const fieldsText = fieldLabels.join(getCurrentLocale() === 'zh' ? '、' : ', ')
		setCardState(
			t('OCR_POSITION_CARD_INCOMPLETE_TITLE'),
			t('OCR_POSITION_CARD_INCOMPLETE_HINT', { fields: fieldsText }),
			'incomplete',
			t('OCR_POSITION_CARD_TAG_INCOMPLETE'),
		)
	},
	setFailure(action: () => void): void {
		cardAction = action
		setCardState(t('OCR_POSITION_CREATE_FAILED'), t('OCR_POSITION_CARD_RETRY'), 'failure')
	},
}

async function capture(plugin: LucrJournalPlugin, remote: ElectronRemote): Promise<void> {
	if (isCapturing || getProcessPlatform() !== 'darwin') {
		return
	}
	isCapturing = true
	const runtimeRequire = getRuntimeRequire()
	const childProcess = runtimeRequire?.('node:child_process') as { execFile: (file: string, args: string[], callback: (error: Error | null) => void) => void } | undefined
	const fs = runtimeRequire?.('node:fs/promises') as { readFile: (path: string) => Promise<Uint8Array>; unlink: (path: string) => Promise<void> } | undefined
	const os = runtimeRequire?.('node:os') as { tmpdir: () => string } | undefined
	const path = runtimeRequire?.('node:path') as { join: (...parts: string[]) => string } | undefined
	if (childProcess === undefined || fs === undefined || os === undefined || path === undefined) {
		isCapturing = false
		return
	}
	const target = path.join(os.tmpdir(), `lucrjournal-${Date.now()}.png`)
	try {
		const didCapture = await new Promise<boolean>((resolve) => {
			childProcess.execFile('/usr/sbin/screencapture', ['-i', '-s', target], (error: Error | null) => resolve(error === null))
		})
		if (!didCapture) {
			return
		}
		const bytes = await fs.readFile(target)
		if (bytes.byteLength === 0) {
			return
		}
		await showCard(plugin, remote, toBase64(bytes))
		plugin.openGlobalScreenshotOcr({ buffer: new Uint8Array(bytes).buffer, extension: 'png', originalName: 'global-screenshot' })
	} catch {
		globalScreenshot.setFailure(() => {})
	} finally {
		isCapturing = false
		await fs.unlink(target).catch(() => undefined)
	}
}

async function showCard(plugin: LucrJournalPlugin, remote: ElectronRemote, image: string): Promise<void> {
	closeCard()
	const workArea = remote.screen.getPrimaryDisplay().workArea
	const cardWidth = 320
	const cardHeight = 260
	const nextCard = new remote.BrowserWindow({
		alwaysOnTop: true,
		backgroundColor: '#00000000',
		frame: false,
		hasShadow: false,
		height: cardHeight,
		resizable: false,
		show: false,
		skipTaskbar: true,
		transparent: true,
		webPreferences: { contextIsolation: true, nodeIntegration: false },
		width: cardWidth,
		x: workArea.x + workArea.width - cardWidth - 16,
		y: workArea.y + workArea.height - cardHeight - 16,
	})
	card = nextCard
	nextCard.on('closed', () => {
		if (card !== nextCard) {
			return
		}
		card = null
		cardAction = null
		plugin.closeGlobalScreenshotOcr()
	})
	nextCard.webContents.setWindowOpenHandler((details) => {
		if (details.url === 'lucrjournal-card://open') {
			openCardAction(nextCard, remote)
		}
		return { action: 'deny' }
	})
	await nextCard.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildCardHtml(image))}`)
	nextCard.showInactive()
	setCardState(t('OCR_POSITION_COMMAND'), t('POSITION_DETAILS_ATTACHMENT_OCR_PREPARING'), 'progress')
}

function openCardAction(_nextCard: ScreenshotCard, remote: ElectronRemote): void {
	const action = cardAction
	closeCard()
	try {
		remote.getCurrentWindow().focus()
	} catch {
		// ignore
	}
	if (action !== null) {
		action()
	}
}

function closeCard(): void {
	if (card !== null && !card.isDestroyed()) {
		card.close()
	}
	card = null
	cardAction = null
}

type CardState = 'progress' | 'success' | 'incomplete' | 'failure'

function setCardState(title: string, detail: string, state: CardState, tag?: string): void {
	if (card === null || card.isDestroyed()) {
		return
	}
	void card.webContents.executeJavaScript(
		`window.setCardState(${JSON.stringify(title)}, ${JSON.stringify(detail)}, ${JSON.stringify(state)}, ${JSON.stringify(tag ?? '')})`,
	)
}

function buildCardHtml(image: string): string {
	// Card uses window.open() so setWindowOpenHandler intercepts it — will-navigate does not fire for custom schemes under contextIsolation
	const brandSvg = IconsSvg.LucrTrade.replaceAll('var(--background-primary)', '#f8fafc')
	const css = [
		'*{box-sizing:border-box}',
		'html,body{width:100%;height:100%;margin:0;background:transparent;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc;user-select:none}',
		'#card{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;border-radius:14px;background:#101218;border:1px solid rgba(255,255,255,.08);transition:all .2s ease;box-shadow:0 8px 30px rgba(0,0,0,.5)}',
		'.preview{height:120px;min-height:120px;max-height:120px;overflow:hidden;background:#181b25;flex-shrink:0;position:relative}',
		'.preview img{display:block;width:100%;height:100%;object-fit:cover}',
		'.content{flex:1;min-height:0;display:flex;flex-direction:column;padding:11px 14px 12px}',
		'.brand{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.55);font-size:11px;font-weight:600;flex-shrink:0}',
		'.brand svg{width:16px;height:16px;flex-shrink:0}',
		'.brand-tag{margin-left:auto;font-size:10px;line-height:1;padding:3px 6px;border-radius:4px;font-weight:600;display:none}',
		'.title{margin-top:6px;font-size:13px;font-weight:700;line-height:1.3;color:#f8fafc;flex-shrink:0}',
		'.detail{margin-top:4px;color:rgba(255,255,255,.6);font-size:11px;line-height:1.35;word-break:break-word}',
		'.bar{margin-top:auto;padding-top:8px;flex-shrink:0}',
		'.bar-inner{height:3px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}',
		'.fill{width:45%;height:100%;background:#8b5cf6;transition:width .25s ease,background .25s ease}',
		'.ready #card{cursor:pointer}',
		'.ready #card:hover{transform:translateY(-1px);box-shadow:0 12px 36px rgba(0,0,0,.6)}',
		'.state-progress .fill{width:45%;background:#8b5cf6}',
		'.state-success #card{border-color:rgba(74,222,128,.28)}',
		'.state-success .brand-tag{display:inline-block;background:rgba(74,222,128,.15);color:#4ade80}',
		'.state-success .title{color:#f8fafc}',
		'.state-success .fill{width:100%;background:#4ade80}',
		'.state-success .detail{color:#4ade80;font-weight:500}',
		'.state-incomplete #card{border-color:rgba(249,115,22,.32)}',
		'.state-incomplete .brand-tag{display:inline-block;background:rgba(249,115,22,.15);color:#fb923c}',
		'.state-incomplete .title{color:#f8fafc}',
		'.state-incomplete .fill{width:100%;background:#f97316}',
		'.state-incomplete .detail{color:#fb923c;font-weight:500}',
		'.state-failure #card{border-color:rgba(239,68,68,.32)}',
		'.state-failure .brand-tag{display:inline-block;background:rgba(239,68,68,.15);color:#f87171}',
		'.state-failure .title{color:#f87171}',
		'.state-failure .fill{width:100%;background:#ef4444}',
		'.state-failure .detail{color:#f87171}',
	].join('')
	return [
		'<!doctype html><meta charset="utf-8">',
		`<style>${css}</style>`,
		'<div id="card">',
		`<div class="preview"><img src="data:image/png;base64,${image}" alt="Screenshot"></div>`,
		'<div class="content">',
		`<div class="brand">${brandSvg}<span>LucrJournal</span><span id="tag" class="brand-tag"></span></div>`,
		'<div id="title" class="title"></div>',
		'<div id="detail" class="detail"></div>',
		'<div class="bar"><div class="bar-inner"><div class="fill"></div></div></div>',
		'</div>',
		'</div>',
		'<script>',
		'var isReady=false;',
		'document.getElementById("card").addEventListener("click",function(){if(isReady)window.open("lucrjournal-card://open")});',
		'window.setCardState=function(t,d,s,g){',
		'document.getElementById("title").textContent=t;',
		'document.getElementById("detail").textContent=d;',
		'var tagEl=document.getElementById("tag");if(tagEl){tagEl.textContent=g||"";}',
		'isReady=s!=="progress";',
		'document.body.className="state-"+s+(isReady?" ready":"");',
		'};',
		'</script>',
	].join('')
}

function toBase64(bytes: Uint8Array): string {
	const runtimeRequire = getRuntimeRequire()
	const buffer = runtimeRequire?.('node:buffer') as { Buffer: { from: (source: Uint8Array) => { toString: (encoding: 'base64') => string } } } | undefined
	if (buffer === undefined) {
		throw new Error('Node buffer unavailable')
	}
	return buffer.Buffer.from(bytes).toString('base64')
}

function getRemote(): ElectronRemote | null {
	try {
		const runtimeRequire = getRuntimeRequire()
		const electron = runtimeRequire?.('electron') as { remote?: ElectronRemote } | undefined
		return electron?.remote ?? runtimeRequire?.('@electron/remote') as ElectronRemote | null
	} catch {
		return null
	}
}

function getRuntimeRequire(): ((id: string) => unknown) | null {
	return (window as Window & { require?: (id: string) => unknown }).require ?? null
}

function getProcessPlatform(): string | undefined {
	return (window as Window & { process?: { platform?: string } }).process?.platform
}

function isMenuShortcut(menu: ElectronMenu | null, accelerator: string): boolean {
	if (menu === null) {
		return false
	}
	for (const item of menu.items ?? []) {
		// Electron reports accelerator as null (not undefined) for the many menu entries without one
		if (typeof item.accelerator === 'string' && normalizeAccelerator(item.accelerator) === normalizeAccelerator(accelerator)) {
			return true
		}
		if (isMenuShortcut(item.submenu ?? null, accelerator)) {
			return true
		}
	}
	return false
}

function isSystemShortcut(accelerator: string): boolean {
	if (getProcessPlatform() !== 'darwin') {
		return false
	}
	const runtimeRequire = getRuntimeRequire()
	const childProcess = runtimeRequire?.('node:child_process') as { execFileSync: (command: string, args: string[], options: { encoding: 'utf8' }) => string } | undefined
	const os = runtimeRequire?.('node:os') as { homedir: () => string } | undefined
	const path = runtimeRequire?.('node:path') as { join: (...parts: string[]) => string } | undefined
	if (childProcess === undefined || os === undefined || path === undefined) {
		return false
	}
	try {
		const raw = childProcess.execFileSync('/usr/bin/plutil', [
			'-convert', 'json', '-o', '-',
			path.join(os.homedir(), 'Library/Preferences/com.apple.symbolichotkeys.plist'),
		], { encoding: 'utf8' })
		const hotkeys = JSON.parse(raw) as { AppleSymbolicHotKeys?: Record<string, unknown> }
		return ['28', '29', '30', '31', '184']
			.map((id) => symbolicHotkeyToAccelerator(hotkeys.AppleSymbolicHotKeys?.[id]))
			.some((systemAccelerator) => systemAccelerator !== null && normalizeAccelerator(systemAccelerator) === normalizeAccelerator(accelerator))
	} catch {
		return false
	}
}

function symbolicHotkeyToAccelerator(hotkey: unknown): string | null {
	if (typeof hotkey !== 'object' || hotkey === null) {
		return null
	}
	const value = hotkey as { enabled?: unknown; value?: { parameters?: unknown } }
	const parameters = value.value?.parameters
	if (value.enabled !== true || !Array.isArray(parameters)) {
		return null
	}
	const [character, , flags] = parameters as unknown[]
	if (character === 65535) {
		return null
	}
	if (typeof character !== 'number' || typeof flags !== 'number') {
		return null
	}
	const modifiers = [
		...(flags & 1048576 ? ['Command'] : []),
		...(flags & 262144 ? ['Control'] : []),
		...(flags & 524288 ? ['Alt'] : []),
		...(flags & 131072 ? ['Shift'] : []),
	]
	return [...modifiers, String.fromCodePoint(character).toUpperCase()].join('+')
}

function normalizeAccelerator(accelerator: string): string {
	const primaryModifier = getProcessPlatform() === 'darwin' ? 'Command' : 'Control'
	const aliases: Record<string, string> = {
		alt: 'Alt',
		cmd: 'Command',
		cmdorctrl: primaryModifier,
		command: 'Command',
		commandorcontrol: primaryModifier,
		control: 'Control',
		ctrl: 'Control',
		meta: getProcessPlatform() === 'darwin' ? 'Command' : 'Super',
		option: 'Alt',
		super: 'Super',
		shift: 'Shift',
		win: 'Super',
		windows: 'Super',
	}
	return accelerator.split('+')
		.map((part) => aliases[part.trim().toLowerCase()] ?? part.trim().toUpperCase())
		.sort()
		.join('+')
}
