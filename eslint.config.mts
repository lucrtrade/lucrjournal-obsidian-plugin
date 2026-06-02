import { createRequire } from 'node:module'
import { fixupPluginRules } from '@eslint/compat'
import stylistic from '@stylistic/eslint-plugin'
import { globalIgnores } from 'eslint/config'
import i18next from 'eslint-plugin-i18next'
import importX from 'eslint-plugin-import-x'
import obsidianmd from 'eslint-plugin-obsidianmd'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import noHardcodedColors from './eslint-rules/no-hardcoded-colors.ts'
import noDynamicPropertyAccess from './eslint-rules/no-dynamic-property-access.ts'
import noNonAscii from './eslint-rules/no-non-ascii.ts'
import noPaddedObjectLiterals from './eslint-rules/no-padded-object-literals.ts'
import noRawMonthFormat from './eslint-rules/no-raw-month-format.ts'
import noSymbolTypeBranching from './eslint-rules/no-symbol-type-branching.ts'
import preferSwitchForDiscriminant from './eslint-rules/prefer-switch-for-discriminant.ts'
import switchDefaultContract from './eslint-rules/switch-default-contract.ts'

const require = createRequire(import.meta.url)
const i18nextDefaults = require('eslint-plugin-i18next/lib/options/defaults')
const i18nextWordsExclude = i18nextDefaults.words.exclude.filter((pattern: string | RegExp) => pattern !== '[A-Z_-]+')
const obsidianmdRecommended = obsidianmd.configs.recommended.map((config) => {
	if (config.rules && Object.keys(config.rules).some((rule) => rule.startsWith('obsidianmd/')) && !config.files) {
		return { ...config, files: ['src/**/*.ts', 'src/**/*.tsx'] }
	}

	return config
})

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
	...obsidianmdRecommended,
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		plugins: {
			'@typescript-eslint': tseslint.plugin,
			'@stylistic': stylistic,
			'i18next': fixupPluginRules(i18next),
			'import-x': importX,
			'local': {
				rules: {
					'no-hardcoded-colors': noHardcodedColors,
					'no-dynamic-property-access': noDynamicPropertyAccess,
					'no-non-ascii': noNonAscii,
					'no-padded-object-literals': noPaddedObjectLiterals,
					'no-raw-month-format': noRawMonthFormat,
					'no-symbol-type-branching': noSymbolTypeBranching,
					'prefer-switch-for-discriminant': preferSwitchForDiscriminant,
					'switch-default-contract': switchDefaultContract,
				},
			},
		},
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'local/no-hardcoded-colors': 'error',
			'local/no-dynamic-property-access': 'error',
			'local/no-non-ascii': 'error',
			'local/no-padded-object-literals': 'error',
			'local/no-raw-month-format': 'off',
			'local/no-symbol-type-branching': 'error',
			'local/prefer-switch-for-discriminant': 'error',
			'local/switch-default-contract': 'error',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
				destructuredArrayIgnorePattern: '^_',
			}],
			'@typescript-eslint/consistent-type-imports': ['error', {
				prefer: 'type-imports',
				fixStyle: 'separate-type-imports',
			}],
			'@typescript-eslint/consistent-type-exports': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-redundant-type-constituents': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/no-unnecessary-type-parameters': 'off',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'error',
			'@typescript-eslint/no-unsafe-call': 'error',
			'@typescript-eslint/no-unsafe-member-access': 'error',
			'@typescript-eslint/no-unsafe-return': 'error',
			'@typescript-eslint/non-nullable-type-assertion-style': 'error',
			'@typescript-eslint/prefer-optional-chain': 'error',
			'@typescript-eslint/prefer-nullish-coalescing': ['error', {
				ignoreConditionalTests: false,
				ignoreMixedLogicalExpressions: false,
			}],
			'@typescript-eslint/prefer-reduce-type-parameter': 'error',
			'@typescript-eslint/related-getter-setter-pairs': 'error',
			'@typescript-eslint/return-await': ['error', 'always'],
			'@typescript-eslint/strict-boolean-expressions': ['error', {
				allowAny: false,
				allowNullableBoolean: false,
				allowNullableNumber: false,
				allowNullableObject: true,
				allowNullableString: true,
				allowNumber: true,
				allowString: true,
			}],
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
			'curly': ['error', 'all'],
			'complexity': ['error', 25],
			'eqeqeq': ['error', 'smart'],
			'import-x/order': ['error', {
				'newlines-between': 'always',
				alphabetize: {
					order: 'asc',
					caseInsensitive: true,
				},
				groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
				pathGroupsExcludedImportTypes: ['builtin'],
			}],
			'import/no-extraneous-dependencies': ['error', {
				packageDir: ['.', './node_modules/obsidian'],
				peerDependencies: true,
			}],
			'no-console': 'error',
			'object-shorthand': ['error', 'always'],
			'prefer-object-spread': 'error',
			'@stylistic/array-bracket-spacing': ['error', 'never'],
			'@stylistic/arrow-parens': ['error', 'always'],
			'@stylistic/block-spacing': ['error', 'always'],
			'@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
			'@stylistic/comma-dangle': ['error', 'always-multiline'],
			'@stylistic/eol-last': ['error', 'always'],
			'@stylistic/indent': ['error', 'tab'],
			'@stylistic/jsx-quotes': ['error', 'prefer-double'],
			'@stylistic/no-multiple-empty-lines': ['error', {
				max: 1,
				maxBOF: 0,
				maxEOF: 1,
			}],
			'@stylistic/object-curly-spacing': ['error', 'always'],
			'@stylistic/padded-blocks': ['error', 'never'],
			'@stylistic/quote-props': ['error', 'as-needed'],
			'@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
			'@stylistic/semi': ['error', 'never'],
			'@stylistic/space-before-blocks': ['error', 'always'],
			'@stylistic/space-infix-ops': 'error',
			'@stylistic/template-curly-spacing': ['error', 'never'],
			'i18next/no-literal-string': ['error', {
				...i18nextDefaults,
				mode: 'jsx-only',
				words: {
					...i18nextDefaults.words,
					exclude: i18nextWordsExclude,
				},
				'jsx-attributes': {
					...i18nextDefaults['jsx-attributes'],
					exclude: [...i18nextDefaults['jsx-attributes'].exclude, 'name', /^data-/],
				},
			}],
		},
	},
	{
		files: ['src/lang/**/*.ts', 'src/lang/**/*.tsx'],
		rules: {
			'local/no-non-ascii': 'off',
		},
	},
	{
		files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx', 'src/views/**/*.ts', 'src/views/**/*.tsx', 'src/editor/**/*.ts', 'src/editor/**/*.tsx'],
		rules: {
			'local/no-raw-month-format': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/strict-boolean-expressions': 'off',
		},
	},
	{
		files: ['src/ui/dashboard-screen.tsx'],
		rules: {
			'complexity': ['error', 79],
		},
	},
	{
		files: ['src/ui/fields/renderers/generic-renderers.tsx'],
		rules: {
			'complexity': ['error', 69],
		},
	},
	{
		files: ['src/ui/position-details/position-details-info-rail.tsx'],
		rules: {
			'complexity': ['error', 32],
		},
	},
	{
		files: ['src/ui/chart/protocol.ts'],
		rules: Object.fromEntries(Object.keys(stylistic.rules).map((rule) => [`@stylistic/${rule}`, 'off'])),
	},
	globalIgnores([
		'node_modules',
		'.agents',
		'assets/ocr',
		'build-assets',
		'demo',
		'dist',
		'esbuild.config.ts',
		'eslint.config.js',
		'scripts',
		'test/mocks',
		'versions.json',
		'main.js',
		'src/content.generated.ts',
		'src/docs.ts',
		'src/icon-assets.generated.ts',
		'src/generated-icons/icon-assets.generated.ts',
		'tailwind.config.js',
		'postcss.config.js',
		'eslint-rules',
	]),
)
