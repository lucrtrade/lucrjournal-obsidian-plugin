import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createJiti } from "jiti";

const shouldInstallFromCli = process.argv.includes("--install");
const SANDBOX_VAULT_NAME = "Obsidian Sandbox";
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
globalThis.__LUCRJOURNAL_CHART_VERSION__ = packageJson.chart_version;
globalThis.__LUCRJOURNAL_CHART_IFRAME_URL__ = `https://lucrchart.lucrtrade.com/lv/${packageJson.chart_version}`;
const jiti = createJiti(import.meta.url);
const {
	LUCR_JOURNAL_VIEW_TYPE,
	LUCR_TRADE_ROOT_DIR,
	OPEN_JOURNAL_COMMAND_ID,
} = jiti("../src/constant.ts");

function isCiEnvironment() {
	return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

function runObsidianCommand(args, options = {}) {
	const commandArgs = options.vaultName === undefined
		? args
		: [`vault=${options.vaultName}`, ...args];
	console.debug("[obsidian-sync] obsidian", args);
	return execFileSync("obsidian", commandArgs, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function runSandboxObsidianCommand(args) {
	return runObsidianCommand(args, { vaultName: SANDBOX_VAULT_NAME });
}

function isObsidianCommandError(output) {
	return output.startsWith("Error:");
}

function listVaultNames() {
	return runObsidianCommand(["vaults"])
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function getSandboxVaultPath() {
	const output = runSandboxObsidianCommand(["vault", "info=path"]);

	if (isObsidianCommandError(output)) {
		throw new Error(`[obsidian-sync] Obsidian CLI failed to resolve sandbox vault path: ${output}`);
	}

	const lines = output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const pathLine = lines.find((line) => line.startsWith("path\t"));
	const vaultPath = pathLine === undefined ? output : pathLine.slice("path\t".length).trim();

	if (!path.isAbsolute(vaultPath)) {
		throw new Error(`[obsidian-sync] Obsidian CLI returned an invalid sandbox vault path: ${output}`);
	}

	return vaultPath;
}

function getEnabledCommunityPluginIds(vaultPath) {
	const communityPluginsPath = path.join(vaultPath, ".obsidian", "community-plugins.json");

	if (!existsSync(communityPluginsPath)) {
		return [];
	}

	return JSON.parse(readFileSync(communityPluginsPath, "utf8"));
}

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function ensureSandboxVaultExists() {
	const vaultNames = listVaultNames();

	if (!vaultNames.includes(SANDBOX_VAULT_NAME)) {
		throw new Error(
			`[obsidian-sync] Vault "${SANDBOX_VAULT_NAME}" not found. This plugin can only be installed into the sandbox vault.`,
		);
	}
}

function resetSandboxTradeRoot(vaultPath) {
	const examplesDir = path.join(process.cwd(), "examples");

	if (!existsSync(examplesDir)) {
		throw new Error(`[obsidian-sync] Missing examples directory: ${examplesDir}.`);
	}

	const tradeRootDir = path.join(vaultPath, LUCR_TRADE_ROOT_DIR);
	rmSync(tradeRootDir, { recursive: true, force: true });
	mkdirSync(tradeRootDir, { recursive: true });

	const exampleSubdirectories = readdirSync(examplesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory());

	for (const entry of exampleSubdirectories) {
		cpSync(path.join(examplesDir, entry.name), path.join(tradeRootDir, entry.name), {
			recursive: true,
		});
	}

	console.log(`[obsidian-sync] Reset ${LUCR_TRADE_ROOT_DIR} in ${SANDBOX_VAULT_NAME} from ${examplesDir}.`);
}

if (isCiEnvironment()) {
	console.log("[obsidian-sync] Skipping local vault sync in CI.");
	process.exit(0);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pluginId = manifest.id;
const openJournalCommandId = `${pluginId}:${OPEN_JOURNAL_COMMAND_ID}`;

if (!pluginId) {
	throw new Error("[obsidian-sync] manifest.json is missing an id.");
}

ensureSandboxVaultExists();

const vaultPath = getSandboxVaultPath();

if (!vaultPath) {
	throw new Error(`[obsidian-sync] Unable to resolve the vault path for "${SANDBOX_VAULT_NAME}".`);
}

resetSandboxTradeRoot(vaultPath);

const installedPluginIds = runSandboxObsidianCommand(["plugins"])
	.split("\n")
	.map((line) => line.trim())
	.filter(Boolean);

const isInstalled = installedPluginIds.includes(pluginId);
const enabledPluginIds = getEnabledCommunityPluginIds(vaultPath);
const isEnabled = enabledPluginIds.includes(pluginId);
const shouldInstall = shouldInstallFromCli || !isInstalled;
const shouldEnable = shouldInstall || !isEnabled;

if (!shouldInstall && !isInstalled) {
	console.log(`[obsidian-sync] Plugin ${pluginId} is not installed in the current vault; skipping sync.`);
	process.exit(0);
}

const pluginDir = path.join(vaultPath, ".obsidian", "plugins", pluginId);
mkdirSync(pluginDir, { recursive: true });

for (const assetDirName of ["onnxruntime-web", "ocr"]) {
	rmSync(path.join(pluginDir, assetDirName), { recursive: true, force: true });
}

for (const fileName of ["main.js", "manifest.json", "styles.css"]) {
	if (!existsSync(fileName)) {
		throw new Error(`[obsidian-sync] Missing build artifact: ${fileName}.`);
	}

	cpSync(fileName, path.join(pluginDir, fileName));
}

if (shouldEnable) {
	await sleep(100);

	const enableResult = runSandboxObsidianCommand(["plugin:enable", `id=${pluginId}`]);
	if (enableResult === null) {
		console.warn(`[obsidian-sync] Plugin ${pluginId} was copied, but automatic enable did not succeed.`);
	}

	await sleep(100);
}

const reloadResult = runSandboxObsidianCommand(["plugin:reload", `id=${pluginId}`]);

if (reloadResult === null) {
	console.warn(`[obsidian-sync] Plugin files were copied to ${pluginDir}, but automatic reload did not succeed.`);
	process.exit(0);
}

const detachResult = runSandboxObsidianCommand([
	"eval",
	`code=app.workspace.detachLeavesOfType('${LUCR_JOURNAL_VIEW_TYPE}')`,
]);

if (detachResult === null) {
	console.warn(`[obsidian-sync] Plugin ${pluginId} reloaded, but closing ${LUCR_JOURNAL_VIEW_TYPE} tabs did not succeed.`);
}

await sleep(100);

const reopenResult = runSandboxObsidianCommand([
	"command",
	`id=${openJournalCommandId}`,
]);

if (reopenResult === null) {
	console.warn(`[obsidian-sync] Plugin ${pluginId} reloaded, but reopening ${openJournalCommandId} did not succeed.`);
}

if (shouldInstallFromCli || !isInstalled) {
	console.log(`[obsidian-sync] Installed plugin ${pluginId} into ${pluginDir} and reloaded it.`);
} else if (!isEnabled) {
	console.log(`[obsidian-sync] Enabled plugin ${pluginId} in ${pluginDir}, synced files, and reloaded it.`);
} else {
	console.log(`[obsidian-sync] Synced plugin ${pluginId} to ${pluginDir} and reloaded it.`);
}
