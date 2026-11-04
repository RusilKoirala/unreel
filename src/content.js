(() => {
  const { normalize, decide, SITES, SITE_NAMES, formatDuration } = globalThis.Unreel;
  const root = document.documentElement;
  const site = SITES[location.hostname];
  let settings = null;
  let log = {};

  const EXTRA_MINUTES = 5;
  const EXTRA_WAIT_SECONDS = 10;
  const IDLE_AFTER_MS = 60000;
  const REPORT_EVERY_MS = 5000;

  const PANELS = {
    ytHome: { title: "Home feed hidden", body: "Search for what you came to watch.", links: [] },
    igFeed: { title: "Home feed hidden", body: "Your messages and profiles still work.", links: [["Messages", "/direct/inbox/"]] },
    igReels: { title: "Reels hidden", body: "Reels sent to you directly still open.", links: [["Messages", "/direct/inbox/"]] },
    igExplore: { title: "Explore hidden", body: "Your messages and profiles still work.", links: [["Messages", "/direct/inbox/"]] },
  };

  const send = (message) => {
    if (chrome.runtime?.id) chrome.runtime.sendMessage(message).catch(() => {});
  };

  const textButton = (label, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => onClick(button));
    return button;
  };

  const settingsButton = () => textButton("Unreel settings", () => send({ type: "openOptions" }));

  const buildPanel = (key, title, body, extras) => {
    const panel = document.createElement("div");
    panel.id = "unreel-panel";
    panel.dataset.rule = key;
    const sun = document.createElement("span");
    sun.className = "sun";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const text = document.createElement("p");
    text.textContent = body;
    panel.append(sun, heading, text, ...extras, settingsButton());
    return panel;
  };

  const buildPagePanel = (id) => {
    const config = PANELS[id];
    const links = config.links.map(([label, href]) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      return a;
    });
    return buildPanel(id, config.title, config.body, links);
  };

  // The extra time is behind a short wait, the same as pausing from the popup.
  const startExtraWait = (button) => {
    if (button.disabled) return;
    button.disabled = true;
    let left = EXTRA_WAIT_SECONDS;
    button.textContent = `Wait ${left}s`;
    const timer = setInterval(() => {
      left -= 1;
      button.textContent = `Wait ${left}s`;
      if (left <= 0) {
        clearInterval(timer);
        send({ type: "extraTime", site, seconds: EXTRA_MINUTES * 60 });
      }
    }, 1000);
  };

  const buildLimitPanel = () =>
    buildPanel(
      "limit",
      `You've used today's ${SITE_NAMES[site]} time`,
      `Your limit is ${formatDuration(settings.limits[site] * 60)} a day. It resets at midnight.`,
      [
        textButton("Close tab", () => send({ type: "closeTab" })),
        textButton(`${EXTRA_MINUTES} more minutes`, startExtraWait),
      ],
    );

  const renderPanel = (key) => {
    const existing = document.getElementById("unreel-panel");
    if (!key || !document.body) {
      existing?.remove();
      return;
    }
    // Instagram's page panels wait until the page they replace exists.
    if (key.startsWith("ig") && !document.querySelector("main")) return;
    if (existing?.dataset.rule === key) return;
    existing?.remove();
    document.body.append(key === "limit" ? buildLimitPanel() : buildPagePanel(key));
  };

  const setAttr = (name, value) => {
    if (value === null) {
      if (root.hasAttribute(name)) root.removeAttribute(name);
    } else if (root.getAttribute(name) !== value) {
      root.setAttribute(name, value);
    }
  };

  // Both sites have their own theme setting, so read the painted background
  // instead of trusting the system preference.
  const pageIsDark = () => {
    for (const el of [document.body, root]) {
      if (!el) continue;
      const [r, g, b, a = 1] = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
      if (a > 0) return 0.299 * r + 0.587 * g + 0.114 * b < 128;
    }
    return false;
  };

  const turnOffAutoplay = () => {
    document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]')?.click();
  };

  const apply = () => {
    if (!settings) return;
    const d = decide(settings, new URL(location.href), new Date(), log);
    setAttr("data-unreel-allow", d.allow.join(" "));

    // Logged-out Instagram serves its sign-in form on blocked paths; leave it alone.
    const signingIn = Boolean(document.querySelector('input[type="password"]'));
    const limit = d.limit && !signingIn;
    const page = d.page && !signingIn ? d.page : null;
    setAttr("data-unreel-limit", limit ? "" : null);
    setAttr("data-unreel-page", page);
    setAttr("data-unreel-dark", (limit || page) && pageIsDark() ? "" : null);

    if (d.redirect) {
      location.replace(d.redirect);
      return;
    }
    // A hidden <video> keeps playing its audio, so stop it explicitly.
    if (limit) document.querySelectorAll("video").forEach((v) => v.pause());
    else if (page?.startsWith("ig")) document.querySelectorAll("main video").forEach((v) => v.pause());

    if (site === "youtube" && !d.allow.includes("ytAutoplay") && !limit) turnOffAutoplay();
    renderPanel(limit ? "limit" : page);
  };

  // Screen time counts while the page is on screen and in use: a video is
  // playing, or the tab has focus and there was input in the last minute.
  let lastTick = Date.now();
  let lastInput = Date.now();
  let unreported = 0;

  for (const type of ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"]) {
    window.addEventListener(type, () => { lastInput = Date.now(); }, { capture: true, passive: true });
  }

  const report = () => {
    const seconds = Math.floor(unreported / 1000);
    if (!seconds) return;
    unreported -= seconds * 1000;
    send({ type: "time", site, seconds });
  };

  const countTime = () => {
    const now = Date.now();
    // Timers stall when a computer sleeps; never count that gap.
    const elapsed = Math.min(now - lastTick, 2000);
    lastTick = now;
    if (document.visibilityState !== "visible" || root.hasAttribute("data-unreel-limit")) return;
    const playing = [...document.querySelectorAll("video")].some((v) => !v.paused && !v.ended);
    if (playing || (document.hasFocus() && now - lastInput < IDLE_AFTER_MS)) unreported += elapsed;
    if (unreported >= REPORT_EVERY_MS) report();
  };

  window.addEventListener("pagehide", report);
  document.addEventListener("visibilitychange", report);

  chrome.storage.sync.get("settings", ({ settings: stored }) => {
    settings = normalize(stored);
    apply();
  });
  chrome.storage.local.get("time", ({ time }) => {
    log = time ?? {};
    apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) settings = normalize(changes.settings.newValue);
    else if (area === "local" && changes.time) log = changes.time.newValue ?? {};
    else return;
    apply();
  });

  // Both sites navigate without reloading, and schedules flip with no event at
  // all, so re-check on a light timer. Chrome removes this script's access to
  // chrome.* when the extension is updated; stop then instead of throwing.
  const timer = setInterval(() => {
    if (!chrome.runtime?.id) {
      clearInterval(timer);
      return;
    }
    apply();
    countTime();
  }, 250);
})();
