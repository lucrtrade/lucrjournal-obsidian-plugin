# Changelog

## [Unreleased]

## [0.1.17]

- Unify attachments: `createPosition({ attachments })` and `api.saveAttachment` now share one pipeline, so a position also accepts `{ base64, fileName }` entries and both use the same dated path, timestamped name and `-2` collision rule
- Skill: document that positions and notes use the same attachment pipeline

## [0.1.16]

- Add `api.saveAttachment({ sourcePath | base64 + fileName })`: stores an image in `LucrJournal/attachments/YYYY-MM/` with the same timestamped naming and `-2` collision rule as the editor, and returns the `token` / `embed` wikilink for any note
- Skill: document `saveAttachment` so an agent never invents an attachment path and never drops images in the attachments root

## [0.1.15]

- Keep the dry-run preview's position frontmatter keys identical to the written note (`profit:`, `risk:` are no longer dropped)
- macOS opener asks macOS to focus Obsidian without letting a missing or renamed `Obsidian.app` break the verification step
- Skill: explain spot vs perpetual symbol alignment, timestamps in the plugin's own time zone, `error.field` / `error.received`, and why `plugin.api.version` (agent API, `1`) is not `plugin.manifest.version`
- Skill: describe macOS window activation as best-effort instead of promising it

## [0.1.14]

- Add the `lucrjournal-create-position` agent skill and the plugin API it drives
- Refuse agent writes while the journal is locked, and keep rollback scoped to the files a call created
- Fix the Windows Git Bash opener, cross-vault position links, and leftover empty view tabs
## [0.1.13]

- Support pre-release CI publishing with immutable release policy
- Hide `lucrjournal` folder

## [0.1.12]

- Fix time

## [0.1.11]

- Improve OCR

## [0.1.10]

- Initial version
