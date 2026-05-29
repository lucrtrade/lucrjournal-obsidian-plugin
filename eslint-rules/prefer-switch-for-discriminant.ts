import type { Rule } from 'eslint'

type BinaryExpressionNode = Rule.Node & {
	type: 'BinaryExpression'
	left: Rule.Node
	operator: string
	right: Rule.Node
}

type IfStatementNode = Rule.Node & {
	type: 'IfStatement'
	test: Rule.Node
	consequent: Rule.Node
	alternate?: Rule.Node | null
	parent?: Rule.Node
}

function isIfStatement(node: Rule.Node | null | undefined): node is IfStatementNode {
	return node?.type === 'IfStatement'
}

function isSupportedLiteral(node: Rule.Node): boolean {
	if (node.type === 'Literal') {
		return true
	}

	if (node.type === 'TemplateLiteral') {
		return node.expressions.length === 0
	}

	return false
}

function extractDiscriminant(test: Rule.Node, sourceCode: Rule.SourceCode): string | null {
	if (test.type !== 'BinaryExpression') {
		return null
	}

	const expression = test as BinaryExpressionNode
	if (expression.operator !== '===' && expression.operator !== '==') {
		return null
	}

	if (isSupportedLiteral(expression.left) && !isSupportedLiteral(expression.right)) {
		return sourceCode.getText(expression.right)
	}

	if (isSupportedLiteral(expression.right) && !isSupportedLiteral(expression.left)) {
		return sourceCode.getText(expression.left)
	}

	return null
}

function collectChain(head: IfStatementNode): IfStatementNode[] {
	const chain = [head]
	let currentAlternate = head.alternate

	while (isIfStatement(currentAlternate)) {
		chain.push(currentAlternate)
		currentAlternate = currentAlternate.alternate
	}

	return chain
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: {
			description: 'Prefer switch statements for repeated discriminant equality chains',
		},
		schema: [],
		messages: {
			preferSwitch: 'Repeated equality checks on "{{discriminant}}" are better expressed as a switch for clearer exhaustive handling.',
		},
	},
	create(context) {
		const sourceCode = context.sourceCode

		return {
			IfStatement(node) {
				const ifNode = node as IfStatementNode
				const parentIf = isIfStatement(ifNode.parent) ? ifNode.parent : null
				if (parentIf?.alternate === ifNode) {
					return
				}

				const chain = collectChain(ifNode)
				if (chain.length < 2) {
					return
				}

				const discriminants = chain
					.map((branch) => extractDiscriminant(branch.test, sourceCode))
					.filter((value): value is string => value !== null)

				if (discriminants.length !== chain.length) {
					return
				}

				const [firstDiscriminant] = discriminants
				if (firstDiscriminant == null || discriminants.some((discriminant) => discriminant !== firstDiscriminant)) {
					return
				}

				context.report({
					node: ifNode,
					messageId: 'preferSwitch',
					data: {
						discriminant: firstDiscriminant,
					},
				})
			},
		}
	},
}

export default rule
