import type { Rule } from 'eslint'

type BinaryExpressionNode = Rule.Node & {
	type: 'BinaryExpression'
	left: Rule.Node
	operator: string
	right: Rule.Node
}

type CallExpressionNode = Rule.Node & {
	type: 'CallExpression'
	callee: Rule.Node
	arguments: Rule.Node[]
}

type ArrayExpressionNode = Rule.Node & {
	type: 'ArrayExpression'
	elements: Array<Rule.Node | null>
}

type IdentifierNode = Rule.Node & {
	type: 'Identifier'
	name: string
}

type MemberExpressionNode = Rule.Node & {
	type: 'MemberExpression' | 'OptionalMemberExpression'
	object: Rule.Node
	property: Rule.Node
	computed: boolean
}

type PropertyNode = Rule.Node & {
	type: 'Property'
	key: Rule.Node
	computed: boolean
}

type SwitchCaseNode = Rule.Node & {
	type: 'SwitchCase'
	test: Rule.Node | null
}

type VariableDeclaratorNode = Rule.Node & {
	type: 'VariableDeclarator'
	id: Rule.Node
	init: Rule.Node | null
}

// @story [[lucrjournal/tooling#^no-symbol-type-branching]] Defines forbidden symbol type branch literals outside the model
const SYMBOL_TYPE_VALUES = new Set(['Crypto_Perp', 'Crypto_Spot', 'Future', 'CFD', 'crypto_perp', 'crypto_spot', 'future', 'cfd'])
const SYMBOL_TYPE_MODEL_PATH = 'src/domains/symbol/position-model.ts'

function unwrapExpression(node: Rule.Node | null | undefined): Rule.Node | null {
	if (
		node?.type === 'TSAsExpression'
		|| node?.type === 'TSSatisfiesExpression'
		|| node?.type === 'TSNonNullExpression'
		|| node?.type === 'TSInstantiationExpression'
	) {
		return unwrapExpression(node.expression)
	}

	return node ?? null
}

function isSymbolTypeLiteral(node: Rule.Node | null | undefined): boolean {
	const unwrappedNode = unwrapExpression(node)
	if (unwrappedNode?.type === 'Literal') {
		return typeof unwrappedNode?.value === 'string' && SYMBOL_TYPE_VALUES.has(unwrappedNode.value)
	}

	if (unwrappedNode?.type === 'TemplateLiteral' && unwrappedNode.expressions.length === 0) {
		const [quasi] = unwrappedNode.quasis
		return quasi !== undefined && SYMBOL_TYPE_VALUES.has(quasi.value.cooked ?? '')
	}

	return false
}

function isSymbolTypeValue(node: Rule.Node | null | undefined, aliases: ReadonlySet<string>): boolean {
	const unwrappedNode = unwrapExpression(node)
	if (isSymbolTypeLiteral(unwrappedNode)) {
		return true
	}

	return unwrappedNode?.type === 'Identifier' && aliases.has(unwrappedNode.name)
}

function isIncludesCall(node: CallExpressionNode): boolean {
	if (node.callee.type !== 'MemberExpression' && node.callee.type !== 'OptionalMemberExpression') {
		return false
	}

	const callee = node.callee as MemberExpressionNode
	return callee.property.type === 'Identifier' && callee.property.name === 'includes'
}

function hasSymbolTypeArrayElement(node: Rule.Node, aliases: ReadonlySet<string>): boolean {
	if (node.type !== 'ArrayExpression') {
		return false
	}

	return (node as ArrayExpressionNode).elements.some((element) => isSymbolTypeValue(element, aliases))
}

function isIdentifier(node: Rule.Node): node is IdentifierNode {
	return node.type === 'Identifier'
}

function isAllowedFile(filename: string): boolean {
	return filename.endsWith(SYMBOL_TYPE_MODEL_PATH)
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow direct branching on symbol type literals outside the symbol type model',
		},
		schema: [],
		messages: {
			noBranch: '不要直接按 symbol type literal 分支；把 Crypto_Perp/Crypto_Spot/Future/CFD 差异放进 BasePositionSymbol 的子类方法。',
		},
	},
	create(context) {
		if (isAllowedFile(context.filename)) {
			return {}
		}

		const symbolTypeAliases = new Set<string>()

		return {
			BinaryExpression(node) {
				const binary = node as BinaryExpressionNode
				if (!['==', '===', '!=', '!=='].includes(binary.operator)) {
					return
				}

				if (!isSymbolTypeValue(binary.left, symbolTypeAliases) && !isSymbolTypeValue(binary.right, symbolTypeAliases)) {
					return
				}

				context.report({ node, messageId: 'noBranch' })
			},
			CallExpression(node) {
				const call = node as CallExpressionNode
				if (
					!isIncludesCall(call)
					|| (
						!call.arguments.some((argument) => isSymbolTypeValue(argument, symbolTypeAliases))
						&& (
							call.callee.type !== 'MemberExpression'
							|| !hasSymbolTypeArrayElement((call.callee as MemberExpressionNode).object, symbolTypeAliases)
						)
					)
				) {
					return
				}

				context.report({ node, messageId: 'noBranch' })
			},
			MemberExpression(node) {
				const member = node as MemberExpressionNode
				if (!member.computed || !isSymbolTypeValue(member.property, symbolTypeAliases)) {
					return
				}

				context.report({ node, messageId: 'noBranch' })
			},
			OptionalMemberExpression(node) {
				const member = node as MemberExpressionNode
				if (!member.computed || !isSymbolTypeValue(member.property, symbolTypeAliases)) {
					return
				}

				context.report({ node, messageId: 'noBranch' })
			},
			Property(node) {
				const property = node as PropertyNode
				if (!isSymbolTypeValue(property.key, symbolTypeAliases)) {
					return
				}

				context.report({ node, messageId: 'noBranch' })
			},
			SwitchCase(node) {
				const switchCase = node as SwitchCaseNode
				if (!isSymbolTypeValue(switchCase.test, symbolTypeAliases)) {
					return
				}

				context.report({ node, messageId: 'noBranch' })
			},
			VariableDeclarator(node) {
				const declarator = node as VariableDeclaratorNode
				if (!isIdentifier(declarator.id) || !isSymbolTypeLiteral(declarator.init)) {
					return
				}

				symbolTypeAliases.add(declarator.id.name)
			},
		}
	},
}

export default rule
