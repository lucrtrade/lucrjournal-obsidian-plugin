import type { Rule } from 'eslint'

type SwitchCaseNode = Rule.Node & {
	type: 'SwitchCase'
	test: Rule.Node | null
	consequent: Rule.Node[]
}

type SwitchStatementNode = Rule.Node & {
	type: 'SwitchStatement'
	discriminant: Rule.Node
	cases: SwitchCaseNode[]
}

// @story [[lucrjournal/tooling#^switch-default-contract]] Defines discriminants requiring a never and throwing default contract
const EXHAUSTIVE_IDENTIFIER_NAMES = new Set([
	'kind',
	'linkStatus',
	'performance',
	'status',
	'tabId',
	'tone',
	'type',
])

const EXHAUSTIVE_MEMBER_PROPERTIES = new Set([
	'display',
	'kind',
	'status',
	'tabId',
	'tone',
	'type',
])

function getMemberPropertyName(node: Rule.Node): string | null {
	if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') {
		return null
	}

	if (node.property.type === 'Identifier' && node.computed === false) {
		return node.property.name
	}

	return null
}

function isExhaustiveDiscriminant(node: Rule.Node): boolean {
	if (node.type === 'Identifier') {
		return EXHAUSTIVE_IDENTIFIER_NAMES.has(node.name)
	}

	const propertyName = getMemberPropertyName(node)
	return propertyName !== null && EXHAUSTIVE_MEMBER_PROPERTIES.has(propertyName)
}

function readAllowedNeverTargets(node: Rule.Node, sourceCode: Rule.SourceCode): string[] {
	const targets = [sourceCode.getText(node)]

	if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
		targets.push(sourceCode.getText(node.object))
	}

	return targets
}

function hasNeverSatisfiesStatement(caseNode: SwitchCaseNode, targets: string[], sourceCode: Rule.SourceCode): boolean {
	return caseNode.consequent.some((statement) => {
		if (statement.type !== 'ExpressionStatement') {
			return false
		}

		const statementText = sourceCode.getText(statement)
		return targets.some((target) => statementText.includes(`${target} satisfies never`))
	})
}

function hasThrowStatement(caseNode: SwitchCaseNode): boolean {
	return caseNode.consequent.some((statement) => statement.type === 'ThrowStatement')
}

function hasFormattedUnknownError(caseNode: SwitchCaseNode): boolean {
	return caseNode.consequent.some((statement) => {
		if (statement.type !== 'ThrowStatement') {
			return false
		}

		const argument = statement.argument
		if (argument.type !== 'NewExpression' || argument.callee.type !== 'Identifier' || argument.callee.name !== 'Error') {
			return false
		}

		const [firstArgument] = argument.arguments ?? []
		if (firstArgument == null || firstArgument.type !== 'Literal' || typeof firstArgument.value !== 'string') {
			return false
		}

		return /^Unknown [A-Za-z0-9 -]+$/.test(firstArgument.value)
	})
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Enforce default cases for switch statements and exhaustive default contracts for discriminant switches',
		},
		schema: [],
		messages: {
			missingDefault: 'Switch statements must handle a default branch.',
			missingExhaustiveDefault: 'Exhaustive discriminant switches must end with `default: {{discriminant}} satisfies never; throw new Error(\'Unknown ...\')`.',
		},
	},
	create(context) {
		const sourceCode = context.sourceCode

		return {
			SwitchStatement(node) {
				const switchNode = node as SwitchStatementNode
				const defaultCase = switchNode.cases.find((switchCase) => switchCase.test === null)

				if (defaultCase == null) {
					context.report({
						node: switchNode,
						messageId: 'missingDefault',
					})
					return
				}

				if (!isExhaustiveDiscriminant(switchNode.discriminant)) {
					return
				}

				const discriminantText = sourceCode.getText(switchNode.discriminant)
				const neverTargets = readAllowedNeverTargets(switchNode.discriminant, sourceCode)
				if (
					hasNeverSatisfiesStatement(defaultCase, neverTargets, sourceCode)
					&& hasThrowStatement(defaultCase)
					&& hasFormattedUnknownError(defaultCase)
				) {
					return
				}

				context.report({
					node: defaultCase,
					messageId: 'missingExhaustiveDefault',
					data: {
						discriminant: discriminantText,
					},
				})
			},
		}
	},
}

export default rule
