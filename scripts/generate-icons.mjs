import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

const outputIconsDirPath = new URL('../src/generated-icons/', import.meta.url)
const outputModulePath = new URL('icon-assets.generated.ts', outputIconsDirPath)
const outputCacheSignaturesPath = new URL('icon-cache-signatures.generated.json', outputIconsDirPath)
const platformsDirPath = new URL('../src/platforms/', import.meta.url)

const scanPlatformFiles = () => {
	const files = readdirSync(platformsDirPath)
		.filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'factory.ts')

	return files.map((fileName) => {
		const filePath = new URL(fileName, platformsDirPath)
		const source = readFileSync(filePath, 'utf8')
		const name = source.match(/name:\s*['"]([^'"]+)['"]/)?.[1] ?? null
		const homepage = source.match(/homepage:\s*['"]([^'"]+)['"]/)?.[1] ?? null
		const iconMatch = source.match(/icon:\s*'((?:[^'\\]|\\.)*)'/)
		const icon = iconMatch?.[1] ?? ''

		return { fileName, filePath, name, homepage, icon }
	}).filter((p) => p.name && p.homepage)
}

const escapeSvgForTs = (svg) => svg.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const writePlatformIcon = (filePath, svgContent) => {
	const source = readFileSync(filePath, 'utf8')
	const updated = source.replace(/icon:\s*''/, `icon: '${escapeSvgForTs(svgContent)}'`)
	if (updated !== source) {
		writeFileSync(filePath, updated, 'utf8')
	}
}

const LUCR_JOURNAL_SVG =
	'<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="var(--background-primary)" style="filter: invert(1);"/><path fill-rule="evenodd" clip-rule="evenodd" d="M49.99875 0C55.595 0 60.978438 0.919369 66.002187 2.615356L52.147188 51.110937H99.986562C99.830938 58.245937 98.183125 65.014063 95.33875 71.112188H38.8875C35.750312 71.111563 32.793438 69.637187 30.904 67.1325C29.015281 64.627813 28.412844 61.38125 29.274375 58.365L45.900312 0.167847C47.251875 0.058187 48.619062 0.000034 49.99875 0Z" fill="var(--background-primary)" /></svg>'

const RASTER_IMAGE_CONTENT_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/avif',
])

const toGoogleFaviconUrl = (homepage) => `https://www.google.com/s2/favicons?sz=64&domain=${new URL(homepage).hostname}`
const toDuckDuckGoFaviconUrl = (homepage) => `https://icons.duckduckgo.com/ip3/${new URL(homepage).hostname}.ico`
const normalizeSvgMarkup = (svg) =>
	svg
		.replace(/\r?\n/g, '')
		.replace(/>\s+</g, '><')
		.trim()

