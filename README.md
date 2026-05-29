# LucrJournal

[中文](README_ZH.md)

LucrJournal is an Obsidian plugin for reviewing and managing positions, playbooks, criteria, symbols, accounts, attachments, and related market analysis in one focused local workspace.

It is built for traders who already use Obsidian for notes and want trade records, context, screenshots, and review conclusions to stay in the same vault.

## What It Helps You Do

- Record positions with account, symbol, execution, risk, and review context.
- Connect trades with news, key levels, market analysis, playbooks, criteria, and confluence.
- Review recent performance from a dashboard instead of reading isolated trade notes.
- Keep screenshots and other image evidence attached to the position they explain.
- Use OCR and import flows to reduce repetitive entry while still reviewing the result before writeback.
- Keep records as local Markdown and attachment files inside your Obsidian vault.

LucrJournal is not a broker, an order-entry tool, a real-time trading terminal, or an investment advice product.

## Key Features

- Position workflow for creating, completing, and reviewing trade records.
- Dashboard views for Overview, Positions, News, Analysis, Playbook, Accounts, and Symbols.
- Account and symbol management for filtering records by source, instrument, or strategy.
- Playbook, criteria, and confluence structures for turning repeated setups into reusable checks.
- Local Markdown storage under `LucrJournal/` in your vault.
- Attachment handling for screenshots, chart evidence, and review images.
- OCR-assisted review for extracting candidate trade fields from screenshots before applying them.
- Candlestick chart support for linked crypto positions, with chart screenshots saved as attachments.
- English and Simplified Chinese interface language settings.

## Installation

LucrJournal requires Obsidian `1.11.4` or later.

For a manual install, copy these files into your vault plugin folder:

```text
VaultFolder/.obsidian/plugins/lucrjournal/
```

Required plugin files:

- `manifest.json`
- `main.js`
- `styles.css`

Then reload Obsidian and enable LucrJournal from Community plugins.

## Usage

Open LucrJournal from the left ribbon icon or the Obsidian command palette command `Open journal`.

A practical first run is:

1. Open LucrJournal.
2. Create or confirm one account.
3. Create a position with the account and symbol.
4. Open position details and fill the execution, risk, notes, and review context that matter for this trade.
5. Add screenshots or other evidence when they explain entry, exit, risk, or conclusion.
6. Review positions later from the dashboard by account, symbol, playbook, or context.

LucrJournal keeps its records in your vault, so you can search, link, and carefully inspect them from Obsidian.

## Development

Install dependencies:

```bash
npm install
```

Start the development build:

```bash
npm run dev
```

Build the plugin bundle:

```bash
npm run build:bundle
```

Run tests:

```bash
npm run test
```

Run lint checks:

```bash
npm run lint
```

The release artifacts are `manifest.json`, `main.js`, and `styles.css`.

## License

MIT
