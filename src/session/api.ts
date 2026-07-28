import { requestUrl } from 'obsidian'

import { APP_URL } from '../constant'

import {
	hasFeature,
	isFeatureKey,
	isPlanKey,
	isProductKey,
	isSubscriptionStatus,
	type AccountContext,
	type FeatureKey,
} from './account.generated'

export type CheckResult =
	| { kind: 'active'; context: AccountContext }
	| { kind: 'signed_out' }
	| { kind: 'keep' }

export type ClientInfo = {
	pluginId: string
	pluginVersion: string
	obsidianVersion: string
	platform: string
}

function coercePlan(value: unknown): AccountContext['plan'] | undefined {
	if (value == null) {
		return null 
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		return undefined 
	}
	const key = (value as { key?: unknown }).key
	const status = (value as { status?: unknown }).status
	if (typeof key !== 'string' || typeof status !== 'string') {
		return undefined 
	}
	if (!isPlanKey(key) || !isSubscriptionStatus(status)) {
		return undefined 
	}
	return { key, status }
}

function coerceProducts(value: unknown): AccountContext['products'] {
	if (!Array.isArray(value)) {
		return [] 
	}
	return value.filter((product): product is AccountContext['products'][number] =>
		typeof product === 'string' && isProductKey(product),
	)
}

function coerceContext(body: Record<string, unknown>): AccountContext | null {
	const profile = body.profile
	const entitlements = body.entitlements
	if (profile == null || typeof profile !== 'object' || Array.isArray(profile)) {
		return null 
	}
	if (entitlements == null || typeof entitlements !== 'object' || Array.isArray(entitlements)) {
		return null 
	}
	const rawFeatures = (entitlements as { features?: unknown }).features
	if (!Array.isArray(rawFeatures)) {
		return null 
	}
	const features = rawFeatures.filter((feature): feature is FeatureKey =>
		typeof feature === 'string' && isFeatureKey(feature),
	)
	const plan = coercePlan(body.plan)
	if (plan === undefined) {
		return null 
	}
	return {
		profile: profile as AccountContext['profile'],
		entitlements: { features },
		plan,
		products: coerceProducts(body.products),
	}
}

export function mapCheckResponse(
	status: number,
	body: { status?: string; code?: string } & Record<string, unknown> | null,
): CheckResult {
	if (status === 200 && body?.status === 'active') {
		const context = coerceContext(body)
		if (context == null) {
			return { kind: 'keep' }
		}
		return hasFeature(context.entitlements, 'journal_basic')
			? { kind: 'active', context }
			: { kind: 'signed_out' }
	}
	const code = body?.code
	if (
		code === 'revoked'
		|| code === 'account_disabled'
		|| code === 'invalid_token'
		|| code === 'lucrjournal_entitlement_required'
	) {
		return { kind: 'signed_out' }
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

export async function revokeSession(token: string): Promise<void> {
	try {
		await requestUrl({
			url: `${APP_URL}/api/obsidian/logout`,
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			contentType: 'application/json',
			body: '{}',
			throw: false,
		})
	} catch (_e) {
		// best-effort; clearSession already signed the user out locally
	}
}

export async function claimSession(
	code: string,
	codeVerifier: string,
	client: ClientInfo,
): Promise<{ token: string; context: AccountContext } | null> {
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
		if (body == null || typeof body.token !== 'string') {
			return null
		}
		const context = coerceContext(body)
		if (context == null || !hasFeature(context.entitlements, 'journal_basic')) {
			return null 
		}
		return { token: body.token, context }
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
