import { runAgentCall } from './errors'
import { executePositionPlan } from './execute'
import { parseCreatePositionInput } from './input'
import { buildOpenPositionCommands, OPEN_POSITION_URI_ACTION, openPositionView } from './open'
import { planPosition } from './plan'
import { describeCurrentVault } from './vault-guard'

import type { App } from 'obsidian'

const AGENT_API_VERSION = 1
export { OPEN_POSITION_URI_ACTION }

/**
 * Public API for agents driving Obsidian through `obsidian eval`:
 * `app.plugins.plugins.lucrjournal.api`. Methods never throw; they resolve to
 * `{ ok: true, ... }` or `{ ok: false, error: { code, message, fix, ... } }`.
 */
export function createAgentApi(plugin: { app: App; manifest: { id: string } }) {
	const { app } = plugin
	return {
		version: AGENT_API_VERSION,
		createPosition: (rawInput: unknown) => runAgentCall(async () => {
			const input = parseCreatePositionInput(rawInput)
			const vault = describeCurrentVault(app)
			const plan = await planPosition(app, input)
			const path = plan.execution.positionPath
			if (input.dryRun) {
				return {
					dryRun: true,
					data: { vault, path, resolved: plan.resolved, files: plan.files },
				}
			}

			const result = await executePositionPlan(app, plan)
			return {
				dryRun: false,
				data: {
					vault,
					path: result.path,
					created: result.created,
					resolved: plan.resolved,
					frontmatter: result.frontmatter,
					open: buildOpenPositionCommands(vault.id, result.path, plugin.manifest.id),
				},
			}
		}),
		openPosition: (rawInput: unknown) => runAgentCall(async () => ({
			vault: describeCurrentVault(app),
			...(await openPositionView(app, rawInput)),
		})),
		/** Handler for `obsidian://lucrjournal-open-position?vault=<id>&file=<vault-relative path>`. */
		handleOpenPositionUri: async (params: Record<string, string>) => {
			const result = await runAgentCall(async () => await openPositionView(app, { path: params.file }))
			return result.ok ? null : result.error.message
		},
	}
}
