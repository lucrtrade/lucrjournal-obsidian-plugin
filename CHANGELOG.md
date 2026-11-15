# Changelog

## [Unreleased]

## [0.1.19]

- Agent API: once the vault has accounts, `createPosition` (and its `dryRun`) no longer creates a second account for a name that matches none of them (币安 next to Binance); it returns `ACCOUNT_NOT_FOUND` with the lookalikes, or every existing account, as `candidates`, and creates the account only with `createAccount: true`. A vault with no account yet still creates it directly
- Agent API: `describe()` returns the same six rules as the skill, adding "search before you create", "change only what the user means" and "pass what the user said, raw"; the result format moved to `results`
- Skill: explain when to retry `ACCOUNT_NOT_FOUND` with a candidate, when to pass `createAccount: true` and report the new account, and when to ask the user

## [0.1.18]

- Agent API v2: `describe()` plus read operations (`listPositions`, `getPosition`, `listEntries`, `checkHealth`, `listAgentActivity`)
- Agent API v2: edit existing positions (`updatePosition`, `addAttachments`, `removeAttachment`, `linkContext`, `unlinkContext`, `setPlaybook`, `removePlaybook`)
- Agent API v2: manage context notes, playbooks, templates and symbols (`createEntry`, `updateEntry`, `createPlaybook`, `updatePlaybook`, `createTemplate`, `updateSymbol`), open any entry (`open`)
- Agent API v2: `renameEntry` and `deleteEntry` run as preview then confirm; every write is rolled back on failure, logged for the session and revertible with `undo`
- Skill: one `lucrjournal` skill replaces `lucrjournal-create-position` and covers every agent API v2 operation through `scripts/lucr.sh` / `scripts/lucr.ps1`; install it with `npx skills add lucrtrade/lucrjournal-obsidian-plugin`, and remove the old skill (`npx skills remove lucrjournal-create-position`, or delete its folder)

## [0.1.17]

- Unify attachments: `createPosition({ attachments })` and `api.saveAttachment` now share one pipeline, so a position also accepts `{ base64, fileName }` entries and both use the same dated path, timestamped name and `-2` collision rule
- Skill: document that positions and notes use the same attachment pipeline

## [0.1.16]

- Add `api.saveAttachment({ sourcePath | base64 + fileName })`: stores an image in `LucrJournal/attachments/YYYY-MM/` with the same timestamped naming and `-2` collision rule as the editor, and returns the `token` / `embed` wikilink for any note
- Skill: document `saveAttachment` so an agent never invents an attachment path and never drops images in the attachments root

## [0.1.15]

- Keep the dry-run preview's position frontmatter keys identical to the written note (`profit:`, `risk:` are no longer dropped)
- macOS opener asks macOS to focus Obsidian without letting a missing or renamed `Obsidian.app` break the verification step
- Skill: explain spot vs perpetual symbol alignment, timestamps in the plugin's own time zone, `error.field` / `error.received`, and why `plugin.api.version` (agent API, `1`) is not `plugin.manifest.version`
- Skill: describe macOS window activation as best-effort instead of promising it

## [0.1.14]

- Add the `lucrjournal-create-position` agent skill and the plugin API it drives
- Refuse agent writes while the journal is locked, and keep rollback scoped to the files a call created
- Fix the Windows Git Bash opener, cross-vault position links, and leftover empty view tabs
## [0.1.13]

- Support pre-release CI publishing with immutable release policy
- Hide `lucrjournal` folder

## [0.1.12]

- Fix time

## [0.1.11]

- Improve OCR

## [0.1.10]

- Initial version
