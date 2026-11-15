import { LUCR_TRADE_ROOT_DIR } from '../constant'

type AgentRule = {
	/** The rule itself. It reads the same in describe(), in the skill and in the vault's AGENTS.md. */
	rule: string
	/** How to follow it with these operations; the skill explains it with its scripts instead. */
	api: string
}

const SKILL_NAME = 'lucrjournal'

const NO_FILE_EDITS: AgentRule = {
	rule: `Never create, edit, move, rename or delete anything under \`${LUCR_TRADE_ROOT_DIR}/\` yourself.`,
	api: 'Change the journal only through these operations; hand-made links and properties are what breaks it. If no operation does what the user wants, say so.',
}

/**
 * The one list of rules an agent follows when it works on the journal.
 * `describe()` serves it, the numbered Rules of `skills/lucrjournal/SKILL.md`
 * open with the same sentences in the same order (a test compares them), and
 * the vault's AGENTS.md section repeats the first one. Change a rule here and
 * in the skill together.
 */
export const AGENT_RULES: readonly AgentRule[] = [
	NO_FILE_EDITS,
	{
		rule: 'Search before you create.',
		api: 'Before linking or creating a news, key level, confluence or market analysis note, find the existing ones with listEntries and reuse a match; linkContext turns any name it does not find into a new, empty note.',
	},
	{
		rule: 'Change only what the user means.',
		api: 'Notes you did not create in this conversation belong to the user: change one only when the user names it or confirms it. When a reference fits several positions or notes, list them and ask.',
	},
	{
		rule: 'Read before you change.',
		api: 'The user edits the same journal in Obsidian: call getPosition before changing a position and pass its `rev` as `ifRev` to every operation that accepts it.',
	},
	{
		rule: 'Destructive operations need the user\'s yes.',
		api: 'renameEntry and deleteEntry first return `needsConfirmation: true` with a scope and a one-time token; show the scope to the user and pass the token only after they agree.',
	},
	{
		rule: 'Pass what the user said, raw.',
		api: 'The plugin resolves symbols, accounts, sides and times and computes profit, risk and fees, so pass the user\'s values rather than your own calculations; translating an exchange name into its English brand is fine.',
	},
]

/**
 * The LucrJournal section of the vault's AGENTS.md. Agents read that file
 * whenever they start in the vault, before they decide whether a skill is
 * relevant, so it only routes them to the skill and forbids the one thing that
 * breaks the journal; the skill carries the rest. The markers let a later
 * plugin version replace this section without touching the user's own text.
 */
export function buildVaultAgentInstructions(): string {
	return [
		'<!-- lucrjournal:start -->',
		'## LucrJournal',
		'',
		`\`${LUCR_TRADE_ROOT_DIR}/\` is the user's trading journal, kept by the LucrJournal plugin. Its notes link to each other through properties and headings that only the plugin keeps consistent.`,
		'',
		`- Before acting on any request about trading positions, news, key levels, confluences, market analyses, playbooks, templates, symbols, accounts or anything under \`${LUCR_TRADE_ROOT_DIR}/\`, load the \`${SKILL_NAME}\` skill and follow it.`,
		`- ${NO_FILE_EDITS.rule} Change the journal only through the \`${SKILL_NAME}\` skill.`,
		'- If the skill is not available, or it cannot do what the user asks, tell the user; never fall back to editing the files.',
		'<!-- lucrjournal:end -->',
	].join('\n')
}
