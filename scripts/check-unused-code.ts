import ts from 'typescript'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const projectRootUrl = new URL('..', import.meta.url)
const projectRootPath = ts.sys.resolvePath(projectRootUrl.pathname)
// @story [[lucrjournal/tooling#^unused-declarations]] Defines the only source files excluded from declaration analysis
const ignoredSourceFiles = new Set([
	ts.sys.resolvePath(new URL('../src/charts/lucrchart-host.ts', import.meta.url).pathname),
	ts.sys.resolvePath(new URL('../src/generated-icons/icon-assets.generated.ts', import.meta.url).pathname),
	ts.sys.resolvePath(new URL('../src/session/account.generated.ts', import.meta.url).pathname),
])
const scriptFiles = ts.sys
	.readDirectory(join(projectRootPath, 'scripts'), ['.ts'], undefined, ['**/*'])
	.map((fileName) => ts.sys.resolvePath(fileName))
	.filter((fileName) => !isTestFilePath(fileName))
const scriptContentsByFile = new Map(
	scriptFiles.map((fileName) => [fileName, readFileSync(fileName, 'utf8')]),
)
const testRangesByFile = new Map()

const configPath = ts.findConfigFile(projectRootPath, ts.sys.fileExists, 'tsconfig.json')

if (!configPath) {
	throw new Error('Cannot find tsconfig.json')
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error) {
	throw new Error(formatDiagnostic(configFile.error))
}

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRootPath)
if (parsedConfig.errors.length > 0) {
	throw new Error(parsedConfig.errors.map(formatDiagnostic).join('\n'))
}

const languageServiceHost = createLanguageServiceHost(parsedConfig.fileNames, parsedConfig.options)
const languageService = ts.createLanguageService(languageServiceHost)
const program = languageService.getProgram()

if (!program) {
	throw new Error('Cannot create TypeScript program for unused code check')
}

let hasErrors = false

// --- Check 1: unused declarations (functions, variables, types, interfaces, enums, classes) ---
const declarations = collectDeclarations(program)
// @story [[lucrjournal/tooling#^unused-declarations]] Fails on unreferenced declarations and locally consumed exports
const unusedEntries = declarations
	.filter((entry) => countExternalReferences(entry) === 0 && !hasScriptReference(entry))
	.sort(compareEntries)

if (unusedEntries.length > 0) {
	console.error(`Found ${unusedEntries.length} unused declarations:\n`)
	for (const entry of unusedEntries) {
		console.error(`- ${formatEntry(entry)}`)
	}
	hasErrors = true
}

// --- Check 2: exported but only used locally ---
const exportedEntries = collectExportedDeclarations(program)
const unnecessaryExports = exportedEntries
	.filter((entry) => {
		const refs = classifyReferences(entry)
		return refs.local > 0 && refs.external === 0 && !hasScriptReference(entry)
	})
	.sort(compareEntries)

if (unnecessaryExports.length > 0) {
	if (hasErrors) console.error('')
	console.error(`Found ${unnecessaryExports.length} unnecessary exports (only used locally):\n`)
	for (const entry of unnecessaryExports) {
		console.error(`- ${formatEntry(entry)}`)
	}
	hasErrors = true
}

// --- Check 3: unused locale keys ---
// @story [[lucrjournal/tooling#^unused-locale-and-css]] Fails on orphan locale keys and source-unreferenced CSS classes
const unusedLocaleKeys = findUnusedLocaleKeys()
if (unusedLocaleKeys.length > 0) {
	if (hasErrors) console.error('')
	console.error(`Found ${unusedLocaleKeys.length} unused locale keys in en.ts:\n`)
	for (const key of unusedLocaleKeys) {
		console.error(`- ${key}`)
	}
	hasErrors = true
}

// --- Check 4: unused CSS classes ---
const unusedCssClasses = findUnusedCssClasses()
if (unusedCssClasses.length > 0) {
	if (hasErrors) console.error('')
	console.error(`Found ${unusedCssClasses.length} unused CSS classes in main.pcss:\n`)
	for (const cls of unusedCssClasses) {
		console.error(`- .${cls}`)
	}
	hasErrors = true
}

