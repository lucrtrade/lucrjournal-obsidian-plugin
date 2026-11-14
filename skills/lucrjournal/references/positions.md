# Positions

## Log a trade (`createPosition`)

Extract only what the user said or a screenshot shows; leave every other field out. The plugin fills the rest.

| Field | What to pass |
| --- | --- |
| `symbol` | The instrument exactly as written or shown (`sol`, `BTC/USDT`, `SOL-PERP`, `XAUUSD`). The only required field; ask only when there is no hint at all. When the user says perpetual / 永续 but the symbol has no perpetual marker, pass it with one (`SOLUSDT.P`) and check `data.resolved.symbol.type` is `Crypto_Perp`. If they only say 合约 and it is not clear whether a perpetual or a dated future is meant, ask; if they leave it to you, use the perpetual on a crypto exchange and say so. |
| `account` | Account or exchange name; translate exchange names to their English brand (币安 → `Binance`, 欧易 → `OKX`). A name that does not exist yet is created as a new account, unless it looks like a typo of an existing one: then `ACCOUNT_NOT_FOUND` names the candidate, and you pass `createAccount: true` only after the user confirms it is new. Omit `account` when the user names none: the plugin picks one when it can (the only account, the one that already has the symbol, or the most recently used account of the right asset class) and says why in `data.resolved.account.reason`; otherwise it returns `ACCOUNT_REQUIRED` with candidates, or `NO_ACCOUNT` when the vault has none. Mention an inferred account in your report. |
| `platform` | Only when creating an account whose name is not the exchange (account `FTMO Challenge` on `MetaTrader`). |
| `createAccount` | `true` only after an error said the name looks like a typo and the user confirms it is a new account. |
| `side` | `LONG` / `SHORT` (buy / sell accepted). Omit when the user gave no direction but a stop or target shows it (stop below entry = long); the plugin infers it. If neither the words nor the prices show the direction, ask: the plugin would record `LONG`. |
| `entry_price` `stop_loss` `target_price` `exit_price` | Positive numbers. `exit_price` closes the position. |
| `amount` / `notional_value` | Crypto size, a positive number, optional: coins (0.5 BTC) or USD — pass one of them only if the user gave a size. |
| `lots` | CFD / MetaTrader size, 0.01–20 in steps of 0.01. |
| `contract` | Futures contracts, a whole number from 1 to 20. |
| `opened_at` `closed_at` | As shown, seconds optional, e.g. `YYYY-MM-DD HH:mm[:ss]` (read in the time zone set in LucrJournal settings, which may differ from the machine's) or ISO 8601 (`2026-11-14T10:00:00`, offset optional; without one the LucrJournal time zone applies). `closed_at` alone also closes the position. `opened_at` defaults to now. For "今天上午十点" use today's date in the user's time zone with an explicit offset. A date without a time is rejected: omit the field when the user gives no time. |
| `confidence` | Integer 1–5. |
| `playbook` `template` | Names of existing ones, only when the user names them. |
| `links` | `{ "news": [], "confluence": [], "key_levels": [], "market_analysis": [] }`. Resolve the names first as in [context.md](context.md); missing names are created as empty notes. |
| `notes` | The user's reasoning as Markdown. It lands under the position's `# Notes`, so use `##` or deeper for sub-headings. |
| `attachments` | Absolute image paths or `{ "sourcePath": "..." }` objects. `{ "base64": "...", "fileName": "chart.png" }` also works but makes the command line long; prefer a file. |
| `dryRun` | `true` when the user wants a preview. |

The result has `data.path`, `data.resolved` (account, symbol, side and why; which linked notes were created) and, after a real create, `data.open` (a dry run has no `data.open` and no `activityId`, and its `path` is a forecast: the real id can be higher if another position is created in between).

**Open it for the user** by running `data.open.bash` (bash / zsh / Git Bash) or `data.open.powershell` exactly as given. It brings Obsidian forward on the position; `ok: true` with `viewType: "lucrjournal-position-view"` proves it is open even when the OS keeps Obsidian in the background or the shell reports that no application handles `obsidian://` URLs.

## Find positions

- `listPositions` filters by `symbol` (substring), `account`, `status` (`open` / `closed`; `close` is accepted too), `side`, `from` / `to` (opened_at), `playbook`, `limit`. Newest first. `from` / `to` take the same formats as `opened_at`, read in the LucrJournal time zone unless they carry an offset; a date-only `from` starts at 00:00 and a date-only `to` ends at 23:59:59.
- `getPosition({ position })` takes `POS-00012`, `12`, or the path. It returns the fields, `links` per kind, `attachments`, the notes text and `rev`. Use `rev` to tell whether a note changed, not `modified`: when `modified` updates depends on a LucrJournal setting.
- Relative dates are in the user's time zone: "本周" is Monday 00:00 until now, "今天" is today 00:00 until now. Pass both ends (`from` alone has no upper bound), with an explicit offset when the user's time zone differs from LucrJournal's.
- "我今天开的 SOL 仓位" → `listPositions({ symbol: "sol", from: "<today> 00:00", to: "<now>" })`. If several match, ask which one.
- "这笔" / "ETH 那笔" later in a conversation means the position you created or found earlier in it, not the newest match in the vault. If that is not clear, ask before writing.

## Change a position (`updatePosition`)

1. `getPosition` → keep `rev`.
2. `updatePosition({ position, ifRev: rev, ...changes })`.
3. On `CONFLICT` the user edited the note meanwhile: `getPosition` again, re-check that the change still makes sense, retry with the new `rev`.

- **Close**: pass `exit_price` and/or `closed_at` — either one closes the position, so a close time without a price works too. Profit, risk and fee are recalculated from what is known.
- **Reopen**: `status: "open"` clears `exit_price`, `closed_at` and profit. It cannot be combined with them in one call. Notes appended when closing stay; no operation removes note text, so tell the user.
- **Notes**: `notes` is appended under `# Notes`; existing text stays.
- `null` clears `stop_loss`, `target_price`, `confidence`.
- `stop_loss` and `target_price` are optional; the ones given must fit the side: a long needs stop < entry < target, a short target < entry < stop. A stop on the far side of the entry (a long's stop moved above entry to lock in profit) is rejected with `RISK_DIRECTION`. Tell the user the journal does not support it yet and keep the old stop; record the new stop in `notes` if they want.

## Images on a position

- Add: `addAttachments({ position, attachments: ["/abs/path/chart.png"] })`. The plugin copies the file into `LucrJournal/attachments/YYYY-MM/` with a timestamped name and links it. Never invent paths there.
- Remove: `removeAttachment({ position, attachment })` with the token, path or file name from `getPosition.attachments`. The image file stays; `checkHealth` lists it as unreferenced when no other note uses it.
- `png`, `jpg`, `jpeg`, `webp`, `gif`, up to 20 MB each.

## Show something to the user

`open({ entry })` opens a position or playbook in its own view and any other note as Markdown.
