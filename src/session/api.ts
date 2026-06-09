import { requestUrl } from 'obsidian'

import { APP_URL } from '../constant'

import type { SessionProfile } from './storage'

export type CheckResult =
	| { kind: 'active'; profile: SessionProfile }
	| { kind: 'revoked' }
	| { kind: 'account_disabled' }
	| { kind: 'keep' }

export type ClientInfo = {
	pluginId: string
	pluginVersion: string
	obsidianVersion: string
	platform: string
}

export function mapCheckResponse(
	status: number,
	body: { status?: string; code?: string; profile?: SessionProfile } | null,
): CheckResult {
	if (status === 200 && body?.status === 'active' && body.profile != null) {
		return { kind: 'active', profile: body.profile }
	}
	const code = body?.code
	if (code === 'revoked') {
		return { kind: 'revoked' }
	}
	if (code === 'account_disabled') {
		return { kind: 'account_disabled' }
	}
	return { kind: 'keep' }
}

export async function checkSession(token: string): Promise<CheckResult> {
	try {
		const res = await requestUrl({
			url: `${APP_URL}/api/obsidian/session`,
			method: 'GET',
			headers: { Authorization: `Bearer ${token}` },
			throw: false,
		})
		const body = parseJson(res.text)
		return mapCheckResponse(res.status, body)
	} catch (_e) {
		return { kind: 'keep' }
	}
}

export async function claimSession(
	code: string,
	codeVerifier: string,
	client: ClientInfo,
): Promise<{ token: string; profile: SessionProfile } | null> {
	try {
		const res = await requestUrl({
			url: `${APP_URL}/api/obsidian/session/claim`,
			method: 'POST',
			contentType: 'application/json',
			body: JSON.stringify({ code, codeVerifier, client }),
			throw: false,
		})
		if (res.status !== 200) {
			return null
		}
		const body = parseJson(res.text)
		if (body == null || typeof body.token !== 'string' || body.profile == null) {
			return null
		}
		return { token: body.token, profile: body.profile as SessionProfile }
	} catch (_e) {
		return null
	}
}

function parseJson(text: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(text)
		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>
		}
		return null
	} catch (_e) {
		return null
	}
}
