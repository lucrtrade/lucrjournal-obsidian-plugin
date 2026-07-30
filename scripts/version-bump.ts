import { readFileSync, writeFileSync } from "fs";

// @story [[lucrjournal/build#^version-metadata-sync]] Uses the package version to update the manifest and compatibility map.
const { version: targetVersion } = JSON.parse(readFileSync("package.json", "utf8"));

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (versions[targetVersion] !== minAppVersion) {
	versions[targetVersion] = minAppVersion;
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
}
