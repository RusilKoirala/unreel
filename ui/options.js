const { normalize, bandsForDay, scheduleApplies, lastSevenDays, dateKey, formatDuration, SITE_NAMES } = globalThis.Unreel;

// Display order starts on Monday; values match Date.getDay().
const DAYS = [
  [1, "M", "Monday", "Mon"], [2, "T", "Tuesday", "Tue"], [3, "W", "Wednesday", "Wed"],
  [4, "T", "Thursday", "Thu"], [5, "F", "Friday", "Fri"], [6, "S", "Saturday", "Sat"], [0, "S", "Sunday", "Sun"],
];

let settings = normalize(null);
let log = {};
const LIMIT_CHOICES = [0, 15, 30, 45, 60, 90, 120, 180];
const $ = (id) => document.getElementById(id);
const save = () => chrome.storage.sync.set({ settings });
const make = (tag, props = {}) => Object.assign(document.createElement(tag), props);

const renderWeek = () => {
  const host = $("week");
  host.replaceChildren();
  const now = new Date();
  for (const [day, , , short] of DAYS) {
    const row = make("div", { className: "day" });
    if (day === now.getDay()) row.dataset.today = "";
    const track = make("div", { className: "track" });
    for (const band of bandsForDay(settings.schedules, day)) {
      const el = make("div", { className: "band" });
      el.style.left = `${(band.start / 1440) * 100}%`;
      el.style.width = `${((band.end - band.start) / 1440) * 100}%`;
      track.append(el);
    }
    if (day === now.getDay()) {
      const marker = make("div", { className: "now" });
      marker.style.left = `${((now.getHours() * 60 + now.getMinutes()) / 1440) * 100}%`;
      track.append(marker);
    }
    row.append(make("div", { className: "day-name", textContent: short }), track);
    host.append(row);
  }
  const axis = make("div", { className: "axis" });
  const labels = make("div");
  for (const t of ["12am", "6am", "12pm", "6pm", "12am"]) labels.append(make("span", { textContent: t }));
  axis.append(make("span"), labels);
  host.append(axis);
};

const renderEnable = () => {
  const input = $("enabled");
  const hasHours = settings.schedules.some((w) => w.days.length);
  input.checked = hasHours && settings.scheduleEnabled;
  input.disabled = !hasHours;
  let note;
  if (!hasHours) note = "Add hours with at least one day first.";
  else if (scheduleApplies(settings)) note = "Unreel is off outside these hours.";
  else note = "Off, so Unreel blocks all day.";
  $("enable-note").textContent = note;
};

const changed = () => {
  renderWeek();
  renderEnable();
  save();
};

const crossesMidnight = (w) => w.end <= w.start;

const renderWindows = () => {
  const host = $("windows");
  host.replaceChildren();
  settings.schedules.forEach((win) => {
    const row = make("div", { className: "window" });
    const times = make("div", { className: "window-times" });
    const note = make("p", { className: "note" });
    const updateNote = () => {
      note.textContent = crossesMidnight(win) ? "Runs past midnight into the next morning." : "";
      note.hidden = !note.textContent;
    };
    const timeInput = (key, label) => {
      const input = make("input", { type: "time", value: win[key] });
      input.setAttribute("aria-label", label);
      input.addEventListener("change", () => {
        if (!input.value) {
          input.value = win[key];
          return;
        }
        win[key] = input.value;
        updateNote();
        changed();
      });
      return input;
    };
    const remove = make("button", { className: "link", type: "button", textContent: "Remove" });
    remove.addEventListener("click", () => {
      settings.schedules = settings.schedules.filter((w) => w !== win);
      if (!settings.schedules.length) settings.scheduleEnabled = false;
      renderWindows();
      changed();
    });
    times.append(timeInput("start", "Start time"), make("span", { textContent: "to" }), timeInput("end", "End time"), remove);

    const days = make("div", { className: "days" });
    for (const [value, letter, full] of DAYS) {
      const chip = make("button", { type: "button", textContent: letter });
      chip.setAttribute("aria-label", full);
      chip.setAttribute("aria-pressed", String(win.days.includes(value)));
      chip.addEventListener("click", () => {
        win.days = win.days.includes(value) ? win.days.filter((d) => d !== value) : [...win.days, value];
        chip.setAttribute("aria-pressed", String(win.days.includes(value)));
        changed();
      });
      days.append(chip);
    }
    updateNote();
    row.append(times, days, note);
    host.append(row);
  });
};

// Rounds the chart's top up to a friendly number of minutes.
const niceMaxMinutes = (minutes) => {
  for (const nice of [30, 60, 120, 240, 360, 480, 720, 960, 1440]) if (minutes <= nice) return nice;
  return 1440;
};

const dayName = (date, style) => date.toLocaleDateString(undefined, { weekday: style });

