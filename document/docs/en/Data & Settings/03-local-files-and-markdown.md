---
icon: Folder
title: "Local files and Markdown"
---

LucrJournal trading records are Markdown and attachments under `LucrJournal/` in the current vault. You can back them up, search them, and open them directly. Structured views also read and rewrite parts of these files.

## Folders and file names

| Content | Folder | File name |
| --- | --- | --- |
| Platforms | `LucrJournal/platforms/` | Sanitized platform name, such as `Binance.md`. |
| Accounts | `LucrJournal/accounts/` | `ACC-{Account name}.md`. |
| Symbols | `LucrJournal/symbols/` | `SBL-{Account name}-{UPPERCASE SYMBOL}.md`. |
| Positions | `LucrJournal/positions/` | A five-digit sequence such as `POS-00001.md`. |
| News | `LucrJournal/news/` | Sanitized News name. |
| Key Levels, Confluence, and Market Analysis | `LucrJournal/analyses/` | Sanitized entry name. |
| Playbooks | `LucrJournal/playbooks/` | Sanitized Playbook name. |
| Criteria | `LucrJournal/criteria/` | Sanitized Criteria name. |
| Position templates | `LucrJournal/templates/` | A five-digit sequence such as `TPL-00001.md`. |
| Attachments | `LucrJournal/attachments/YYYY-MM/` | Local time, milliseconds, and the original file name. |

LucrJournal uses wikilinks without folder paths. Markdown in different folders cannot share the same file name. The plugin checks basename conflicts across all folders when creating an entry. Rename an Account, Symbol, or context entry from its structured interface so linked references can be updated too.

## A file has two parts

Leading frontmatter stores the type, links, and structured fields. The body stores Notes, context headings, or Playbook Criteria.

`lucr_type` decides whether a file is a position, Playbook, or another entry type. Do not edit it directly. Frontmatter that cannot be recognized or does not match the schema leaves the file in plain Markdown and removes it from the corresponding list and structured view.

From a position or Playbook page, select `Open as Markdown`. After checking the file, select `Open as Position View` or `Open as Playbook View` to return to the structured interface.

## How a position body is rewritten

A new position body contains only `# Notes`. After linking context, H1 sections use this order:

1. `# Notes`
2. `# News`
3. `# Key Levels`
4. `# Confluence`
5. `# Market Analysis`

Structured edits preserve content before the first H1 and preserve other H1 titles and bodies. However, every write rebuilds all H1 sections and normalizes spacing between headings, surrounding body whitespace, and the final newline. Duplicate target headings may be merged and lose content.

Removing a linked entry rebuilds the recognized H2 blocks under the target H1. Handwritten text before the first H2 in that section is lost, and surrounding whitespace in retained blocks is normalized. Bulk link cleanup may rebuild other context sections the same way.

> [!NOTE]
> The section parser does not recognize fenced code blocks. A line starting with `# ` or `## ` inside a code block is still treated as a real heading boundary. Avoid placing the hash at the start of a code-example line in a position body.

## How a Playbook body is rewritten

The structured Playbook body only recognizes a Criteria wikilink as an H1 with nested Confluence wikilinks as H2 headings. Plain headings, H3 headings, and paragraphs do not become structured values.

> [!WARNING]
> When you select `Save Playbook`, LucrJournal preserves only a well-formed leading frontmatter block byte for byte. It replaces the entire body after it with the current Criteria and Confluence. Handwritten paragraphs, unstructured headings, comments, and code blocks disappear. Unclosed leading frontmatter is not preserved either.

Put explanations that must survive in the relevant Criteria, Confluence, or another note. Do not put them where structured Playbook saving will overwrite them. See [[playbooks-and-criteria]] for the full model.

## Attachment references are not synchronized both ways

When you paste or drop a file into Markdown under `LucrJournal/`, the plugin stores it in the attachments folder and inserts a body link. For a position, it also appends the same reference to frontmatter `attachments`. The two locations are not reconciled afterward.

Deleting an attachment from the position interface only handles its frontmatter reference. It does not scan or rewrite body embeds. Deleting a position directly moves only the position file and does not clean up exclusive attachments. Before deleting, use [[attachments-chart-ocr]] to check the body, attachment property, and references from other positions.

## Safe boundaries for direct editing

- You can edit plain Notes, spelling, and review conclusions, but first check whether structured saving can rebuild that body.
- Do not manually change file identity or relationship fields for Accounts, Symbols, and positions. Use their interfaces.
- Frontmatter must still satisfy field rules after an edit, or LucrJournal skips the file.
- A position context H2 must be a complete wikilink to enter the structured model. Unresolved headings remain in Markdown but are not repaired automatically.
- Back up the vault before a large direct edit.

See [[account-fields]], [[symbol-fields]], [[position-fields]], and [[context-playbook-fields]] for field meanings. For file problems, return to [[q-and-a]].
