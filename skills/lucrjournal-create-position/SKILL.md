---
name: lucrjournal-create-position
description: Record a trading position in the user's LucrJournal Obsidian vault and open it. Use when the user asks to log, record or open a trade/position (e.g. "帮我记这个仓位", "新开一个 SOLUSDT 仓位", a pasted chart or broker screenshot, a short description of an entry), including a dry run / preview of what would be created.
---

# LucrJournal: create a position

The LucrJournal plugin does all resolution inside Obsidian: it aligns the symbol to the account's existing format (`sol` → `SOLUSDT.P`), creates missing accounts, symbols and analysis notes, infers account and side, validates everything, and rolls back on failure. Your job is to **extract** what the user gave and pass it through **raw**.

The happy path is two shell calls and zero questions: create, then open. Every command works in bash/zsh (macOS, Linux, Git Bash on Windows) and has a PowerShell form for Windows.

## 1. Extract

Read the conversation and any screenshot or pasted text. Fill only fields with evidence; leave everything else out.

| Field | Meaning |
| --- | --- |
| `symbol` | The instrument exactly as written or shown (`sol`, `BTC/USDT`, `SOL-PERP`, `XAUUSD`). The only field you need. |
| `account` | Account or exchange name; translate exchange names to their English brand (币安 → `Binance`, 欧易 → `OKX`). A missing account is created automatically. |
| `platform` | Only when creating an account whose name is not the exchange itself (account `FTMO Challenge` on `MetaTrader`). |
| `createAccount` | `true` only to confirm a new account after an error said the name looks like a typo and the user means a new one. |
| `side` | `LONG` / `SHORT` (buy/sell also accepted). Leave it out when the user gives no direction; the plugin infers it from prices or defaults to LONG. |
| `entry_price` `stop_loss` `target_price` `exit_price` | Plain numbers. `exit_price` closes the position. |
| `amount` / `notional_value` | Crypto size: `amount` = coin quantity (0.5 BTC), `notional_value` = size in USD. One of the two. |
| `lots` | CFD / MetaTrader size (0.01–20). |
| `contract` | Futures contracts (whole number). |
| `opened_at` `closed_at` | Times exactly as shown, seconds included: `YYYY-MM-DD HH:mm[:ss]` (read in the plugin time zone) or ISO 8601 with offset. `opened_at` defaults to now; `closed_at` stays empty unless shown. |
| `confidence` | Integer 1–5. |
| `playbook` `template` | Names of existing ones, only when the user names them. |
| `links` | `{ "key_levels": [], "confluence": [], "market_analysis": [], "news": [] }` — names mentioned as reasons; missing ones are created. |
| `notes` | The user's rationale or observations as Markdown body text; it lands under the position's own `# Notes` heading, so start with the content and use `##` or deeper for sub-headings. |
| `attachments` | Absolute paths of screenshot image files the user referenced on disk (`/Users/...` or `C:\...`). |
| `dryRun` | `true` when the user says dry run / 预览 / 试运行 / 先看看 / 别真的创建. |

Also extract the **vault**: when the user names an Obsidian vault ("在 lucrjournal 库里", "in my Trading vault"), the command in step 2 gets `vault="<that name>"` right after `obsidian`. Otherwise the CLI uses the active vault.

Ask the user only when there is no symbol hint at all.

## 2. Create (one call)

The vault must be signed in to LucrJournal. If it is not, the call returns `JOURNAL_LOCKED` and **nothing is written** — ask the user to sign in, then run the same call again.

**bash / zsh / Git Bash.** Put the input object into the quoted heredoc verbatim — it passes quotes, Chinese and newlines through untouched:

```bash
obsidian eval code="$(cat <<'EOF'
(function () {
	const plugin = app.plugins.plugins.lucrjournal;
	if (!plugin) {
		return { ok: false, error: { code: 'LUCRJOURNAL_NOT_LOADED_HERE', message: 'LucrJournal is not enabled in vault ' + app.vault.getName() + '.', fix: 'Ask the user to switch Obsidian to the vault that uses LucrJournal, or to name it; then rerun with vault=<name> right after obsidian.' } };
	}
	if (!plugin.api || typeof plugin.api.createPosition !== 'function') {
		return { ok: false, error: { code: 'LUCRJOURNAL_API_MISSING', message: 'LucrJournal is installed in vault ' + app.vault.getName() + ' but this plugin build has no agent API (it is older than this skill).', fix: 'Ask the user to update the LucrJournal plugin in Obsidian (Settings -> Community plugins -> Check for updates), then retry. Do not switch vaults.' } };
	}
	return plugin.api.createPosition({ "symbol": "sol", "entry_price": 142, "stop_loss": 138 });
})()
EOF
)"
```

