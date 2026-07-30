/// <reference types="vitest/importMeta" />

// @story [[lucrjournal/domain-model#^position-uuid-identity]] Generates the stable persisted identity used by position payloads
export function createUuidV7() {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)

	const timestamp = Date.now()
	bytes[0] = Math.floor(timestamp / 0x10000000000) & 0xff
	bytes[1] = Math.floor(timestamp / 0x100000000) & 0xff
	bytes[2] = Math.floor(timestamp / 0x1000000) & 0xff
	bytes[3] = Math.floor(timestamp / 0x10000) & 0xff
	bytes[4] = Math.floor(timestamp / 0x100) & 0xff
	bytes[5] = timestamp & 0xff
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

	const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('createUuidV7', () => {
		// @story [[lucrjournal/domain-model#^position-uuid-identity]] Covers UUID version and variant bits in the persisted string
		it('generates uuid v7 strings', () => {
			expect(createUuidV7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
		})
	})
}