if (hasErrors) {
	process.exit(1)
}

console.log('unused code check passed.')

// ─── helpers ────────────────────────────────────────────────────────────────

function createLanguageServiceHost(fileNames, compilerOptions) {
	return {
		getCompilationSettings: () => compilerOptions,
		getCurrentDirectory: () => projectRootPath,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getNewLine: () => '\n',
		getScriptFileNames: () => fileNames,
		getScriptVersion: () => '0',
		getScriptSnapshot: (fileName) => {
			const content = ts.sys.readFile(fileName)
			return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content)
		},
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	}
}

function collectDeclarations(program) {
	const declarations = []

	for (const sourceFile of program.getSourceFiles()) {
		if (!shouldInspectFile(sourceFile.fileName)) {
			continue
		}

		const resolvedFilePath = ts.sys.resolvePath(sourceFile.fileName)
		const testRanges = collectTestRanges(sourceFile)
		testRangesByFile.set(resolvedFilePath, testRanges)

		ts.forEachChild(sourceFile, function visit(node) {
			if (isWithinRanges(node.getStart(sourceFile), testRanges)) {
				return
			}

			const entry = getTrackedDeclaration(node)
			if (entry) {
				declarations.push(entry)
			}

			ts.forEachChild(node, visit)
		})
	}

	return declarations
}

function collectExportedDeclarations(program) {
	const exported = []

	for (const sourceFile of program.getSourceFiles()) {
		if (!shouldInspectFile(sourceFile.fileName)) {
			continue
		}

		const resolvedFilePath = ts.sys.resolvePath(sourceFile.fileName)
		const testRanges = testRangesByFile.get(resolvedFilePath) ?? collectTestRanges(sourceFile)

		ts.forEachChild(sourceFile, function visit(node) {
			if (isWithinRanges(node.getStart(sourceFile), testRanges)) {
				return
			}

			const entry = getExportedDeclaration(node)
			if (entry) {
				exported.push(entry)
			}

			ts.forEachChild(node, visit)
		})
	}

	return exported
}

function shouldInspectFile(fileName) {
	const resolvedPath = ts.sys.resolvePath(fileName)
	return (
		resolvedPath.startsWith(`${projectRootPath}/src/`)
		&& !ignoredSourceFiles.has(resolvedPath)
		&& !isTestFilePath(resolvedPath)
	)
}

function getTrackedDeclaration(node) {
	if (ts.isFunctionDeclaration(node) && node.name && shouldTrackName(node.name.text)) {
		return createEntry('function', node.name)
	}

	if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && shouldTrackName(node.name.text)) {
		return createEntry('variable', node.name)
	}

	if (ts.isTypeAliasDeclaration(node) && shouldTrackName(node.name.text)) {
		return createEntry('type', node.name)
	}

	if (ts.isInterfaceDeclaration(node) && shouldTrackName(node.name.text)) {
		return createEntry('interface', node.name)
	}

	if (ts.isEnumDeclaration(node) && shouldTrackName(node.name.text)) {
		return createEntry('enum', node.name)
	}

	if (ts.isClassDeclaration(node) && node.name && shouldTrackName(node.name.text)) {
		return createEntry('class', node.name)
	}

	if (
		ts.isMethodDeclaration(node)
		&& ts.isIdentifier(node.name)
		&& shouldTrackName(node.name.text)
		&& (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent))
	) {
		const modifiers = node.modifiers ?? []
		const isAbstract = modifiers.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)
		const isPrivate = modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
		const isProtected = modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)
		const isOverride = modifiers.some((m) => m.kind === ts.SyntaxKind.OverrideKeyword)
		if (!isAbstract && !isPrivate && !isProtected && !isOverride) {
			return createEntry('method', node.name)
		}
	}

	return null
}

function getExportedDeclaration(node) {
	const hasExportModifier = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
	if (!hasExportModifier) return null

	const name = getDeclarationName(node)
	if (!name || !shouldTrackName(name.text)) return null

	return createEntry('export', name)
}

