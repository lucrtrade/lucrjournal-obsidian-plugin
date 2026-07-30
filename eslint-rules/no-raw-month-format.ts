import type { Rule } from 'eslint'

function isIdentifierKey(node: unknown, name: string): boolean {
	return (
		typeof node === 'object'
		&& node !== null
		&& 'type' in node
		&& node.type === 'Identifier'
		&& 'name' in node
		&& node.name === name
	)
}

// @story [[lucrjournal/tooling#^no-raw-month-format]] Detects direct textual month formatting in configured UI source trees
function hasMonthTextStyleOption(node: Rule.Node | null | undefined): boolean {
	if (
		node == null
		|| node.type !== 'ObjectExpression'
	) {
		return false
	}

	return node.properties.some((property) => {
		if (
			property.type !== 'Property'
			|| property.computed
			|| !isIdentifierKey(property.key, 'month')
			|| property.value.type !== 'Literal'
		) {
			return false
		}

		return property.value.value === 'short' || property.value.value === 'long' || property.value.value === 'narrow'
	})
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow raw month label formatting in UI code',
		},
		schema: [],
		messages: {
			noRawMonthFormat: 'User-facing month labels must go through shared i18n helpers instead of raw Intl APIs.',
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				if (
					node.callee.type !== 'MemberExpression'
					|| node.callee.property.type !== 'Identifier'
				) {
					return
				}

				const methodName = node.callee.property.name
				if (methodName !== 'toLocaleDateString' && methodName !== 'toLocaleString') {
					return
				}

				if (!hasMonthTextStyleOption(node.arguments[1] as Rule.Node | undefined)) {
					return
				}

				context.report({
					node,
					messageId: 'noRawMonthFormat',
				})
			},
			NewExpression(node) {
				if (
					node.callee.type !== 'MemberExpression'
					|| node.callee.object.type !== 'Identifier'
					|| node.callee.object.name !== 'Intl'
					|| node.callee.property.type !== 'Identifier'
					|| node.callee.property.name !== 'DateTimeFormat'
				) {
					return
				}

				if (!hasMonthTextStyleOption(node.arguments[1] as Rule.Node | undefined)) {
					return
				}

				context.report({
					node,
					messageId: 'noRawMonthFormat',
				})
			},
		}
	},
}

export default rule
