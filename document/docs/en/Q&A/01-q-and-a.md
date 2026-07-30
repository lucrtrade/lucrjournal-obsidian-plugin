---
icon: CircleHelp
title: "Q&A"
---

Start with the symptom. Each answer gives only the next action. The linked page explains the full boundary and steps.

## Where is my data stored? Does it sync with a broker or the cloud automatically?

Records are stored under `LucrJournal/` in the current vault. LucrJournal does not sync broker history automatically. Vault sync and backups depend on the Obsidian solution you use. See [[local-files-and-markdown]].

## What can I do offline?

You can keep creating, editing, and reviewing local records, and local OCR still works. Sign-in, web sources, remote Symbol metadata, and chart market data need a connection. Their failure does not delete saved records. See [[sync-and-import]].

## What if OCR is wrong?

Compare the result with the original image in `Review OCR Result` and edit it before applying. OCR only writes fields you submit, and it does not decide `LONG` or `SHORT`. See [[attachments-chart-ocr]] and [[sync-and-import]].

## Why did my old News body disappear after import?

`Import source content` replaces the current News body with the remote page. If the confirmation says content already exists, cancel and copy handwritten content before importing. See [[sync-and-import]].

## Why was my Symbol saved with the wrong Type?

An unknown six-character uppercase code is inferred as Crypto Spot. A missing or unrecognized Type makes position calculations fall back to Crypto Perpetual. Verify Type, Fee, and Contract Unit after adding it. See [[symbol-types]] and [[symbol-fields]].

## Why can I not save a Fee of 0?

Leave Fee blank when there is no fee. All three fee models reject 0. Crypto uses a percentage, Futures use an amount per contract, and CFDs use an amount per lot. See [[symbol-types]].

## Why is R:R different from my calculation?

Planned and Real R:R recalculate from Side, Entry Price, Stop Loss, and Target Price or Exit Price. They do not use saved Risk or Net PnL, and they exclude Fee. The formula uses one Entry Price and has no average-entry model. See [[position-fields]] and [[position-lifecycle]].

## Why is an old derived value still present after I cleared an input?

If Amount, Entry Price, or Contract Unit becomes invalid and no new result can be calculated, the old Notional Value is not cleared. Fee can remain too when it cannot be derived again. Recheck Notional Value, Fee, Net PnL, and Risk. See [[position-details]] and [[position-fields]].

## Why do Closed At, Status, and Exit Price disagree?

These fields are not forced to stay synchronized. An Exit Price of 0 or less still closes a position, and clearing Exit Price does not reopen it. Check all three after closing or reopening. See [[position-lifecycle]].

## Why can I not fix the Side after creation?

`Side` cannot be changed after a position is created. Any update that touches it is rejected as a whole. Delete the incorrect record and recreate it with the correct Side. See [[record-first-position]].

## What should I do after an Account rename fails?

Renaming an Account rewrites the Account, Symbols, and position references one by one, with no rollback. Check that the new name does not conflict with an existing file, back up the vault, and do not close Obsidian during the rename. After a failure, check every level of the relationship. See [[accounts-and-symbols]] and [[account-fields]].

## Why does deleting an Account include Symbols, positions, or even a Platform?

`Delete Account?` removes the whole downstream relationship. Check every listed file before confirming. Platform names that differ only by case can confuse sharing detection, so inspect other Accounts when `Platform File (sole account)` appears. See [[accounts-and-symbols]].

## Why did linked positions disappear when I deleted a Symbol?

`Confirm Delete` trashes the linked positions before the Symbol file. Their attachments are not cleaned up, so handle evidence first. See [[accounts-and-symbols]] and [[attachments-chart-ocr]].

## Why are attachments still present after I deleted a position?

Deleting a position directly moves only its file. It does not clean up exclusive files under `LucrJournal/attachments/`. Remove unwanted attachments from the position interface first. See [[position-lifecycle]] and [[attachments-chart-ocr]].

## Why did a body image break after I deleted an attachment?

`Delete attachment` removes the frontmatter reference but does not scan the Markdown body. An exclusive physical file may be deleted even while the body still embeds it. Select `Open as Markdown` and check the body before confirming. See [[attachments-chart-ocr]] and [[local-files-and-markdown]].

## Why did my handwritten Playbook notes disappear?

`Save Playbook` preserves only valid leading frontmatter and replaces the rest with the current Criteria and Confluence. Handwritten paragraphs, extra headings, comments, and code blocks do not survive. See [[playbooks-and-criteria]] and [[local-files-and-markdown]].

## Why does a Playbook have a broken link after I deleted Confluence?

Deleting Confluence from `Analysis` cleans position links but does not rewrite Playbook bodies. Confirm that no Playbook still references it before deleting. See [[context-notes]] and [[playbooks-and-criteria]].

## Why does a position created from a template have no Notes?

The template body becomes the new position body. If the template has no `# Notes`, the position may have no default Notes section either. Keep that heading unless you deliberately need another structure. See [[templates]].

## Why did “how long ago” change after I changed Timezone?

Relative time discards the offset in the record and compares wall-clock time in the current Timezone. Absolute time converts correctly. Also verify that the setting is a valid timezone, or calendars and relative time can throw errors. See [[settings-and-preferences]].

## Can I send debug logs directly to someone else?

No. With `Debug mode` enabled, a development build logs complete request headers and bodies, which may include sign-in credentials. Enable it only temporarily, then disable it and remove sensitive data before sharing anything. See [[settings-and-preferences]].

## Why did a heading inside a code block change my position body structure?

The position section parser does not recognize fenced code. A line starting with `# ` or `## ` is treated as a real heading. Adjust the example so the hash is not at the start of the line. See [[local-files-and-markdown]].
