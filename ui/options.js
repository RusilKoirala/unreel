const { normalize, bandsForDay, scheduleApplies } = globalThis.Unreel;

// Display order starts on Monday; values match Date.getDay().
const DAYS = [
  [1, "M", "Monday", "Mon"], [2, "T", "Tuesday", "Tue"], [3, "W", "Wednesday", "Wed"],
  [4, "T", "Thursday", "Thu"], [5, "F", "Friday", "Fri"], [6, "S", "Saturday", "Sat"], [0, "S", "Sunday", "Sun"],
];

let settings = normalize(null);
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

const renderAll = () => {
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

// Another window changed settings. Skip while this page has focus so typing and
// open time pickers aren't rebuilt by our own saves.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings && !document.hasFocus()) {
    settings = normalize(changes.settings.newValue);
    renderAll();
  }
});

chrome.storage.sync.get("settings", ({ settings: stored }) => {
  settings = normalize(stored);
  renderAll();
});
