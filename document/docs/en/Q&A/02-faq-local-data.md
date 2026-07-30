---
icon: HardDrive
title: "Local data and body structure"
---

These questions cover local data boundaries, offline capabilities, and how Markdown body structure is parsed.

## Local storage

**I cannot find my LucrJournal records at my broker or in the cloud.**

Records are stored under `LucrJournal/` in the current vault. ==LucrJournal does not sync broker history automatically.==

Vault sync and backups depend on the Obsidian solution you use.

→ [[local-files-and-markdown]]

## Offline use

**I am worried that losing my connection will affect saved records or local features.**

You can keep creating, editing, and reviewing local records, and local OCR still works. Network failures do not delete saved records.

Sign-in, web sources, remote Symbol metadata, and chart market data need a connection.

→ [[sync-and-import]]

## Fenced-code headings

**A heading inside a code block changed my position body structure.**

The position section parser does not recognize fenced code. A line starting with `# ` or `## ` is treated as a real heading.

> [!TIP] What to do
> Adjust the example so the hash is not at the start of the line.

→ [[local-files-and-markdown]]
