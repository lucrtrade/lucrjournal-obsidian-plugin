import { execFileSync } from "node:child_process";

function isCiEnvironment() {
	return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

if (isCiEnvironment()) {
	console.log("[obsidian-open] Skipping Obsidian launch in CI.");
	process.exit(0);
}

try {
	execFileSync("open", ["obsidian://open"], {
		stdio: "ignore",
	});
	console.log("[obsidian-open] Opened Obsidian via obsidian://open.");
} catch (error) {
	console.warn("[obsidian-open] Unable to open Obsidian via obsidian://open.");
	process.exit(0);
}
