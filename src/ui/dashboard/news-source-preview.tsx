import { requestUrl } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'

import { normalizeHomepageUrl, readHomepageHostname, resolveHomepageFaviconUrl } from '../../icon/homepage-favicon'
import { t } from '../../lang/helpers'
import { resolveDefuddleFrontmatterTitle } from '../../utils/url-page-title'
import { ObsidianIcon } from '../primitives/obsidian-icon'

type UrlPreviewState = {
	title: string | null
	faviconUrl: string | null
	status: 'loading' | 'ready' | 'failed'
}

const previewCache = new Map<string, UrlPreviewState>()
const previewRequests = new Map<string, Promise<UrlPreviewState>>()

export function NewsSourcePreview({
	url,
	framed = true,
	compact = false,
}: {
	url: string | null
	framed?: boolean
	compact?: boolean
}) {
	const normalizedUrl = useMemo(() => normalizeUrl(url), [url])
	const [preview, setPreview] = useState<UrlPreviewState | null>(
		normalizedUrl === null ? null : previewCache.get(normalizedUrl) ?? { title: null, faviconUrl: null, status: 'loading' },
	)
	const [faviconFailed, setFaviconFailed] = useState(false)

	useEffect(() => {
		setFaviconFailed(false)
		if (normalizedUrl === null) {
			setPreview(null)
			return
		}

		const cached = previewCache.get(normalizedUrl)
		if (cached !== undefined) {
			setPreview(cached)
			return
		}

		setPreview({ title: null, faviconUrl: null, status: 'loading' })
		let isCancelled = false
		void loadUrlPreview(normalizedUrl).then((result) => {
			if (!isCancelled) {
				setPreview(result)
			}
		})

		return () => {
			isCancelled = true
		}
	}, [normalizedUrl])

	if (normalizedUrl === null) {
		return <span className={compact ? 'lj:text-lj-c-muted-faint' : 'lj:px-1 lj:text-lj-c-muted-faint'}>-</span>
	}

	const hostname = readHostname(normalizedUrl)
	const title = preview?.status === 'ready'
		? preview.title ?? hostname
		: preview?.status === 'loading'
			? t('DASHBOARD_META_ANALYSIS_SOURCE_LOADING')
			: t('DASHBOARD_META_ANALYSIS_SOURCE_UNAVAILABLE')

	return (
		<div className={compact ? undefined : 'lj:px-1'}>
			<a
				href={normalizedUrl}
				target="_blank"
				rel="noreferrer"
				title={`${title}\n${normalizedUrl}`}
				className={[
					compact
						? 'lj:flex lj:h-7 lj:min-w-0 lj:items-center lj:gap-1.5 lj:rounded-md lj:px-1 lj:py-0 lj:text-left'
						: 'lj:flex lj:min-w-0 lj:items-center lj:gap-2 lj:rounded-lg lj:px-2 lj:py-1.5 lj:text-left',
					framed ? 'lj:border lj:border-transparent lj:transition-all lj:hover:border-lj-alpha-10' : 'lj:border-0',
				].join(' ')}
			>
				<span className="lj:flex lj:size-4 lj:shrink-0 lj:items-center lj:justify-center lj:overflow-hidden lj:rounded-full lj:bg-lj-alpha-5">
					{preview?.faviconUrl !== null && preview?.faviconUrl !== undefined && !faviconFailed ? (
						<img
							src={preview.faviconUrl}
							alt=""
							className="lj:size-4 lj:rounded-full lj:object-cover"
							onError={() => setFaviconFailed(true)}
						/>
					) : (
						<ObsidianIcon name="globe" className="lj:size-3 lj:text-lj-c-hint-vivid" />
					)}
				</span>
				<span className="lj:min-w-0 lj:flex-1">
					<span className="lj:block lj:truncate lj:text-xs lj:font-medium lj:text-lj-c-strong">
						{compact ? `${title} · ${hostname}` : title}
					</span>
					{compact ? null : (
						<span className="lj:block lj:truncate lj:text-[10px] lj:text-lj-c-hint-vivid">
							{hostname}
						</span>
					)}
				</span>
			</a>
		</div>
	)
}

function normalizeUrl(url: string | null): string | null {
	return normalizeHomepageUrl(url)
}

function readHostname(url: string): string {
	return readHomepageHostname(url)
}

function extractTitle(html: string): string | null {
	const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null
	if (rawTitle === null) {
		return null
	}

	const normalized = rawTitle.replace(/\s+/g, ' ').trim()
	return normalized.length > 0 ? normalized : null
}

