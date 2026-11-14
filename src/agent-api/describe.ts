type OperationDoc = {
	name: string
	type: 'read' | 'write' | 'destructive'
	summary: string
	fields: Record<string, string>
	example: Record<string, unknown>
}

const POSITION_REF = 'Position path or id, e.g. "POS-00012" or "LucrJournal/positions/POS-00012.md". Required.'
const IF_REV = 'Optional `rev` from getPosition; the call fails with CONFLICT when the note changed since.'
const DRY_RUN = 'true = return what would change and write nothing.'
const ENTRY_REF = 'Path or note name. Required. Add `kind` when the name alone is not unique.'
const KIND_CONTEXT = 'news | key_level | confluence | market_analysis. Required.'
const CONFIRM = 'Omit on the first call to get the scope and a token; pass the token to execute.'

/**
 * Machine-readable catalog of the agent API, served by `api.describe()` so a
 * skill never has to carry a field table that can drift from the installed
 * plugin. A test asserts it lists exactly the methods `createAgentApi` exposes.
 */
const AGENT_OPERATIONS: readonly OperationDoc[] = [
	{
		name: 'describe',
		type: 'read',
		summary: 'List every operation of this plugin version with its fields and an example.',
		fields: {},
		example: {},
	},
	{
		name: 'listPositions',
		type: 'read',
		summary: 'Find positions, newest first.',
		fields: {
			symbol: 'Substring of the symbol name, case-insensitive.',
			account: 'Exact account display name.',
			status: 'open | closed (the stored value "close" is accepted too). Results always say open / closed.',
			side: 'LONG | SHORT.',
			from: 'opened_at lower bound: YYYY-MM-DD or YYYY-MM-DD HH:mm[:ss], in the plugin time zone.',
			to: 'opened_at upper bound, same formats.',
			playbook: 'Exact playbook name.',
			limit: 'Whole number from 1; default 50, capped at 500.',
		},
		example: { symbol: 'sol', status: 'open', from: '2026-11-01' },
	},
	{
		name: 'getPosition',
		type: 'read',
		summary: 'Read one position: fields, linked notes, attachments, notes text and its `rev`. Call it before changing a position.',
		fields: { position: POSITION_REF },
		example: { position: 'POS-00012' },
	},
	{
		name: 'listEntries',
		type: 'read',
		summary: 'List notes of one kind with their properties. Playbooks include their criteria groups.',
		fields: {
			kind: 'account | platform | symbol | news | key_level | confluence | market_analysis | playbook | criteria | template. Required.',
			query: 'Substring of the name, case-insensitive.',
			limit: 'Whole number from 1; default 50, capped at 500.',
		},
		example: { kind: 'news', query: 'cpi' },
	},
	{
		name: 'createPosition',
		type: 'write',
		summary: 'Record a new position. Missing accounts, symbols and linked notes are created; a failure is rolled back, except METADATA_TIMEOUT, which keeps the written files (listed in error.details.keptPaths): check them before retrying.',
		fields: {
			symbol: 'Instrument exactly as written or shown. Required.',
			account: 'Account or exchange name; created when missing.',
			platform: 'Only when creating an account whose name is not the exchange.',
			createAccount: 'true to confirm a new account after a typo warning.',
			side: 'LONG | SHORT (buy / sell also accepted); inferred from prices when omitted.',
			entry_price: 'Positive number.',
			stop_loss: 'Positive number.',
			target_price: 'Positive number.',
			exit_price: 'Positive number; closes the position.',
			amount: 'Crypto size in coins, positive.',
			notional_value: 'Crypto size in USD, positive.',
			lots: 'CFD size, 0.01-20 in steps of 0.01.',
			contract: 'Futures contracts, whole number from 1 to 20.',
			opened_at: 'YYYY-MM-DD HH:mm[:ss] or ISO 8601; without an offset the LucrJournal time zone applies. Defaults to now.',
			closed_at: 'Same formats.',
			confidence: 'Integer 1-5.',
			playbook: 'Name of an existing playbook.',
			template: 'Name of an existing position template.',
			links: '{ key_levels: [], confluence: [], market_analysis: [], news: [] } - note names; missing ones are created.',
			notes: 'Markdown appended under "# Notes"; no level-1 headings.',
			attachments: 'Array of absolute image paths, { sourcePath } or { base64, fileName } objects.',
			dryRun: DRY_RUN,
		},
		example: { symbol: 'sol', entry_price: 142, stop_loss: 138, links: { news: ['CPI beat'] } },
	},
	{
		name: 'updatePosition',
		type: 'write',
		summary: 'Change fields of an existing position, close or reopen it, and append to its notes. Derived fields (profit, risk, fee) are recalculated by the plugin.',
		fields: {
			position: POSITION_REF,
			entry_price: 'Positive number.',
			stop_loss: 'Positive number; null clears it.',
			target_price: 'Positive number; null clears it.',
			exit_price: 'Positive number; also closes the position.',
			amount: 'Crypto size in coins, positive.',
			notional_value: 'Crypto size in USD, positive.',
			lots: 'CFD size, 0.01-20 in steps of 0.01.',
			contract: 'Futures contracts, whole number from 1 to 20.',
			opened_at: 'YYYY-MM-DD HH:mm[:ss] or ISO 8601; without an offset the LucrJournal time zone applies.',
			closed_at: 'Same formats; also closes the position.',
			confidence: 'Integer 1-5; null clears it.',
			status: 'close (or closed) | open. "open" reopens the position and clears exit_price and closed_at; it cannot be combined with exit_price or closed_at.',
			notes: 'Markdown appended under "# Notes"; existing text is kept.',
			ifRev: IF_REV,
			dryRun: DRY_RUN,
		},
		example: { position: 'POS-00012', exit_price: 150, notes: 'Closed at the range high.' },
	},
	{
		name: 'addAttachments',
		type: 'write',
		summary: 'Store images in the dated attachments folder and reference them from an existing position.',
		fields: {
			position: POSITION_REF,
			attachments: 'Array of absolute image paths, { sourcePath } or { base64, fileName } objects (png, jpg, jpeg, webp, gif; up to 20 MB each). Prefer paths. Required.',
			ifRev: IF_REV,
			dryRun: DRY_RUN,
		},
		example: { position: 'POS-00012', attachments: ['/Users/me/Desktop/chart.png'] },
	},
	{
		name: 'removeAttachment',
		type: 'write',
		summary: 'Remove one image reference from a position. The image file is kept.',
		fields: { position: POSITION_REF, attachment: 'Token, path or file name from getPosition `attachments`. Required.', ifRev: IF_REV, dryRun: DRY_RUN },
		example: { position: 'POS-00012', attachment: 'chart.png' },
	},
	{
		name: 'saveAttachment',
		type: 'write',
		summary: 'Store one image without attaching it to a position; returns the wikilink to embed in another note.',
		fields: { sourcePath: 'Absolute path to an image. One of sourcePath / base64.', base64: 'Image bytes; needs fileName.', fileName: 'Name with an image extension.', dryRun: DRY_RUN },
		example: { sourcePath: '/Users/me/Desktop/chart.png' },
	},
	{
		name: 'linkContext',
		type: 'write',
		summary: 'Link a news / key level / confluence / market analysis note into an existing position. A note that does not exist yet is created with only its name.',
		fields: { position: POSITION_REF, kind: KIND_CONTEXT, name: 'Title of the note to link. Required.', ifRev: IF_REV, dryRun: DRY_RUN },
		example: { position: 'POS-00012', kind: 'news', name: 'CPI beat' },
	},
	{
		name: 'unlinkContext',
		type: 'write',
		summary: 'Remove one linked note from a position. The note itself is kept.',
		fields: { position: POSITION_REF, kind: KIND_CONTEXT, name: 'Title of the linked note. Required.', ifRev: IF_REV, dryRun: DRY_RUN },
		example: { position: 'POS-00012', kind: 'key_level', name: 'Range high' },
	},
	{
		name: 'setPlaybook',
		type: 'write',
		summary: 'Set or replace the playbook of a position.',
		fields: { position: POSITION_REF, playbook: 'Name of an existing playbook. Required.', ifRev: IF_REV, dryRun: DRY_RUN },
		example: { position: 'POS-00012', playbook: 'Breakout' },
	},
	{
		name: 'removePlaybook',
		type: 'write',
		summary: 'Clear the playbook of a position.',
		fields: { position: POSITION_REF, ifRev: IF_REV, dryRun: DRY_RUN },
		example: { position: 'POS-00012' },
	},
	{
		name: 'createEntry',
		type: 'write',
		summary: 'Create a standalone news / key level / confluence / market analysis note with its fields and body text.',
		fields: {
			kind: KIND_CONTEXT,
			name: 'Title; becomes the file name. Required.',
			description: 'Short description.',
			source: 'News only: http(s) URL. The plugin tries to fetch the article text into the body like the UI; the note is created even when that fails.',
			impact: 'News only: high | medium | low.',
			tags: 'Array of tags.',
			public: 'Confluence only: false keeps it out of the public confluence list.',
			body: 'Markdown appended to the note; no level-1 headings.',
			dryRun: DRY_RUN,
		},
		example: { kind: 'news', name: 'CPI beat', source: 'https://example.com/cpi', impact: 'high', tags: ['macro'] },
	},
	{
		name: 'updateEntry',
		type: 'write',
		summary: 'Change fields of a news / key level / confluence / market analysis / playbook note and append to its body.',
		fields: {
			entry: ENTRY_REF,
			kind: 'Optional kind to disambiguate a name.',
			description: 'Short description; null clears it.',
			source: 'News only.',
			impact: 'News only: high | medium | low; null clears it.',
			tags: 'Replaces the tag list; [] clears it. Not for playbooks.',
			public: 'Confluence only; true or false (null means false).',
			body: 'Markdown appended to the note; existing text is kept. Do not use it on playbooks: saving playbook criteria replaces the body.',
			dryRun: DRY_RUN,
		},
		example: { entry: 'CPI beat', kind: 'news', impact: 'medium' },
	},
	{
		name: 'createPlaybook',
		type: 'write',
		summary: 'Create a playbook with its criteria groups. Missing confluence and criteria notes are created with it.',
		fields: {
			name: 'Title. Required.',
			description: 'Short description.',
			criteria: 'Array of { name, confluences: [names] }; every group needs at least one confluence, and a confluence may appear only once per playbook.',
			dryRun: DRY_RUN,
		},
		example: { name: 'Breakout', criteria: [{ name: 'Trend', confluences: ['HTF trend', 'Break of structure'] }] },
	},
	{
		name: 'updatePlaybook',
		type: 'write',
		summary: 'Change a playbook description and/or replace its whole criteria structure. Replacing criteria rewrites the playbook body.',
		fields: { playbook: 'Name of an existing playbook. Required.', description: 'Short description; null clears it.', criteria: 'Full replacement, same shape as createPlaybook.', dryRun: DRY_RUN },
		example: { playbook: 'Breakout', criteria: [{ name: 'Trend', confluences: ['HTF trend'] }] },
	},
	{
		name: 'createTemplate',
		type: 'write',
		summary: 'Create a position template.',
		fields: { name: 'Title. Required.', body: 'Template text; may contain the position sections such as "# Notes".', dryRun: DRY_RUN },
		example: { name: 'Swing setup', body: '# Notes\n\n## Thesis\n\n## Invalidation\n' },
	},
	{
		name: 'updateSymbol',
		type: 'write',
		summary: 'Change the trading parameters of a symbol.',
		fields: {
			symbol: 'Symbol name or path. Required.',
			account: 'Account name, when the symbol exists on several accounts.',
			type: 'Crypto_Perp | Crypto_Spot | Future | CFD.',
			fee_value: 'Positive number that fits the symbol type.',
			contract_unit: 'Positive whole number; CFD symbols only.',
			dryRun: DRY_RUN,
		},
		example: { symbol: 'XAUUSD', fee_value: 7 },
	},
	{
		name: 'renameEntry',
		type: 'destructive',
		summary: 'Rename a news / key level / confluence / market analysis / playbook note; every link to it is updated. Two calls: preview, then confirm.',
		fields: { entry: ENTRY_REF, kind: 'Optional kind to disambiguate a name.', newName: 'New title. Required.', confirmToken: CONFIRM },
		example: { entry: 'Confluence A', newName: 'HTF trend' },
	},
	{
		name: 'deleteEntry',
		type: 'destructive',
		summary: 'Move an entry to the trash together with whatever the UI deletes with it (an account takes its symbols and positions). Two calls: preview, then confirm. Always show the user the scope first, including `linksLeftBroken`: notes that will keep a link to the deleted entry.',
		fields: { entry: ENTRY_REF, kind: 'Optional kind to disambiguate a name.', confirmToken: CONFIRM },
		example: { entry: 'Binance', kind: 'account' },
	},
	{
		name: 'open',
		type: 'read',
		summary: 'Show an entry to the user in Obsidian: positions and playbooks in their own views, other notes as Markdown.',
		fields: { entry: 'Path or unique note name. Required.' },
		example: { entry: 'POS-00012' },
	},
	{
		name: 'openPosition',
		type: 'read',
		summary: 'Show a position in its view (kept for the commands createPosition returns).',
		fields: { path: 'Vault-relative path of the position. Required.' },
		example: { path: 'LucrJournal/positions/POS-00012.md' },
	},
	{
		name: 'checkHealth',
		type: 'read',
		summary: 'Audit LucrJournal/: notes hidden by invalid properties, broken links, duplicate names, unreferenced or mismatched attachments. Reports only.',
		fields: {},
		example: {},
	},
	{
		name: 'listAgentActivity',
		type: 'read',
		summary: 'List what the agent changed in this Obsidian session, newest first. The log is cleared when Obsidian restarts.',
		fields: { limit: 'Whole number from 1; default 20, capped at 50.' },
		example: {},
	},
	{
		name: 'undo',
		type: 'write',
		summary: 'Revert one agent operation: restores edited notes and trashes notes it created. Refuses when those notes changed afterwards (undo later operations first, newest first); renames and deletions cannot be undone.',
		fields: { id: 'Activity id from listAgentActivity; omit for the latest operation.' },
		example: { id: 'act-0003' },
	},
]

export function describeAgentApi(version: number) {
	return {
		data: {
			version,
			rules: [
				'Never create, edit, move or delete files under LucrJournal/ directly; use these operations.',
				'Read before you write: the user edits the same journal in Obsidian. Pass `rev` back as `ifRev`.',
				'Every result is { ok: true, ... } or { ok: false, error: { code, message, fix } }; follow `error.fix`.',
				'Destructive operations return `needsConfirmation: true` first; show the scope to the user before confirming.',
			],
			operations: AGENT_OPERATIONS,
		},
	}
}
