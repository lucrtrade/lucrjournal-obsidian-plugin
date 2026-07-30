---
icon: FileText
title: "Position Templates"
---

## What a Position Template is

A Position Template is a starting body for a new position. It can hold fixed review questions, checklists, and screenshot placeholders. It does not hold the account, symbol, side, or execution result for one trade.

When you create a position from a template, the template body replaces the normal empty `Notes` body. You still enter Account, Symbol, and Side under `Create New Position`. The complete validation flow still runs.

> [!NOTE]
> A template affects only the body copied during creation. Enter real prices, size, times, and conclusions in each position.

## Create a template from its dedicated entry point

Create templates only from the `Templates` menu beside `New Position`. Do not treat one as a generic entry. The generic creation path does not accept Position Templates.

1. Select the down arrow beside `New Position` to open `Templates`.
2. Select `Create New Template`.
3. Enter a nonempty name under `Enter template name`, then press Enter.
4. When the page shows `Position Template`, select `Open source file`.
5. Write the Markdown body to copy below the file properties.

Templates are stored under `LucrJournal/templates/` with five-digit sequences such as `TPL-00001.md`. Use `Edit template file` to reopen an existing template.

%% ![[screenshot-position-template-menu.png]] %%

## Write the template body

The template body is the Markdown used when a new position is created. Keep it short. Include only structure that you use every time.

```markdown
# Notes

## Entry thesis

## Execution mistakes

## Review conclusion
```

`# Notes` is the body heading for the default `Notes` area. The template body is not validated against the default position structure, so a completely different body is also accepted.

> [!WARNING]
> If the template omits `# Notes`, a position created from it may also have no default `Notes` section. Keep `# Notes` unless you intentionally need a custom structure.

If Templater is installed, LucrJournal tries to expand the template body while creating the position. Without Templater, it uses the raw body. If expansion fails, it logs the error and also falls back to the raw body. The template file is not rewritten.

![[screenshot-position-template-detail.png]]

## Create a position from a template

Template creation means choosing a body starting point, then using the normal position creation flow.

1. Select the down arrow beside `New Position`.
2. Under `Templates`, select a template name. The pencil button beside it is `Edit template file`.
3. `Create New Position` displays `Template` and the selected name.
4. Complete `Account`, `Symbol`, and `Side`.
5. Select `Save Position`.

Saving still validates the existing account, symbol format, side, file identity, and position property shape. If the template file no longer exists, creation fails before writing the position.

After creation, LucrJournal still writes the `Open` status, current-timezone `Opened At`, and the other normal defaults. Only the body source changes to the template.

> [!TIP]
> If you delete large sections from the template every time, remove those fixed sections. A template should reduce repeated typing, not create cleanup work.

## Next step

Return to [[position-details]] to add the real trade, or continue to [[dashboard-review]] for daily review.
