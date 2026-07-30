---
icon: CircleDollarSign
title: "Symbol Fields"
---

This table covers fields in the symbol creation form and Symbols list. See [[symbol-types]] for the calculation model behind each type.

| Field | Meaning | Value or example | Notes |
| --- | --- | --- | --- |
| `Account` | The account that owns the symbol. | An existing account. | It must match an existing account during creation. The account display name enters the symbol filename. |
| `Symbol` | The tradable instrument code. | `BTCUSDT`, `BTCUSDT.P`, `ES`, `XAUUSD`. | The normalized code enters the filename: `SBL-{Account Display Name}-{Normalized Symbol}.md`. |
| `Type` | The model used to interpret quantity, contract unit, and fees. | `Crypto Perpetual`, `Crypto Spot`, `Future`, `CFD`, or Clear. | It is normally inferred from the code and can be changed in the Symbols list. Missing or unrecognized values make position calculations fall back to `Crypto Perpetual`. |
| `Fee` | The symbol's fee rate or per-unit fee. | `0.1%`, `1.25` per contract, or `3` per lot. | Its unit changes with `Type`. A position uses it to derive an absolute fee. |
| `Contract Unit` | The instrument size represented by one quantity unit. | `MES = 5`, `XAUUSD = 100`. | Crypto uses a fixed value of 1. Futures use built-in values. CFDs use a built-in value or a positive integer override. |
| `Position Count` | The number of positions linked to this symbol. | `24`. | Display only. It counts exact position symbol links and does not affect filenames. |

## Quantity and Fee across the four Types

| `Type` | Position quantity field | Valid range | Notional Value | Meaning of `Fee` |
| --- | --- | --- | --- | --- |
| `Crypto Perpetual` | `Amount`, as a USD amount or `Native` asset quantity. | It must be positive to enter calculations. | Native mode uses `Amount × Entry Price`; Contract Unit is fixed at 1. | Percentage of Notional Value, above 0 and below 100. |
| `Crypto Spot` | `Amount`, as a USD amount or `Native` asset quantity. | It must be positive to enter calculations. | Native mode uses `Amount × Entry Price`; Contract Unit is fixed at 1. | Percentage of Notional Value, above 0 and below 100. |
| `Future` | `Contract`, measured in contracts. | An integer from 1 through 20. | `Contract × Entry Price × built-in Contract Unit`. It cannot be derived without a built-in Contract Unit. | An amount per contract. It must be a finite number of at least 0.0001. |
| `CFD` | `Lots`, measured in lots. | 0.01 through 20. | `Lots × Entry Price × Contract Unit`. | An amount per lot. It must be a finite number of at least 0.0001. |

## Code normalization

The code is trimmed and converted to uppercase first. It is then resolved against built-in symbols, pair shapes, and derivative shapes.

| Input | Saved result | Rule |
| --- | --- | --- |
| `doge/usdt` | `DOGEUSDT` | A spot pair with a known quote asset loses its separator. |
| `BTC/USDT:USDT` | `BTCUSDT.P` | A settlement marker becomes `.P`. |
| `BTCUSDT_PERP` | `BTCUSDT.P` | Derivative suffixes such as `PERP` become `.P`. |
| `XAUUSD+` | `XAUUSD` | A built-in symbol returns the canonical catalog name first. |
| `FOO/BAR` | `FOO/BAR` | An explicit pair with an unknown quote asset keeps its uppercased separator shape. |

An empty code, or one that cannot resolve to an uppercase alphanumeric code, explicit pair, or supported derivative shape, is rejected. A symbol is also rejected when its normalized filename already exists under the same account.

> [!WARNING]
> Any six-letter uppercase code missing from the built-in catalog is inferred as `Crypto Spot`. If `Type` is empty or misspelled, the position silently uses `Crypto Perpetual` rules instead. After a code saves, still verify `Type`, `Fee`, and `Contract Unit`.

