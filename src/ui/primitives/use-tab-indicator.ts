import { useLayoutEffect, useRef, useState } from 'react'

type TabIndicatorState = {
	x: number
	width: number
	visible: boolean
}

type UseTabIndicatorParams<T extends string> = {
	activeTab: T
	deps?: readonly unknown[]
	hidden?: boolean
}

export function useTabIndicator<T extends string, TElement extends HTMLElement = HTMLElement>({
	activeTab,
	deps = [],
	hidden = false,
}: UseTabIndicatorParams<T>) {
	const [indicator, setIndicator] = useState<TabIndicatorState>({ x: 0, width: 0, visible: false })
	const tabListRef = useRef<TElement | null>(null)
	const tabButtonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})

	useLayoutEffect(() => {
		const tabList = tabListRef.current

		const hideIndicator = () => {
			setIndicator((previous) => previous.visible ? { ...previous, visible: false } : previous)
		}

		const updateIndicator = () => {
			const activeButton = tabButtonRefs.current[activeTab]

			if (hidden || tabList === null || activeButton === null || activeButton === undefined) {
				hideIndicator()
				return
			}

			const tabListRect = tabList.getBoundingClientRect()
			const buttonRect = activeButton.getBoundingClientRect()
			const nextIndicator = {
				x: Math.round(buttonRect.left - tabListRect.left + tabList.scrollLeft),
				width: Math.round(buttonRect.width),
				visible: true,
			}

			setIndicator((previous) => (
				previous.x === nextIndicator.x
				&& previous.width === nextIndicator.width
				&& previous.visible === nextIndicator.visible
			)
				? previous
				: nextIndicator)
		}

		updateIndicator()

		if (tabList === null) {
			return
		}

		const observer = new ResizeObserver(updateIndicator)
		observer.observe(tabList)
		const activeButton = tabButtonRefs.current[activeTab]
		if (activeButton !== null && activeButton !== undefined) {
			observer.observe(activeButton)
		}

		tabList.addEventListener('scroll', updateIndicator, { passive: true })

		return () => {
			observer.disconnect()
			tabList.removeEventListener('scroll', updateIndicator)
		}
	}, [activeTab, hidden, ...deps])

	return {
		indicatorStyle: {
			width: `${indicator.width}px`,
			transform: `translateX(${indicator.x}px)`,
			opacity: indicator.visible ? '1' : '0',
		},
		registerTabButton: (tabId: T) => (element: HTMLButtonElement | null) => {
			tabButtonRefs.current[tabId] = element
		},
		tabListRef,
	}
}