const renderTime = () => {
  const now = new Date();
  const days = lastSevenDays(log, now);
  const today = days[6];
  const counted = days.filter((d) => d.total > 0);
  const average = counted.length ? days.reduce((sum, d) => sum + d.total, 0) / counted.length : 0;
  $("stat-today").textContent = formatDuration(today.total);
  $("stat-average").textContent = formatDuration(average);

  const chart = $("chart");
  chart.replaceChildren();
  const top = niceMaxMinutes(Math.max(...days.map((d) => d.total)) / 60);
  const plotHeight = 186;
  for (const fraction of [0, 0.5, 1]) {
    const line = make("div", { className: "grid" });
    line.style.top = `${plotHeight * (1 - fraction)}px`;
    line.append(make("span", { textContent: formatDuration(top * fraction * 60) }));
    chart.append(line);
  }
  const bars = make("div", { className: "bars" });
  for (const d of days) {
    const col = make("div", { className: "bar-col", tabIndex: 0 });
    if (d.today) col.dataset.today = "";
    const label = `${dayName(d.date, "long")}: ${formatDuration(d.total)} in total, YouTube ${formatDuration(d.youtube)}, Instagram ${formatDuration(d.instagram)}`;
    col.setAttribute("role", "img");
    col.setAttribute("aria-label", label);
    for (const site of ["instagram", "youtube"]) {
      if (!d[site]) continue;
      const seg = make("div", { className: "seg" });
      seg.dataset.site = site;
      seg.style.height = `${Math.max(2, (d[site] / 60 / top) * plotHeight)}px`;
      col.append(seg);
    }
    col.append(make("span", { className: "day-label", textContent: dayName(d.date, "short") }));
    const show = () => showTooltip(col, d);
    col.addEventListener("pointerenter", show);
    col.addEventListener("focus", show);
    col.addEventListener("pointerleave", hideTooltip);
    col.addEventListener("blur", hideTooltip);
    bars.append(col);
  }
  chart.append(bars);
  if (!counted.length) {
    chart.append(make("div", { className: "empty", textContent: "Nothing counted yet. Your time shows up here after you use YouTube or Instagram." }));
  }

  const table = $("time-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const title of ["Day", "YouTube", "Instagram", "Total"]) head.append(make("th", { textContent: title }));
  const body = table.createTBody();
  for (const d of days) {
    const row = body.insertRow();
    for (const value of [dayName(d.date, "long"), formatDuration(d.youtube), formatDuration(d.instagram), formatDuration(d.total)]) {
      row.insertCell().textContent = value;
    }
  }
};

const showTooltip = (col, d) => {
  const tip = $("tooltip");
  tip.replaceChildren(make("b", { textContent: `${dayName(d.date, "long")}: ${formatDuration(d.total)}` }));
  tip.append(`YouTube ${formatDuration(d.youtube)}`, make("br"), `Instagram ${formatDuration(d.instagram)}`);
  tip.hidden = false;
  const area = $("time").getBoundingClientRect();
  const box = col.getBoundingClientRect();
  const left = box.left - area.left + box.width / 2 - tip.offsetWidth / 2;
  tip.style.left = `${Math.max(0, Math.min(left, area.width - tip.offsetWidth))}px`;
  tip.style.top = `${box.top - area.top + 4}px`;
};

const hideTooltip = () => { $("tooltip").hidden = true; };

const limitLabel = (minutes) => (minutes ? `${formatDuration(minutes * 60)} a day` : "No limit");

const renderLimits = () => {
  const host = $("limits");
  host.replaceChildren();
  for (const [site, name] of Object.entries(SITE_NAMES)) {
    const row = make("div", { className: "limit-row" });
    const label = make("label", { textContent: name, htmlFor: `limit-${site}` });
    const select = make("select", { id: `limit-${site}` });
    const choices = LIMIT_CHOICES.includes(settings.limits[site]) ? LIMIT_CHOICES : [...LIMIT_CHOICES, settings.limits[site]];
    for (const minutes of choices) select.append(new Option(limitLabel(minutes), minutes));
    select.value = settings.limits[site];
    select.addEventListener("change", () => {
      settings.limits[site] = Number(select.value);
      save();
    });
    row.append(label, select);
    host.append(row);
  }
};

const renderAll = () => {
  renderLimits();
  renderWeek();
  renderEnable();
  renderWindows();
};

$("enabled").addEventListener("change", (e) => {
  settings.scheduleEnabled = e.target.checked;
  changed();
});

$("add").addEventListener("click", () => {
  settings.schedules.push({ id: crypto.randomUUID(), start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] });
  if (settings.schedules.length === 1) settings.scheduleEnabled = true;
  renderWindows();
  changed();
});

$("clear").addEventListener("click", () => {
  if (confirm("Clear all your screen time history? This also resets today's limits.")) {
    chrome.storage.local.remove("time");
  }
});

// Another window changed settings. Skip while this page has focus so typing and
// open time pickers aren't rebuilt by our own saves.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings && !document.hasFocus()) {
    settings = normalize(changes.settings.newValue);
    renderAll();
  }
  if (area === "local" && "time" in changes) {
    log = changes.time.newValue ?? {};
    renderTime();
  }
});

chrome.storage.sync.get("settings", ({ settings: stored }) => {
  settings = normalize(stored);
  renderAll();
});

chrome.storage.local.get("time", ({ time }) => {
  log = time ?? {};
  renderTime();
});
renderTime();