**PowerShell (Windows).** PowerShell mangles double quotes inside native command arguments, so pass the input as base64 of its UTF-8 JSON; the `code=` argument then contains no double quotes:

```powershell
$json = @'
{ "symbol": "sol", "entry_price": 142, "stop_loss": 138 }
'@
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
obsidian eval "code=(function () { const plugin = app.plugins.plugins.lucrjournal; if (!plugin) { return { ok: false, error: { code: 'LUCRJOURNAL_NOT_LOADED_HERE', message: 'LucrJournal is not enabled in vault ' + app.vault.getName() + '.', fix: 'Ask the user to switch Obsidian to the vault that uses LucrJournal, or to name it; then rerun with vault=<name> right after obsidian.' } }; } if (!plugin.api || typeof plugin.api.createPosition !== 'function') { return { ok: false, error: { code: 'LUCRJOURNAL_API_MISSING', message: 'LucrJournal is installed in vault ' + app.vault.getName() + ' but this plugin build has no agent API (it is older than this skill).', fix: 'Ask the user to update the LucrJournal plugin in Obsidian, then retry. Do not switch vaults.' } }; } return plugin.api.createPosition('$b64'); })()"
```

The wrapper answers two different failures: `LUCRJOURNAL_NOT_LOADED_HERE` means the vault does not run LucrJournal (switch or name the vault); `LUCRJOURNAL_API_MISSING` means the installed build is too old (update the plugin, stay in this vault).

## 3. Read the result

The output is `=> ` followed by JSON. The exit code is always 0, so judge only by `ok`.

- `ok: true`, `dryRun: true` → show the user `data.files` (paths, key frontmatter, body) and `data.resolved`, then stop. `data.files[].bodyNote` is a caveat to repeat when present.
- `ok: true` → go to step 4.
- `ok: false`, `JOURNAL_LOCKED` → nothing was written. Ask the user to sign in to LucrJournal (or restore access) in Obsidian, then rerun the same call. Never switch vaults and never retry without the sign-in.
- `ok: false` → follow `error.fix`. Retry once without asking only when a candidate is the same thing the user said in another spelling or language (`Binanse` → `Binance`, 币安 → `Binance`). Otherwise ask the user one question built from `error.message` and `error.candidates`. `error.details.additionalErrors` lists further independent problems with the same shape: settle all of them in that same retry or question.
- Anything else → see Troubleshooting.

## 4. Open (one call)

Run the command for your shell from `data.open` exactly as given: `data.open.bash` (bash / zsh / Git Bash) or `data.open.powershell`. The plugin builds them for the OS it runs on. The `obsidian://lucrjournal-open-position` URI brings Obsidian to the foreground on the position, and the chained `obsidian eval` confirms it.

macOS (`data.open.bash`; Linux uses `xdg-open`; Git Bash on Windows runs `powershell.exe -NoProfile -Command "Start-Process '<uri>'"`, because Git Bash has no reliable `start`):

```bash
open "obsidian://lucrjournal-open-position?vault=2b770fde7df4a65c&file=LucrJournal%2Fpositions%2FPOS-00012.md" && obsidian vault=2b770fde7df4a65c eval code="app.plugins.plugins.lucrjournal.api.openPosition({ path: 'LucrJournal/positions/POS-00012.md' })"
```

Windows PowerShell (`data.open.powershell`):

```powershell
Start-Process 'obsidian://lucrjournal-open-position?vault=2b770fde7df4a65c&file=LucrJournal%2Fpositions%2FPOS-00012.md'; obsidian vault=2b770fde7df4a65c eval "code=app.plugins.plugins.lucrjournal.api.openPosition({ path: 'LucrJournal/positions/POS-00012.md' })"
```

