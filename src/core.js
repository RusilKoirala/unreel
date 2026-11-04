// Pure logic shared by the content script, popup, options page and tests.
(() => {
  const RULES = [
    { id: "ytShorts", site: "YouTube", label: "Shorts", on: true },
    { id: "ytHome", site: "YouTube", label: "Home feed", on: true },
    { id: "ytRelated", site: "YouTube", label: "Suggested videos", on: true },
    { id: "ytComments", site: "YouTube", label: "Comments", on: false },
    { id: "igReels", site: "Instagram", label: "Reels", on: true },
    { id: "igExplore", site: "Instagram", label: "Explore", on: true },
    { id: "igFeed", site: "Instagram", label: "Home feed and stories", on: true },
  ];

  const defaults = () => ({
    rules: Object.fromEntries(RULES.map((r) => [r.id, r.on])),
    scheduleEnabled: false,
    schedules: [],
    pausedUntil: 0,
  });

  const normalize = (stored) => {
    const base = defaults();
    if (!stored) return base;
    return { ...base, ...stored, rules: { ...base.rules, ...stored.rules } };
  };

  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
  };

  // A window covers its start day; if end <= start it runs past midnight into
  // the next day. start === end means the full 24 hours from start.
  const inWindow = (win, date) => {
    const start = toMinutes(win.start);
    const end = toMinutes(win.end);
    const day = date.getDay();
    const prev = (day + 6) % 7;
    const now = date.getHours() * 60 + date.getMinutes();
    if (start < end) return win.days.includes(day) && now >= start && now < end;
    return (win.days.includes(day) && now >= start) || (win.days.includes(prev) && now < end);
  };

  const scheduleApplies = (s) =>
    s.scheduleEnabled && s.schedules.some((w) => w.days.length > 0);

  const isBlocking = (s, date) => {
    if (date.getTime() < s.pausedUntil) return false;
    if (!scheduleApplies(s)) return true;
    return s.schedules.some((w) => inWindow(w, date));
  };

  // The next moment blocking flips, or null if it never does.
  const nextChange = (s, date) => {
    if (date.getTime() < s.pausedUntil) return new Date(s.pausedUntil);
    if (!scheduleApplies(s)) return null;
    const current = isBlocking(s, date);
    const probe = new Date(date);
    probe.setSeconds(0, 0);
    for (let i = 0; i < 8 * 1440; i++) {
      probe.setMinutes(probe.getMinutes() + 1);
      if (isBlocking(s, probe) !== current) return new Date(probe);
    }
    return null;
  };

  // Horizontal bands for the week chart: [{start, end}] in minutes for one day.
  const bandsForDay = (schedules, day) => {
    const prev = (day + 6) % 7;
    const bands = [];
    for (const w of schedules) {
      const start = toMinutes(w.start);
      const end = toMinutes(w.end);
      if (start < end) {
        if (w.days.includes(day)) bands.push({ start, end });
      } else {
        if (w.days.includes(day)) bands.push({ start, end: 1440 });
        if (w.days.includes(prev) && end > 0) bands.push({ start: 0, end });
      }
    }
    return bands;
  };

  const IG_RESERVED_EXPLORE = /^\/explore\/search(\/|$)/;

  // Decides what to do for one URL at one moment. Returns:
  //   allow:    rule ids NOT being hidden (the CSS hides everything else)
  //   page:     rule id whose whole page is replaced with a panel, or null
  //   redirect: URL to go to instead, or null
  const decide = (s, url, date) => {
    const blocking = isBlocking(s, date);
    const blocked = (id) => blocking && s.rules[id] !== false;
    const allow = RULES.filter((r) => !blocked(r.id)).map((r) => r.id);
    const path = url.pathname;
    let page = null;
    let redirect = null;

    if (url.hostname === "www.youtube.com") {
      if (blocked("ytShorts")) {
        const m = path.match(/^\/shorts(?:\/([^/]*)\/?)?$/);
        if (m) redirect = m[1] ? `/watch?v=${m[1]}` : "/";
      }
      if (path === "/" && blocked("ytHome")) page = "ytHome";
    } else if (url.hostname === "www.instagram.com") {
      if (path === "/" && blocked("igFeed")) page = "igFeed";
      if (/^\/reels(\/|$)/.test(path) && blocked("igReels")) page = "igReels";
      if (/^\/explore(\/|$)/.test(path) && !IG_RESERVED_EXPLORE.test(path) && blocked("igExplore")) {
        page = "igExplore";
      }
    }
    return { allow, page, redirect };
  };

  const formatTime = (date) =>
    date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  globalThis.Unreel = {
    RULES, defaults, normalize, toMinutes, inWindow, isBlocking, nextChange,
    bandsForDay, decide, formatTime, scheduleApplies,
  };
})();
