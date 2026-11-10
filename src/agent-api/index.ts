import { runAgentCall } from './errors'
import { executePositionPlan } from './execute'
import { parseCreatePositionInput } from './input'
import { buildOpenPositionCommands, OPEN_POSITION_URI_ACTION, openPositionView } from './open'
import { planPosition } from './plan'
import { parseSaveAttachmentInput, persistAttachment } from './save-attachment'
import { assertAgentSession } from './session-guard'
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
			// @story [[lucrjournal/agent-api#^agent-api-session-gate]] Refuses to write positions the user could not see
			assertAgentSession(app)
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
		openPosition: (rawInput: unknown) => runAgentCall(async () => {
			assertAgentSession(app)
			return {
				vault: describeCurrentVault(app),
				...(await openPositionView(app, rawInput)),
			}
		}),
		/** Store an agent-supplied image in `LucrJournal/attachments/YYYY-MM/` and return its wikilink. */
		saveAttachment: (rawInput: unknown) => runAgentCall(async () => {
			assertAgentSession(app)
			const input = parseSaveAttachmentInput(rawInput)
			return { data: await persistAttachment(app, input) }
		}),
		/** Handler for `obsidian://lucrjournal-open-position?vault=<id>&file=<vault-relative path>`. */
		handleOpenPositionUri: async (params: Record<string, string>) => {
			const currentVault = describeCurrentVault(app)
			const requestedVault = (params.vault ?? '').trim()
			if (requestedVault !== '' && currentVault.id !== '' && requestedVault !== currentVault.id) {
				return `This link targets vault ${JSON.stringify(requestedVault)}, but LucrJournal is running in vault ${JSON.stringify(currentVault.name)} (${currentVault.id}); nothing was opened. Enable LucrJournal in the vault the link names and use that vault's link.`
			}
			const result = await runAgentCall(async () => {
				assertAgentSession(app)
				return await openPositionView(app, { path: params.file })
			})
			return result.ok ? null : result.error.message
		},
	}
}
