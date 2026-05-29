function encodeBase64Utf8(value: string): string {
	const bytes = new TextEncoder().encode(value)
	return encodeBase64Bytes(bytes)
}

function encodeBase64Bytes(value: ArrayBuffer | Uint8Array): string {
	const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
	let binary = ''

	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}

	return btoa(binary)
}

export function toSvgDataUri(svg: string): string {
	return `data:image/svg+xml;base64,${encodeBase64Utf8(svg)}`
}
