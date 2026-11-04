(() => {
  const { normalize, decide } = globalThis.Unreel;
  const root = document.documentElement;
  let settings = null;

  const PANELS = {
    ytHome: { title: "Home feed hidden", body: "Search for what you came to watch.", links: [["Subscriptions", "/feed/subscriptions"]] },
    igFeed: { title: "Home feed hidden", body: "Your messages and profiles still work.", links: [["Messages", "/direct/inbox/"]] },
    igReels: { title: "Reels hidden", body: "Reels sent to you directly still open.", links: [["Messages", "/direct/inbox/"]] },
    igExplore: { title: "Explore hidden", body: "Your messages and profiles still work.", links: [["Messages", "/direct/inbox/"]] },
  };

  const buildPanel = (id, config) => {
    const panel = document.createElement("div");
    panel.id = "unreel-panel";
    panel.dataset.rule = id;
    const sun = document.createElement("span");
    sun.className = "sun";
    const title = document.createElement("h2");
    title.textContent = config.title;
    const body = document.createElement("p");
    body.textContent = config.body;
    panel.append(sun, title, body);
    for (const [label, href] of config.links) {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      panel.append(a);
    }
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.textContent = "Unreel settings";
    settingsButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "openOptions" });
    });
    panel.append(settingsButton);
    return panel;
  };

  // The panel waits for the page to exist, and never covers a login form:
  // logged-out Instagram serves its sign-in page at "/".
  const panelCanShow = (page) => {
    if (document.querySelector('input[type="password"]')) return false;
    if (page.startsWith("ig")) return Boolean(document.querySelector("main"));
    return Boolean(document.body);
  };

  const renderPanel = (page) => {
    const existing = document.getElementById("unreel-panel");
    if (!page || !panelCanShow(page)) {
      existing?.remove();
      return;
    }
    if (existing?.dataset.rule === page) return;
    existing?.remove();
    document.body.append(buildPanel(page, PANELS[page]));
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

  const apply = () => {
    if (!settings) return;
    const d = decide(settings, new URL(location.href), new Date());
    setAttr("data-unreel-allow", d.allow.join(" "));

    // Logged-out Instagram has a sign-in form on the blocked home path; leave it alone.
    const showPage = d.page && !document.querySelector('input[type="password"]') ? d.page : null;
    setAttr("data-unreel-page", showPage);
    setAttr("data-unreel-dark", showPage && pageIsDark() ? "" : null);

    if (d.redirect) {
      location.replace(d.redirect);
      return;
    }
    // A hidden <video> keeps playing its audio, so stop it explicitly.
    if (showPage?.startsWith("ig")) {
      document.querySelectorAll("main video").forEach((v) => v.pause());
    }
    renderPanel(showPage);
  };

  chrome.storage.sync.get("settings", ({ settings: stored }) => {
    settings = normalize(stored);
    apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) {
      settings = normalize(changes.settings.newValue);
      apply();
    }
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
  }, 250);
})();
