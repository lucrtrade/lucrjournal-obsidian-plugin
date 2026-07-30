---
icon: Image
title: "Charts, Attachments, and OCR"
---

## What the three tools do

Charts, attachments, and OCR solve different problems. Charts provide external market data. Attachments keep local evidence. OCR extracts fields from an image for you to review.

| Tool | Data source | If market data or recognition fails |
| --- | --- | --- |
| `Chart` | Yahoo or the exchange linked to the selected account. | The chart is marked unavailable. Local position content stays visible. |
| `Attachments` | Local files in the current Obsidian vault, or external image URLs referenced by the position. | They do not depend on a market data service. Existing files and references still work. |
| `OCR` | Local recognition of the imported or saved image. | It does not open a review result or change the position. |

## How attachments are stored

Attachments created by the plugin are stored under `LucrJournal/attachments/YYYY-MM/`. A filename contains local time and the original filename, such as `2026-07-30_14-05-09-123_order.png`. Unsafe filename characters are replaced. A collision advances to the next available timestamp.

Position details accepts GIF, JPEG, JPG, PNG, SVG, and WebP images. Identical content is not saved twice in the same position or import batch. If the managed attachment folder already contains the same image, LucrJournal reuses that file.

## Add image evidence

Image evidence is a screenshot that helps reconstruct the trade plan, execution, or result.

1. Open a position.
2. Under `Attachments`, select `Add Image`, or drop an image into the attachment area.
3. After choosing the image, wait for `Attachment added.`
4. Select the thumbnail and confirm that `Open attachment preview` shows the original image.

![[screenshot-attachment-preview.png]]

Useful evidence includes the chart before entry, the chart after exit, an order screenshot, and a marked-up review chart. The attachment reference is written to position properties. The image itself is written to the managed attachment folder.

### Paste or drop files in Markdown

Editor paste and drop puts files directly into the body of a LucrJournal note. The plugin handles this only for Markdown files under `LucrJournal/`.

- Pasting or dropping an image saves the file and inserts an image embed at the cursor.
- Pasting or dropping another file saves it and inserts a plain link.
- When you add multiple files at once, links are inserted in input order on separate lines.
- When the current file is a position, the same references are also appended to its attachment properties. Images can then appear under `Attachments`.

Body embeds and position attachment properties are not reconciled automatically. Check both before deleting anything.

## OCR requires a manual review

OCR assists data entry. It does not fill the form automatically. It prepares editable drafts only for `Notional Value`, `Entry Price`, `Exit Price`, `Stop Loss`, and `Target Price`. It never infers `Side` from price relationships.

There are two entry points:

1. Select `OCR` under `Execution Details`. In the import window, paste, upload, or drop a trade screenshot. Only the first supported image is processed.
2. Open a local attachment preview and select `OCR`. External image URLs do not provide this action.

After recognition succeeds, `Review OCR Result` opens:

1. Compare every value with the original image and edit mistakes.
2. Remove values that should not be written. Keep only confirmed values.
3. Select `Apply to Position`.

Fields are written only after this action succeeds. When you started from the import window, the source image is saved as an attachment at the same time. Closing the review without applying creates no attachment and changes no position field.

%% ![[screenshot-position-ocr-review.png]] %%

> [!WARNING]
> OCR can misread decimal points, prices, or other numbers. Compare the result with the original image before selecting `Apply to Position`. OCR does not verify trade direction for you.

## Where chart data comes from

The linked symbol and account determine the chart source.

| Symbol type | Market data source |
| --- | --- |
| Future | Yahoo. The normalized symbol code is used for futures data. |
| Crypto Spot or Crypto Perpetual | The platform of the linked account. Binance, Bybit, and OKX are currently supported. |
| Another type or incomplete metadata | There is no supported source, so no market data request is made. |

The chart starts at the 60-minute resolution and lets you select resolutions supported by the source. Chart state is stored on the current position. Its theme follows Obsidian.

If a request fails, the platform is unsupported, or linked metadata is incomplete, the chart may disappear or remain unavailable. `Attachments`, `Net PnL`, `Execution Details`, `Timing`, `Risk & Reward`, and the local position body still display normally.

> [!NOTE]
> An unavailable chart does not mean the position file is damaged. Check the account platform, symbol type, and code in [[accounts-and-symbols]].

## Protect evidence when deleting

Deleting an attachment first removes its reference from the current position properties. The plugin trashes the physical file only when it is inside the managed attachment folder and no other position references it. Shared files, external images, and files outside the managed folder stay in place.

> [!WARNING]
> `Delete attachment` does not scan or rewrite the position's Markdown body. Even if the body still contains an image embed, the property reference is removed and an unshared physical file may be deleted. Check body references in the source file first.

> [!WARNING]
> `Delete Position` trashes only the position file. It does not clean up attachments used only by that position. They remain under `LucrJournal/attachments/` without a position reference. Remove unneeded attachments before deleting a position.

## Next step

Continue with [[templates]] when you need the same body structure for new positions.
