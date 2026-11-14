# Context notes: news, key levels, confluences, market analyses

A position links supporting notes in its `# News`, `# Key Levels`, `# Confluence` and `# Market Analysis` sections. Each is its own note (`kind`: `news`, `key_level`, `confluence`, `market_analysis`). Note names are unique across all of `LucrJournal/`, whatever the kind.

## Match before you link or create

The user usually describes context in their own words ("我看到了大周期趋势向上", "今天 CPI 超预期"). Resolve each item to an existing note before writing anything:

1. `listEntries({ kind, limit: 500 })` for each kind the user mentioned. Each entry has `name` and `path`, and `description`, `tags`, `created` when they are set. If the result says `truncated: true`, or your tool cut the output short, the list is incomplete: narrow with `query` before deciding a note does not exist.
2. Decide per item:
   - **Same name** (any case) → use the existing name.
   - **Clearly the same thing in other words** ("大周期趋势" ↔ `HTF trend` described as higher-timeframe trend) → use the existing name.
   - **Unsure** — a title that sounds related but has no description to confirm it (`Volume` for "成交量放大"), or several plausible candidates → ask the user once, listing the candidates, for all unsure items together. If the user already said it is new ("一个新的理由"), still mention the closest existing note in the question. When one candidate's description matches and the others only share a word of the title, use that one without asking. When the user leaves the choice to you, reuse only a clear match; otherwise create the note with the user's own term, and say so.
   - **Nothing similar** → create it (step 3).
3. Create with what the user told you, so the note is not an empty shell: `createEntry({ kind, name, description, tags, body })`; Confluences are public unless you pass `public: false`. For news add `source` (URL; the plugin tries to fetch the article text into the body, and still creates the note when that fails) and `impact` (`high` / `medium` / `low`) when the user gave them; both are optional, never invent them. Name new notes in the language and style of the existing ones.
4. Link: `linkContext({ position, kind, name })` with the exact existing or new name. `linked: "exists"` means it was already linked.

Do not skip step 1: `linkContext` matches names only (ignoring case), not meanings, so "大周期趋势" next to an existing `HTF trend` becomes a second, empty note.

For a new trade, pass the resolved names in `createPosition({ links })`. A missing name there is created with its title only, so when the user gave a description, source or text for a new note, create it with `createEntry` first. For an existing position call `linkContext` per item.

## "Today's" news / confluences / analyses

There is no date filter for notes, and "created today" is not the same as "relevant to this trade". Work in two steps:

1. **Collect candidates.** List the kind with `limit: 500` and keep entries whose `created` starts with today's date (`created` is ISO 8601 in the LucrJournal time zone, e.g. `2026-11-13T09:30:00+08:00`). `created` is when the note was written, not when the event happened. If the result says `truncated: true`, or your tool cut the output short, some notes were not seen: narrow with `query` or tell the user.
2. **Filter and confirm.** Drop notes that are plainly unrelated to the position's market (another instrument, test or placeholder names). `listEntries` returns no note text, so a missing description does not mean an empty note. Then show the user the remaining list with each note's description (or "no description"), and link only after they confirm — unless it is three or fewer notes that clearly match. Macro news that does not name the market (a rate decision, "risk assets") is not a clear match: list it for the user to decide. Never link a whole day's notes blindly.

## Unlink

`unlinkContext({ position, kind, name })` removes the link only; the note stays.

## Edit a note

`updateEntry({ entry, kind?, ... })`:
- `description`, `impact`: a value replaces, `null` clears.
- `tags`: replaces the whole list, `[]` clears.
- `public` (confluence): `false` keeps it out of the public confluence list.
- `body`: appended at the end; existing text stays. No level-1 (`# `) headings.

## Images inside a note

1. `saveAttachment({ sourcePath: "/abs/path/shot.png" })` → `data.embed` (`![[...]]`).
2. `updateEntry({ entry, body: "<data.embed>" })` to append it to the note.

For a position, use `addAttachments` instead ([positions.md](positions.md)).
