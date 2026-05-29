import { SELECT_OPTION_COLOR_VARS } from '../core/ui'

import type { SelectOption } from '../core/form'

export function getSymbolTypeOptions(): SelectOption[] {
	return [
		{
			value: 'Crypto_Perp',
			label: 'Crypto Perpetual',
			labelKey: 'SYMBOL_TYPE_CRYPTO_PERP',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.surfSuccessSoft,
				text: SELECT_OPTION_COLOR_VARS.cSuccess,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
		{
			value: 'Crypto_Spot',
			label: 'Crypto Spot',
			labelKey: 'SYMBOL_TYPE_CRYPTO_SPOT',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.alpha5,
				text: SELECT_OPTION_COLOR_VARS.cMuted,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
		{
			value: 'Future',
			label: 'Future',
			labelKey: 'SYMBOL_TYPE_FUTURE',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.surfDangerSoft,
				text: SELECT_OPTION_COLOR_VARS.cDanger,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
		{
			value: 'CFD',
			label: 'CFD',
			labelKey: 'SYMBOL_TYPE_CFD',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.surfWarningSoft,
				text: SELECT_OPTION_COLOR_VARS.cWarning,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
		{
			value: '',
			label: 'Clear',
			labelKey: 'SYMBOL_TYPE_CLEAR',
			tone: {
				background: SELECT_OPTION_COLOR_VARS.alpha5,
				text: SELECT_OPTION_COLOR_VARS.cMuted,
				border: SELECT_OPTION_COLOR_VARS.alpha10,
			},
		},
	]
}
