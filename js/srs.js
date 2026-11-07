// 简化版 SM-2 间隔重复
export const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;

export function newCard(id) {
  return { id, state: 'new', iv: 0, ease: 2.5, reps: 0, lapses: 0, due: 0, last: 0 };
}

function apply(c, g, now, dry) {
  let interval;
  if (g === 'again') {
    interval = 5 * MIN;
    if (c.state !== 'new') c.lapses += 1;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.iv = 0;
    c.state = 'learn';
  } else if (g === 'hard') {
    if (c.state === 'new' || c.iv === 0) {
      interval = 30 * MIN;
      c.state = 'learn';
      c.iv = 0;
    } else {
      c.iv = Math.max(1, c.iv * 1.2);
      interval = c.iv * DAY;
      c.state = 'review';
    }
    c.ease = Math.max(1.3, c.ease - 0.15);
  } else {
    if (c.state === 'new' || c.iv === 0) {
      c.iv = 1;
    } else {
      c.iv = Math.max(1, c.iv * c.ease);
    }
    interval = c.iv * DAY;
    c.state = 'review';
    c.reps += 1;
    c.ease = Math.min(3.0, c.ease + 0.1);
  }
  if (!dry) c.due = now + interval;
  return interval;
}

export function grade(card, g, now = Date.now()) {
  const c = { ...card };
  const interval = apply(c, g, now, false);
  c.last = now;
  return { card: c, interval };
}

export function previewInterval(card, g, now = Date.now()) {
  return apply({ ...card }, g, now, true);
}

export function fmtInterval(ms) {
  if (ms < 60 * MIN) return Math.max(1, Math.round(ms / MIN)) + ' 分钟';
  if (ms < DAY) return Math.round(ms / (60 * MIN)) + ' 小时';
  const d = ms / DAY;
  if (d < 30) return (d < 1.5 ? 1 : Math.round(d)) + ' 天';
  if (d < 365) return Math.round(d / 30) + ' 个月';
  return (d / 365).toFixed(1).replace('.0', '') + ' 年';
}

export function previewLabel(card, g, now = Date.now()) {
  return fmtInterval(previewInterval(card, g, now));
}
