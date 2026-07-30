---
icon: HardDrive
title: "Local data and body structure"
---

These questions cover local data boundaries, offline capabilities, and how Markdown body structure is parsed.

## Where is my data stored? Does it sync with a broker or the cloud automatically?

Records are stored under `LucrJournal/` in the current vault. LucrJournal does not sync broker history automatically. Vault sync and backups depend on the Obsidian solution you use. See [[local-files-and-markdown]].

## What can I do offline?

You can keep creating, editing, and reviewing local records, and local OCR still works. Sign-in, web sources, remote Symbol metadata, and chart market data need a connection. Their failure does not delete saved records. See [[sync-and-import]].

## Why did a heading inside a code block change my position body structure?

The position section parser does not recognize fenced code. A line starting with `# ` or `## ` is treated as a real heading. Adjust the example so the hash is not at the start of the line. See [[local-files-and-markdown]].
