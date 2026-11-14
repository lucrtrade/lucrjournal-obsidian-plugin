# Playbooks, templates, symbols, renames and deletions

## Playbooks

A playbook is a checklist of **criteria groups**, each holding one or more **confluences**:

```md
# [[Trend]]              ← criteria group (a note under LucrJournal/criteria/)
## [[HTF trend]]         ← confluence (a note under LucrJournal/analyses/)
## [[Break of structure]]
```

- **Create**: `createPlaybook({ name, description?, criteria: [{ name, confluences: [...] }] })`. Missing criteria and confluence notes are created with it. Every group needs at least one confluence; a confluence may appear only once per playbook. Reuse existing confluence names the same way as in [context.md](context.md).
- **Change**: `updatePlaybook({ playbook, description?, criteria? })`. `criteria` replaces the whole structure, so read the current one first with `listEntries({ kind: "playbook", query: "<name>" })` (each playbook comes with its `criteria`), edit it, and send the full list.
- Do not use `updateEntry({ body })` on a playbook: saving criteria rewrites the body.
- **Use on a position**: `setPlaybook({ position, playbook })` / `removePlaybook({ position })`; positions of a playbook: `listPositions({ playbook })`.

## Templates

`createTemplate({ name, body })`; the body may contain position sections such as `# Notes`. Use it with `createPosition({ template })`. Templates cannot be edited or renamed through the API; delete and recreate if needed.

## Symbols

`updateSymbol({ symbol, account?, type?, fee_value?, contract_unit? })`. Pass `account` when the same symbol exists on several accounts. `fee_value` must be positive and fit the symbol type; `contract_unit` is a positive whole number and applies to CFD symbols only. Existing positions are not recalculated; tell the user when that matters.

Accounts cannot be renamed or edited through the API.

## Rename (`renameEntry`)

News, key level, confluence, market analysis and playbook notes can be renamed; every link to them is updated. Positions, symbols, accounts and templates cannot.

1. `renameEntry({ entry, kind?, newName })` → `scope.rename` and `scope.linksUpdatedIn`, plus `confirmToken`.
2. Show the user the new name and the notes whose links will change.
3. After the user agrees: the same call plus `confirmToken`.

## Delete (`deleteEntry`)

Deletions move notes to the trash (Obsidian's or the system's, per the user's settings) and **cannot be undone with `undo`**.

1. `deleteEntry({ entry, kind? })` → `scope` and `confirmToken`. The scope always has `trash` and `linksLeftBroken`; context notes and playbooks also have `unlinkedFromPositions`:
   - `trash`: everything that will be moved to the trash. Deleting an **account** takes its symbols and positions, and its platform when no other account uses it. Deleting a **symbol** takes all its positions (`trash.positions`).
   - `unlinkedFromPositions`: positions whose link to this note will be removed.
   - `linksLeftBroken`: notes that will keep a link to nothing (for example a playbook that uses a deleted confluence).
   - `trash.privateConfluences` (playbooks): confluences only this playbook used, trashed with it.
2. Show the user the whole scope, in particular `trash` for accounts and `linksLeftBroken`.
3. After the user agrees: the same call plus `confirmToken`. A changed vault makes the token invalid; preview again.

Special cases:
- Deleting a position keeps its image files.
- A criteria note can be deleted only when no playbook uses it; otherwise remove it from those playbooks with `updatePlaybook` first.
- A platform cannot be deleted directly; deleting the last account that uses it takes it along.
