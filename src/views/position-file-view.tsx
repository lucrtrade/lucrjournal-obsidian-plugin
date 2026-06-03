import { PositionDetails } from '../ui/position-details'

import { DomainFileView, type DomainFileViewConfig } from './domain-file-view'
import { positionDomainFileViewDescriptor } from './domain-file-view-registry'

import type { Position } from '../domains/position'
import type LucrJournalPlugin from '../main'
import type { WorkspaceLeaf } from 'obsidian'

export class PositionFileView extends DomainFileView<Position> {
	protected override readonly config: DomainFileViewConfig<Position> = {
		descriptor: positionDomainFileViewDescriptor,
		render: ({ app, file, value }) => (
			<PositionDetails
				app={app}
				plugin={this.plugin}
				position={value}
				positionFile={file}
			/>
		),
	}

	constructor(leaf: WorkspaceLeaf, private readonly plugin: LucrJournalPlugin) {
		super(leaf)
	}

	getViewType(): string {
		return positionDomainFileViewDescriptor.viewType
	}
}
