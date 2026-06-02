import { readFileSync, writeFileSync } from 'node:fs'

import { searchTradingViewSymbols } from '../src/domains/symbol/tradingview.ts'

const constantsPath = new URL('../src/domains/symbol/constants.ts', import.meta.url)
const builtinPath = new URL('../src/domains/symbol/builtin.ts', import.meta.url)

function readBuiltinSymbols() {
	const constantsSource = readFileSync(constantsPath, 'utf8')
	const builtinSource = readFileSync(builtinPath, 'utf8')
	const types = new Map(Array.from(builtinSource.matchAll(/^\t([^:]+): \{ type: '([^']+)'/gm), (match) => [
		parseKey(match[1]),
		match[2],
	]))

	return Array.from(constantsSource.matchAll(/\{\s*symbol_name:\s*'([^']+)'/g), (match) => ({
		name: match[1],
		type: resolveType(types, match[1]),
	}))
}

async function resolveLogo(row) {
	const best = (await searchTradingViewSymbols(fetch, row.name, row.type))[0]
	if (best === undefined) {
		throw new Error(`Missing TradingView logo for ${row.name}`)
	}

	return best.logo
}

function formatBuiltinModule(entries) {
	const rows = entries
		.map(([name, type, logo]) => `\t${formatKey(name)}: { type: ${formatString(type)}, logo: ${formatString(logo)} },`)
		.join('\n')

	return `import type { BuiltinSymbolName } from './constants'
import type { PositionSymbolType } from './position-model'

export const BuiltinSymbols = {
${rows}
} as const satisfies Record<BuiltinSymbolName, { type: PositionSymbolType; logo: string }>
`
}

function resolveType(types, name) {
	const type = types.get(name)
	if (type === undefined) {
		throw new Error(`Missing builtin symbol type for ${name}`)
	}

	return type
}

function parseKey(value) {
	return value.startsWith("'")
		? value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\')
		: value
}

function formatKey(value) {
	return /^[A-Za-z_$][\w$]*$/u.test(value) ? value : formatString(value)
}

function formatString(value) {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const rows = readBuiltinSymbols()
const entries = []

for (const row of rows) {
	const logo = await resolveLogo(row)
	entries.push([row.name, row.type, logo])
	console.log(`${row.name}: ${logo}`)
}

writeFileSync(builtinPath, formatBuiltinModule(entries), 'utf8')
