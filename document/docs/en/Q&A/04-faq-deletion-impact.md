---
icon: Trash2
title: "Deletion impact"
---

These questions cover the cascading effects of renaming or deleting Accounts, Symbols, positions, attachments, and Confluence.

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

## Why does a Playbook have a broken link after I deleted Confluence?

Deleting Confluence from `Analysis` cleans position links but does not rewrite Playbook bodies. Confirm that no Playbook still references it before deleting. See [[context-notes]] and [[playbooks-and-criteria]].
