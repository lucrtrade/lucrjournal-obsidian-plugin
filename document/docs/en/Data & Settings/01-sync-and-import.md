---
icon: ArrowDownUp
title: "Sync and import"
---

LucrJournal does not sync broker history automatically. Positions, Accounts, Symbols, and review content use files in the current vault as their source of truth. Online features only fetch web content, Symbol metadata, and chart market data, or complete sign-in.

## Know what is local and what is online

| Feature | Data source | Internet required | What happens offline |
| --- | --- | --- | --- |
| Create and edit records | Current vault | No | You can keep recording and reviewing. |
| Screenshot OCR | Local models installed with the plugin and your image | No | You can recognize, review, and apply fields to a position. |
| News source | The page you enter and a remote content extraction service | Yes | A title or body may be unavailable. You can still create News and write the body manually. |
| Symbol search and metadata | Built-in catalog, current vault, and TradingView | Only remote enrichment | Local choices and saved Symbols remain available. Remote type and logo data may be missing. |
| Chart market data | Yahoo or the exchange for the Account platform | Yes | The chart may have no data or fail to load. Local positions are not deleted. |

Remote results never replace local records as the source of truth. Going offline does not make saved Markdown unusable.

## Import News from a web page

When you fill in `Source URL` for News, LucrJournal accesses that page. When creating News, it tries to obtain a usable title and body. If the page has no usable title, it also tries a remote fallback service.

After you edit the source of existing News, the interface opens `Import source content`:

1. Confirm that `Source URL` points to the correct page.
2. Read the confirmation. Select `Cancel` if you do not want to change the body.
3. Select `Import` to convert the remote page into a Markdown body.
4. Check that the title, paragraphs, and links are worth keeping.

If the remote body cannot be loaded, newly created News remains with an empty body. When editing existing News, you can cancel or retry later.

> [!WARNING]
> `Import source content` replaces the current News body. If the confirmation says content already exists, copy any handwritten notes you still need first.

## Read position fields from a screenshot

OCR can start with the first supported image you paste, upload, or drop. It can also start from an existing position image attachment in the vault. The recognition models and runtime files ship with the plugin, and no replacements are downloaded at runtime. OCR fails if any required file is missing.

The result only contains `Notional Value`, `Entry Price`, `Exit Price`, `Stop Loss`, and `Target Price`. Use this flow:

1. Open OCR import, then paste, upload, or drop a trade screenshot.
2. Wait for `Review OCR Result`.
3. Compare every value with the original image and edit it.
4. Select `Apply to Position`.

Nothing is written to the position before submission. Closing the review does not create an attachment. After a successful apply, the reviewed fields and source image attachment are written together.

%% ![[screenshot-ocr-import-modal.png]] %%

> [!WARNING]
> OCR can misread decimal points, prices, and amounts. Check every value against the original image. It also does not decide `LONG` or `SHORT` from price relationships.

See [[attachments-chart-ocr]] for the complete attachment and OCR flow.

## How Symbol search uses remote data

When selecting a Symbol, LucrJournal first uses Symbols from the current vault and the built-in catalog. For input outside the local catalog, it queries TradingView for suggestions and tries to enrich `Type` and the logo.

If the remote query fails, returns nothing, or has no usable type, local creation continues. Saved Symbols are always read from the vault and do not depend on TradingView, so they remain usable offline. After creating one, use [[accounts-and-symbols]] to verify Type, Fee, and Contract Unit.

Successful remote searches are cached in memory for one hour. Failures are not cached or persisted into local records.

## Where chart market data comes from

The chart requests data only when it can resolve a supported source:

- Futures ignore the Account platform and use Yahoo market data.
- Crypto Spot and Crypto Perpetual use Binance, Bybit, or OKX based on the Account platform.
- No request is made when the Symbol link, Type, or Account platform cannot be resolved.

Market data is for the chart only. It is not written into position fields. Non-empty results are cached for 15 minutes; empty results are not cached. The plugin waits and retries after exchange rate limiting. Other network or response errors fail that chart load.

> [!TIP]
> Keep writing the position and review while offline. Reopen the chart or search for the Symbol after reconnecting. You do not need to recreate local records.

See [[local-files-and-markdown]] for the complete local file boundary.
