import { resolveNewsTitleIcon, type IconDescriptor } from '../../domains'
import { resolveIconDescriptor } from '../../domains/core/icon-descriptor'
import { resolveHomepageFaviconUrl } from '../../icon/homepage-favicon'
import { IconView } from '../primitives/icon-view'

import type { DomainPersistedEntry } from '../../domains/core/type'
import type { ReactNode } from 'react'

type LinkedEntryTitleValue = {
	lucr_type?: string
	icon?: string | null
	source?: string | null
	impact?: 'high' | 'medium' | 'low' | null
}

export function LinkedEntryTitle({
	entry,
	title,
	titleClassName,
	iconClassName = 'lj:size-3.5',
}: {
	entry: DomainPersistedEntry<LinkedEntryTitleValue>
	title: string
	titleClassName?: string
	iconClassName?: string
}): ReactNode {
	const icon = resolveLinkedEntryTitleIcon(entry)

	return (
		<span className="lj:flex lj:min-w-0 lj:items-center lj:gap-2">
			{icon == null ? null : <IconView icon={icon} className={iconClassName} />}
			<span className={titleClassName ?? 'lj:min-w-0 lj:flex-1 lj:truncate'}>{title.trim() === '' ? '-' : title}</span>
		</span>
	)
}

function resolveLinkedEntryTitleIcon(entry: DomainPersistedEntry<LinkedEntryTitleValue>): IconDescriptor | string | undefined {
	if (entry.fm.lucr_type === 'news') {
		return resolveNewsTitleIcon(entry.fm) ?? undefined
	}

	if (entry.fm.icon != null) {
		return typeof entry.fm.icon === 'string'
			? resolveIconDescriptor(entry.fm.icon, { fallbackImageName: entry.fm.icon }) ?? { kind: 'image', value: entry.fm.icon }
			: entry.fm.icon
	}

	const sourceFaviconUrl = resolveHomepageFaviconUrl(entry.fm.source)
	return sourceFaviconUrl == null ? undefined : { kind: 'url', value: sourceFaviconUrl }
}
