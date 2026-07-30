---
icon: Settings
title: "Settings and logs"
---

These questions cover the settings boundaries around timezone display and debug logs.

## Changed relative time

**“How long ago” changed after I changed `Timezone`.**

Relative time discards the offset in the record and compares wall-clock time in the current `Timezone`. Absolute time converts correctly.

Also verify that the setting is a valid timezone, or calendars and relative time can throw errors.

→ [[settings-and-preferences]]

## Sensitive debug logs

**I am about to send my debug logs to someone else.**

Do not send them as-is. With `Debug mode` enabled, a development build logs complete request headers and bodies, which may include sign-in credentials.

> [!WARNING] What to do
> Enable `Debug mode` only temporarily, then disable it and remove sensitive data before sharing anything.

→ [[settings-and-preferences]]
