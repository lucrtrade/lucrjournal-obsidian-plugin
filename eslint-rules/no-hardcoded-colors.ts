/**
 * ESLint rule: no-hardcoded-colors
 *
 * Disallows hardcoded Tailwind CSS color utilities (named palette, white/black,
 * arbitrary hex/rgb) inside `lj:` prefixed class names.
 * All colors must go through lj-* design tokens defined in main.pcss @theme.
 */
import type { Rule } from 'eslint';

const UTIL =
	'(?:text|bg|border|ring|fill|stroke|outline|shadow|accent|caret|decoration|divide|placeholder|from|via|to)';
const PALETTE =
	'(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';

const patterns: RegExp[] = [
	// Named palette: lj:text-gray-500, lj:dark:hover:bg-red-100/50
	new RegExp(`\\blj:(?:[\\w-]+:)*${UTIL}-${PALETTE}-\\d+(?:/\\d+)?`, 'g'),
	// white/black (with optional opacity): lj:text-white, lj:dark:bg-black/50
	new RegExp(`\\blj:(?:[\\w-]+:)*${UTIL}-(?:white|black)(?:/\\d+)?\\b`, 'g'),
	// Arbitrary color values: lj:bg-[#0a0a0a], lj:text-[rgb(...)], but NOT var(--)
	new RegExp(
		`\\blj:(?:[\\w-]+:)*${UTIL}-\\[(?:#|rgb|rgba|hsl|hsla)[^\\]]*\\]`,
		'g',
	),
];

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow hardcoded Tailwind colors — use lj-* design tokens instead',
		},
		messages: {
			noHardcodedColor:
				'Hardcoded color "{{cls}}" — use an lj-* design token instead.',
		},
		schema: [],
	},
	create(context) {
		function check(node: Rule.Node, value: string) {
			for (const pattern of patterns) {
				pattern.lastIndex = 0;
				let match;
				while ((match = pattern.exec(value)) !== null) {
					context.report({
						node,
						messageId: 'noHardcodedColor',
						data: { cls: match[0] },
					});
				}
			}
		}

		return {
			Literal(node) {
				if (typeof node.value === 'string') {
					check(node, node.value);
				}
			},
			TemplateLiteral(node) {
				for (const quasi of node.quasis) {
					check(quasi as unknown as Rule.Node, quasi.value.raw);
				}
			},
		};
	},
};

export default rule;
