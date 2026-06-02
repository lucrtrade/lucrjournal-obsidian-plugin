import type { ThemeColors } from '../../charts/protocol'

// ─── Defaults derived from main.pcss --lj-* tokens ──────────────────────────
// Monochrome palette: profit/buy = strong, loss/sell = muted

const LIGHT_DEFAULTS: ThemeColors = {
	// profit = strong (#111111), loss = muted (rgba(17,17,17,0.38))
	buyColor: '#111111',
	sellColor: 'rgba(17, 17, 17, 0.38)',
	buyColorDark: '#000000',
	sellColorDark: 'rgba(17, 17, 17, 0.5)',
	textOnColor: '#ffffff',
	// --lj-surf (light): #ffffff
	backgroundColor: '#ffffff',
	loadingFg: '#111111',
	separatorColor: 'rgba(0, 0, 0, 0)',
	// --lj-c-muted (light): #6b7280
	crosshairColor: '#6b7280',
	watermarkTransparency: 90,
	// --lj-c-strong (light): #111827
	headerIconColor: '#111827',
	buyBorderColor: '#111111',
	sellBorderColor: 'rgba(17, 17, 17, 0.38)',
	buyWickColor: '#111111',
	sellWickColor: 'rgba(17, 17, 17, 0.38)',
	// --lj-border (light): rgba(0,0,0,0.1)
	gridColor: 'rgba(0, 0, 0, 0.1)',
	scalesTextColor: '#111827',
	scalesLineColor: 'rgba(0, 0, 0, 0.12)',
	volumeUpColor: 'rgba(17, 17, 17, 0.15)',
	volumeDownColor: 'rgba(17, 17, 17, 0.06)',
}

const DARK_DEFAULTS: ThemeColors = {
	// profit = strong (#ffffff), loss = muted (rgba(255,255,255,0.3))
	buyColor: '#ffffff',
	sellColor: 'rgba(255, 255, 255, 0.3)',
	buyColorDark: '#cccccc',
	sellColorDark: 'rgba(255, 255, 255, 0.4)',
	textOnColor: '#000000',
	// --lj-surf (dark): #0a0a0a
	backgroundColor: '#0a0a0a',
	loadingFg: '#ffffff',
	separatorColor: 'rgba(0, 0, 0, 0)',
	// --lj-c-muted (dark): rgba(255,255,255,0.4)
	crosshairColor: 'rgba(255, 255, 255, 0.4)',
	watermarkTransparency: 90,
	// --lj-c-strong (dark): #ffffff
	headerIconColor: '#ffffff',
	buyBorderColor: '#ffffff',
	sellBorderColor: 'rgba(255, 255, 255, 0.3)',
	buyWickColor: '#ffffff',
	sellWickColor: 'rgba(255, 255, 255, 0.3)',
	// --lj-border (dark): rgba(255,255,255,0.1)
	gridColor: 'rgba(255, 255, 255, 0.1)',
	scalesTextColor: '#eaeaea',
	scalesLineColor: 'rgba(255, 255, 255, 0.12)',
	volumeUpColor: 'rgba(255, 255, 255, 0.12)',
	volumeDownColor: 'rgba(255, 255, 255, 0.05)',
}

function getLjVar(name: string): string {
	return getComputedStyle(activeDocument.body).getPropertyValue(`--lj-${name}`).trim()
}

function resolveThemeColors(defaults: ThemeColors): ThemeColors {
	const surf = getLjVar('surf')
	const profitText = getLjVar('profit-text')
	const lossText = getLjVar('loss-text')
	const strong = getLjVar('c-strong')
	const muted = getLjVar('c-muted')
	const border = getLjVar('border')
	const text = getLjVar('text')

	return {
		...defaults,
		...(surf && { backgroundColor: surf }),
		...(profitText && { buyColor: profitText, buyBorderColor: profitText, buyWickColor: profitText, loadingFg: profitText }),
		...(lossText && { sellColor: lossText, sellBorderColor: lossText, sellWickColor: lossText }),
		...(strong && { headerIconColor: strong }),
		...(text && { scalesTextColor: text }),
		...(muted && { crosshairColor: muted }),
		...(border && { gridColor: border, scalesLineColor: border }),
	}
}

export function resolveChartThemeColors(): { light: ThemeColors; dark: ThemeColors } {
	const isDark = activeDocument.body.classList.contains('theme-dark')
	const current = resolveThemeColors(isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS)

	return {
		light: isDark ? LIGHT_DEFAULTS : current,
		dark: isDark ? current : DARK_DEFAULTS,
	}
}

export function resolveCurrentThemeColors(): ThemeColors {
	const isDark = activeDocument.body.classList.contains('theme-dark')
	return resolveThemeColors(isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS)
}
