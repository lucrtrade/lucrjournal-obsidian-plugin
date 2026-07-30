import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { IconView } from './icon-view'
import { SymbolIcon } from './symbol-icon'

import type { IconDescriptor } from '../../domains'

const TEST_SYMBOL_LOGO_URL = 'https://example.com/btc.svg'

vi.mock('./obsidian-icon', () => ({
	ObsidianIcon({ name }: { name: string }) {
		return <i data-icon={name} />
	},
}))

vi.mock('../../icon/symbol-icons', () => ({
	getTradingViewSymbolLogoUrl(logo: string | null | undefined) {
		return logo ?? null
	},
	loadCachedSymbolLogoSrc(logo: string | null | undefined) {
		return Promise.resolve(logo == null ? null : 'data:image/svg+xml;base64,PHN2Zy8+')
	},
	readCachedSymbolLogoSrc(logo: string | null | undefined) {
		return logo == null ? null : 'data:image/svg+xml;base64,PHN2Zy8+'
	},
}))

describe('IconView platform fallback', () => {
	it('renders a generic platform icon when the platform asset is missing', () => {
		// @story [[lucrjournal/primitives#^icon-asset-fallback]] Covers the generic platform fallback
		const icon = { kind: 'platform', value: 'Missing Platform' } satisfies IconDescriptor

		expect(renderToStaticMarkup(<IconView icon={icon} />)).toContain('data-icon="landmark"')
	})

	it('renders a generic image icon when the image asset is missing', () => {
		// @story [[lucrjournal/primitives#^icon-asset-fallback]] Covers the generic image fallback
		const icon = { kind: 'image', value: 'Missing Asset' } satisfies IconDescriptor

		expect(renderToStaticMarkup(<IconView icon={icon} />)).toContain('data-icon="image"')
	})
})

describe('image icon shape', () => {
	it('renders IconView image-backed icons as circles', () => {
		// @story [[lucrjournal/primitives#^image-icon-shape]] Covers URL platform and named image shape
		const icons = [
			{ kind: 'url', value: 'https://example.com/favicon.png' },
			{ kind: 'platform', value: 'Binance' },
			{ kind: 'image', value: 'Binance' },
		] satisfies IconDescriptor[]

		for (const icon of icons) {
			const markup = renderToStaticMarkup(<IconView icon={icon} />)

			expect(markup).toContain('lj:rounded-full')
			expect(markup).toContain('lj:object-cover')
		}
	})

	it('renders SymbolIcon image as a circle', () => {
		// @story [[lucrjournal/primitives#^image-icon-shape]] Covers loaded symbol image shape
		const markup = renderToStaticMarkup(<SymbolIcon logo={TEST_SYMBOL_LOGO_URL} />)

		expect(markup).toContain('lj:rounded-full')
		expect(markup).toContain('lj:object-cover')
	})
})
