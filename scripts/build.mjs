// Packages the extension for the Chrome Web Store.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

// The fixed name keeps the website's "latest release" download link stable.
const out = "dist/unreel.zip";
// Only replace the zip: dist/ can also hold a signing key (.pem), which is irreplaceable.
mkdirSync("dist", { recursive: true });
rmSync(out, { force: true });
execFileSync("zip", ["-qr", out, "manifest.json", "src", "ui", "icons", "-x", "icons/icon.svg", "*.DS_Store"], { stdio: "inherit" });
console.log(`Built ${out}`);
