---
name: lucrjournal
description: Read and change the user's LucrJournal trading journal in Obsidian through the plugin's agent API — never by editing files. Use whenever the user wants to log, find, open, update, close or reopen a trading position; link or unlink news, key levels, confluences or market analyses to a position; create or edit those notes; manage playbooks, criteria, templates or symbol fees; attach a chart or screenshot; rename or delete journal entries; undo an agent change; or check the journal for broken links. Triggers include "帮我记这个仓位", "我今天在 142 开了 SOL 多单", "把今天的新闻关联到这个仓位", "平仓", "新建一个 confluence", "改一下策略手册", "撤销刚才的修改", "log this trade", "close POS-00012", "link this news", a pasted chart or broker screenshot, or any request touching the `LucrJournal/` folder of a vault.
---

# LucrJournal

LucrJournal stores a trading journal as linked Markdown notes under `LucrJournal/` in an Obsidian vault. The plugin exposes an agent API inside the running Obsidian that does what the UI does: it resolves symbols and accounts, keeps links and properties consistent, validates input, and undoes a failed write where it can. You call it through `scripts/lucr.sh` (bash, zsh, Git Bash) or `scripts/lucr.ps1` (PowerShell).

## Rules

1. **Never create, edit, move, rename or delete anything under `LucrJournal/` yourself** — no file tools, no `obsidian create` / `append` / `move`, no scripts of your own; only this skill's `lucr.sh` / `lucr.ps1`. Hand-made links and properties are exactly what breaks the journal. If no operation does what the user wants, say so.
2. **Search before you create.** Before linking or creating a news / key level / confluence / market analysis note, list the existing ones and reuse a match. `linkContext` reuses a note of the same kind only when its name matches (case, `.md` and reserved characters aside; a vault path works too); any other name silently becomes a new, empty note, or a `NAME_CONFLICT` if another kind uses that name. A `LucrJournal/...` path that does not exist returns `ENTRY_NOT_FOUND`.
3. **Change only what the user means.** "这笔" / "that trade" is the position this conversation is about (the one you just created or found). Notes you did not create in this conversation belong to the user: change one only when the user names it or confirms it. When a reference could mean several positions, list them and ask.
4. **Read before you change.** Before changing a position, call `getPosition` and pass its `rev` as `ifRev` to every operation that accepts it; the user edits the same journal in Obsidian.
5. **Destructive operations need the user's yes.** `renameEntry` and `deleteEntry` first return a scope and a token. Show the scope — for a rename `scope.rename` and `scope.linksUpdatedIn`, for a delete everything including `linksLeftBroken` — and confirm only after the user agrees.
6. **Pass what the user said, raw.** The plugin normalizes symbols (`sol` → `SOLUSDT.P` on a perpetual account), accounts (币安 → Binance is fine to translate; spelling is checked), sides and times. Do not compute derived fields (profit, risk, fee); the plugin does.

## Calling the API

Every call runs one operation, with one JSON object when the operation takes input:

```
scripts/lucr.sh [--vault <name>] <operation> [<input.json> | -]
```

Put the JSON in a quoted heredoc so quotes, Chinese and newlines pass through untouched:

```bash
scripts/lucr.sh --vault Trading createPosition - <<'EOF'
{ "symbol": "sol", "side": "LONG", "entry_price": 142, "stop_loss": 138, "links": { "news": ["CPI beat"] } }
EOF
```

In PowerShell, write the JSON to a UTF-8 file and pass its path. `-ExecutionPolicy Bypass` lets the script run where the local execution policy blocks it (a Group Policy can still forbid it):

```powershell
@'
{ "symbol": "sol", "side": "LONG", "entry_price": 142, "stop_loss": 138 }
'@ | Set-Content -Encoding utf8 $env:TEMP\lucr-input.json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lucr.ps1 -Vault Trading createPosition $env:TEMP\lucr-input.json
```

