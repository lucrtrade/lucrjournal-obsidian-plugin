---
icon: Settings
title: "Settings and preferences"
---

LucrJournal plugin settings are grouped into `Account`, `General`, `Modified Timestamp`, and `Advanced`. The sign-in actions and six settings in these groups change identity state, presentation, and runtime behavior. They do not change your trading conclusions.

%% ![[screenshot-settings-accounts.png]] %%

## Account

When signed out, `Account` shows `Sign in`. It opens LucrTrade for authorization, then shows `Checking LucrJournal access` after you return to Obsidian.

When signed in, this section shows the available avatar, email, and plan. A free Account shows `Free`. A paid plan may also show `Premium`, Monthly or Annual billing, and a renewal or valid-until date. The `Account` section describes identity only. It has no upgrade or recheck action.

After you select `Log out`, the plugin immediately clears the local session and refreshes the interface. It then tries to revoke the old session remotely. Remote revocation is best effort: an offline or failed request does not undo local logout and does not have to succeed first.

## Language

`Language` offers `System`, `English`, and `中文`. The default is `System`: Chinese Obsidian locales use Chinese, and other locales use English.

Changing Language immediately refreshes LucrJournal UI text and date and number formats. It does not translate or rewrite saved vault content.

## Timezone

`Timezone` controls the display or write context for calendar dates, absolute times, relative times, and newly created records. Settings offers common cities and UTC with their current offsets.

> [!WARNING]
> The persisted Timezone setting accepts any string without checking whether it is a real timezone. Writing an invalid value directly makes calendar and relative-time formatting throw errors. Use only the options in Settings.

Absolute time parses the offset stored in the record, then converts it to the current Timezone, so the same instant is displayed correctly. Relative time discards the stored offset and compares the original date and time as wall-clock time in the current Timezone. Changing Timezone can therefore change how long ago the same instant appears.

## Modified Timestamp

`Auto update modified` is enabled by default. It only handles Markdown under `LucrJournal/` that still refines as a valid entry. About two seconds after a qualifying change, it updates `modified`. If `created` is missing, it writes the same timestamp there too.

Enabling it reveals `Update strategy`:

| Option | Default | When it updates |
| --- | --- | --- |
| `User-driven` | Yes | Only editor input, deletion, and movement. Programmatic writes are not user edits. |
| `File-driven` | No | Any vault file modification event, including changes made by other tools. |

Turn off `Auto update modified` if you do not want the plugin to maintain these timestamps. Existing timestamps are not deleted.

## Advanced

`Show release notes after updates` is enabled by default. After LucrJournal upgrades to a newer version, it opens the latest changelog difference. A first install does not show historical updates. Turning it off only disables the automatic modal after upgrades. You can still run the `Show release notes` command.

`Debug mode` is disabled by default. When enabled, the shared logger writes debug messages and groups to the developer console. Warnings and errors remain visible regardless of this setting. Only a development build adds request logging; a production build does not install that request interceptor.

> [!WARNING]
> With `Debug mode` enabled, a development build writes complete request headers and bodies to the developer console. They may contain sign-in credentials. Enable it only temporarily while troubleshooting. Do not leave it on, and do not send console logs captured while it was enabled directly to anyone.

For Settings problems, start with [[q-and-a]]. To understand file modification boundaries, continue with [[local-files-and-markdown]].
