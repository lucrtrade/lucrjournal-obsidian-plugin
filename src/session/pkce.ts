function toBase64Url(bytes: Uint8Array): string {
	let str = ''
	for (const b of bytes) {
		str += String.fromCharCode(b)
	}
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBase64Url(byteLength: number): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function sha256Base64Url(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
	return toBase64Url(new Uint8Array(digest))
}

// @story [[lucrjournal/session#^fresh-pkce-material]] Creates fresh OAuth state and verifier material with Web Crypto.
// @story [[lucrjournal/session#^pkce-s256]] Derives the PKCE challenge from the verifier with SHA-256 and Base64url.
export async function createPkcePair(): Promise<{
	state: string
	codeVerifier: string
	codeChallenge: string
}> {
	const state = randomBase64Url(24)
	const codeVerifier = randomBase64Url(48)
	const codeChallenge = await sha256Base64Url(codeVerifier)
	return { state, codeVerifier, codeChallenge }
}
