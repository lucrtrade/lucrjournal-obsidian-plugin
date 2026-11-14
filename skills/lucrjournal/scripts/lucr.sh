#!/usr/bin/env bash
# Call one LucrJournal agent API operation in the running Obsidian through the Obsidian CLI.
#
# Usage:
#   lucr.sh [--vault <name-or-id>] <operation> [<input.json> | -]
#
#   <operation>   An operation name from `lucr.sh describe`, e.g. createPosition, linkContext.
#   <input.json>  JSON object with the operation's fields; `-` reads it from stdin; omit for none.
#
# The input travels as base64 of its UTF-8 JSON, so quotes, Chinese text and newlines need no
# escaping. Prints the result JSON on one line. Exit code: 0 = ok:true, 1 = ok:false (read
# error.code / error.fix), 2 = no usable answer came back (CLI or Obsidian problem); the operation may still have run.
set -u

vault=""
positional=()
while [ $# -gt 0 ]; do
	case "$1" in
		--vault) vault="${2:-}"; shift 2 || shift; [ -n "$vault" ] || { echo 'usage: lucr.sh [--vault <name-or-id>] <operation> [<input.json> | -]' >&2; exit 2; } ;;
		--vault=*) vault="${1#--vault=}"; shift; [ -n "$vault" ] || { echo 'usage: lucr.sh [--vault <name-or-id>] <operation> [<input.json> | -]' >&2; exit 2; } ;;
		*) positional+=("$1"); shift ;;
	esac
done
if [ "${#positional[@]}" -gt 2 ]; then
	echo 'usage: lucr.sh [--vault <name-or-id>] <operation> [<input.json> | -]' >&2
	exit 2
fi
operation="${positional[0]:-}"
source="${positional[1]:-}"

if ! printf '%s' "$operation" | grep -Eq '^[A-Za-z]+$'; then
	echo 'usage: lucr.sh [--vault <name-or-id>] <operation> [<input.json> | -]' >&2
	exit 2
fi
if ! command -v obsidian >/dev/null 2>&1; then
	echo '{"ok":false,"error":{"code":"OBSIDIAN_CLI_MISSING","message":"The obsidian command is not on PATH.","fix":"Ask the user to enable Obsidian -> Settings -> General -> Command line interface (Obsidian 1.12+), then open a new terminal."}}'
	exit 2
fi

input="null"
if [ -n "$source" ]; then
	if [ "$source" = "-" ]; then
		json="$(cat)"
	elif [ -f "$source" ]; then
		json="$(cat "$source")"
	else
		echo "lucr.sh: input file not found: $source" >&2
		exit 2
	fi
	input="'$(printf '%s' "$json" | base64 | tr -d '\n\r')'"
fi

# No double quotes in the code: the same text works as a PowerShell argument (see lucr.ps1).
code="const plugin = app.plugins.plugins.lucrjournal;
const fail = (code, message, fix) => JSON.stringify({ ok: false, error: { code, message, fix } });
if (!plugin) return fail('LUCRJOURNAL_NOT_LOADED_HERE', 'LucrJournal is not enabled in vault ' + app.vault.getName() + '.', 'Ask the user which vault holds the journal, then rerun with --vault <name>.');
const api = plugin.api;
if (!api || typeof api.version !== 'number' || api.version < 2) return fail('LUCRJOURNAL_API_TOO_OLD', 'The LucrJournal plugin in vault ' + app.vault.getName() + ' is older than this skill (agent API ' + (api ? api.version : 'none') + ', needs 2).', 'Ask the user to update LucrJournal (Settings -> Community plugins -> Check for updates), then retry in the same vault.');
if (typeof api['$operation'] !== 'function') return fail('UNKNOWN_OPERATION', 'LucrJournal has no operation $operation.', 'Run lucr.sh describe to see the operations of the installed version.');
const input = $input;
return JSON.stringify(input === null ? await api['$operation']() : await api['$operation'](input));"

if [ -n "$vault" ]; then
	output="$(obsidian "vault=$vault" eval "code=$code" 2>&1)"
else
	output="$(obsidian eval "code=$code" 2>&1)"
fi
status=$?
# The result is the line starting with "=> ". Obsidian can interleave log lines of other, concurrent CLI
# calls ("Received CLI command [...]") into this output; ignore everything else.
result_line="$(printf '%s\n' "$output" | grep '^=> ' | tail -n 1)"
if [ -z "$result_line" ]; then
	printf '%s\n' "$output"
	exit 2
fi
result="${result_line#=> }"
printf '%s\n' "$result"
if [ $status -ne 0 ]; then
	exit 2
fi
case "$result" in
	'{"ok":true'*) exit 0 ;;
	'{"ok":false'*) exit 1 ;;
	*) exit 2 ;;
esac
