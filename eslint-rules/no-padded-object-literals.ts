import type { Rule } from 'eslint'

function resolveLineBreak(source: string): '\n' | '\r\n' {
	return source.includes('\r\n') ? '\r\n' : '\n'
}

function hasInterleavedComment(source: string): boolean {
	return source.includes('//') || source.includes('/*')
}

// @story [[lucrjournal/tooling#^no-padded-object-literals]] Removes uncommented blank lines between object properties
function reportPaddedProperties(context: Rule.RuleContext, properties: Rule.Node[]): void {
	const sourceCode = context.sourceCode

	for (let index = 0; index < properties.length - 1; index += 1) {
		const current = properties[index]
		const next = properties[index + 1]

		if (current.loc == null || next.loc == null || next.loc.start.line - current.loc.end.line <= 1) {
			continue
		}

		const delimiterToken = sourceCode.getTokenAfter(current)
		const gapStart = delimiterToken?.value === ',' ? delimiterToken.range[1] : current.range[1]
		const gapText = sourceCode.text.slice(gapStart, next.range[0])

		if (hasInterleavedComment(gapText)) {
			continue
		}

		const lineBreak = resolveLineBreak(gapText)
		const indent = ' '.repeat(next.loc.start.column)

		context.report({
			node: next,
			message: 'Unexpected blank line between object properties.',
			fix(fixer) {
				return fixer.replaceTextRange([gapStart, next.range[0]], `${lineBreak}${indent}`)
			},
		})
	}
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'layout',
		docs: {
			description: 'Disallow blank lines between object literal properties',
		},
		fixable: 'whitespace',
		schema: [],
	},
	create(context) {
		return {
			ObjectExpression(node) {
				reportPaddedProperties(context, node.properties as Rule.Node[])
			},
			ObjectPattern(node) {
				reportPaddedProperties(context, node.properties as Rule.Node[])
			},
		}
	},
}

export default rule
