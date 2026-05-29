import { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react', async (importOriginal) => {
	const actual = await importOriginal<object>()

	return {
		...actual,
		useEffect() {},
		useRef<T>(value: T) {
			return { current: value }
		},
		useState<T>(value: T): [T, (next: T) => void] {
			return [value, () => {}]
		},
	}
})

vi.mock('../../domains', () => ({
	AccountDomain: {
		resolveDisplayIcon: () => ({ kind: 'lucide', value: 'wallet' }),
		resolveIcon: () => ({ kind: 'lucide', value: 'wallet' }),
		toDisplayName: () => 'Main',
		totalEntries: () => [],
	},
	derivePositionAccountWikilink: () => '[[ACC-Main]]',
	resolveSymbolLogo: () => null,
	resolveSymbolName: () => 'ES',
	SymbolDomain: {
		resolveEntry: () => ({ fm: { type: 'Future' } }),
		typeOptions: () => [{
			value: 'Future',
			label: 'Future',
			labelKey: 'SYMBOL_TYPE_FUTURE',
			tone: {
				background: '--lj-surf-danger-soft',
				border: '--lj-alpha-10',
				text: '--lj-c-danger',
			},
		}],
	},
}))

import { EnumBadge } from '../fields/renderers/enum-badge'

import { PositionDetailsHeader } from './position-details-header'

import type { Position } from '../../domains'
import type { ReactElement, ReactNode } from 'react'

describe('PositionDetailsHeader', () => {
	it('renders the linked symbol type next to the position side', () => {
		const tree = PositionDetailsHeader({
			app: {} as never,
			positionFile: null,
			position: {
				lucr_type: 'position',
				side: 'LONG',
				symbol: '[[SBL-Main-ES]]',
			} as Position,
			onBack: () => {},
			onDeletePosition: () => {},
		})

		const badge = findElementByType(tree, EnumBadge)

		expect(badge?.props.option?.value).toBe('Future')
		expect(badge?.props.variant).toBe('side')
	})
})

function findElementByType(node: ReactNode, type: unknown): ReactElement<{ option?: { value?: string }; variant?: string; children?: ReactNode }> | null {
	if (node == null || typeof node === 'boolean') {
		return null
	}
	if (typeof node === 'string' || typeof node === 'number') {
		return null
	}
	if (Array.isArray(node)) {
		for (const child of node as ReactNode[]) {
			const result = findElementByType(child, type)
			if (result !== null) {
				return result
			}
		}
		return null
	}
	if (!isValidElement<{ children?: ReactNode }>(node)) {
		return null
	}
	if (node.type === type) {
		return node as ReactElement<{ option?: { value?: string }; variant?: string; children?: ReactNode }>
	}
	return findElementByType(node.props.children, type)
}
