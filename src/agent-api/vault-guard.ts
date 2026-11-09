import type { App } from 'obsidian'

export type AgentVault = { id: string; name: string }

/**
 * The vault this call runs in. The agent picks it with the CLI itself:
 * the active vault by default, or `obsidian vault=<name>` when the user names one.
 */
export function describeCurrentVault(app: App): AgentVault {
	const name = app.vault.getName()
	// appId is not part of the public API; the CLI and obsidian:// URIs accept the vault name as well.
	const appId = (app as App & { appId?: unknown }).appId
	return {
		id: typeof appId === 'string' && appId !== '' ? appId : name,
		name,
	}
}
