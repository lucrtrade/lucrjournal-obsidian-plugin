export function getFileBasename(file: { path: string; basename?: string }) {
	const basename = file.basename?.trim()
	if (basename) {
		return basename
	}

	const fileName = file.path.split('/').pop() ?? file.path
	return fileName.replace(/\.[^.]+$/, '')
}
