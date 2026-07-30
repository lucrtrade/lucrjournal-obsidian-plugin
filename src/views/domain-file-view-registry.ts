import { LUCR_PLAYBOOK_VIEW_TYPE, LUCR_POSITION_VIEW_TYPE } from '../constant'
import { PlaybookDomain, type Playbook } from '../domains/playbook'
import { PositionDomain, type Position } from '../domains/position'
import { t } from '../lang/helpers'

export type DomainFileViewDescriptor<Value = unknown> = {
	className: string
	fallbackTitle: string
	markdownActionLabel: () => string
	refine: (frontmatter: unknown) => Value | null
	rootName: string
	viewType: string
}

export const positionDomainFileViewDescriptor: DomainFileViewDescriptor<Position> = {
	className: 'lucrjournal-position-view',
	fallbackTitle: 'Position',
	markdownActionLabel: () => t('POSITION_MARKDOWN_VIEW_OPEN_POSITION'),
	refine: (frontmatter) => PositionDomain.refine(frontmatter),
	rootName: 'position-file-view',
	viewType: LUCR_POSITION_VIEW_TYPE,
}

export const playbookDomainFileViewDescriptor: DomainFileViewDescriptor<Playbook> = {
	className: 'lucrjournal-playbook-view',
	fallbackTitle: 'Playbook',
	markdownActionLabel: () => t('PLAYBOOK_MARKDOWN_VIEW_OPEN_PLAYBOOK'),
	refine: (frontmatter) => PlaybookDomain.refine(frontmatter),
	rootName: 'playbook-file-view',
	viewType: LUCR_PLAYBOOK_VIEW_TYPE,
}

// @story [[lucrjournal/runtime#^domain-default-view]] Maps valid position and playbook domain data to their structured view descriptors.
export const domainFileViewDescriptors: readonly DomainFileViewDescriptor[] = [
	positionDomainFileViewDescriptor,
	playbookDomainFileViewDescriptor,
]
