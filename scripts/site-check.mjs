// Screenshots the website and checks its interactions and layout at phone width.
import { chromium } from "playwright";
import { resolve } from "node:path";
const out = process.argv[2] ?? "test-results";
const url = `file://${resolve("docs/index.html")}`;
const b = await chromium.launch();
let failed = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "pass" : "FAIL"}  ${n} ${x}`); if (!ok) failed++; };
for (const [name, width, height] of [["desktop", 1280, 800], ["phone", 360, 740]]) {
  const p = await b.newPage({ viewport: { width, height } });
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url); await p.waitForTimeout(2600);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${name}: no sideways scroll`, over <= 0, `overflow ${over}px`);
  check(`${name}: font loaded`, await p.evaluate(() => document.fonts.check('700 20px "Bricolage"')));
  await p.screenshot({ path: `${out}/site-${name}-top.png` });
  await p.screenshot({ path: `${out}/site-${name}.png`, fullPage: true });
  check(`${name}: no script errors`, errors.length === 0, errors.join());
  if (name === "desktop") {
    await p.locator("#try").scrollIntoViewIfNeeded();
    await p.locator("#demo-switch").uncheck({ force: true }); await p.waitForTimeout(500);
    check("demo off shows the feed", (await p.locator("#demo .noise").evaluate((e) => getComputedStyle(e).opacity)) === "1");
    check("demo label follows", (await p.textContent("#demo-label")) === "Unreel is off");
    await p.locator("#try").screenshot({ path: `${out}/site-demo-off.png` });
  }
  await p.close();
}
await b.close();
process.exit(failed ? 1 : 0);
