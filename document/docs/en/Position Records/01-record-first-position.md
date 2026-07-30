---
icon: FilePlus
title: "Record Your First Position"
---

## What creating a position means

Creating a position makes a separate record for one trade. The creation form asks only for the three facts that identify the trade: `Account`, `Symbol`, and `Side`. You add prices, size, times, and review content after saving.

Prepare an existing account first. You can choose a saved symbol or enter a new code while creating the position. See [[accounts-and-symbols]] for the account and symbol relationship.

## Complete the creation fields

All three fields in `Create New Position` are required.

| Field | What to enter | Validation |
| --- | --- | --- |
| `Account` | Choose the account that owns this trade. | It must match an existing account. Typing a missing name does not create an account and cannot save the position. |
| `Symbol` | Choose one under `IN MY JOURNAL`, or enter a new symbol code. | It cannot be empty. Use uppercase codes: `BTCUSDT` or `BTC/USDT` for spot, `BTCUSDT.P` or `BTC/USDT:USDT` for perp, `ES` or `NQ` for futures, and `XAUUSD` for CFD. |
| `Side` | Choose `LONG` or `SHORT`. | These are the only values. The default is `LONG`. |

If a new symbol passes validation, LucrJournal first ensures that it exists under the selected account, then creates the position. It does not create an account when you type a new account name.

If you select a template from `Templates`, the form also displays `Template`. It changes only the new position body and adds no creation field.

> [!NOTE]
> Check `Symbol` again after changing `Account`. Symbol choices always come from the current account.

![[screenshot-new-position-modal.png]]

## Create and save the record

1. Select `New Position` in LucrJournal.
2. Under `Create New Position`, choose an `Account`.
3. Under `Symbol`, choose a saved code or enter a valid new code.
4. Under `Side`, choose `LONG` or `SHORT`.
5. Check all three values, then select `Save Position`.

You can submit only when all three fields are nonempty. A visible field validation error prevents any position write. If creation fails, the current draft stays in the form so you can correct it.

> [!TIP]
> Skip templates for your first record. Create one from [[templates]] after you start repeating the same review questions.

## What happens after saving

After a successful save, LucrJournal opens the new position details and writes:

- `Status` as `Open`.
- `Opened At` as the current time in your configured timezone.
- The `Side` selected during creation.
- Empty `Confidence`, `Notional Value`, `Risk`, and `Fee` values.
- An initial `Net PnL` of 0.
- An empty `Notes` section.

Empty values mean that the information is incomplete. They do not mean that LucrJournal calculated a result. The position file is stored under `LucrJournal/positions/` with a five-digit sequence such as `POS-00001.md`.

Select `Positions` to find it again in the list.

![[screenshot-positions.png]]

## What cannot change after creation

`Side` cannot change after creation. LucrJournal rejects an entire later update if that update includes Side. Check `LONG` or `SHORT` before saving.

> [!WARNING]
> If you selected the wrong side, delete the incorrect record and create a new one with the correct side. The plugin has no supported flow for changing the side of an existing position.

The position's account comes from its linked symbol. Position details displays the account, symbol, and fixed side, but does not treat them as normal completion fields. See [[position-lifecycle]] for the complete lifecycle rules.

## Next step

Continue with [[position-details]] to add entry, exit, size, times, the plan, and raw Notes.
