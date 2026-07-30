---
icon: ListChecks
title: "Context and Playbook Fields"
---

This table covers News, Key Level, Market Analysis, Confluence, Playbook, and Criteria. See [[context-notes]] and [[playbooks-and-criteria]] for their relationships.

## Entry fields

| Field | Applies to | Meaning | Value or notes |
| --- | --- | --- | --- |
| `Name` | News, Key Level, Market Analysis, Confluence, Playbook, Criteria | The entry name. | The sanitized name normally becomes the filename. A conflicting filename rejects creation. |
| `Description` | Key Level, Market Analysis, Confluence, Playbook | A short summary. | Leading and trailing whitespace is removed. Blank input is stored as empty. |
| `Source URL` | News creation form | The source webpage for a News entry. | A valid HTTP or HTTPS URL, or blank. |
| `Date` | News, Key Level, Market Analysis, and Confluence lists | The entry creation time. | Display-only and available to date filters. |
| `Title` | News, Key Level, Market Analysis, and Confluence lists | The display title from the filename. | Renaming changes the file path. Link updates depend on Obsidian's file rename behavior. |
| `Source` | News list | The list view of the saved Source URL. | It is the same source value as `Source URL` during creation and can be changed in the list. |
| `Impact` | News | The News impact level. | `High`, `Medium`, `Low`, or blank. |
| `Tags` | News, Key Level, Market Analysis, Confluence | Tags used for search and filters. | Matching ignores a leading `#` and letter case. An empty list is stored as empty. |
| `Public` | Confluence | Whether the entry appears in the Public Confluence list. | Direct creation from a position defaults to Public. Creation through a Playbook defaults to private. |
| `Criteria` | Confluence, Playbook | The Criteria section name or link. | Names are sanitized and deduplicated without letter case. This column is read-only in the Confluence list. |
| `Playbook Confluences` | Playbook | Criteria sections and their Confluences. | A Criteria section is saved only when it contains a Confluence. Criteria names and Confluence names across the Playbook must be unique. |

> [!WARNING]
> Saving `Playbook Confluences` rebuilds everything after frontmatter from the current structured Criteria and Confluences. Regular paragraphs, unstructured headings, comments, and code blocks are not preserved.

## Statistic fields

| Field | Applies to | Calculation rule | With no samples |
| --- | --- | --- | --- |
| `Positions` | News, Key Level, Market Analysis, Confluence | Every position whose link resolves to this entry file. It does not require a closed position or valid Net PnL. | `0`. |
| `Trades` | Playbook | Every position whose link resolves to this Playbook file. | `0`. |
| `Win Rate` | Playbook and shared performance statistics | Among closed positions whose `Net PnL` is a nonzero number, winning positions ÷ sample size. | `0`. |
| `Net PnL` | Playbook and shared performance statistics | The sum of only closed positions whose `Net PnL` is a nonzero number, rounded to amount precision. | `0`. |
| `Largest Profit` | Playbook and shared performance statistics | The largest positive `Net PnL` in that performance sample. | Empty. |
| `Largest Loss` | Playbook and shared performance statistics | The smallest negative `Net PnL` in that performance sample. | Empty. |

`Positions` or `Trades` can therefore be greater than the sample size used by Win Rate and PnL. The counts include every resolved linked position. Performance excludes open positions and positions whose Net PnL is empty, invalid, or zero.
