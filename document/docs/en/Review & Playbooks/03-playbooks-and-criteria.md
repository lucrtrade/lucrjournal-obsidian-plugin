---
icon: ListChecks
title: "Playbooks and Criteria"
---

## What Playbooks, Criteria, and Confluence are

These three concepts turn a vague review conclusion into a structure you can reuse.

| Concept | What it stores | Question it answers |
| --- | --- | --- |
| Playbook | One repeatable trade setup | Which method does this trade belong to? |
| Criteria | One review stage or group of checks | Which conditions should I check before entry, while holding, or before exit? |
| Confluence | A named set of conditions that appears repeatedly | Which combinations actually appeared in this trade? |

The interface represents checklist items as `Criteria` or Criteria sections. A Playbook contains several Criteria sections. Each section contains one or more Confluences.

## How a Playbook stores its structure

A Playbook is a Markdown file. Its Name determines the filename. `Description` is stored in frontmatter. Criteria sections and Confluences are stored in the structured body.

The structured body recognizes only two levels of linked headings. A Criteria section is an H1. A Confluence under it is an H2. Regular headings, H3 headings, and handwritten text below a heading do not become structured content. Empty sections are not saved. Criteria section names must be unique, and Confluence names must be unique across the entire Playbook. These comparisons ignore letter case.

> [!WARNING]
> When you select `Save Playbook` in the structured screen, LucrJournal preserves only a well-formed frontmatter block at the very start, verbatim. It regenerates everything after frontmatter from the current Criteria sections and Confluences. Handwritten paragraphs, unstructured headings, comments, and code blocks disappear. An unclosed leading frontmatter block is not preserved.

For extra free-form text, put a short summary in `Description` and keep single-trade experience in the position's `Notes`. Do not mix unstructured content into the Playbook body.

%% ![[screenshot-playbook-editor.png]] %%

## Create a Playbook

1. Open `Playbook` in the dashboard, then select `Create New Playbook`.
2. Enter a `Name` and an optional `Description`. A new form already has one Criteria section and one blank Confluence slot.
3. Under `Select or create a criteria section...`, choose an existing criterion or enter a new name.
4. Under `Select or create a confluence...`, choose an existing combination or enter a new name.
5. Select `New Criteria` for another section. Select `Create new confluence` for another combination.
6. Check for duplicate names, then select `Save Playbook`.

![[screenshot-playbook.png]]

> [!TIP]
> Start from a pattern that has already repeated in two or three real positions. A short Playbook with one Criteria section is easier to maintain than a complete framework with no samples.

## What saving creates

When you save, LucrJournal normalizes names and reuses existing files first. It creates a separate Criteria file for each missing Criteria section. It also creates any missing Confluence referenced by the Playbook before writing the body.

Confluences created through a Playbook are not `Public` by default. They do not appear in the dashboard's public `Confluence` list, but they remain available in Playbooks. After a position links to the Playbook, it can also use private Confluences referenced by that Playbook. A position without a linked Playbook can select only Public Confluences.

> [!NOTE]
> After you remove a Criteria section from a Playbook and save, LucrJournal moves its Criteria file to the trash if no other Playbook or Confluence still references it.

## Link a position to a Playbook

1. Select a row in `Positions` to open Position Details.
2. Open the Playbook content area and select `Add playbook`.
3. Choose an existing Playbook under `Search saved playbooks...`. You can also enter a name to create a new one.
4. After linking, the position shows the Playbook's Criteria sections, Confluences, Win Rate, Net PnL, and Trades.
5. Check the Confluences that appeared in this trade. Checking adds a link to the position's Confluence section. Unchecking removes only the link from the current position. It does not delete the original Confluence file.

The Playbook link is stored in the position's `playbook` frontmatter field. LucrJournal includes a position in Playbook performance only when its link resolves to that Playbook file.

%% ![[screenshot-position-playbook-checklist.png]] %%

## Maintain a Playbook with real samples

Use the same order for every periodic review:

1. Return to linked positions from `Trades` in the Playbook.
2. Check wins, losses, and samples that missed the plan. Do not read only Win Rate.
3. Add, rename, or remove a Criteria section or Confluence only after the same conclusion repeats.
4. Save, then reopen related positions and confirm the criteria still describe real trades.

`Trades` includes every resolved linked position. Performance metrics use only closed positions whose Net PnL is a nonzero number. See [[review-workflow]] for the complete denominator rules.

> [!WARNING]
> When you delete a Confluence under `Analysis`, LucrJournal cleans related links from positions but does not rewrite Playbook bodies that still reference it. Before deleting, confirm that no Playbook still uses it, or the Playbook will keep a broken link.

## Continue reading

- [[dashboard-review]]: Find positions that need review from the dashboard.
- [[context-notes]]: Understand Public and private Confluences and backlink statistics.
- [[q-and-a]]: Resolve short usage questions.
