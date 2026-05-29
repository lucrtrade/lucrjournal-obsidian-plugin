import { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AttachmentLightbox } from './attachment-lightbox'
import { ImageLightbox } from './image-lightbox'

import type { ReactElement, ReactNode } from 'react'

describe('AttachmentLightbox', () => {
	it('passes an OCR action for vault attachments', () => {
		const tree = AttachmentLightbox({
			attachment: {
				kind: 'vault',
				label: 'shot',
				src: 'app://shot.png',
			},
			currentIndex: 0,
			isOpen: true,
			onClose: () => {},
			onNext: () => {},
			onPrevious: () => {},
			onRunOcr: () => {},
			total: 1,
		})
		const lightbox = findElementByType(tree, ImageLightbox)

		expect(lightbox?.props.topRightAction).not.toBeUndefined()
	})

	it('wires the OCR action without closing the lightbox', () => {
		const onRunOcr = vi.fn()
		const tree = AttachmentLightbox({
			attachment: {
				kind: 'vault',
				label: 'shot',
				src: 'app://shot.png',
			},
			currentIndex: 0,
			isOpen: true,
			isRunningOcr: true,
			onClose: () => {},
			onNext: () => {},
			onPrevious: () => {},
			onRunOcr,
			total: 1,
		})
		const lightbox = findElementByType(tree, ImageLightbox)
		const action = lightbox?.props.topRightAction

		if (!isValidElement<OcrActionProps>(action)) {
			throw new Error('Expected vault attachment OCR action')
		}

		const event = { stopPropagation: vi.fn() }
		action.props.onClick(event)

		expect(action.props.disabled).toBe(true)
		expect(event.stopPropagation).toHaveBeenCalledOnce()
		expect(onRunOcr).toHaveBeenCalledOnce()
	})

	it('does not pass an OCR action for external attachments', () => {
		const tree = AttachmentLightbox({
			attachment: {
				kind: 'external',
				label: 'shot',
				src: 'https://example.com/shot.png',
			},
			currentIndex: 0,
			isOpen: true,
			onClose: () => {},
			onNext: () => {},
			onPrevious: () => {},
			onRunOcr: () => {},
			total: 1,
		})
		const lightbox = findElementByType(tree, ImageLightbox)

		expect(lightbox?.props.topRightAction).toBeUndefined()
	})
})

type OcrActionProps = {
	disabled?: boolean
	onClick: (event: { stopPropagation: () => void }) => void
}

function findElementByType(node: ReactNode, type: unknown): ReactElement<{ children?: ReactNode; topRightAction?: ReactNode }> | null {
	if (isReactNodeArray(node)) {
		for (const child of node) {
			const result = findElementByType(child, type)
			if (result !== null) {
				return result
			}
		}
		return null
	}

	if (!isValidElement<{ children?: ReactNode; topRightAction?: ReactNode }>(node)) {
		return null
	}

	if (node.type === type) {
		return node
	}

	return findElementByType(node.props.children, type)
}

function isReactNodeArray(node: ReactNode): node is ReactNode[] {
	return Array.isArray(node)
}
