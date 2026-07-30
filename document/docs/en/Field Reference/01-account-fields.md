---
icon: WalletCards
title: "Account and Platform Fields"
---

This table covers fields in the account creation form and Accounts list. See [[accounts-and-symbols]] for how accounts, platforms, and symbols relate.

| Field | Meaning | Value or example | Filename and display rules |
| --- | --- | --- | --- |
| `Platform` | The platform linked to the account. | `Binance`, `Interactive Brokers`, or a new platform name. | A new platform creates a same-named `.md` file from the sanitized value. If `Display Name` is blank, Platform also becomes the account display name and enters the account filename. |
| `Display Name` | The optional name entered when creating an account. | `Main Account`, `Paper`; leave blank to use `Platform`. | After sanitization and trimming, it becomes the account display name. The account filename is `ACC-{Display Name}.md`. |
| `Account Name` | The current display name shown and edited in the Accounts list. | `Main Account`. | It represents the same account identity as `Display Name` during creation. Changing it updates the account file, its symbol files, and symbol references in positions. |
| `Symbols` | The number of symbols under this account. | `12`. | Display only. It counts symbols whose account link exactly targets this account basename. It does not affect filenames. |
| `Positions` | The number of positions linked through this account's symbols. | `48`. | Display only. The account is derived through each position's symbol; legacy account fields on positions are ignored. It does not affect filenames. |

A platform uses its filename as its name. An account display name resolves from a nonempty `Display Name`, then the platform name, and finally `Account`. Platform icons are display-only and do not affect account or platform filenames.

> [!WARNING]
> Changing `Account Name` rewrites the account, symbols, and position references one by one, with no automatic rollback. Confirm that the new name does not collide with an existing file before renaming.