function getDeclarationName(node) {
	if (ts.isFunctionDeclaration(node) && node.name) return node.name
	if (ts.isVariableStatement(node)) {
		const decl = node.declarationList.declarations[0]
		if (decl && ts.isIdentifier(decl.name)) return decl.name
	}
	if (ts.isTypeAliasDeclaration(node)) return node.name
	if (ts.isInterfaceDeclaration(node)) return node.name
	if (ts.isEnumDeclaration(node)) return node.name
	if (ts.isClassDeclaration(node) && node.name) return node.name
	return null
}

function createEntry(kind, identifier) {
	const sourceFile = identifier.getSourceFile()
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(identifier.getStart())

	return {
		filePath: ts.sys.resolvePath(sourceFile.fileName),
		fileName: relativeToProject(sourceFile.fileName),
		line: line + 1,
		character: character + 1,
		kind,
		name: identifier.text,
		position: identifier.getStart(),
		length: identifier.getWidth(),
	}
}

function shouldTrackName(name) {
	return !name.startsWith('_')
}

function countExternalReferences(entry) {
	const referencedSymbols = languageService.findReferences(entry.filePath, entry.position + 1) ?? []
	let count = 0

	for (const referencedSymbol of referencedSymbols) {
		for (const referenceEntry of referencedSymbol.references) {
			const referenceFilePath = ts.sys.resolvePath(referenceEntry.fileName)
			const isOwnDefinition =
				referenceFilePath === entry.filePath
				&& referenceEntry.textSpan.start === entry.position
				&& referenceEntry.textSpan.length === entry.length

			if (isOwnDefinition) {
				continue
			}

			if (isSameNameExportSpecifierReference(referenceEntry)) {
				continue
			}

			count += 1
		}
	}

	if (entry.kind === 'method') {
		count += countImplicitMethodReferences(entry)
	}

	return count
}

function classifyReferences(entry) {
	const referencedSymbols = languageService.findReferences(entry.filePath, entry.position + 1) ?? []
	let local = 0
	let external = 0

	for (const referencedSymbol of referencedSymbols) {
		for (const referenceEntry of referencedSymbol.references) {
			const referenceFilePath = ts.sys.resolvePath(referenceEntry.fileName)
			const isOwnDefinition =
				referenceFilePath === entry.filePath
				&& referenceEntry.textSpan.start === entry.position
				&& referenceEntry.textSpan.length === entry.length

			if (isOwnDefinition) {
				continue
			}

			if (isSameNameExportSpecifierReference(referenceEntry)) {
				continue
			}

			if (isExportedReference(entry, referenceEntry)) {
				external += 1
			} else if (referenceFilePath === entry.filePath) {
				local += 1
			} else {
				external += 1
			}
		}
	}

	if (entry.kind === 'method') {
		const implicitRefs = classifyImplicitMethodReferences(entry)
		local += implicitRefs.local
		external += implicitRefs.external
	}

	return { local, external }
}

function countImplicitMethodReferences(entry) {
	const refs = classifyImplicitMethodReferences(entry)
	return refs.local + refs.external
}

function classifyImplicitMethodReferences(entry) {
	let local = 0
	let external = 0

	for (const sourceFile of program.getSourceFiles()) {
		if (!shouldInspectFile(sourceFile.fileName)) {
			continue
		}

		const filePath = ts.sys.resolvePath(sourceFile.fileName)
		const testRanges = testRangesByFile.get(filePath) ?? collectTestRanges(sourceFile)

		ts.forEachChild(sourceFile, function visit(node) {
			if (isWithinRanges(node.getStart(sourceFile), testRanges)) {
				return
			}

			if (isImplicitMethodReference(node, entry)) {
				if (filePath === entry.filePath) {
					local += 1
				} else {
					external += 1
				}
			}

			ts.forEachChild(node, visit)
		})
	}

	return { local, external }
}

function isImplicitMethodReference(node, entry) {
	if (ts.isPropertyAccessExpression(node) && node.name.text === entry.name) {
		return !isDeclarationNameNode(node.name)
	}

	if (
		ts.isElementAccessExpression(node)
		&& ts.isStringLiteralLike(node.argumentExpression)
		&& node.argumentExpression.text === entry.name
	) {
		return true
	}

	if (
		ts.isBinaryExpression(node)
		&& node.operatorToken.kind === ts.SyntaxKind.InKeyword
		&& ts.isStringLiteralLike(node.left)
		&& node.left.text === entry.name
	) {
		return true
	}

	return false
}

