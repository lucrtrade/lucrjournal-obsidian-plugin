import { type CSSProperties } from 'react'

import { resolveIconDescriptor } from '../../domains/core/icon-descriptor'
import {
	PLATFORM_FALLBACK_ICON_NAME,
	getInitialPlatformIconSrc,
} from '../../icon/platform-icons'

import { ObsidianIcon } from './obsidian-icon'

import type { IconDescriptor } from '../../domains'

const IMAGE_FALLBACK_ICON_NAME = 'image'
const IMAGE_ICON_CLASS_NAME = 'lj:rounded-full lj:object-cover'

export function IconView({ icon, className }: {
	icon: string | IconDescriptor
	className?: string
}) {
	const sizeClass = className ?? 'lj:size-4'
	const resolvedIcon = typeof icon === 'string'
		? resolveIconDescriptor(icon, { fallbackImageName: icon }) ?? { kind: 'image', value: icon }
		: icon

	switch (resolvedIcon.kind) {
		case 'image':
			return <ResolvedImageIcon name={resolvedIcon.value} className={sizeClass} />
		case 'platform':
			return <ResolvedPlatformIcon name={resolvedIcon.value} className={sizeClass} />
		case 'lucide':
			return (
				<span
					className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${sizeClass}`}
					style={resolveLucideIconStyle(resolvedIcon.color)}
				>
					<ObsidianIcon
						name={resolvedIcon.value}
						className={resolvedIcon.color === undefined
							? `${sizeClass} lj:text-lj-c-hint-vivid`
							: sizeClass}
					/>
				</span>
			)
		case 'emoji':
			return (
				<span className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${sizeClass}`}>
					<ObsidianIcon name={resolvedIcon.value} className={`${sizeClass} lj:text-lj-c-hint-vivid`} />
				</span>
			)
		case 'url':
			return (
				<span className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${sizeClass}`}>
					<img src={resolvedIcon.value} alt="" className={`lj:block lj:border-none lj:outline-none lj:ring-0 ${IMAGE_ICON_CLASS_NAME} ${sizeClass}`} />
				</span>
			)

		default:
			resolvedIcon satisfies never
			throw new Error('Unknown icon kind')
	}
}

function resolveLucideIconStyle(color: string | undefined): CSSProperties | undefined {
	return color === undefined ? undefined : { color: `var(${color})` }
}

function ResolvedPlatformIcon({ name, className }: {
	name: string
	className: string
}) {
	const iconSrc = useResolvedPlatformIconSrc(name)
	if (iconSrc === null) {
		return (
			<span className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${className}`}>
				<ObsidianIcon name={PLATFORM_FALLBACK_ICON_NAME} className={`${className} lj:text-lj-c-hint-vivid`} />
			</span>
		)
	}

	return (
		<span className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${className}`}>
			<img src={iconSrc} alt="" className={`lj:block lj:border-none lj:outline-none lj:ring-0 ${IMAGE_ICON_CLASS_NAME} ${className}`} />
		</span>
	)
}

function ResolvedImageIcon({ name, className }: {
	name: string
	className: string
}) {
	const iconSrc = useResolvedImageIconSrc(name)
	if (iconSrc === null) {
		return (
			<span className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${className}`}>
				<ObsidianIcon name={IMAGE_FALLBACK_ICON_NAME} className={`${className} lj:text-lj-c-hint-vivid`} />
			</span>
		)
	}

	return (
		<span className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${className}`}>
			<img src={iconSrc} alt="" className={`lj:block lj:border-none lj:outline-none lj:ring-0 ${IMAGE_ICON_CLASS_NAME} ${className}`} />
		</span>
	)
}

function useResolvedImageIconSrc(name: string) {
	return getInitialPlatformIconSrc(name)
}

function useResolvedPlatformIconSrc(name: string) {
	return getInitialPlatformIconSrc(name)
}
