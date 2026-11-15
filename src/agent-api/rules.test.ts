import { describe, expect, it } from 'vitest'

import skill from '../../skills/lucrjournal/SKILL.md?raw'

import { describeAgentApi } from './describe'
import { AGENT_RULES, buildVaultAgentInstructions } from './rules'

function skillRules(): string[] {
	const section = /^## Rules\n([\s\S]*?)^## /mu.exec(skill)?.[1] ?? ''
	return [...section.matchAll(/^\d+\. \*\*(.+?)\*\*/gmu)].map((match) => match[1] ?? '')
}

describe('agent rules', () => {
	it('opens every numbered rule of the skill with the same sentence, in the same order', () => {
		expect(skillRules()).toEqual(AGENT_RULES.map(({ rule }) => rule))
	})

	it('serves every rule from describe()', () => {
		const served = describeAgentApi(2).data.rules
		expect(served).toHaveLength(AGENT_RULES.length)
		AGENT_RULES.forEach(({ rule }, index) => {
			expect(served[index]?.startsWith(`${rule} `)).toBe(true)
		})
	})

	it('routes vault agents to the skill by its installed name and repeats the file rule', () => {
		const name = /^name: (\S+)$/mu.exec(skill)?.[1]
		const block = buildVaultAgentInstructions()
		expect(block).toContain(`load the \`${name}\` skill`)
		expect(block).toContain(AGENT_RULES[0]?.rule ?? 'the first rule')
		expect(block.startsWith('<!-- lucrjournal:start -->\n')).toBe(true)
		expect(block.endsWith('\n<!-- lucrjournal:end -->')).toBe(true)
	})
})
