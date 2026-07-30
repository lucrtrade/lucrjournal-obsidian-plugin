import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const docsRoot = 'document/docs'
const assetsRoot = 'document/assets'

// @story [[lucrjournal/tooling#^doc-asset-embed-pattern]] Holds the Obsidian embed and comment patterns the audit reads.
const embedPattern = /!\[\[([^\]]+)\]\]/g
const commentPattern = /%%[\s\S]*?%%/g

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name)
		return statSync(path).isDirectory() ? walk(path) : [path]
	})
}

function commentSpans(text: string) {
	return [...text.matchAll(commentPattern)].map((match) => [match.index, match.index + match[0].length] as const)
}

// An embed inside an Obsidian comment never reaches the site: comments are
// stripped before any other conversion. So a commented embed still counts as a
// reference, but it does not count as a rendered one.
function readReferences(files: string[]) {
	const referenced = new Set<string>()
	const rendered = new Set<string>()

	for (const file of files) {
		const text = readFileSync(file, 'utf8')
		const spans = commentSpans(text)

		for (const match of text.matchAll(embedPattern)) {
			const target = match[1].trim()
			referenced.add(target)
			if (!spans.some(([start, end]) => match.index >= start && match.index < end)) {
				rendered.add(target)
			}
		}
	}

	return { referenced, rendered }
}

const { referenced, rendered } = readReferences(walk(docsRoot).filter((path) => path.endsWith('.md')))
const assets = walk(assetsRoot)
const problems: string[] = []

for (const asset of assets) {
	const name = asset.split('/').at(-1)!

	// @story [[lucrjournal/tooling#^doc-asset-must-be-referenced]] Rejects an asset that no document embeds.
	if (!referenced.has(name)) {
		problems.push(`${asset}: 没有任何文档引用它，删除该文件`)
		continue
	}

	// @story [[lucrjournal/tooling#^doc-asset-reference-must-render]] Rejects an asset whose every embed stays commented.
	if (!rendered.has(name)) {
		problems.push(`${asset}: 存在但所有引用都被 %% %% 注释，去掉注释让它显示`)
	}
}

if (problems.length > 0) {
	console.error(`doc asset check failed:\n${problems.join('\n')}`)
	process.exit(1)
}

console.log(`doc asset check passed: ${assets.length} assets, ${rendered.size} rendered embeds.`)
