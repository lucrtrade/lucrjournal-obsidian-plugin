import { FileView, TFile, type App, type WorkspaceLeaf } from 'obsidian'
import { type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { t } from '../lang/helpers'
import { getToken } from '../session/storage'
import { SessionGateScreen } from '../ui/login-screen'

import { openDomainFileAsMarkdown } from './domain-file-routing'

import type { DomainFileViewDescriptor } from './domain-file-view-registry'

export type DomainFileViewConfig<Value> = {
	descriptor: DomainFileViewDescriptor<Value>
	render: (context: {
		app: App
		file: TFile
		rerender: () => void
		value: Value
	}) => ReactNode
}

export abstract class DomainFileView<Value> extends FileView {
	private root: Root | null = null
	private workspaceLeafEl: HTMLElement | null = null

	protected abstract readonly config: DomainFileViewConfig<Value>

	constructor(leaf: WorkspaceLeaf) {
		super(leaf)
	}

	override getDisplayText(): string {
		return this.file?.basename ?? this.config.descriptor.fallbackTitle
	}

	override getIcon(): string {
		return 'lucrtrade'
	}

	override async onOpen(): Promise<void> {
		this.workspaceLeafEl = this.getWorkspaceLeafEl()
		this.workspaceLeafEl.addClass('lucrjournal-leaf')
		this.contentEl.empty()
		this.registerEvent(this.app.metadataCache.on('changed', (file) => {
			if (file.path === this.file?.path) {
				this.render()
			}
		}))
		this.registerEvent(this.app.metadataCache.on('resolved', () => this.render()))

		this.addAction('file-text', t('DOMAIN_FILE_VIEW_OPEN_MARKDOWN'), () => {
			if (!(this.file instanceof TFile)) {
				return
			}
			void openDomainFileAsMarkdown(this.leaf, this.file.path, undefined, undefined, this.app)
		})

		this.root = createRoot(this.contentEl.createDiv({
			cls: `lucrjournal-view ${this.config.descriptor.className}`,
			attr: {
				'data-lj-root': this.config.descriptor.rootName,
				'data-lj-view-type': this.config.descriptor.viewType,
			},
		}))
		this.render()
	}

	override async onClose(): Promise<void> {
		this.root?.unmount()
		this.root = null
		this.workspaceLeafEl?.removeClass('lucrjournal-leaf')
		this.workspaceLeafEl = null
		this.contentEl.empty()
	}

	override async onLoadFile(_file: TFile): Promise<void> {
		this.render()
	}

	override async onUnloadFile(_file: TFile): Promise<void> {
		this.root?.render(null)
	}

	public requestRender(): void {
		this.render()
	}

	private render(): void {
		if (this.root === null) {
			return
		}

		if (getToken(this.app) === null) {
			this.root.render(<SessionGateScreen app={this.app} />)
			return
		}

		const file = this.file
		if (!(file instanceof TFile)) {
			return
		}

		const cache = this.app.metadataCache.getFileCache(file)
		if (cache === null) {
			this.root.render(null)
			return
		}

		const value = this.config.descriptor.refine(cache.frontmatter)
		if (value === null) {
			void openDomainFileAsMarkdown(this.leaf, file.path, 'source', undefined, this.app)
			return
		}

		this.root.render(this.config.render({
			app: this.app,
			file,
			rerender: () => this.render(),
			value,
		}))
	}

	private getWorkspaceLeafEl(): HTMLElement {
		const leafEl = this.containerEl.closest('.workspace-leaf')
		if (!(leafEl instanceof HTMLElement)) {
			throw new Error('Missing workspace leaf element')
		}
		return leafEl
	}
}