const toAttributeMap = (tag) =>
	Object.fromEntries(
		Array.from(tag.matchAll(/([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g), (match) => [
			match[1].toLowerCase(),
			match[3] ?? match[4] ?? match[5] ?? '',
		]),
	)

const tryResolveUrl = (href, homepage) => {
	try {
		return new URL(href, homepage).toString()
	} catch {
		return null
	}
}

const ICON_REQUEST_TIMEOUT_MS = 20_000
const DEFAULT_FETCH_HEADERS = {
	accept: '*/*',
	'user-agent': 'LucrJournal Icon Generator/1.0',
}

const fetchResource = async (url, accept) => {
	try {
		const response = await fetch(url, {
			headers: {
				...DEFAULT_FETCH_HEADERS,
				accept,
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(ICON_REQUEST_TIMEOUT_MS),
		})

		if (!response.ok) {
			return null
		}

		return response
	} catch {
		return null
	}
}

const extractHomepageIconCandidates = async (homepage) => {
	const response = await fetchResource(homepage, 'text/html,*/*;q=0.8')
	const contentType = response?.headers.get('content-type')?.split(';')[0]?.trim() ?? null
	if (contentType !== 'text/html') {
		return []
	}

	const html = await response.text()
	if (html.length === 0) {
		return []
	}
	const candidates = Array.from(
		html.matchAll(/<link\b[^>]*>/gi),
		([tag]) => toAttributeMap(tag),
	)
		.filter((attributes) => attributes.rel?.toLowerCase().includes('icon'))
		.map((attributes) => attributes.href)
		.filter(Boolean)
		.map((href) => tryResolveUrl(href, homepage))
		.filter(Boolean)

	return [...new Set(candidates)]
}

const getFallbackIconCandidates = (homepage) => [
	`${homepage}/favicon.svg`,
	`${homepage}/favicon.png`,
	`${homepage}/favicon.ico`,
	`${homepage}/apple-touch-icon.png`,
	toDuckDuckGoFaviconUrl(homepage),
	toGoogleFaviconUrl(homepage),
]

const downloadIconAsset = async (url) => {
	const response = await fetchResource(url, 'image/svg+xml,image/*,*/*;q=0.8')
	const contentType = response?.headers.get('content-type')?.split(';')[0]?.trim() ?? null
	if (!contentType?.startsWith('image/')) {
		return null
	}

	if (contentType === 'image/svg+xml') {
		return {
			contentType,
			svg: normalizeSvgMarkup(await response.text()),
		}
	}

	return {
		base64: Buffer.from(await response.arrayBuffer()).toString('base64'),
		contentType,
	}
}

const wrapRasterIconAsSvg = (contentType, base64) =>
	normalizeSvgMarkup(
		`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><image href="data:${contentType};base64,${base64}" width="16" height="16" preserveAspectRatio="xMidYMid meet"/></svg>`,
	)

const downloadHomepageIconSvg = async (name, homepage, kind) => {
	const candidates = [
		...await extractHomepageIconCandidates(homepage),
		...getFallbackIconCandidates(homepage),
	]

	for (const candidate of [...new Set(candidates)]) {
		const icon = await downloadIconAsset(candidate)
		if (!icon) {
			continue
		}

		if ('svg' in icon) {
			return icon.svg
		}

		if (RASTER_IMAGE_CONTENT_TYPES.has(icon.contentType)) {
			return wrapRasterIconAsSvg(icon.contentType, icon.base64)
		}
	}

	console.warn(`[generate-icons] Skip ${kind} icon for ${name}`)
	return null
}

const toIconFileName = (name) => `${name}.svg`

const toIconImportName = (name) => {
	const normalized = name.replace(/[^a-zA-Z0-9_$]+/g, ' ')
		.trim()
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('')

	return /^[0-9]/.test(normalized) ? `Icon${normalized}` : normalized
}

const getSvgIconFileUrl = (directoryName, name) => {
	const outputDirectoryPath = directoryName.length === 0
		? outputIconsDirPath
		: new URL(`${directoryName}/`, outputIconsDirPath)

	return new URL(toIconFileName(name), outputDirectoryPath)
}

const readCachedSvgIcon = (directoryName, name) => {
	const fileUrl = getSvgIconFileUrl(directoryName, name)
	if (!existsSync(fileUrl)) {
		return null
	}

	return normalizeSvgMarkup(readFileSync(fileUrl, 'utf8'))
}

const generatePlatformIcons = async () => {
	const platforms = scanPlatformFiles()

	const entries = await Promise.all(
		platforms.map(async (platform) => {
			if (platform.icon.length > 0) {
				return [platform.name, platform.icon]
			}

			const cachedSvg = readCachedSvgIcon('platforms', platform.name)
			if (cachedSvg !== null) {
				writePlatformIcon(platform.filePath, cachedSvg)
				return [platform.name, cachedSvg]
			}

			const iconSvg = await downloadHomepageIconSvg(platform.name, platform.homepage, 'platform')
			if (iconSvg === null) {
				return null
			}
			writePlatformIcon(platform.filePath, iconSvg)
			return [platform.name, iconSvg]
		}),
	)

	return Object.fromEntries(entries.filter((entry) => entry !== null))
}

const writeSvgIconGroup = (directoryName, icons) => {
	const outputDirectoryPath = directoryName.length === 0
		? outputIconsDirPath
		: new URL(`${directoryName}/`, outputIconsDirPath)

	mkdirSync(outputDirectoryPath, {
		recursive: true,
	})

	for (const [name, svg] of Object.entries(icons)) {
		const fileUrl = getSvgIconFileUrl(directoryName, name)
		const nextContent = `${svg}\n`
		const currentContent = existsSync(fileUrl) ? readFileSync(fileUrl, 'utf8') : null

		if (currentContent !== nextContent) {
			writeFileSync(fileUrl, nextContent, 'utf8')
		}
	}
}

const writeSvgIcons = ({ coreIcons, platformIcons }) => {
	writeSvgIconGroup('', coreIcons)
	writeSvgIconGroup('platforms', platformIcons)
}

const cleanupSvgIconGroup = (directoryName, icons) => {
	const outputDirectoryPath = directoryName.length === 0
		? outputIconsDirPath
		: new URL(`${directoryName}/`, outputIconsDirPath)

	if (!existsSync(outputDirectoryPath)) {
		return
	}

	const expectedFileNames = new Set(Object.keys(icons).map(toIconFileName))
	for (const fileName of readdirSync(outputDirectoryPath)) {
		if (fileName.endsWith('.svg') && !expectedFileNames.has(fileName)) {
			rmSync(new URL(fileName, outputDirectoryPath), {
				force: true,
			})
		}
	}
}

const cleanupSvgIconDirectory = (directoryName) => {
	const outputDirectoryPath = new URL(`${directoryName}/`, outputIconsDirPath)
	if (!existsSync(outputDirectoryPath)) {
		return
	}

	rmSync(outputDirectoryPath, {
		force: true,
		recursive: true,
	})
}

const cleanupGeneratedIcons = ({ coreIcons, platformIcons }) => {
	cleanupSvgIconGroup('', coreIcons)
	cleanupSvgIconGroup('platforms', platformIcons)
	cleanupSvgIconDirectory('symbols')
}

const formatImportBlock = (directoryName, icons) =>
	Object.entries(icons)
		.map(([name, icon]) => {
			const iconDirectoryPrefix = directoryName.length === 0 ? '' : `${directoryName}/`
			return `import ${toIconImportName(name)}Svg from './${iconDirectoryPrefix}${toIconFileName(name)}';`
		})
		.join('\n')

const formatImportedSvgRecord = (icons) =>
	Object.keys(icons)
		.map((name) => `\t${JSON.stringify(name)}: ${toIconImportName(name)}Svg,`)
		.join('\n')

const generateFileContent = (coreIcons, platformIcons) => `// This file is auto-generated by scripts/generate-icons.mjs
// Do not edit manually.

${formatImportBlock('', coreIcons)}
${formatImportBlock('platforms', platformIcons)}

export const GeneratedCoreIconsSvg = {
${formatImportedSvgRecord(coreIcons)}
} as const;

export const GeneratedPlatformIconsSvg = {
${formatImportedSvgRecord(platformIcons)}
} as const;
`

const platformIcons = await generatePlatformIcons()
const coreIcons = {
	LucrTrade: LUCR_JOURNAL_SVG,
}

writeSvgIcons({
	coreIcons,
	platformIcons,
})
cleanupGeneratedIcons({
	coreIcons,
	platformIcons,
})
rmSync(outputCacheSignaturesPath, { force: true })
writeFileSync(outputModulePath, generateFileContent(coreIcons, platformIcons), 'utf8')
console.log(`Generated ${outputModulePath.pathname}`)
