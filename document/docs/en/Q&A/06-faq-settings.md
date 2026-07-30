---
icon: Settings
title: "Settings and logs"
---

These questions cover the settings boundaries around timezone display and debug logs.

## Why did “how long ago” change after I changed Timezone?

Relative time discards the offset in the record and compares wall-clock time in the current Timezone. Absolute time converts correctly. Also verify that the setting is a valid timezone, or calendars and relative time can throw errors. See [[settings-and-preferences]].

## Can I send debug logs directly to someone else?

No. With `Debug mode` enabled, a development build logs complete request headers and bodies, which may include sign-in credentials. Enable it only temporarily, then disable it and remove sensitive data before sharing anything. See [[settings-and-preferences]].
