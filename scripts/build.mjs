// Packages the extension for the Chrome Web Store.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const out = `dist/unreel-${version}.zip`;
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
execFileSync("zip", ["-qr", out, "manifest.json", "src", "ui", "icons", "-x", "icons/icon.svg", "*.DS_Store"], { stdio: "inherit" });
console.log(`Built ${out}`);