Done when it prints `ok: true` with `viewType: "lucrjournal-position-view"`.

## 5. Report

One line: the position path plus what was inferred or created, from `data.resolved` (account and why, final symbol and whether it was created, side and why, linked or created notes). Example: `已记录 POS-00012：Binance / SOLUSDT.P（新建，按账户惯例补全为永续）LONG，关联 Key Level "Range high"。`

## 6. Troubleshooting (常见问题)

Run each `obsidian` call with a 60 s timeout. Stop after one failed retry and tell the user what you saw.

| Symptom | Cause | What to do |
| --- | --- | --- |
| `obsidian: command not found` / "not recognized as a cmdlet" | The Obsidian CLI is not registered (needs the Obsidian 1.12+ installer). | Ask the user to enable it in Obsidian → Settings → General → Command line interface, then open a new terminal. |
| The command hangs with no output | Obsidian is showing a modal dialog (e.g. "Vault not found"), which blocks every CLI call, or Obsidian is still starting. | Stop and ask the user to look at Obsidian and close the dialog. Leave the window alone: no keystrokes, no retry loop. |
| `vault=<name>` started a vault the user did not mean | Any `vault=` command launches that vault if it is closed. | Use `vault=` only with the name the user gave or the id from `data.vault.id`; never loop over `obsidian vaults`. |
| `LUCRJOURNAL_NOT_LOADED_HERE` | The active vault does not have LucrJournal enabled. | Follow `error.fix`: ask which vault, rerun with `vault=<name>`. |
| `LUCRJOURNAL_API_MISSING` | LucrJournal runs here, but the installed build is older than this skill (no agent API). | Ask the user to update LucrJournal (Settings → Community plugins → Check for updates), then retry **in the same vault**. Do not switch vaults. |
| `JOURNAL_LOCKED` | LucrJournal is not signed in in this vault, or the account's journal access is denied. | Nothing was written. Ask the user to sign in / restore access in Obsidian, then rerun the same call. Do not switch vaults and do not retry without signing in. |
| `Error: TypeError: … createPosition is not a function` or `api` is undefined | The installed LucrJournal is older than this skill. | Ask the user to update LucrJournal (Settings → Community plugins) and retry. |
| `Error: SyntaxError …` | The object literal is malformed — usually quotes lost on the way. | Recheck the JSON; in PowerShell use the base64 form from step 2. |
| `INVALID_VALUE` mentioning base64 | The PowerShell input was not base64 of UTF-8 JSON. | Encode exactly as in step 2 (`[Text.Encoding]::UTF8.GetBytes`). |
| `METADATA_TIMEOUT` | Obsidian was busy indexing or syncing. | The written notes were **kept** (nothing was trashed). Wait a few seconds, check them in Obsidian, and retry only if a note is incomplete. |
| `POST_WRITE_VERIFY_FAILED` / `ROLLBACK_FAILED` | The write did not read back as planned; files were trashed (or, for ROLLBACK_FAILED, some were left behind). | Report `error.message` to the user, including any leftover paths; retry at most once. |
| Open printed `ok: true` but Obsidian stayed in the background | The OS blocked focus stealing (Windows) or no handler is registered for `obsidian://` (Linux). | The position is open; tell the user to switch to Obsidian. |
| Times look shifted by a few hours | The source shows another time zone (e.g. MetaTrader server time). | Pass `opened_at` / `closed_at` as ISO 8601 with the source offset. |

## 7. References (参考文档)

- Obsidian CLI — commands, `vault=` targeting, default vault rule: https://obsidian.md/help/cli
- Obsidian URI — `vault` / `file` parameters, and why `path` (absolute filesystem path) must not be used: https://obsidian.md/help/uri
- Agent Skills specification: https://agentskills.io/specification
- LucrJournal plugin and this skill: https://github.com/lucrtrade/lucrjournal-obsidian-plugin
- LucrJournal user docs (positions, accounts, analyses): https://github.com/lucrtrade/lucrjournal-obsidian-plugin/tree/main/document/docs/en
- Plugin agent API (fields, inference rules, error codes): https://github.com/lucrtrade/lucrjournal-obsidian-plugin/tree/main/src/agent-api
