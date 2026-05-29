import { setIcon } from 'obsidian'
import { useEffect, useRef } from 'react'

type ObsidianIconProps = {
	name: string
	className?: string
}

export function ObsidianIcon({ name, className }: ObsidianIconProps) {
	const ref = useRef<HTMLSpanElement>(null)

	useEffect(() => {
		if (ref.current) {
			ref.current.empty()
			setIcon(ref.current, name)
		}
	}, [name])

	return (
		<span
			ref={ref}
			className={`lj:inline-flex lj:items-center lj:justify-center ${className ?? ''}`}
		/>
	)
}
