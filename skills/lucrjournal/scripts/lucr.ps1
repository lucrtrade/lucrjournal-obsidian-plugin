# Call one LucrJournal agent API operation in the running Obsidian through the Obsidian CLI.
#
# Usage:
#   lucr.ps1 [-Vault <name-or-id>] <operation> [<input.json> | -]
#   Get-Content -Raw -Encoding UTF8 input.json | lucr.ps1 <operation> -
#
# Same contract as lucr.sh: the input travels as base64 of its UTF-8 JSON, the result JSON is
# printed on one line, and the exit code is 0 = ok:true, 1 = ok:false, 2 = no usable answer
# came back (CLI or Obsidian problem); the operation may still have run.
param(
	[string]$Vault = '',
	[Parameter(Position = 0)][string]$Operation = '',
	[Parameter(Position = 1)][string]$InputFile = ''
)

# Windows PowerShell decodes native output with the OEM code page; the CLI prints UTF-8 (Chinese names).
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# An empty -Vault (an unset variable) must not silently fall back to whichever vault is active.
if ($PSBoundParameters.ContainsKey('Vault') -and [string]::IsNullOrWhiteSpace($Vault)) {
	[Console]::Error.WriteLine('lucr.ps1: -Vault is empty.')
	exit 2
}

if ($Operation -notmatch '^[A-Za-z]+$') {
	[Console]::Error.WriteLine('usage: lucr.ps1 [-Vault <name-or-id>] <operation> [<input.json> | -]')
	exit 2
}
if (-not (Get-Command obsidian -ErrorAction SilentlyContinue)) {
	Write-Output '{"ok":false,"error":{"code":"OBSIDIAN_CLI_MISSING","message":"The obsidian command is not on PATH.","fix":"Ask the user to enable Obsidian -> Settings -> General -> Command line interface (Obsidian 1.12+), then open a new terminal."}}'
	exit 2
}

$inputLiteral = 'null'
if ($InputFile -ne '') {
	if ($InputFile -eq '-') {
		$json = @($input) -join "`n"
	} elseif (Test-Path -LiteralPath $InputFile -PathType Leaf) {
		try {
			$json = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $InputFile -ErrorAction Stop).ProviderPath, [Text.Encoding]::UTF8)
		} catch {
			[Console]::Error.WriteLine("lucr.ps1: cannot read input file: $InputFile")
			exit 2
		}
	} else {
		[Console]::Error.WriteLine("lucr.ps1: input file not found: $InputFile")
		exit 2
	}
	$inputLiteral = "'" + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)) + "'"
}

# One line and no double quotes: PowerShell passes it to the native CLI unchanged.
$code = @'
const plugin = app.plugins.plugins.lucrjournal;
const fail = (code, message, fix) => JSON.stringify({ ok: false, error: { code, message, fix } });
if (!plugin) return fail('LUCRJOURNAL_NOT_LOADED_HERE', 'LucrJournal is not enabled in vault ' + app.vault.getName() + '.', 'Ask the user which vault holds the journal, then rerun with -Vault <name>.');
const api = plugin.api;
if (!api || typeof api.version !== 'number' || api.version < 2) return fail('LUCRJOURNAL_API_TOO_OLD', 'The LucrJournal plugin in vault ' + app.vault.getName() + ' is older than this skill (agent API ' + (api ? api.version : 'none') + ', needs 2).', 'Ask the user to update LucrJournal (Settings -> Community plugins -> Check for updates), then retry in the same vault.');
if (typeof api['__OPERATION__'] !== 'function') return fail('UNKNOWN_OPERATION', 'LucrJournal has no operation __OPERATION__.', 'Run lucr.ps1 describe to see the operations of the installed version.');
const input = __INPUT__;
return JSON.stringify(input === null ? await api['__OPERATION__']() : await api['__OPERATION__'](input));
'@
$code = ($code -replace "`r?`n", ' ').Replace('__OPERATION__', $Operation).Replace('__INPUT__', $inputLiteral)

if ($Vault -ne '') {
	$output = & obsidian "vault=$Vault" eval "code=$code" 2>&1 | Out-String
} else {
	$output = & obsidian eval "code=$code" 2>&1 | Out-String
}
$status = $LASTEXITCODE
# The result is the line starting with "=> ". Obsidian can interleave log lines of other, concurrent CLI
# calls ("Received CLI command [...]") into this output; ignore everything else.
$resultLine = @($output -split "`r?`n" | Where-Object { $_.StartsWith('=> ') }) | Select-Object -Last 1
if ($null -eq $resultLine) {
	Write-Output $output.Trim()
	exit 2
}
$result = $resultLine.Substring(3).Trim()
Write-Output $result

if ($status -ne 0) { exit 2 }
if ($result.StartsWith('{"ok":true')) { exit 0 }
if ($result.StartsWith('{"ok":false')) { exit 1 }
exit 2
