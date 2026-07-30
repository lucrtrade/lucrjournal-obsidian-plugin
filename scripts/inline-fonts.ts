import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cssPath = resolve(root, "styles.css");

let css = readFileSync(cssPath, "utf8");

// @story [[lucrjournal/build#^inline-font-assets]] Replaces every local WOFF2 reference with its base64 data URL.
css = css.replace(/url\(([^)]+\.woff2)\)/g, (_match, rawPath) => {
	const clean = rawPath.replace(/['"]/g, "");
	const abs = resolve(root, "node_modules", clean);
	const buf = readFileSync(abs);
	const b64 = buf.toString("base64");
	return `url(data:font/woff2;base64,${b64})`;
});

writeFileSync(cssPath, css);

const kb = (Buffer.byteLength(css) / 1024).toFixed(1);
console.log(`[inline-fonts] Inlined woff2 fonts into styles.css (${kb} KB)`);
