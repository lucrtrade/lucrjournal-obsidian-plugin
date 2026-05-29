# Privacy Policy

Last updated: 2026-05-21

This Privacy Policy explains how LucrTrade handles information in LucrJournal, an Obsidian plugin for trade journaling, position review, playbooks, criteria, market analysis, and related records.

LucrJournal is local-first. The product is designed to keep journal records in the user's own Obsidian vault unless the user chooses a feature that needs an external request.

## Operator and Contact

LucrJournal is operated by LucrTrade.

Contact: [contact@lucrtrade.com](mailto:contact@lucrtrade.com)

## Information LucrJournal Processes

LucrJournal may process information that the user creates, imports, edits, or asks the plugin to derive, including:

- local journal records such as positions, accounts, symbols, news, analyses, criteria, playbooks, templates, Markdown content, and tags;
- trading-related fields such as platform, account name, symbol, fees, orders, prices, quantities, attachments, notes, and chart state;
- images or clipboard image data that the user attaches to a position or submits to OCR;
- external URLs that the user adds as news sources, source previews, or linked analysis context;
- plugin settings and preferences, such as language, time zone, modified timestamp behavior, and table preferences;
- local runtime cache data, including chart OHLCV cache entries and URL preview cache entries.

The current implementation does not create a LucrTrade-hosted account system and does not store or transmit exchange API credentials.

## Local Storage

LucrJournal primarily stores information on the user's device:

- persisted journal records are Markdown files in the user's Obsidian vault, typically under `LucrJournal/`;
- position attachments are written to the vault, currently under `LucrJournal/attachments/`;
- plugin settings are stored through Obsidian plugin data storage;
- chart state and other persisted domain fields are stored in Markdown frontmatter;
- runtime caches may use memory and IndexedDB scoped to the Obsidian vault;
- OCR runtime and model assets may be cached in the local plugin directory after first use.

LucrTrade does not provide a LucrJournal cloud account, hosted workspace, or built-in sync service in the current product implementation.

## External Requests

LucrJournal may make external network requests when the user uses features that need remote resources:

- chart features may load LucrChart from `https://lucrchart.lucrtrade.com/`;
- chart history requests may use `ccxt` and Obsidian `requestUrl` to request market data from exchange endpoints;
- news creation, source preview, and page title features may request URLs that the user provides;
- news source import requests `https://defuddle.md/{source-url}` to convert the user-provided source URL to Markdown;
- page title and preview features may also request `defuddle.md` as a fallback when page metadata cannot be read directly;
- source preview UI may request favicon URLs from the source website or from `https://icons.duckduckgo.com/ip3/{hostname}.ico`;
- OCR features may download OCR runtime and model assets from the repository asset mirror at `https://raw.githubusercontent.com/lucrtrade/lucrjournal-obsidian-plugin/main/assets/ocr/...`.

OCR recognition runs in the local plugin runtime after the required assets are available. LucrJournal does not intentionally send the user's OCR image to a remote OCR service as part of the current OCR flow.

External requests are feature-triggered. If the user does not use chart, OCR, news source, preview, or import features, the corresponding external requests are not needed for those features.

## Third-Party Services

Exchange endpoints, source websites, `defuddle.md`, DuckDuckGo favicon URLs, GitHub raw asset hosting, LucrChart, Obsidian, and any other third-party services are governed by their own terms and privacy practices. LucrTrade does not control those third-party services.

## What LucrJournal Does Not Include

Based on the current implementation reviewed for this policy, LucrJournal does not include:

- a LucrTrade-hosted user account system;
- built-in cloud sync;
- built-in advertising;
- built-in payment, subscription, refund, or paid plan processing;
- product telemetry or analytics features identified in the current codebase review;
- brokerage, custody, order execution, or trading advisory services.

## User Choices

The user can limit information processing by choosing which features to use. For example, the user can:

- use LucrJournal only for local Markdown records;
- avoid adding external URLs;
- avoid chart, OCR, source preview, or import features;
- edit or delete local vault files, attachments, plugin settings, and Obsidian backups;
- clear local browser/runtime storage where Obsidian exposes that control.

## Retention and Security Boundaries

Because LucrJournal is local-first, retention is mainly controlled by the user's device, Obsidian vault, Obsidian sync or backup choices, and local storage settings.

LucrTrade does not promise that local storage, Obsidian, third-party services, source websites, market data endpoints, or the user's device are immune from loss, compromise, outages, or misuse. Users should maintain their own backups and protect access to their device and vault.

## Children

LucrJournal is not designed specifically for children. Minors should use LucrJournal only with appropriate permission and supervision under applicable rules.

## Changes to This Policy

LucrTrade may update this Privacy Policy by publishing a revised version. The updated version applies from its stated "Last updated" date.

## Contact

For privacy-related questions about LucrJournal, contact [contact@lucrtrade.com](mailto:contact@lucrtrade.com).
