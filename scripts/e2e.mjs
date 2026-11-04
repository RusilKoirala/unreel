// Loads the real extension into Chromium and checks it against live YouTube and
// Instagram (logged out). Saves screenshots to test-results/.
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ext = resolve(".");
const out = resolve("test-results");
mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "unreel-")), {
  channel: "chromium",
  headless: true,
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const id = new URL(sw.url()).host;
const setSettings = (s) => sw.evaluate((v) => chrome.storage.sync.set({ settings: v }), s);

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "pass" : "FAIL"}  ${name} ${extra}`);
  if (!ok) failed++;
};
const visible = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel);
const go = async (p, u, wait = 6000) => {
  for (let attempt = 1; ; attempt++) {
    try {
      await p.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`retry ${u}: ${e.message.split("\n")[0]}`);
    }
  }
  await p.waitForTimeout(wait);
};
// Panel text must be readable on whatever the site actually painted.
const panelReadable = (p) => p.evaluate(() => {
  const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const text = lum(getComputedStyle(document.getElementById("unreel-panel")).color);
  let bg = 255;
  for (const el of [document.body, document.documentElement]) {
    const c = getComputedStyle(el).backgroundColor;
    if (!/, 0\)$/.test(c) && c !== "transparent") { bg = lum(c); break; }
  }
  return Math.abs(text - bg) > 100;
});

const p = await ctx.newPage();
const SHORTS = "ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, grid-shelf-view-model:has(ytm-shorts-lockup-view-model)";

await go(p, "https://www.youtube.com/");
check("yt home: feed hidden", (await visible(p, "ytd-rich-grid-renderer")) === 0);
check("yt home: panel shown", (await visible(p, "#unreel-panel")) === 1);
check("yt home: panel text readable", await panelReadable(p));
check("yt home: Shorts guide entry hidden", (await visible(p, 'ytd-guide-entry-renderer:has(a[title="Shorts"])')) === 0);
check("yt home: search kept", (await visible(p, "input[name=search_query], yt-searchbox")) > 0);
await p.screenshot({ path: `${out}/yt-home.png` });

await go(p, "https://www.youtube.com/results?search_query=funny+cats");
check("yt search: Shorts hidden", (await visible(p, SHORTS)) === 0);
check("yt search: normal results kept", (await visible(p, "ytd-video-renderer")) > 0);
await p.screenshot({ path: `${out}/yt-search.png` });

await go(p, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
check("yt watch: suggestions hidden", (await visible(p, "ytd-watch-next-secondary-results-renderer")) === 0);
check("yt watch: player kept", (await visible(p, "#movie_player")) === 1);
check("yt watch: comments stay (off by default)", (await visible(p, "ytd-comments#comments")) === 1);

await go(p, "https://www.youtube.com/@MrBeast");
const tabs = await p.evaluate(() => [...document.querySelectorAll("yt-tab-shape")].map((t) => [t.getAttribute("tab-title"), t.getClientRects().length > 0]));
check("yt channel: Shorts tab hidden, others kept", tabs.some(([n, v]) => n === "Videos" && v) && !tabs.some(([n, v]) => n === "Shorts" && v), JSON.stringify(tabs));

await go(p, "https://www.youtube.com/shorts/");
check("yt /shorts/ leaves Shorts", !p.url().includes("/shorts"), p.url());

await go(p, "https://www.instagram.com/", 5000);
check("ig logged out: login form not blocked", (await visible(p, 'input[type="password"]')) === 1);
check("ig logged out: no panel", (await visible(p, "#unreel-panel")) === 0);
await go(p, "https://www.instagram.com/reels/", 5000);
check("ig reels: page hidden", (await visible(p, "main")) === 0, p.url());
check("ig reels: panel shown", (await visible(p, "#unreel-panel")) === 1);
check("ig reels: panel text readable", await panelReadable(p));
check("ig reels: no video playing", await p.evaluate(() => [...document.querySelectorAll("video")].every((v) => v.paused)));
await p.screenshot({ path: `${out}/ig-reels.png` });

// Rule off, live update without reload.
await go(p, "https://www.youtube.com/");
await setSettings({ rules: { ytHome: false } });
await p.waitForTimeout(800);
check("toggle off applies without reload", (await visible(p, "ytd-rich-grid-renderer")) > 0 && (await visible(p, "#unreel-panel")) === 0);

// Paid schedule that excludes right now: nothing is blocked.
const nowDay = new Date().getDay();
await setSettings({ scheduleEnabled: true, schedules: [{ id: "a", start: "00:00", end: "00:00", days: [(nowDay + 2) % 7] }] });
await go(p, "https://www.youtube.com/results?search_query=funny+cats");
check("outside hours: Shorts visible", (await visible(p, SHORTS)) > 0);
await setSettings({ scheduleEnabled: true, schedules: [{ id: "a", start: "00:00", end: "00:00", days: [nowDay] }] });
await p.waitForTimeout(800);
check("schedule start applies without reload", (await visible(p, SHORTS)) === 0);

// Extension pages.
await setSettings({});
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 340, height: 600 });
await pop.goto(`chrome-extension://${id}/ui/popup.html`);
await pop.waitForTimeout(400);
check("popup renders 7 rules", (await pop.locator(".rule").count()) === 7);
await pop.screenshot({ path: `${out}/popup.png` });
await pop.click("#pause");
await pop.waitForTimeout(300);
check("pause starts a countdown", (await pop.textContent("#pause")).startsWith("Cancel"));
await pop.click("#pause");
check("pause can be cancelled", (await pop.textContent("#pause")).startsWith("Pause"));

// The full pause: wait out the delay, confirm blocking lifts, then resume.
await pop.click("#pause");
await pop.waitForTimeout(10600);
check("pause takes effect after the wait", (await pop.textContent("#status-title")) === "Blocking is paused");
await p.bringToFront();
await go(p, "https://www.youtube.com/results?search_query=funny+cats");
check("paused: Shorts visible", (await visible(p, SHORTS)) > 0);
await pop.click("#pause");
await p.waitForTimeout(800);
check("resume re-blocks without reload", (await visible(p, SHORTS)) === 0);

const opt = await ctx.newPage();
await opt.setViewportSize({ width: 1280, height: 800 });
await opt.goto(`chrome-extension://${id}/ui/options.html`);
await opt.waitForTimeout(300);
check("options: switch locked until hours exist", await opt.isDisabled("#enabled"));
await opt.click("#add");
check("options: add hours draws bands", (await opt.locator(".band").count()) === 5);
check("options: first hours turn the schedule on", await opt.isChecked("#enabled"));
await opt.waitForTimeout(200);
const stored = await sw.evaluate(() => chrome.storage.sync.get("settings"));
check("options: hours are saved", stored.settings.scheduleEnabled === true && stored.settings.schedules.length === 1);
await opt.screenshot({ path: `${out}/options.png`, fullPage: true });
await opt.reload();
await opt.waitForTimeout(300);
check("options: hours survive a reload", (await opt.locator(".window").count()) === 1);

await ctx.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
