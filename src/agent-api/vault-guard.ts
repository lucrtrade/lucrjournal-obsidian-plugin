import type { App } from 'obsidian'

export type AgentVault = { id: string; name: string }

/**
 * The vault this call runs in. The agent picks it with the CLI itself:
 * the active vault by default, or `obsidian vault=<name>` when the user names one.
 */
export function describeCurrentVault(app: App): AgentVault {
	return {
		id: (app as App & { appId?: string }).appId ?? '',
		name: app.vault.getName(),
	}
}
