type DashboardAnalysisSubTabMeta = {
	label: string
	icon: string
}

type AnalysisSubTabTriggerContent = {
	icon: string
	label: string
}

export function buildAnalysisSubTabTriggerContent(subTab: DashboardAnalysisSubTabMeta) {
	return {
		icon: subTab.icon,
		label: subTab.label,
	} satisfies AnalysisSubTabTriggerContent
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('buildAnalysisSubTabTriggerContent', () => {
		it('includes the lucide icon metadata for analysis sub tabs', () => {
			const content = buildAnalysisSubTabTriggerContent({
				label: 'Key Levels',
				icon: 'crosshair',
			})

			expect(content).toMatchObject({
				label: 'Key Levels',
				icon: 'crosshair',
			})
		})
	})
}
