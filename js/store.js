const KEY = 'danci.state.v2';

export function defaults() {
  return {
    v: 2,
    seed: Math.floor(Math.random() * 1e9),
    settings: { book: 'cet4', newPerDay: 20, reviewCap: 150, autoTTS: true },
    cards: {},
    days: {},
    wrong: {},
    fav: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw);
    if (!s || s.v !== 2) return defaults();
    s.settings = { ...defaults().settings, ...(s.settings || {}) };
    s.cards = s.cards || {};
    s.days = s.days || {};
    s.wrong = s.wrong || {};
    s.fav = s.fav || {};
    return s;
  } catch (e) {
    return defaults();
  }
}

export function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    // 存储满时静默失败，避免打断学习
    console.warn('保存失败', e);
  }
}

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ensureDay(s, key = dayKey()) {
  if (!s.days[key]) s.days[key] = { new: 0, rev: 0, good: 0, hard: 0, again: 0, newBook: {}, revBook: {}, goalBook: {} };
  const d = s.days[key];
  d.new = d.new || 0; d.rev = d.rev || 0; d.good = d.good || 0; d.hard = d.hard || 0; d.again = d.again || 0;
  d.newBook = d.newBook || {}; d.revBook = d.revBook || {}; d.goalBook = d.goalBook || {};
  return d;
}

export function dayTotal(d) {
  return (d.new || 0) + (d.rev || 0);
}

export function streak(s) {
  const today = dayKey();
  const y = new Date(); y.setDate(y.getDate() - 1);
  let start = today;
  if (!s.days[today] || dayTotal(s.days[today]) === 0) {
    start = dayKey(y);
    if (!s.days[start] || dayTotal(s.days[start]) === 0) return 0;
  }
  let n = 0;
  const d = new Date(start + 'T12:00:00');
  while (true) {
    const k = dayKey(d);
    const rec = s.days[k];
    if (rec && dayTotal(rec) > 0) { n += 1; d.setDate(d.getDate() - 1); }
    else break;
  }
  return n;
}

export function accuracy(s, days = 0) {
  let good = 0, total = 0;
  const keys = Object.keys(s.days);
  for (const k of keys) {
    if (days > 0) {
      const d = new Date(); d.setDate(d.getDate() - days + 1);
      if (k < dayKey(d)) continue;
    }
    const r = s.days[k];
    good += r.good || 0;
    total += (r.good || 0) + (r.hard || 0) + (r.again || 0);
  }
  return total ? Math.round((good / total) * 100) : 0;
}
