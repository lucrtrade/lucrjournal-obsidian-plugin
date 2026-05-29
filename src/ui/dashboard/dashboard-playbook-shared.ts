import { t } from '../../lang/helpers'
import { formatAmount } from '../../utils'

export function getPlaybookDisplayName(name: string) {
	const trimmedName = name.trim()
	return trimmedName === '' ? t('DASHBOARD_PLAYBOOK_UNTITLED') : trimmedName.replaceAll('_', ' ')
}

export function clampPercentage(value: number) {
	return Math.min(Math.max(value, 0), 100)
}

export function formatCurrency(value: number) {
	return formatAmount(value)
}
