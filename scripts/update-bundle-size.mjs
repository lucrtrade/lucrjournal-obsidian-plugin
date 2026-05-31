import { statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const artifacts = ['main.js', 'styles.css']

const build = spawnSync('npm', ['run', 'build:bundle:prod'], { stdio: 'inherit' })
if (build.error != null) {
	throw build.error
}
if (build.status !== 0) {
	process.exit(build.status ?? 1)
}

function formatSize(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(2)} KiB`
	}

	return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

const files = artifacts.map((path) => {
	const bytes = statSync(path).size
	return { path, bytes, size: formatSize(bytes) }
})
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)

writeFileSync('bundle-size.json', `${JSON.stringify({
	build: 'production',
	files,
	total: { bytes: totalBytes, size: formatSize(totalBytes) },
}, null, '\t')}\n`)
