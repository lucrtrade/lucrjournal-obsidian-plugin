---
icon: Calculator
title: "Symbols and values"
---

These questions cover Symbol fields, derived values, the position lifecycle, and constraints after creation.

## Incorrect Type

**My Symbol saved, but its `Type` is not the one I selected.**

`Type` is inferred; it is not parsed from the code.

An unknown six-character uppercase code is inferred as `Crypto Spot`. A missing or unrecognized `Type` makes position calculations fall back to `Crypto Perpetual`. Neither case reports an error.

> [!TIP] What to do
> After adding a Symbol, verify `Type`, `Fee`, and `Contract Unit` in the `Symbols` list.

→ [[symbol-types]] · [[symbol-fields]]

## Zero Fee

**A `Fee` of 0 will not save.**

All three fee models reject 0. Leave `Fee` blank when there is no fee.

The same `Fee` field has a different meaning for each Type:

| Type | Meaning of `Fee` |
| --- | --- |
| `Crypto Spot`, `Crypto Perpetual` | Percentage of notional value |
| `Future` | Amount per contract |
| `CFD` | Amount per lot |

→ [[symbol-types]]

## R:R mismatch

**The R:R shown in LucrJournal does not match my calculation.**

==Both `Planned R:R` and `Real R:R` recalculate Risk, ignore the saved `Risk`, and exclude `Fee`.==

They recalculate from `Side`, `Entry Price`, `Stop Loss`, and `Target Price` or `Exit Price`. They do not read saved `Risk` or `Net PnL`. The formula uses one `Entry Price` and has no average-entry model.

→ [[position-fields]] · [[position-lifecycle]]

## Stale derived values

**I changed an amount or price, but `Notional Value` still shows the old value.**

When a new value cannot be calculated, the old derived value remains instead of being cleared.

If `Amount`, `Entry Price`, or `Contract Unit` becomes invalid, the old `Notional Value` remains when the formula has no new result. `Fee` behaves the same way when it cannot be derived again. These values continue to participate in `Net PnL` calculations.

> [!WARNING] What to do
> After breaking or removing a source field, verify `Notional Value`, `Fee`, `Net PnL`, and `Risk`.

→ [[position-details]] · [[position-fields]]

## Unsynchronized closure

**`Status`, `Closed At`, and `Exit Price` disagree.**

These three fields are not forced to stay synchronized.

An `Exit Price` of 0 or less still closes a position. Clearing `Exit Price` does not reopen it.

> [!TIP] What to do
> Verify all three fields after closing or reopening a position.

→ [[position-lifecycle]]

## Immutable Side

**I selected the wrong `Side` and cannot change it.**

`Side` cannot be changed after a position is created. Any update that touches it is rejected as a whole.

> [!TIP] What to do
> Delete the incorrect record and recreate it with the correct `Side`.

→ [[record-first-position]]
