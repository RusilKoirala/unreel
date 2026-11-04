// Pure logic shared by the content script, popup, options page and tests.
(() => {
  const RULES = [
    { id: "ytShorts", site: "YouTube", label: "Shorts", on: true },
    { id: "ytHome", site: "YouTube", label: "Home feed", on: true },
    { id: "ytRelated", site: "YouTube", label: "Suggested videos", on: true },
    { id: "ytAutoplay", site: "YouTube", label: "Autoplay next video", on: true },
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
    limits: { youtube: 0, instagram: 0 },
  });

  const normalize = (stored) => {
    const base = defaults();
    if (!stored) return base;
    return {
      ...base,
      ...stored,
      rules: { ...base.rules, ...stored.rules },
      limits: { ...base.limits, ...stored.limits },
    };
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

  // Screen time. `log` is { "2026-11-04": { youtube: seconds, instagram: seconds,
  // extra: { youtube: seconds } } }, kept on this device only.
  const SITES = { "www.youtube.com": "youtube", "www.instagram.com": "instagram" };
  const SITE_NAMES = { youtube: "YouTube", instagram: "Instagram" };
  const KEEP_DAYS = 30;

  const dateKey = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  const daysAgo = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - n);

  const addTime = (log, date, site, seconds) => {
    const next = { ...log };
    const key = dateKey(date);
    next[key] = { ...next[key], [site]: (next[key]?.[site] ?? 0) + seconds };
    const oldest = dateKey(daysAgo(date, KEEP_DAYS));
    for (const k of Object.keys(next)) if (k < oldest) delete next[k];
    return next;
  };

  const limitReached = (s, log, site, date) => {
    const minutes = s.limits[site];
    if (!minutes || date.getTime() < s.pausedUntil) return false;
    const day = log[dateKey(date)];
    return (day?.[site] ?? 0) >= minutes * 60 + (day?.extra?.[site] ?? 0);
  };

  // Extra time counts from now, even if the day's total has already passed the limit.
  const grantExtra = (log, date, site, limitMinutes, seconds) => {
    const next = { ...log };
    const key = dateKey(date);
    const day = next[key] ?? {};
    const overBy = Math.max(0, (day[site] ?? 0) - limitMinutes * 60);
    const current = Math.max(day.extra?.[site] ?? 0, overBy);
    next[key] = { ...day, extra: { ...day.extra, [site]: current + seconds } };
    return next;
  };

  const lastSevenDays = (log, date) => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(date, i);
      const day = log[dateKey(d)] ?? {};
      out.push({
        date: d,
        today: i === 0,
        youtube: day.youtube ?? 0,
        instagram: day.instagram ?? 0,
        total: (day.youtube ?? 0) + (day.instagram ?? 0),
      });
    }
    return out;
  };

  const formatDuration = (seconds) => {
    if (seconds > 0 && seconds < 60) return "<1m";
    const minutes = Math.floor(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  // Decides what to do for one URL at one moment. Returns:
  //   allow:    rule ids NOT being hidden (the CSS hides everything else)
  //   page:     rule id whose whole page is replaced with a panel, or null
  //   redirect: URL to go to instead, or null
  //   limit:    site whose daily limit is used up, or null
  const decide = (s, url, date, log = {}) => {
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
    const site = SITES[url.hostname];
    const limit = site && limitReached(s, log, site, date) ? site : null;
    return { allow, page, redirect: limit ? null : redirect, limit };
  };

  const formatTime = (date) =>
    date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  globalThis.Unreel = {
    RULES, defaults, normalize, toMinutes, inWindow, isBlocking, nextChange,
    bandsForDay, decide, formatTime, scheduleApplies, SITES, SITE_NAMES, dateKey,
    addTime, limitReached, grantExtra, lastSevenDays, formatDuration,
  };
})();