function isDeclarationNameNode(node) {
	const parent = node.parent
	return (
		(ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent))
		&& parent.name === node
	)
}

function hasScriptReference(entry) {
	const pattern = new RegExp(`\\b${escapeRegExp(entry.name)}\\b`)

	for (const [fileName, content] of scriptContentsByFile) {
		const matches = content.match(new RegExp(`\\b${escapeRegExp(entry.name)}\\b`, 'g')) ?? []
		const ownFileMatchCount = fileName === entry.filePath ? 1 : 0
		if (matches.length > ownFileMatchCount && pattern.test(content)) {
			return true
		}
	}

	return false
}

function collectTestRanges(sourceFile) {
	const ranges = []

	ts.forEachChild(sourceFile, function visit(node) {
		if (ts.isIfStatement(node) && isImportMetaVitestExpression(node.expression)) {
			ranges.push({ start: node.thenStatement.getStart(), end: node.thenStatement.getEnd() })
		}

		ts.forEachChild(node, visit)
	})

	return ranges
}

function isImportMetaVitestExpression(node) {
	return (
		ts.isPropertyAccessExpression(node)
		&& node.name.text === 'vitest'
		&& ts.isMetaProperty(node.expression)
		&& node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
		&& node.expression.name.text === 'meta'
	)
}

function isTestFilePath(filePath) {
	return /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)
}

function isExportedReference(entry, referenceEntry) {
	if (referenceEntry.fileName !== entry.filePath) {
		return false
	}

	const sourceFile = program.getSourceFile(entry.filePath)
	if (!sourceFile) {
		return false
	}

	let found = false

	ts.forEachChild(sourceFile, function visit(node) {
		if (found) {
			return
		}

		if (
			node.pos <= referenceEntry.textSpan.start
			&& referenceEntry.textSpan.start < node.end
			&& node.pos !== entry.position
			&& getExportedDeclaration(node)
			&& !isImplementationReference(node, referenceEntry.textSpan.start)
		) {
			found = true
			return
		}

		ts.forEachChild(node, visit)
	})

	return found
}

function isImplementationReference(node, position) {
	if (hasBodyContaining(node, position)) {
		return true
	}

	if (ts.isVariableStatement(node)) {
		return node.declarationList.declarations.some((declaration) =>
			declaration.initializer
			&& declaration.initializer.pos <= position
			&& position < declaration.initializer.end,
		)
	}

	return false
}

function hasBodyContaining(node, position) {
	let found = false
	ts.forEachChild(node, function visit(child) {
		if (found) {
			return
		}

		if (ts.isBlock(child) && child.pos <= position && position < child.end) {
			found = true
			return
		}

		ts.forEachChild(child, visit)
	})

	return found
}

function isSameNameExportSpecifierReference(referenceEntry) {
	const sourceFile = program.getSourceFile(referenceEntry.fileName)
	if (!sourceFile) {
		return false
	}

	let found = false
	ts.forEachChild(sourceFile, function visit(node) {
		if (found) {
			return
		}

		if (ts.isExportSpecifier(node) && !node.propertyName) {
			found = (
				node.getStart(sourceFile) <= referenceEntry.textSpan.start
				&& referenceEntry.textSpan.start < node.getEnd()
			)
			if (found) {
				return
			}
		}

		ts.forEachChild(node, visit)
	})

	return found
}

function isWithinRanges(position, ranges) {
	return ranges.some((range) => position >= range.start && position < range.end)
}

function compareEntries(left, right) {
	return (
		left.fileName.localeCompare(right.fileName)
		|| left.line - right.line
		|| left.character - right.character
		|| left.name.localeCompare(right.name)
	)
}

function formatEntry(entry) {
	return `${entry.fileName}:${entry.line}:${entry.character} ${entry.kind} ${entry.name}`
}

