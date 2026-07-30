---
icon: Trash2
title: "Deletion impact"
---

These questions cover the cascading effects of renaming or deleting Accounts, Symbols, positions, attachments, and Confluence.

## Failed Account rename

**An Account rename failed, leaving some linked files changed and others unchanged.**

Renaming an Account rewrites the Account, Symbols, and position references one by one, with no rollback. ==Changes completed before a failure remain in place.==

> [!WARNING] What to do
> Before renaming, check that the new name does not conflict with an existing file, back up the vault, and do not close Obsidian during the rename. After a failure, check every level of the relationship.

→ [[accounts-and-symbols]] · [[account-fields]]

## Account deletion scope

**The Account deletion list also includes Symbols, positions, or even a Platform.**

`Delete Account?` removes the whole downstream relationship.

Platform names that differ only by case can confuse sharing detection.

> [!WARNING] What to do
> Check every listed file before confirming. When `Platform File (sole account)` appears, inspect the other Accounts too.

→ [[accounts-and-symbols]]

## Symbol deletion scope

**Linked positions disappeared when I deleted a Symbol.**

`Confirm Delete` trashes the linked positions before the Symbol file.

Position attachments are not cleaned up.

> [!WARNING] What to do
> Handle the evidence in those positions before deleting the Symbol.

→ [[accounts-and-symbols]] · [[attachments-chart-ocr]]

## Orphaned attachments

**I deleted a position, but its attachments remain in the vault.**

Deleting a position directly moves only its file. It does not clean up exclusive files under `LucrJournal/attachments/`.

Remove unwanted attachments from the position interface first.

→ [[position-lifecycle]] · [[attachments-chart-ocr]]

## Broken body image

**A Markdown body image broke after I deleted an attachment.**

`Delete attachment` removes the frontmatter reference but does not scan the Markdown body. ==An exclusive physical file may be deleted even while the body still embeds it.==

> [!WARNING] What to do
> Select `Open as Markdown` and check the body before confirming.

→ [[attachments-chart-ocr]] · [[local-files-and-markdown]]

## Broken Playbook link

**A Playbook has a broken link after I deleted Confluence.**

Deleting Confluence from `Analysis` cleans position links but does not rewrite Playbook bodies.

Confirm that no Playbook still references it before deleting.

→ [[context-notes]] · [[playbooks-and-criteria]]
