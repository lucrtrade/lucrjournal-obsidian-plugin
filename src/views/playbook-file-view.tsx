import { listPlaybookEntriesWithStats } from '../domains'
import { DashboardPlaybookDetails } from '../ui/dashboard/dashboard-playbook-details'

import { DomainFileView, type DomainFileViewConfig } from './domain-file-view'
import { playbookDomainFileViewDescriptor } from './domain-file-view-registry'

import type { Playbook } from '../domains'

export class PlaybookFileView extends DomainFileView<Playbook> {
	protected override readonly config: DomainFileViewConfig<Playbook> = {
		descriptor: playbookDomainFileViewDescriptor,
		render: ({ app, file, rerender }) => {
			const playbook = listPlaybookEntriesWithStats(app)
				.find((item) => item.entry.file.path === file.path)
			if (playbook === undefined) {
				throw new Error(`Playbook file view entry missing: ${file.path}`)
			}

			return (
				<DashboardPlaybookDetails
					app={app}
					playbook={playbook}
					onPlaybookPathChange={rerender}
				/>
			)
		},
	}

	getViewType(): string {
		return playbookDomainFileViewDescriptor.viewType
	}
}
