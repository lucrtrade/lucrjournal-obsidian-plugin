import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { setCurrentLocaleSetting } from '../../lang/helpers'

import { ChartView } from './chart-view'

describe('ChartView', () => {
	// @story [[lucrjournal/chart#^host-owns-iframe-src]] Covers host ownership of iframe navigation.
	it('leaves iframe src to LucrChart host', () => {
		setCurrentLocaleSetting('en')

		const html = renderToStaticMarkup(
			<ChartView iframeRef={{ current: null }} isReady={false} />,
		)

		expect(html).toContain('data-lj-control="chart-iframe"')
		expect(html).not.toContain('src=')
	})
})
