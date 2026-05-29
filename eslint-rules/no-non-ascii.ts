import type { Rule } from 'eslint'

const NON_ASCII_PATTERN = /[^\x00-\x7F]/gu
const NON_ASCII_TEXT_CHAR_PATTERN = /[\p{Letter}\p{Number}\p{Mark}]/u

function formatCodePoint(value: string): string {
	return `U+${value.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0') ?? '0000'}`
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow non-ASCII letters and numbers outside i18n source files',
		},
		schema: [],
		messages: {
			nonAscii: 'Non-ASCII text {{char}} ({{codePoint}}) is not allowed outside i18n files.',
		},
	},
	create(context) {
		return {
				Program(node) {
					const source = context.sourceCode.text

					for (const match of source.matchAll(NON_ASCII_PATTERN)) {
						const character = match[0]
						const index = match.index
						if (index === undefined) {
							continue
						}
						if (!NON_ASCII_TEXT_CHAR_PATTERN.test(character)) {
							continue
						}

						const loc = context.sourceCode.getLocFromIndex(index)
					context.report({
						node,
						loc: {
							start: loc,
							end: {
								line: loc.line,
								column: loc.column + character.length,
							},
						},
						messageId: 'nonAscii',
						data: {
							char: JSON.stringify(character),
							codePoint: formatCodePoint(character),
						},
					})
				}
			},
		}
	},
}

export default rule
