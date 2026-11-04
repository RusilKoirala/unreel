const { RULES, normalize, isBlocking, nextChange, formatTime, dateKey, formatDuration, SITE_NAMES } = globalThis.Unreel;

const PAUSE_MINUTES = 5;
const PAUSE_WAIT_SECONDS = 10;

let settings = normalize(null);
let log = {};
let countdown = null; // { left, timer } while the pause wait is running

const save = () => chrome.storage.sync.set({ settings });

const renderRules = () => {
  const host = document.getElementById("rules");
  host.replaceChildren();
  for (const site of ["YouTube", "Instagram"]) {
    const heading = document.createElement("h2");
    heading.textContent = site;
    host.append(heading);
    for (const rule of RULES.filter((r) => r.site === site)) {
      const label = document.createElement("label");
      label.className = "rule";
      const name = document.createElement("span");
      name.textContent = rule.label;
      const toggle = document.createElement("span");
      toggle.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", `Hide ${site} ${rule.label}`);
      input.checked = settings.rules[rule.id] !== false;
      input.addEventListener("change", () => {
        settings.rules[rule.id] = input.checked;
        save();
      });
      toggle.append(input, document.createElement("span"));
      label.append(name, toggle);
      host.append(label);
    }
  }
};

const renderStatus = () => {
  const now = new Date();
  const paused = now.getTime() < settings.pausedUntil;
  const blocking = isBlocking(settings, now);
  const change = nextChange(settings, now);
  const header = document.getElementById("status");
  const title = document.getElementById("status-title");
  const detail = document.getElementById("status-detail");
  header.dataset.state = paused ? "paused" : blocking ? "on" : "off";
  if (paused) {
    title.textContent = "Blocking is paused";
    detail.textContent = `Back on at ${formatTime(change)}`;
  } else if (blocking) {
    title.textContent = "Blocking is on";
    detail.textContent = change ? `Until ${formatTime(change)}` : "All day, every day";
  } else {
    title.textContent = "Blocking is off";
    detail.textContent = change ? `Starts at ${formatTime(change)}` : "No hours set";
  }

  const pause = document.getElementById("pause");
  if (countdown) pause.textContent = `Cancel (${countdown.left}s)`;
  else if (paused) pause.textContent = "Resume blocking";
  else pause.textContent = `Pause ${PAUSE_MINUTES} min`;
  pause.disabled = !paused && !blocking && !countdown;

  document.getElementById("hours").textContent = "Time, limits and hours";
};

const renderToday = () => {
  const host = document.getElementById("today");
  host.replaceChildren();
  const day = log[dateKey(new Date())] ?? {};
  for (const [site, name] of Object.entries(SITE_NAMES)) {
    const used = day[site] ?? 0;
    const limit = settings.limits[site] * 60;
    const row = document.createElement("div");
    row.className = "today-row";
    const label = document.createElement("span");
    label.textContent = `${name} today`;
    const value = document.createElement("b");
    value.textContent = limit ? `${formatDuration(used)} of ${formatDuration(limit)}` : formatDuration(used);
    row.append(label, value);
    host.append(row);
    if (limit) {
      const meter = document.createElement("div");
      meter.className = "meter";
      if (used >= limit) meter.dataset.full = "";
      const fill = document.createElement("i");
      fill.style.width = `${Math.min(100, (used / limit) * 100)}%`;
      meter.append(fill);
      host.append(meter);
    }
  }
};

const stopCountdown = () => {
  clearInterval(countdown.timer);
  countdown = null;
};

// The wait is deliberate: ten seconds is long enough to change your mind.
document.getElementById("pause").addEventListener("click", () => {
  if (countdown) {
    stopCountdown();
  } else if (Date.now() < settings.pausedUntil) {
    settings.pausedUntil = 0;
    save();
  } else {
    countdown = {
      left: PAUSE_WAIT_SECONDS,
      timer: setInterval(() => {
        countdown.left -= 1;
        if (countdown.left <= 0) {
          stopCountdown();
          settings.pausedUntil = Date.now() + PAUSE_MINUTES * 60000;
          save();
        }
        renderStatus();
      }, 1000),
    };
  }
  renderStatus();
});

document.getElementById("hours").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    settings = normalize(changes.settings.newValue);
    renderRules();
    renderStatus();
    renderToday();
  } else if (area === "local" && changes.time) {
    log = changes.time.newValue ?? {};
    renderToday();
  }
});

chrome.storage.sync.get("settings", ({ settings: stored }) => {
  settings = normalize(stored);
  renderRules();
  renderStatus();
  renderToday();
  setInterval(renderStatus, 15000);
});

chrome.storage.local.get("time", ({ time }) => {
  log = time ?? {};
  renderToday();
});
