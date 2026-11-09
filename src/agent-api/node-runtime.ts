type NodeRequire = (id: string) => unknown

export type NodeFs = {
	existsSync(path: string): boolean
	statSync(path: string): { isFile(): boolean; size: number }
	readFileSync(path: string, encoding?: string): string | Uint8Array
}

/** Node/Electron modules are only reachable on desktop; returns null elsewhere (mobile, tests). */
export function loadDesktopModule<T>(id: 'fs'): T | null {
	if (typeof window === 'undefined') {
		return null
	}
	const requireFn = (window as unknown as { require?: NodeRequire }).require
	if (typeof requireFn !== 'function') {
		return null
	}
	try {
		return requireFn(id) as T
	} catch {
		return null
	}
}
