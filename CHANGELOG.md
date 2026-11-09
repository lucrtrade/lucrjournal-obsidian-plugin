# Changelog

## [Unreleased]

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
