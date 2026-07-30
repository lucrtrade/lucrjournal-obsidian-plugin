import { describe, expect, it } from 'vitest'

import { createPkcePair, sha256Base64Url } from './pkce'

describe('createPkcePair', () => {
	// @story [[lucrjournal/session#^fresh-pkce-material]] Covers the generated state and verifier lengths.
	// @story [[lucrjournal/session#^pkce-s256]] Covers deriving the challenge from the generated verifier.
	it('produces a challenge that is the base64url sha256 of the verifier', async () => {
		const pair = await createPkcePair()
		expect(pair.state.length).toBeGreaterThan(20)
		expect(pair.codeVerifier.length).toBeGreaterThan(40)
		expect(pair.codeChallenge).toBe(await sha256Base64Url(pair.codeVerifier))
	})
	// @story [[lucrjournal/session#^pkce-s256]] Covers the standard PKCE S256 vector.
	it('matches the RFC 7636 test vector', async () => {
		expect(await sha256Base64Url('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
			.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
	})
})
