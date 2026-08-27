import { readFileSync, writeFileSync } from "fs";

// @story [[lucrjournal/build#^version-metadata-sync]] Uses the package version to update the manifest and compatibility map.
const { version: targetVersion } = JSON.parse(readFileSync("package.json", "utf8"));

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

const isPrerelease = targetVersion.includes("-");
if (!isPrerelease) {
	const versions = JSON.parse(readFileSync("versions.json", "utf8"));
	if (versions[targetVersion] !== minAppVersion) {
		versions[targetVersion] = minAppVersion;
		writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
	}
}

const changelog = readFileSync("CHANGELOG.md", "utf8");
const escapedVersion = targetVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sectionPattern = new RegExp(`^## \\[${escapedVersion}\\]`, "m");
if (!sectionPattern.test(changelog)) {
	const unreleasedPattern = /^## \[Unreleased\]/m;
	if (unreleasedPattern.test(changelog)) {
		const updatedChangelog = changelog.replace(
			unreleasedPattern,
			`## [Unreleased]\n\n## [${targetVersion}]`,
		);
		writeFileSync("CHANGELOG.md", updatedChangelog);
	}
}
