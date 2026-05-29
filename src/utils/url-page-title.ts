import { requestUrl } from 'obsidian'

import { normalizeHomepageUrl } from '../icon/homepage-favicon'

import { sanitizeObsidianFileName } from './entry-name'

const DEFUDDLE_MARKDOWN_URL_PREFIX = 'https://defuddle.md/'
const pageTitleCache = new Map<string, string | null>()
const pageTitleRequests = new Map<string, Promise<string | null>>()

export async function resolveHttpPageTitle(url: string | null | undefined): Promise<string | null> {
	const normalizedUrl = normalizeHomepageUrl(url)
	if (normalizedUrl === null) {
		return null
	}

	const cached = pageTitleCache.get(normalizedUrl)
	if (cached !== undefined) {
		return cached
	}

	const pending = pageTitleRequests.get(normalizedUrl)
	if (pending !== undefined) {
		return await pending
	}

	const nextRequest = requestUrl({
		url: normalizedUrl,
		headers: {
			Accept: 'text/html,*/*;q=0.8',
		},
		throw: false,
	}).then(async (response) => {
		const rawTitle = readHtmlResponseTitle(response.text, response.status, response.headers)
			?? await resolveDefuddleFrontmatterTitle(normalizedUrl)
		const normalizedTitle = rawTitle == null ? null : sanitizeObsidianFileName(rawTitle)
		const result = normalizedTitle == null || normalizedTitle === '' ? null : normalizedTitle
		pageTitleCache.set(normalizedUrl, result)
		pageTitleRequests.delete(normalizedUrl)
		return result
	}, () => {
		return resolveDefuddleFrontmatterTitle(normalizedUrl).then((rawTitle) => {
			const normalizedTitle = rawTitle == null ? null : sanitizeObsidianFileName(rawTitle)
			const result = normalizedTitle == null || normalizedTitle === '' ? null : normalizedTitle
			pageTitleCache.set(normalizedUrl, result)
			pageTitleRequests.delete(normalizedUrl)
			return result
		}, () => {
			pageTitleCache.set(normalizedUrl, null)
			pageTitleRequests.delete(normalizedUrl)
			return null
		})
	})

	pageTitleRequests.set(normalizedUrl, nextRequest)
	return await nextRequest
}

export async function resolveDefuddleFrontmatterTitle(url: string | null | undefined): Promise<string | null> {
	const normalizedUrl = normalizeHomepageUrl(url)
	if (normalizedUrl === null) {
		return null
	}

	try {
		const response = await requestUrl({
			url: `${DEFUDDLE_MARKDOWN_URL_PREFIX}${normalizedUrl}`,
			headers: {
				Accept: 'text/markdown,text/plain,*/*;q=0.8',
			},
			throw: false,
		})

		if (response.status < 200 || response.status >= 300) {
			return null
		}

		return extractDefuddleFrontmatterTitle(response.text)
	} catch {
		return null
	}
}

function readResponseHeader(headers: Record<string, string>, headerName: string): string | null {
	const normalizedHeaderName = headerName.toLowerCase()
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === normalizedHeaderName) {
			return value
		}
	}

	return null
}

function extractHtmlTitle(html: string): string | null {
	const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null
	if (rawTitle === null) {
		return null
	}

	const normalized = rawTitle.replace(/\s+/g, ' ').trim()
	return normalized === '' ? null : normalized
}

function extractDefuddleFrontmatterTitle(markdown: string): string | null {
	if (!markdown.startsWith('---\n')) {
		return null
	}

	const fenceEnd = markdown.indexOf('\n---\n', 4)
	if (fenceEnd === -1) {
		return null
	}

	const frontmatter = markdown.slice(4, fenceEnd)
	const rawTitle = frontmatter.match(/^title:\s*"([^"\n]+)"\s*$/m)?.[1]
	if (rawTitle === undefined) {
		return null
	}

	const normalized = rawTitle.replace(/\s+/g, ' ').trim()
	return normalized === '' ? null : normalized
}

function readHtmlResponseTitle(html: string, status: number, headers: Record<string, string>): string | null {
	const contentType = readResponseHeader(headers, 'content-type')?.split(';')[0]?.trim()
	return status >= 200 && status < 300 && contentType === 'text/html'
		? extractHtmlTitle(html)
		: null
}

if (import.meta.vitest) {
	const { beforeEach, describe, expect, it, vi } = import.meta.vitest
	const TEST_DEFUDDLE_TITLE = '\u9996\u5c14\u8c6a\u8d4c\uff1a\u52a0\u5bc6\u8d44\u4ea7\u80fd\u5426\u91cd\u5851\u97e9\u56fd\u7ecf\u6d4e\u672a\u6765\uff1f'
	const clearResolvedHttpPageTitleCache = () => {
		pageTitleCache.clear()
		pageTitleRequests.clear()
	}

	describe('extractDefuddleFrontmatterTitle', () => {
		it('reads title from defuddle frontmatter', () => {
			expect(extractDefuddleFrontmatterTitle(
				'---\n'
				+ `title: "${TEST_DEFUDDLE_TITLE}"\n`
				+ 'author: "Techub News"\n'
				+ '---\n\n# Body\n',
			)).toBe(TEST_DEFUDDLE_TITLE)
		})

		it('returns null when frontmatter title is missing', () => {
			expect(extractDefuddleFrontmatterTitle('---\nauthor: "Techub News"\n---\n')).toBeNull()
		})
	})

	describe('resolveHttpPageTitle', () => {
		beforeEach(() => {
			vi.restoreAllMocks()
			clearResolvedHttpPageTitleCache()
		})

		it('falls back to defuddle frontmatter title when html title is unavailable', async () => {
			const requestUrlSpy = vi.spyOn(await import('obsidian'), 'requestUrl')
			requestUrlSpy
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
						+ '---\n\n# Body\n',
				} as unknown as Awaited<ReturnType<typeof requestUrl>>)

			await expect(resolveHttpPageTitle('https://www.panewslab.com/zh/articles/1csafn9q'))
				.resolves.toBe(TEST_DEFUDDLE_TITLE)
		})

		it('returns null only when html title and defuddle title both fail', async () => {
			const requestUrlSpy = vi.spyOn(await import('obsidian'), 'requestUrl')
			requestUrlSpy
				.mockResolvedValueOnce({
					status: 500,
					headers: { 'content-type': 'text/html' },
					text: '',
				} as unknown as Awaited<ReturnType<typeof requestUrl>>)
				.mockResolvedValueOnce({
					status: 503,
					headers: { 'content-type': 'text/markdown' },
					text: '',
				} as unknown as Awaited<ReturnType<typeof requestUrl>>)

			await expect(resolveHttpPageTitle('https://www.panewslab.com/zh/articles/1csafn9q')).resolves.toBeNull()
		})
	})
}
