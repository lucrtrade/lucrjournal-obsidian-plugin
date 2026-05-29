import { PositionDetails } from '../ui/position-details'

import { DomainFileView, type DomainFileViewConfig } from './domain-file-view'
import { positionDomainFileViewDescriptor } from './domain-file-view-registry'

import type { Position } from '../domains/position'

export class PositionFileView extends DomainFileView<Position> {
	protected override readonly config: DomainFileViewConfig<Position> = {
		descriptor: positionDomainFileViewDescriptor,
		render: ({ app, file, value }) => (
			<PositionDetails
				app={app}
				position={value}
				positionFile={file}
			/>
		),
	}

	getViewType(): string {
		return positionDomainFileViewDescriptor.viewType
	}
}