- `scripts/...` is relative to this skill's directory; use its absolute path when you run from elsewhere. An input file path is relative to your current directory; image `sourcePath`s must be absolute.
- Add `--vault <name>` (PowerShell: `-Vault <name>`) when the user names a vault; otherwise the CLI uses the active one. Never guess vault names: `vault=` opens a closed vault.
- Operations without input take no JSON: `scripts/lucr.sh --vault Trading describe`.
- Run each call with a 60 s timeout and run calls one at a time.
- **Images**: pass an absolute file path (`sourcePath`). If the image exists only in the conversation, save it to a temporary file first. Base64 makes the command line long enough to fail on Windows.
- The input travels on the command line in both shells, so keep one call's JSON under about 20 KB of UTF-8 (a Chinese character is 3 bytes, so roughly 6,000 Chinese characters); append a longer `body` or `notes` in several calls.

A LucrJournal answer is printed as one line of JSON; a CLI or Obsidian problem may print plain text instead. Exit code 0 = `ok: true`, 1 = `ok: false` (read the error), 2 = no usable answer came back (see [troubleshooting](references/troubleshooting.md)); the operation may still have run. Never repeat a write blindly after an unclear result: check with `getPosition` / `listEntries` whether it happened first.

**Start each session with `describe` in the target vault** (`scripts/lucr.sh [--vault <name>] describe`). It lists every operation of the installed plugin version with its fields and an example. When it and this skill disagree about which operations or fields exist, trust `describe`; the references add limits and details it only summarizes.

## Reading results

- `{ ok: true, data }`: done. A write that changed something also carries a top-level `activityId`, its id in the activity log (`undo` instead returns the undone activity as `data`, with `data.id`); `unchanged: true` means nothing needed writing, and there is no `activityId`. Renames and deletions get an id too but cannot be undone (see `undoable` in `listAgentActivity`).
- `{ ok: true, dryRun: true, data }`: a preview; nothing was written. Writes accept `dryRun: true` — use it when the user says 预览 / 先看看 / dry run — except `renameEntry` and `deleteEntry` (they preview by themselves, see below) and `undo` (no preview).
- `{ ok: true, needsConfirmation: true, data: { scope, confirmToken } }`: a destructive preview (see Rules). The token works once, only for that scope.
- `{ ok: false, error: { code, message, fix, field?, received?, candidates?, details? } }`: usually nothing was written; the exceptions are `ROLLBACK_FAILED` (leftovers listed) and `METADATA_TIMEOUT` from `createPosition` (files kept, see `details.keptPaths`). Do what `error.fix` says. When the error has `candidates` (often on `*_AMBIGUOUS`, `*_NOT_FOUND` and typo warnings), retry by yourself only when one is plainly what the user meant in another spelling or language; otherwise ask one question built from `message` and `candidates`. For other errors follow `error.fix` and the recovery steps in the references. `details.additionalErrors` lists further problems: settle them all in one retry or question.

## What to read next

| The user wants to | Operations | Read |
| --- | --- | --- |
| Log a trade from a description or screenshot; find, open, update, close, reopen a position; add or remove images | `createPosition`, `listPositions`, `getPosition`, `updatePosition`, `addAttachments`, `removeAttachment`, `open` | [positions.md](references/positions.md) |
| Link today's news / confluences / analyses to a position; match what the user describes to existing notes or create them; edit those notes | `listEntries`, `linkContext`, `unlinkContext`, `createEntry`, `updateEntry`, `saveAttachment` | [context.md](references/context.md) |
| Playbooks and criteria, templates, symbol fees, rename or delete anything | `createPlaybook`, `updatePlaybook`, `setPlaybook`, `removePlaybook`, `createTemplate`, `updateSymbol`, `renameEntry`, `deleteEntry` | [playbooks-and-cleanup.md](references/playbooks-and-cleanup.md) |
| Undo an agent change, see what the agent did, audit the journal, or a call failed | `undo`, `listAgentActivity`, `checkHealth` | [troubleshooting.md](references/troubleshooting.md) |

## Reporting back

One or two lines in the user's language: what changed (position id, linked notes, which were reused and which were created), anything the plugin inferred (account, symbol, side), and the `activityId` when the change can be undone and the user may want to. Example: `已记录 POS-00012：Binance / SOLUSDT.P LONG @142，关联已有 Confluence "HTF trend"，新建 News "CPI beat"。`
