/// <reference types="vitest/importMeta" />

type MarkdownHeading = {
	title: string
	start: number
	lineEnd: number
}

type ExtractedMarkdownSection = {
	title: string
	body: string
	start: number
	end: number
}

function collectHeadings(content: string, depth: number): MarkdownHeading[] {
	const headings: MarkdownHeading[] = []
	const prefix = '#'.repeat(depth)
	const pattern = new RegExp(`^${prefix} (.+)$`, 'gm')

	for (const match of content.matchAll(pattern)) {
		const start = match.index
		const title = match[1] ?? ''
		const lineBreakIndex = content.indexOf('\n', start)
		headings.push({
			title,
			start,
			lineEnd: lineBreakIndex === -1 ? content.length : lineBreakIndex + 1,
		})
	}

	return headings
}

export function extractSection(
	content: string,
	heading: string,
	depth = 1,
): { body: string; start: number; end: number; found: boolean } {
	const headings = collectHeadings(content, depth)
	const index = headings.findIndex(({ title }) => title === heading)
	if (index === -1) {
		return { body: '', start: content.length, end: content.length, found: false }
	}

	const currentHeading = headings[index]
	if (currentHeading === undefined) {
		throw new Error('Missing current heading after index lookup')
	}

	const nextHeading = headings[index + 1]
	const bodyStart = currentHeading.lineEnd
	const bodyEnd = nextHeading?.start ?? content.length

	return {
		body: content.slice(bodyStart, bodyEnd).trim(),
		start: bodyStart,
		end: bodyEnd,
		found: true,
	}
}

export function extractSections(content: string, depth: number): ExtractedMarkdownSection[] {
	const headings = collectHeadings(content, depth)

	return headings.map((heading, index) => {
		const nextHeading = headings[index + 1]
		const bodyStart = heading.lineEnd
		const bodyEnd = nextHeading?.start ?? content.length

		return {
			title: heading.title,
			body: content.slice(bodyStart, bodyEnd).trim(),
			start: bodyStart,
			end: bodyEnd,
		}
	})
}

export function normalizeSectionBody(body: string): string {
	return body.replace(/^# (?=\S)/gm, '## ')
}

export function hasTopLevelH1(body: string): boolean {
	return /^# (?=\S)/m.test(body)
}

function formatSectionBody(newBody: string, hasFollowingSection: boolean): string {
	const trimmedBody = newBody.trimEnd()
	if (trimmedBody.length === 0) {
		return '\n'
	}

	return `\n${trimmedBody}${hasFollowingSection ? '\n\n' : '\n'}`
}

export function spliceSection(content: string, heading: string, newBody: string): string {
	const headings = collectHeadings(content, 1)
	const index = headings.findIndex(({ title }) => title === heading)

	if (index === -1) {
		const insertAt = headings[0]?.start ?? content.length
		const before = content.slice(0, insertAt)
		const after = content.slice(insertAt)
		const beforeSeparator =
			before.length === 0 ? '' :
				before.endsWith('\n\n') ? '' :
					before.endsWith('\n') ? '\n' :
						'\n\n'

		return before + beforeSeparator + `# ${heading}\n` + formatSectionBody(newBody, after.length > 0) + after
	}

	const currentHeading = headings[index]
	if (currentHeading === undefined) {
		throw new Error('Missing current heading after index lookup')
	}

	const nextHeading = headings[index + 1]
	const before = content.slice(0, currentHeading.lineEnd)
	const after = content.slice(nextHeading?.start ?? content.length)

	return before + formatSectionBody(newBody, after.length > 0) + after
}

export function replaceTopLevelHeading(content: string, nextTitle: string) {
	const lines = content.split('\n')
	let contentStartIndex = 0

	if (lines[0] === '---') {
		for (let index = 1; index < lines.length; index += 1) {
			if (lines[index] === '---') {
				contentStartIndex = index + 1
				break
			}
		}
	}

	while (contentStartIndex < lines.length && lines[contentStartIndex]!.trim().length === 0) {
		contentStartIndex += 1
	}

	if (contentStartIndex >= lines.length) {
		return content
	}

	if (lines[contentStartIndex]!.startsWith('# ')) {
		lines[contentStartIndex] = `# ${nextTitle}`
		return lines.join('\n')
	}

	return content
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('extractSection', () => {
		it('reads the requested top-level section body without pulling in the next H1', () => {
			const content = [
				'---',
				'name: BTC',
				'---',
				'',
				'# Note',
				'',
				'first line',
				'',
				'## Nested',
				'',
				'second line',
				'',
				'# News',
				'',
				'context body',
			].join('\n')

			expect(extractSection(content, 'Note').body).toBe('first line\n\n## Nested\n\nsecond line')
		})
	})

	describe('extractSections', () => {
		it('extracts sibling H2 sections in order', () => {
			const content = [
				'## [[news1]]',
				'',
				'alpha',
				'',
				'## [[keylevel2]]',
				'',
				'beta',
			].join('\n')

			expect(extractSections(content, 2).map(({ title, body }) => ({ title, body }))).toEqual([
				{ title: '[[news1]]', body: 'alpha' },
				{ title: '[[keylevel2]]', body: 'beta' },
			])
		})
	})

	describe('normalizeSectionBody', () => {
		it('demotes nested H1 lines so they do not become sibling sections', () => {
			expect(normalizeSectionBody('# Title\n\n## Keep')).toBe('## Title\n\n## Keep')
		})
	})

	describe('hasTopLevelH1', () => {
		it('detects top-level H1 inside a section body', () => {
			expect(hasTopLevelH1('# Title\n\ntext')).toBe(true)
			expect(hasTopLevelH1('## Title\n\ntext')).toBe(false)
		})
	})

	describe('spliceSection', () => {
		it('updates only the requested section body', () => {
			const content = '# Notes\n\nold\n# News\n\nstay\n'

			expect(spliceSection(content, 'Notes', 'new body')).toBe('# Notes\n\nnew body\n\n# News\n\nstay\n')
		})

		it('inserts the section before the first existing top-level heading when it is missing', () => {
			expect(spliceSection('# News\n\nstay\n', 'Notes', 'new body')).toBe('# Notes\n\nnew body\n\n# News\n\nstay\n')
		})

		it('preserves frontmatter and inserts Note only once', () => {
			const content = ['---', 'lucr_type: position', 'symbol: BTC/USDT', '---', '', '# News', '', 'stay'].join('\n')

			expect(spliceSection(content, 'Notes', 'new body')).toBe(['---', 'lucr_type: position', 'symbol: BTC/USDT', '---', '', '# Notes', '', 'new body', '', '# News', '', 'stay'].join('\n'))
		})
	})

	describe('replaceTopLevelHeading', () => {
		it('replaces the first top-level heading after frontmatter', () => {
			expect(replaceTopLevelHeading(
				'---\nlucr_type: "analysis"\n---\n\n# old-name\n\nBody',
				'new-name',
			)).toBe('---\nlucr_type: "analysis"\n---\n\n# new-name\n\nBody')
		})

		it('leaves markdown unchanged when the body has no top-level heading', () => {
			expect(replaceTopLevelHeading(
				'---\nlucr_type: "playbook"\n---\n\nBody',
				'ICT Daily PO3',
			)).toBe('---\nlucr_type: "playbook"\n---\n\nBody')
		})
	})
}
