import { useLayoutEffect, useState, type RefObject } from 'react'

export function useObservedWidth<T extends HTMLElement>(elementRef: RefObject<T | null>) {
	const [width, setWidth] = useState(0)

	// @story [[lucrjournal/primitives#^observed-container-width]] Measures the referenced element and disconnects its ResizeObserver
	useLayoutEffect(() => {
		const element = elementRef.current
		if (element === null) {
			return
		}

		const updateWidth = () => {
			setWidth(Math.round(element.getBoundingClientRect().width))
		}

		updateWidth()

		const observer = new ResizeObserver(updateWidth)
		observer.observe(element)

		return () => observer.disconnect()
	}, [elementRef])

	return width
}
