import { useEffect, useState } from 'react'

import {
	getTradingViewSymbolLogoUrl,
	loadCachedSymbolLogoSrc,
	readCachedSymbolLogoSrc,
} from '../../icon/symbol-icons'

import { ObsidianIcon } from './obsidian-icon'

type SymbolIconProps = {
	logo: string | null | undefined
	alt?: string
	className?: string
}

// @story [[lucrjournal/primitives#^symbol-icon-fallback]] Defines the visible fallback while a symbol logo is unavailable
const DEFAULT_SYMBOL_ICON_NAME = 'circle-dollar-sign'
// @story [[lucrjournal/primitives#^image-icon-shape]] Keeps loaded symbol images circular and cropped
const IMAGE_ICON_CLASS_NAME = 'lj:rounded-full lj:object-cover'

export function SymbolIcon({
	logo,
	alt = '',
	className,
}: SymbolIconProps) {
	const logoUrl = getTradingViewSymbolLogoUrl(logo)
	const [iconSrc, setIconSrc] = useState(() => readCachedSymbolLogoSrc(logoUrl))
	const iconClassName = `lj:border-none lj:ring-0 lj:outline-none ${className ?? ''}`.trim()

	// @story [[lucrjournal/primitives#^symbol-icon-fallback]] Loads cache misses asynchronously and ignores results after unmount
	useEffect(() => {
		const cachedLogoSrc = readCachedSymbolLogoSrc(logoUrl)
		setIconSrc(cachedLogoSrc)
		if (logoUrl === null || cachedLogoSrc !== null) {
			return
		}

		let alive = true
		void loadCachedSymbolLogoSrc(logoUrl).then((loadedLogoSrc) => {
			if (alive) {
				setIconSrc(loadedLogoSrc)
			}
		})

		return () => {
			alive = false
		}
	}, [logoUrl])

	if (iconSrc === null) {
		return (
			<span className={`lj:flex lj:shrink-0 lj:items-center lj:justify-center ${iconClassName}`}>
				<ObsidianIcon name={DEFAULT_SYMBOL_ICON_NAME} className={`${iconClassName} lj:text-lj-c-hint-vivid`} />
			</span>
		)
	}

	return <img src={iconSrc} alt={alt} className={`${iconClassName} ${IMAGE_ICON_CLASS_NAME}`} />
}
