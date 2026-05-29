export const SELECT_OPTION_COLOR_VARS = {
	alpha5: '--lj-alpha-5',
	alpha510: '--lj-alpha-5-10',
	alpha68: '--lj-alpha-6-8',
	alpha10: '--lj-alpha-10',
	cStrong: '--lj-c-strong',
	cStrongDim: '--lj-c-strong-dim',
	cSecondary: '--lj-c-secondary',
	cMuted: '--lj-c-muted',
	cInv: '--lj-c-inv',
	cDanger: '--lj-c-danger',
	cWarning: '--lj-c-warning',
	cSuccess: '--lj-c-success',
	fillContrast: '--lj-fill-contrast',
	surfDangerSoft: '--lj-surf-danger-soft',
	surfWarningSoft: '--lj-surf-warning-soft',
	surfSuccessSoft: '--lj-surf-success-soft',
} as const

export type UiColorVar = typeof SELECT_OPTION_COLOR_VARS[keyof typeof SELECT_OPTION_COLOR_VARS]