function relativeToProject(fileName) {
	return ts.sys.resolvePath(fileName).replace(`${projectRootPath}/`, '')
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatDiagnostic(diagnostic) {
	return ts.formatDiagnostic(diagnostic, {
		getCanonicalFileName: (fileName) => fileName,
		getCurrentDirectory: () => projectRootPath,
		getNewLine: () => '\n',
	})
}

// ─── Check 3: unused locale keys ───────────────────────────────────────────

function findUnusedLocaleKeys() {
	const enPath = resolve(projectRootPath, 'src/lang/locale/en.ts')
	const enContent = readFileSync(enPath, 'utf8')

	// Extract all keys from en.ts: lines like `    KEY_NAME: '...'`
	const keyPattern = /^\s+([A-Z][A-Z0-9_]+)\s*:/gm
	const allKeys = []
	let match
	while ((match = keyPattern.exec(enContent)) !== null) {
		allKeys.push(match[1])
	}

	// Collect all source content (excluding en.ts, zh-cn.ts, and test files)
	const srcDir = resolve(projectRootPath, 'src')
	const sourceFiles = collectSourceFilePaths(srcDir)
	const excludeFiles = new Set([
		resolve(projectRootPath, 'src/lang/locale/en.ts'),
		resolve(projectRootPath, 'src/lang/locale/zh-cn.ts'),
	])

	const sourceContents = sourceFiles
		.filter((f) => !excludeFiles.has(f) && !isTestFilePath(f))
		.map((f) => readFileSync(f, 'utf8'))
		.join('\n')

	return allKeys.filter((key) => {
		const keyRegex = new RegExp(`\\b${escapeRegExp(key)}\\b`)
		return !keyRegex.test(sourceContents)
	}).sort()
}

function collectSourceFilePaths(dir) {
	const results = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = resolve(dir, entry.name)
		if (entry.isDirectory()) {
			results.push(...collectSourceFilePaths(fullPath))
		} else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
			results.push(fullPath)
		}
	}
	return results
}

// ─── shared ────────────────────────────────────────────────────────────────

/** Replace every balanced `{ ... }` block whose opening matches `pattern` with spaces. */
function stripBalancedBlocks(source, pattern) {
	const ranges = []
	let match
	while ((match = pattern.exec(source)) !== null) {
		let depth = 1
		let i = match.index + match[0].length
		while (i < source.length && depth > 0) {
			if (source[i] === '{') depth++
			else if (source[i] === '}') depth--
			i++
		}
		ranges.push([match.index, i])
	}
	let result = source
	for (let k = ranges.length - 1; k >= 0; k--) {
		const [start, end] = ranges[k]
		result = result.slice(0, start) + ' '.repeat(end - start) + result.slice(end)
	}
	return result
}

// ─── Check 4: unused CSS classes ───────────────────────────────────────────

function findUnusedCssClasses() {
	const cssPath = resolve(projectRootPath, 'src/styles/main.pcss')
	const cssContent = readFileSync(cssPath, 'utf8')

	// Strip @theme blocks (both `@theme { ... }` and `@theme inline { ... }`)
	// so we only scan actual CSS rule selectors, not variable definitions.
	const withoutTheme = stripBalancedBlocks(cssContent, /@theme\b[^{]*\{/g)

	// Extract class selectors: `.lj-something` followed by `{`, `,`, `:`, or whitespace
	const classPattern = /\.(lj-[a-zA-Z][a-zA-Z0-9-]+)/g
	const classNames = new Set()
	let match
	while ((match = classPattern.exec(withoutTheme)) !== null) {
		classNames.add(match[1])
	}

	// Also exclude the root `.lucrjournal-view` — it's set by Obsidian, not referenced in source
	classNames.delete('lucrjournal-view')

	// Collect all source content (TS/TSX + CSS itself for cross-references)
	const srcDir = resolve(projectRootPath, 'src')
	const sourceFiles = collectSourceFilePaths(srcDir)
	const sourceContents = sourceFiles
		.filter((f) => !isTestFilePath(f) && !f.endsWith('main.pcss'))
		.map((f) => readFileSync(f, 'utf8'))
		.join('\n')

	return [...classNames]
		.filter((cls) => {
			const pattern = new RegExp(`\\b${escapeRegExp(cls)}\\b`)
			return !pattern.test(sourceContents)
		})
		.sort()
}
