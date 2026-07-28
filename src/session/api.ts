import { requestUrl } from 'obsidian'

import { APP_URL } from '../constant'
import { createLogger } from '../logger'

import {
	hasFeature,
	isFeatureKey,
	isPlanKey,
	isProductKey,
	isSubscriptionStatus,
	type AccountContext,
	type FeatureKey,
} from './account.generated'

const logger = createLogger('session')
const SESSION_ENDPOINT = `${APP_URL}/api/obsidian/session`
const CLAIM_ENDPOINT = `${SESSION_ENDPOINT}/claim`
const LOGOUT_ENDPOINT = `${APP_URL}/api/obsidian/logout`

export type CheckResult =
	| { kind: 'active'; context: AccountContext }
	| { kind: 'signed_out'; reason: 'entitlement_required' | 'invalid_session' }
	| { kind: 'keep' }

export type ClaimResult =
	| { kind: 'active'; token: string; context: AccountContext }
	| { kind: 'entitlement_required'; context: AccountContext | null }
	| { kind: 'failed' }

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
			: { kind: 'signed_out', reason: 'entitlement_required' }
	}
	const code = body?.code
	if (code === 'lucrjournal_entitlement_required') {
		return { kind: 'signed_out', reason: 'entitlement_required' }
	}
	if (code === 'revoked' || code === 'account_disabled' || code === 'invalid_token') {
		return { kind: 'signed_out', reason: 'invalid_session' }
	}
	return { kind: 'keep' }
}

export async function checkSession(token: string): Promise<CheckResult> {
	try {
		const res = await requestUrl({
			url: SESSION_ENDPOINT,
			method: 'GET',
			headers: { Authorization: `Bearer ${token}` },
			throw: false,
		})
		const body = parseJson(res.text)
		const result = mapCheckResponse(res.status, body)
		if (result.kind !== 'active') {
			logger.error(
				result.kind === 'signed_out' ? 'session check rejected' : 'session check could not be classified',
				{
					endpoint: SESSION_ENDPOINT,
					status: res.status,
					code: typeof body?.code === 'string' ? body.code : null,
					bodyKeys: body == null ? [] : Object.keys(body),
					responseLength: res.text.length,
				},
			)
		}
		return result
	} catch (error: unknown) {
		logger.error('session check request failed', {
			endpoint: SESSION_ENDPOINT,
			error,
		})
		return { kind: 'keep' }
	}
}

export async function revokeSession(token: string): Promise<void> {
	try {
		const res = await requestUrl({
			url: LOGOUT_ENDPOINT,
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			contentType: 'application/json',
			body: '{}',
			throw: false,
		})
		if (res.status < 200 || res.status >= 300) {
			const body = parseJson(res.text)
			logger.error('session revoke rejected', {
				endpoint: LOGOUT_ENDPOINT,
				status: res.status,
				code: typeof body?.code === 'string' ? body.code : null,
				bodyKeys: body == null ? [] : Object.keys(body),
				responseLength: res.text.length,
			})
		}
	} catch (error: unknown) {
		logger.error('session revoke request failed', {
			endpoint: LOGOUT_ENDPOINT,
			error,
		})
	}
}

export async function claimSession(
	code: string,
	codeVerifier: string,
	client: ClientInfo,
): Promise<ClaimResult> {
	try {
		const res = await requestUrl({
			url: CLAIM_ENDPOINT,
			method: 'POST',
			contentType: 'application/json',
			body: JSON.stringify({ code, codeVerifier, client }),
			throw: false,
		})
		const body = parseJson(res.text)
		if (res.status !== 200) {
			logger.error('session claim rejected', {
				endpoint: CLAIM_ENDPOINT,
				status: res.status,
				code: typeof body?.code === 'string' ? body.code : null,
				bodyKeys: body == null ? [] : Object.keys(body),
				responseLength: res.text.length,
			})
			return body?.code === 'lucrjournal_entitlement_required'
				? { kind: 'entitlement_required', context: null }
				: { kind: 'failed' }
		}
		if (body == null) {
			logger.error('session claim returned invalid JSON', {
				endpoint: CLAIM_ENDPOINT,
				status: res.status,
				responseLength: res.text.length,
			})
			return { kind: 'failed' }
		}
		if (typeof body.token !== 'string') {
			logger.error('session claim response missing token', {
				endpoint: CLAIM_ENDPOINT,
				status: res.status,
				bodyKeys: Object.keys(body),
			})
			return { kind: 'failed' }
		}
		const context = coerceContext(body)
		if (context == null) {
			logger.error('session claim response has invalid account context', {
				endpoint: CLAIM_ENDPOINT,
				status: res.status,
				bodyKeys: Object.keys(body).filter((key) => key !== 'token'),
			})
			return { kind: 'failed' }
		}
		if (!hasFeature(context.entitlements, 'journal_basic')) {
			logger.error('session claim missing journal access', {
				endpoint: CLAIM_ENDPOINT,
				status: res.status,
				features: context.entitlements.features,
				plan: context.plan?.key ?? null,
				products: context.products,
			})
			return { kind: 'entitlement_required', context }
		}
		return { kind: 'active', token: body.token, context }
	} catch (error: unknown) {
		logger.error('session claim request failed', {
			endpoint: CLAIM_ENDPOINT,
			error,
		})
		return { kind: 'failed' }
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
