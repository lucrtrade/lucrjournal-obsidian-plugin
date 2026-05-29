import type { Rule } from 'eslint'

type BinaryExpressionNode = Rule.Node & {
	type: 'BinaryExpression'
	left: Rule.Node
	operator: string
	right: Rule.Node
}

type MemberExpressionNode = Rule.Node & {
	type: 'MemberExpression'
	computed: boolean
	property: Rule.Node
}

function isStringLiteralNode(node: Rule.Node): node is Rule.Node & { type: 'Literal'; value: string } {
	return node.type === 'Literal' && typeof ('value' in node ? node.value : undefined) === 'string'
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow runtime property-name access with string literals',
		},
		schema: [],
		messages: {
			noStringIn: 'Do not use string-literal property checks with `in`. Prefer an explicit type contract or typed type guard.',
			noComputedStringAccess: 'Do not use string-literal computed property access. Prefer a typed property access or explicit type contract.',
		},
	},
	create(context) {
		return {
			BinaryExpression(node) {
				const expression = node as BinaryExpressionNode
				if (expression.operator !== 'in') {
					return
				}

				if (isStringLiteralNode(expression.left)) {
					context.report({
						node,
						messageId: 'noStringIn',
					})
				}
			},
			MemberExpression(node) {
				const expression = node as MemberExpressionNode
				if (!expression.computed) {
					return
				}

				if (isStringLiteralNode(expression.property)) {
					context.report({
						node,
						messageId: 'noComputedStringAccess',
					})
				}
			},
		}
	},
}

export default rule