function extractFaviconUrl(html: string, url: string): string | null {
	const iconHref = Array.from(
		html.matchAll(/<link\b[^>]*>/gi),
		([tag]) => Object.fromEntries(
			Array.from(
				tag.matchAll(/([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g),
				(match) => [(match[1] ?? '').toLowerCase(), match[3] ?? match[4] ?? match[5] ?? ''],
			),
		),
	)
		.find((attributes) => attributes.rel?.toLowerCase().includes('icon'))
		?.href

	if (typeof iconHref === 'string' && iconHref.length > 0) {
		try {
			return new URL(iconHref, url).toString()
		} catch {
			return null
		}
	}

	return `https://icons.duckduckgo.com/ip3/${readHostname(url)}.ico`
}

async function loadUrlPreview(url: string): Promise<UrlPreviewState> {
	const cached = previewCache.get(url)
	if (cached !== undefined) {
		return cached
	}

	const pending = previewRequests.get(url)
	if (pending !== undefined) {
		return await pending
	}

	const nextRequest = requestUrl({
		url,
		headers: {
			Accept: 'text/html,*/*;q=0.8',
		},
		throw: false,
	}).then(async (response) => {
		const htmlTitle = extractTitle(response.text)
		const fallbackTitle = htmlTitle === null ? await resolveDefuddleFrontmatterTitle(url) : null
		const title = htmlTitle ?? fallbackTitle
		const result: UrlPreviewState = response.status >= 200
			&& response.status < 300
			&& title !== null
			? {
				title,
				faviconUrl: extractFaviconUrl(response.text, url),
				status: 'ready',
			}
			: {
				title: null,
				faviconUrl: resolveHomepageFaviconUrl(url),
				status: 'failed',
			}
		previewCache.set(url, result)
		previewRequests.delete(url)
		return result
	}, () => {
		const result: UrlPreviewState = {
			title: null,
			faviconUrl: resolveHomepageFaviconUrl(url),
			status: 'failed',
		}
		previewCache.set(url, result)
		previewRequests.delete(url)
		return result
	})

	previewRequests.set(url, nextRequest)
	return await nextRequest
}

if (import.meta.vitest) {
	const { beforeEach, describe, expect, it, vi } = import.meta.vitest
	const TEST_DEFUDDLE_TITLE = '\u9996\u5c14\u8c6a\u8d4c\uff1a\u52a0\u5bc6\u8d44\u4ea7\u80fd\u5426\u91cd\u5851\u97e9\u56fd\u7ecf\u6d4e\u672a\u6765\uff1f'
	const TEST_URL = 'https://example.com'
	const clearUrlPreviewCache = () => {
		previewCache.clear()
		previewRequests.clear()
	}

	describe('loadUrlPreview', () => {
		beforeEach(() => {
			clearUrlPreviewCache()
			vi.restoreAllMocks()
		})

		it('renders favicon frame as a circle', async () => {
			const { renderToStaticMarkup } = await import('react-dom/server')

			expect(renderToStaticMarkup(<NewsSourcePreview url={TEST_URL} />)).toContain('lj:rounded-full')
		})

		it('falls back to defuddle frontmatter title when html title is unavailable', async () => {
			const obsidian = await import('obsidian')
			vi.spyOn(obsidian, 'requestUrl')
				.mockResolvedValueOnce({
					status: 200,
					headers: { 'content-type': 'text/html' },
					text: '<html><body>No title</body></html>',
				} as unknown as Awaited<ReturnType<typeof requestUrl>>)
				.mockResolvedValueOnce({
					status: 200,
					headers: { 'content-type': 'text/markdown' },
					text: '---\n'
						+ `title: "${TEST_DEFUDDLE_TITLE}"\n`
						+ 'author: "Techub News"\n'
						+ 'site: "PANews"\n'
						+ '---\n\n# Body\n',
				} as unknown as Awaited<ReturnType<typeof requestUrl>>)

			await expect(loadUrlPreview('https://www.panewslab.com/zh/articles/1csafn9q')).resolves.toEqual({
				title: TEST_DEFUDDLE_TITLE,
				faviconUrl: 'https://icons.duckduckgo.com/ip3/www.panewslab.com.ico',
				status: 'ready',
			})
		})

		it('returns failed only when html title and defuddle title both fail', async () => {
			const obsidian = await import('obsidian')
			vi.spyOn(obsidian, 'requestUrl')
				.mockResolvedValueOnce({
					status: 200,
					headers: { 'content-type': 'text/html' },
					text: '<html><body>No title</body></html>',
				} as unknown as Awaited<ReturnType<typeof requestUrl>>)
				.mockResolvedValueOnce({
					status: 503,
					headers: { 'content-type': 'text/markdown' },
					text: '',
				} as unknown as Awaited<ReturnType<typeof requestUrl>>)

			await expect(loadUrlPreview('https://www.panewslab.com/zh/articles/another')).resolves.toEqual({
				title: null,
				faviconUrl: 'https://icons.duckduckgo.com/ip3/www.panewslab.com.ico',
				status: 'failed',
			})
		})
	})
}
