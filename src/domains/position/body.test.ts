import { TFile, type App } from 'obsidian'
import { describe, expect, it } from 'vitest'

import { LUCR_TRADE_ROOT_DIR } from '../../constant'

import {
	appendSectionEntry,
	buildDefaultPositionBody,
	ensureTopLevelSection,
	removeAllSectionEntriesFromPositionByLinkpath,
	removePositionPlaybookFrontmatter,
	removePositionPlaybookFrontmatterByLinkpath,
	removeSectionEntryFromPosition,
	removeTopLevelSectionFromPosition,
	setPositionPlaybookFrontmatter,
} from './body'

describe('position body contract', () => {
	// @story [[lucrjournal/position-body#^default-position-body]] Covers the exact Notes-only body skeleton
	it('builds the default skeleton with Notes only', () => {
		expect(buildDefaultPositionBody()).toBe('\n# Notes\n')
	})

	// @story [[lucrjournal/position-body#^position-section-contract]] Covers canonical insertion between surrounding H1 sections
	// @story [[lucrjournal/position-body#^append-position-context]] Covers a missing H1 and canonical linked H2 append
	// @story [[lucrjournal/position-body#^position-body-reserialization]] Covers preservation of frontmatter Notes body and sibling H1 sections
	it('appends a linked entry into a missing top-level section and inserts it in order', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const newsFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/news/news1.md`)
		const runtime = createPositionBodyRuntime([
			'---',
			'lucr_type: "position"',
			'---',
			'',
			'# Notes',
			'',
			'manual notes',
			'',
			'# Key Levels',
			'',
			'# Confluence',
			'',
		].join('\n'))

		const result = await appendSectionEntry(runtime.app, positionFile, 'News', newsFile)

		expect(result).toBe('appended')
		expect(runtime.content).toBe([
			'---',
			'lucr_type: "position"',
			'---',
			'',
			'# Notes',
			'',
			'manual notes',
			'',
			'# News',
			'',
			'## [[news1]]',
			'',
			'# Key Levels',
			'',
			'# Confluence',
			'',
		].join('\n'))
	})

	// @story [[lucrjournal/position-body#^append-position-context]] Covers duplicate linkpath rejection without a file write
	it('does not duplicate an existing linked entry inside the same section', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const newsFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/news/news1.md`)
		const runtime = createPositionBodyRuntime([
			'# Notes',
			'',
			'# News',
			'',
			'## [[news1]]',
			'',
			'alpha',
			'',
		].join('\n'))

		const result = await appendSectionEntry(runtime.app, positionFile, 'News', newsFile)

		expect(result).toBe('exists')
		expect(runtime.writeCount).toBe(0)
	})

	// @story [[lucrjournal/position-body#^position-playbook-writeback]] Covers canonical playbook basename writeback
	it('writes the linked playbook into frontmatter', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const playbookFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/playbooks/PBK-00002.md`)
		const runtime = createPositionBodyRuntime([
			'---',
			'lucr_type: "position"',
			'---',
			'',
			'# Notes',
			'',
		].join('\n'))

		const result = await setPositionPlaybookFrontmatter({
			app: runtime.app,
			positionFile,
			playbookFile,
		})

		expect(result).toBe('appended')
		expect(runtime.frontmatter.playbook).toBe('[[PBK-00002]]')
	})

	// @story [[lucrjournal/position-body#^position-playbook-writeback]] Covers clearing an existing playbook reference
	it('clears the linked playbook from frontmatter', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const runtime = createPositionBodyRuntime('# Notes\n', { playbook: '[[PBK-00001]]' })

		const removed = await removePositionPlaybookFrontmatter({
			app: runtime.app,
			positionFile,
		})

		expect(removed).toBe(true)
		expect(runtime.frontmatter.playbook).toBeNull()
	})

	// @story [[lucrjournal/position-body#^position-playbook-writeback]] Covers exact-linkpath cleanup and mismatch preservation
	it('clears playbook frontmatter only when linkpath matches', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const runtime = createPositionBodyRuntime('# Notes\n', { playbook: '[[PBK-00001]]' })

		expect(await removePositionPlaybookFrontmatterByLinkpath({
			app: runtime.app,
			positionFile,
			linkpath: 'PBK-99999',
		})).toBe(false)
		expect(runtime.frontmatter.playbook).toBe('[[PBK-00001]]')

		expect(await removePositionPlaybookFrontmatterByLinkpath({
			app: runtime.app,
			positionFile,
			linkpath: 'PBK-00001',
		})).toBe(true)
		expect(runtime.frontmatter.playbook).toBeNull()
	})

	// @story [[lucrjournal/position-body#^remove-position-context]] Covers linked block deletion while retaining the empty H1
	it('keeps the optional H1 when its last linked block is deleted', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const runtime = createPositionBodyRuntime([
			'# Notes',
			'',
			'# News',
			'',
			'## [[news1]]',
			'',
			'alpha',
			'',
		].join('\n'))

		const removed = await removeSectionEntryFromPosition({
			app: runtime.app,
			linkpath: 'news1',
			positionFile,
			sectionStart: runtime.content.indexOf('alpha'),
			sectionTitle: 'News',
		})

		expect(removed).toBe(true)
		expect(runtime.content).toBe([
			'# Notes',
			'',
			'# News',
			'',
		].join('\n'))
	})

	// @story [[lucrjournal/position-body#^ensure-position-section]] Covers explicit creation of one empty optional H1
	it('creates an empty optional section without opening a picker path', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const runtime = createPositionBodyRuntime([
			'# Notes',
			'',
		].join('\n'))

		const result = await ensureTopLevelSection(runtime.app, positionFile, 'News')

		expect(result).toBe('created')
		expect(runtime.content).toBe([
			'# Notes',
			'',
			'# News',
			'',
		].join('\n'))
	})

	// @story [[lucrjournal/position-body#^remove-position-section]] Covers exact H1 removal with sibling preservation
	it('deletes a whole top-level analysis section on demand', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const runtime = createPositionBodyRuntime([
			'# Notes',
			'',
			'# News',
			'',
			'## [[news1]]',
			'',
			'alpha',
			'',
			'# Key Levels',
			'',
		].join('\n'))

		const removed = await removeTopLevelSectionFromPosition({
			app: runtime.app,
			positionFile,
			sectionTitle: 'News',
		})

		expect(removed).toBe(true)
		expect(runtime.content).toBe([
			'# Notes',
			'',
			'# Key Levels',
			'',
		].join('\n'))
	})

	// @story [[lucrjournal/position-body#^remove-all-position-context]] Covers four-section cleanup Notes preservation and playbook isolation
	it('removes the same linkpath from every analysis section but keeps playbook frontmatter intact', async () => {
		const positionFile = createMockTFile(`${LUCR_TRADE_ROOT_DIR}/positions/POS-00001.md`)
		const runtime = createPositionBodyRuntime([
			'# Notes',
			'',
			'keep note body',
			'',
			'# News',
			'',
			'## [[shared-link]]',
			'',
			'from news',
			'',
			'# Key Levels',
			'',
			'## [[shared-link]]',
			'',
			'from key levels',
			'',
			'# Confluence',
			'',
			'## [[shared-link]]',
			'',
			'from confluence',
			'',
			'# Market Analysis',
			'',
			'## [[shared-link]]',
			'',
			'from premarket',
			'',
		].join('\n'), { playbook: '[[shared-link]]' })

		const removedCount = await removeAllSectionEntriesFromPositionByLinkpath({
			app: runtime.app,
			linkpath: 'shared-link',
			positionFile,
		})

		expect(removedCount).toBe(4)
		expect(runtime.content).toBe([
			'# Notes',
			'',
			'keep note body',
			'',
			'# News',
			'',
			'# Key Levels',
			'',
			'# Confluence',
			'',
			'# Market Analysis',
			'',
		].join('\n'))
		expect(runtime.frontmatter.playbook).toBe('[[shared-link]]')
	})
})

function createPositionBodyRuntime(initialContent: string, initialFrontmatter: Record<string, unknown> = {}) {
	const runtime = {
		content: initialContent,
		writeCount: 0,
		frontmatter: { ...initialFrontmatter } as Record<string, unknown>,
	}

	return {
		get content() {
			return runtime.content
		},
		get writeCount() {
			return runtime.writeCount
		},
		get frontmatter() {
			return runtime.frontmatter
		},
		app: {
			vault: {
				read: async () => runtime.content,
				adapter: {
					write: async (_path: string, nextContent: string) => {
						runtime.content = nextContent
						runtime.writeCount += 1
					},
				},
			},
			fileManager: {
				processFrontMatter: async (_file: TFile, editor: (frontmatter: Record<string, unknown>) => void) => {
					editor(runtime.frontmatter)
				},
			},
			metadataCache: {
				getFileCache: () => ({ frontmatter: runtime.frontmatter }),
			},
		} as unknown as App,
	}
}

function createMockTFile(path: string) {
	const file = new TFile()
	file.path = path
	file.basename = path.split('/').pop()!.replace(/\.md$/, '')
	file.extension = 'md'
	return file
}
