---
icon: Calculator
title: "Symbols and values"
---

These questions cover Symbol fields, derived values, the position lifecycle, and constraints after creation.

## Why was my Symbol saved with the wrong Type?

An unknown six-character uppercase code is inferred as Crypto Spot. A missing or unrecognized Type makes position calculations fall back to Crypto Perpetual. Verify Type, Fee, and Contract Unit after adding it. See [[symbol-types]] and [[symbol-fields]].

## Why can I not save a Fee of 0?

Leave Fee blank when there is no fee. All three fee models reject 0. Crypto uses a percentage, Futures use an amount per contract, and CFDs use an amount per lot. See [[symbol-types]].

## Why is R:R different from my calculation?

Planned and Real R:R recalculate from Side, Entry Price, Stop Loss, and Target Price or Exit Price. They do not use saved Risk or Net PnL, and they exclude Fee. The formula uses one Entry Price and has no average-entry model. See [[position-fields]] and [[position-lifecycle]].

## Why is an old derived value still present after I cleared an input?

If Amount, Entry Price, or Contract Unit becomes invalid and no new result can be calculated, the old Notional Value is not cleared. Fee can remain too when it cannot be derived again. Recheck Notional Value, Fee, Net PnL, and Risk. See [[position-details]] and [[position-fields]].

## Why do Closed At, Status, and Exit Price disagree?

These fields are not forced to stay synchronized. An Exit Price of 0 or less still closes a position, and clearing Exit Price does not reopen it. Check all three after closing or reopening. See [[position-lifecycle]].

## Why can I not fix the Side after creation?

`Side` cannot be changed after a position is created. Any update that touches it is rejected as a whole. Delete the incorrect record and recreate it with the correct Side. See [[record-first-position]].
