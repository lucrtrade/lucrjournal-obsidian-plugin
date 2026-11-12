import { readArgs, readNumber, readText } from './args'
import { persistAttachment } from './attachments'
import { describeAgentApi } from './describe'
import { createEntry, createPlaybook, createTemplate, deleteEntry, renameEntry, updateEntry, updatePlaybook, updateSymbol } from './entry-ops'
import { runAgentCall } from './errors'
import { executePositionPlan } from './execute'
import { checkHealth } from './health'
import { parseCreatePositionInput } from './input'
import { AgentJournal } from './journal'
import { buildOpenPositionCommands, OPEN_POSITION_URI_ACTION, openEntryView, openPositionView } from './open'
import { planPosition } from './plan'
import { addAttachments, linkContext, removeAttachment, removePlaybook, setPlaybook, unlinkContext, updatePosition } from './position-ops'
import { getPosition, listEntries, listPositions } from './queries'
import { assertAgentSession } from './session-guard'
import { describeCurrentVault } from './vault-guard'

import type { App } from 'obsidian'

const AGENT_API_VERSION = 2
export { OPEN_POSITION_URI_ACTION }

/**
 * Public API for agents driving Obsidian through `obsidian eval`:
 * `app.plugins.plugins.lucrjournal.api`. Methods never throw; they resolve to
 * `{ ok: true, ... }` or `{ ok: false, error: { code, message, fix, ... } }`.
 */
export function createAgentApi(plugin: { app: App; manifest: { id: string } }) {
	const { app } = plugin
	const journal = new AgentJournal()
	/** Every operation is refused while the journal is locked, exactly like createPosition. */
	const guarded = <T extends Record<string, unknown>>(call: (rawInput: unknown) => Promise<T> | T) =>
		(rawInput?: unknown) => runAgentCall(async () => {
			assertAgentSession(app)
			return await call(rawInput)
		})
	return {
		version: AGENT_API_VERSION,
		describe: () => runAgentCall(async () => describeAgentApi(AGENT_API_VERSION)),
		listPositions: guarded((rawInput) => listPositions(app, rawInput)),
		getPosition: guarded((rawInput) => getPosition(app, rawInput)),
		listEntries: guarded((rawInput) => listEntries(app, rawInput)),
		updatePosition: guarded((rawInput) => updatePosition(app, journal, rawInput)),
		addAttachments: guarded((rawInput) => addAttachments(app, journal, rawInput)),
		removeAttachment: guarded((rawInput) => removeAttachment(app, journal, rawInput)),
		linkContext: guarded((rawInput) => linkContext(app, journal, rawInput)),
		unlinkContext: guarded((rawInput) => unlinkContext(app, journal, rawInput)),
		setPlaybook: guarded((rawInput) => setPlaybook(app, journal, rawInput)),
		removePlaybook: guarded((rawInput) => removePlaybook(app, journal, rawInput)),
		createEntry: guarded((rawInput) => createEntry(app, journal, rawInput)),
		updateEntry: guarded((rawInput) => updateEntry(app, journal, rawInput)),
		createPlaybook: guarded((rawInput) => createPlaybook(app, journal, rawInput)),
		updatePlaybook: guarded((rawInput) => updatePlaybook(app, journal, rawInput)),
		createTemplate: guarded((rawInput) => createTemplate(app, journal, rawInput)),
		updateSymbol: guarded((rawInput) => updateSymbol(app, journal, rawInput)),
		renameEntry: guarded((rawInput) => renameEntry(app, journal, rawInput)),
		deleteEntry: guarded((rawInput) => deleteEntry(app, journal, rawInput)),
		open: guarded(async (rawInput) => ({ vault: describeCurrentVault(app), ...(await openEntryView(app, rawInput)) })),
		checkHealth: guarded((rawInput) => checkHealth(app, rawInput)),
		listAgentActivity: guarded((rawInput) => {
			const limit = readNumber(readArgs('listAgentActivity', rawInput ?? {}, ['limit']), 'limit')
			return { data: { activity: journal.list(limit === null ? 20 : Math.max(1, Math.min(50, Math.floor(limit)))) } }
		}),
		undo: guarded(async (rawInput) => ({ data: await journal.undo(app, readText(readArgs('undo', rawInput ?? {}, ['id']), 'id')) })),
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
			return { data: await persistAttachment(app, rawInput) }
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
