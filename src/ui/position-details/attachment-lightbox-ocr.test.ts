import { describe, expect, it } from 'vitest'

import { closeAttachmentLightboxOcrReview, runAttachmentLightboxOcr } from './attachment-lightbox-ocr'

import type { PositionAttachment } from './use-position-details-media'

describe('runAttachmentLightboxOcr', () => {
	it('keeps the lightbox open while OCR is running and opens review after a result', async () => {
		const attachment = buildAttachment()
		let resolveImport!: (value: boolean) => void
		const importPromise = new Promise<boolean>((resolve) => {
			resolveImport = resolve
		})
		const calls: string[] = []

		const result = runAttachmentLightboxOcr({
			attachment,
			importAttachmentOcrFromAttachment: async (received) => {
				expect(received).toBe(attachment)
				calls.push('import')
				return await importPromise
			},
			openReview: () => calls.push('review'),
		})

		expect(calls).toEqual(['import'])
		resolveImport(true)
		await expect(result).resolves.toBe(true)
		expect(calls).toEqual(['import', 'review'])
	})

	it('keeps the lightbox open when OCR does not produce a review modal', async () => {
		const calls: string[] = []

		const result = await runAttachmentLightboxOcr({
			attachment: buildAttachment(),
			importAttachmentOcrFromAttachment: async () => {
				calls.push('import')
				return false
			},
			openReview: () => calls.push('review'),
		})

		expect(result).toBe(false)
		expect(calls).toEqual(['import'])
	})

	it('restores the source lightbox when closing a fullscreen OCR review', () => {
		const calls: string[] = []

		closeAttachmentLightboxOcrReview({
			dismissAttachmentOcr: () => calls.push('dismiss'),
			restoreLightbox: () => calls.push('restore'),
		})

		expect(calls).toEqual(['dismiss', 'restore'])
	})

	it('does not restore a lightbox for normal OCR import review', () => {
		const calls: string[] = []

		closeAttachmentLightboxOcrReview({
			dismissAttachmentOcr: () => calls.push('dismiss'),
		})

		expect(calls).toEqual(['dismiss'])
	})
})

function buildAttachment(): PositionAttachment {
	return {
		extension: 'png',
		fileSizeBytes: 3,
		id: 'vault:shot',
		kind: 'vault',
		label: 'shot',
		path: 'LucrJournal/attachments/shot.png',
		referenceKey: 'vault:LucrJournal/attachments/shot.png',
		src: 'app://shot.png',
		token: '[[LucrJournal/attachments/shot.png|shot]]',
	}
}
