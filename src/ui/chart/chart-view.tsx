import { LUCRCHART_IFRAME_URL } from '../../constant'
import { t } from '../../lang/helpers'

import type { RefObject } from 'react'

type ChartViewProps = {
	iframeRef: RefObject<HTMLIFrameElement | null>
	heightClassName?: string
	isReady: boolean
}

export function ChartView({
	iframeRef,
	heightClassName = 'lj:h-64',
	isReady,
}: ChartViewProps) {
	return (
		<div data-lj-panel="chart-view" className={`lj:flex lj:flex-col lj:bg-lj-surf lj:border lj:border-lj-alpha-10 lj:rounded-md lj:overflow-hidden lj:shadow-sm ${heightClassName}`}>
			<div className="lj:w-full lj:min-h-0 lj:flex-1">
				<iframe
					ref={iframeRef}
					src={LUCRCHART_IFRAME_URL}
					data-lj-control="chart-iframe"
					data-lj-ready={isReady ? 'true' : 'false'}
					className="lj:w-full lj:h-full lj:border-0"
					allow="autoplay"
					title={t('POSITION_DETAILS_CHART_IFRAME_TITLE')}
				/>
			</div>
		</div>
	)
}
