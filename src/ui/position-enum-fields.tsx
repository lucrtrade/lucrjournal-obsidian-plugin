import type { POSITION_CONFIDENCE_OPTIONS } from '../domains'

function ConfidenceRing({ value, active }: { value: number; active?: boolean }) {
	const radius = 6
	const circumference = 2 * Math.PI * radius
	const strokeDashoffset = circumference - (value / 5) * circumference

	return (
		<div className="lj:flex lj:items-center lj:gap-2">
			<svg width="16" height="16" className="lj:-rotate-90">
				<circle cx="8" cy="8" r={radius} stroke="currentColor" strokeWidth="2" fill="transparent" className={active ? 'lj:text-lj-alpha-15' : 'lj:text-lj-alpha-10'} />
				<circle cx="8" cy="8" r={radius} stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className={active ? 'lj:text-lj-c-strong' : 'lj:text-lj-c-muted-vivid'} />
			</svg>
			<span className={active ? 'lj:text-sm lj:font-semibold lj:text-lj-c-strong' : 'lj:text-sm lj:font-medium lj:text-lj-c-strong'}>
				{value}
			</span>
		</div>
	)
}

export function renderPositionConfidenceContent(confidence: typeof POSITION_CONFIDENCE_OPTIONS[number] | null | undefined) {
	return confidence == null ? '-' : <ConfidenceRing value={confidence} />
}
