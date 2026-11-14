# Undo, audit and troubleshooting

## Undo an agent change

- `listAgentActivity({ limit? })` lists what agents changed in this Obsidian session, newest first: `id`, `at` (time), `operation`, `summary`, `created` / `modified` / `removed` (paths), `undoable`, `undone`. `undoable` says whether that kind of operation can be undone; a later change can still block it, and `undo` then says why. It is empty after Obsidian restarts, and it also holds other agents' work in the same session: to report or undo your own changes, go by the `activityId`s your calls returned, and leave unknown entries alone.
- `undo({ id })` restores the notes the operation edited and trashes the notes it created. Without `id` it undoes the latest operation. The result's `data` is that activity (`data.id`).
- `CONFLICT` means a later change touched the same notes; follow `error.fix`:
  - Later agent operations that can be undone (`details.laterOperations`): undo them first, newest first, but only if the user wants those undone too.
  - A later rename or deletion: it cannot be undone, so neither can this operation. Make the change forward instead: `getPosition`, then e.g. `updatePosition({ status: "open" })` to reverse a close, and tell the user what you did.
  - No later operations: the user edited the notes (`details.changedSince`). Do not overwrite their edits. When the operation changed only fields (a price, a stop, the status), you can reverse those fields with `updatePosition` and the latest `rev`, which keeps the user's text; tell the user. Otherwise tell them and let them decide.
  - `details.linkedFrom`: another note now links to a note this operation created. Unlink it first, or keep the note.
- Renames and deletions cannot be undone; deleted notes are in the trash.

## Audit the journal

`checkHealth()` reports, without changing anything: notes hidden by invalid properties, broken links, duplicate names, and unreferenced or mismatched attachments. Each issue has a `fix`. Fixes that need hand-editing a note are for the user to do in Obsidian; tell them rather than editing files.

## Errors

The script's exit code 1 means LucrJournal answered `ok: false`; 2 means no usable answer came back (CLI missing, vault not found, Obsidian not responding). After a 2 the operation may still have run: check before retrying a write. Stop after one failed retry and tell the user what you saw.

| Symptom / code | Cause | What to do |
| --- | --- | --- |
| `OBSIDIAN_CLI_MISSING`, `obsidian: command not found` | The Obsidian CLI is not registered (Obsidian 1.12+). | Ask the user to enable Settings → General → Command line interface, then open a new terminal. |
| The call hangs | Obsidian shows a modal dialog, which blocks every CLI call, or it is still starting. | Stop the call and ask the user to look at Obsidian and close the dialog. Do not repeat a write: once the CLI answers again, check with one `getPosition` / `listEntries` whether it happened. |
| `Vault not found.` (plain text, exit 2) | No vault has that name. | Ask the user for the vault name; do not guess or list vaults. |
| A vault the user did not mean opened | `--vault` launches a closed vault. | Use only names the user gave or `data.vault.id` from a result. |
| `LUCRJOURNAL_NOT_LOADED_HERE` | The vault does not run LucrJournal. | Ask which vault; rerun with `--vault`. |
| `LUCRJOURNAL_API_TOO_OLD` | The installed plugin predates this skill. | Ask the user to update LucrJournal (Settings → Community plugins → Check for updates), then retry in the same vault. |
| `JOURNAL_LOCKED` from a write or read | Not signed in to LucrJournal in this vault, or signed in but without journal access (e.g. the plan expired). | Nothing was written. Tell the user what `error.message` says (sign in, or restore access), then rerun the same call. |
| `JOURNAL_LOCKED` from `open` / `openPosition` / `data.open` | The note is saved; only showing it failed. | **Do not repeat `createPosition`.** Ask the user to restore access, then open the existing position. |
| `UNKNOWN_FIELD`, `INVALID_VALUE` | A field name or value is wrong. | Check `error.field` against `describe`, fix, retry. |
| `*_NOT_FOUND`, `*_AMBIGUOUS` | No match, or several. | Use `error.candidates` when present, otherwise `error.fix`; ask the user when it is not obvious. |
| `NAME_CONFLICT` | Another LucrJournal note, of any kind, already has that name. | Reuse that note if it is the same thing, or choose a more specific name. |
| `RISK_DIRECTION` | The stop, entry and target that were given conflict with the side or with each other. | Ask the user which value is wrong; do not swap values yourself. |
| `QUANTITY_CONFLICT` | More than one size field was passed, or the field does not fit the symbol type (e.g. `amount` on a future). | Pass exactly the one size field `error.fix` names for that symbol type. |
| `CONFLICT` (position write) | The note changed since your `getPosition`. | Read again, re-check, retry with the new `rev`. |
| `CONFIRMATION_INVALID` | The token is used, belongs to another preview, or the scope changed. | Preview again and show the user the new scope. |
| `METADATA_TIMEOUT` | Obsidian did not index the write in time (busy indexing or syncing). | From `createPosition`: the files were kept (`details.keptPaths`); check them before any retry, or you create a duplicate. From other writes: follow `error.message` / `error.fix`. |
| `POST_WRITE_VERIFY_FAILED` | The written note did not read back as planned; it was rolled back. | Tell the user `error.message`; retry at most once. |
| `INTERNAL_ERROR` | An unexpected error. | Tell the user `error.message` and stop; do not retry. |
| `ROLLBACK_FAILED` | The write failed and some files could not be restored. | Tell the user the exact paths in `error.details.leftovers`; do not retry until they have checked them. |
| Times in an unexpected offset | LucrJournal uses the time zone from its settings, not the machine's. | Expected. Pass ISO 8601 with the source offset when it matters (e.g. MetaTrader server time). |
| Open printed `ok: true` but Obsidian stayed behind | The OS blocked focus stealing. | The position is open; tell the user to switch to Obsidian. |

## References

- Obsidian CLI: https://obsidian.md/help/cli
- LucrJournal plugin and this skill: https://github.com/lucrtrade/lucrjournal-obsidian-plugin
- Agent API source (fields, rules, error codes): https://github.com/lucrtrade/lucrjournal-obsidian-plugin/tree/main/src/agent-api
