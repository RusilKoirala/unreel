// Renders Chrome Web Store images from the real extension UI.
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ext = resolve(".");
const out = resolve("store/images");
mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "unreel-")), {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 800 }, colorScheme: "light",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const id = new URL(sw.url()).host;
await sw.evaluate(() => chrome.storage.sync.set({ settings: {
  scheduleEnabled: true,
  schedules: [
    { id: "a", start: "08:30", end: "15:30", days: [1, 2, 3, 4, 5] },
    { id: "b", start: "19:00", end: "22:00", days: [0, 1, 2, 3, 4] },
  ],
} }));

await sw.evaluate(() => {
  const time = {};
  const youtube = [38, 62, 24, 71, 45, 90, 32];
  const instagram = [20, 15, 31, 12, 40, 25, 11];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 864e5);
    time[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`] = { youtube: youtube[i] * 60, instagram: instagram[i] * 60 };
  }
  return chrome.storage.local.set({ time });
});
const p = await ctx.newPage();
await p.goto(`chrome-extension://${id}/ui/options.html`);
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/screenshot-hours.png` });

// Popup enlarged on a plain background, with a line saying what it does.
await sw.evaluate(() => chrome.storage.sync.set({ settings: {} }));
const stage = await ctx.newPage();
await stage.setViewportSize({ width: 1280, height: 800 });
await stage.goto(`chrome-extension://${id}/ui/popup.html`);
await stage.evaluate((src) => {
  document.documentElement.innerHTML = `<body style="margin:0;width:1280px;height:800px;background:#2a3bd6;color:#fff;display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;font-family:Bricolage,system-ui">
    <div style="flex:1"><div style="font-size:72px;font-weight:800;line-height:1.05">Keep the video. Lose the scroll.</div>
    <div style="font-size:26px;margin-top:24px;line-height:1.35">Hide Shorts, Reels and feeds on YouTube and Instagram.</div></div>
    <iframe src="${src}" style="width:340px;height:478px;border:0;border-radius:12px;zoom:1.3"></iframe></body>`;
}, `chrome-extension://${id}/ui/popup.html`);
await stage.waitForTimeout(600);
await stage.screenshot({ path: `${out}/screenshot-rules.png` });

await stage.setViewportSize({ width: 440, height: 280 });
await stage.evaluate(() => {
  document.documentElement.innerHTML = `<body style="margin:0;width:440px;height:280px;background:#2a3bd6;color:#fff;display:flex;align-items:center;gap:24px;padding:0 36px;box-sizing:border-box;font-family:Bricolage,system-ui">
    <div style="width:88px;height:88px;border-radius:50%;background:#ffc21a;flex:none"></div>
    <div><div style="font-size:42px;font-weight:800;line-height:1">Unreel</div><div style="font-size:19px;margin-top:8px;line-height:1.25">Hide Shorts, Reels and feeds</div></div></body>`;
});
await stage.waitForTimeout(200);
await stage.screenshot({ path: `${out}/promo-small.png` });
await ctx.close();
console.log("Wrote store/images");
