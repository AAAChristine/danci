import { grade, previewLabel, newCard } from './srs.js';
import { load, save, dayKey, ensureDay, dayTotal, streak, accuracy, defaults } from './store.js';

const state = load();
const DATA = {};
const ALL = {};
const BOOKS = ['cet4', 'phrases', 'awl'];
const META = {
  cet4: { name: '四级单词', tag: '四级' },
  phrases: { name: '四级词组', tag: '词组' },
  awl: { name: 'AWL 学术词汇', tag: 'AWL' },
};

let booted = false;
let session = null;
let detailId = null;
let calOffset = 0;
let searchQ = '';
let focusSearch = false;
let toastTimer = 0;

const ICON = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6.5H9V21H4a1 1 0 0 1-1-1z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m5 5 14 14M19 5 5 19"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m4 12.5 5 5L20 6.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 21V9m0 0 4 4m-4-4-4 4M4 3h16"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/></svg>',
};

init();

async function init() {
  try {
    const list = await Promise.all(
      BOOKS.map((id) => fetch('./data/' + id + '.json').then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }))
    );
    list.forEach((b) => {
      DATA[b.id] = b;
      b.byId = {};
      b.entries.forEach((e) => { b.byId[e.id] = e; ALL[e.id] = e; });
    });
    booted = true;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    window.addEventListener('hashchange', () => {
      focusSearch = location.hash.startsWith('#/search');
      window.scrollTo(0, 0);
      render();
    });
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    if (!location.hash) location.replace('#/home');
    render();
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<div class="boot-error"><h1>加载失败</h1><p>词库没有加载成功。请确认通过网址访问（本地服务器或静态托管），而不是直接双击 HTML 文件。</p><p class="muted">' +
      esc(e.message) + '</p></div>';
  }
}

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function bookOf(id) {
  const p = id.slice(0, 2);
  return p === 'c4' ? 'cet4' : p === 'aw' ? 'awl' : 'phrases';
}
function entriesOf(book) { return (DATA[book] && DATA[book].entries) || []; }
function learnedCount(book) {
  return Object.keys(state.cards).filter((id) => bookOf(id) === book).length;
}
function dueIds(book) {
  const now = Date.now();
  return Object.keys(state.cards).filter((id) => {
    const c = state.cards[id];
    return bookOf(id) === book && c.state !== 'new' && c.due <= now;
  });
}
function allDueIds() {
  return Object.keys(state.cards).filter((id) => state.cards[id].state !== 'new' && state.cards[id].due <= Date.now());
}
function unstudied(book) {
  return entriesOf(book).filter((e) => !state.cards[e.id]).map((e) => e.id);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function newWordOrder(book) {
  if (book === 'awl') {
    const groups = {};
    entriesOf(book).forEach((e) => {
      if (state.cards[e.id]) return;
      (groups[e.sub] = groups[e.sub] || []).push(e.id);
    });
    return Object.keys(groups).sort((a, b) => a - b).flatMap((k) => shuffle(groups[k]));
  }
  return shuffle(unstudied(book));
}
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
function back() {
  if (history.length > 1) history.back();
  else go('#/home');
}
function fmtDate(d) {
  const wd = '日一二三四五六'[d.getDay()];
  return { md: d.getMonth() + 1 + '月' + d.getDate() + '日', wd: '周' + wd };
}
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('当前浏览器不支持发音'); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    const vs = window.speechSynthesis.getVoices();
    const v = vs.find((x) => /en-US/i.test(x.lang)) || vs.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch (e) { toast('发音失败'); }
}

/* ---------------- router ---------------- */
function render() {
  if (!booted) return;
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const name = hash.split('/')[0];
  const app = document.getElementById('app');
  if (name === 'study') { renderStudy(app); return; }
  let html = '';
  let tab = 'home';
  if (name === 'books') { html = viewBooks(); tab = 'books'; }
  else if (name === 'stats') { html = viewStats(); tab = 'stats'; }
  else if (name === 'me') { html = viewMe(); tab = 'me'; }
  else if (name === 'wrong') { html = viewWrong(); }
  else if (name === 'search') { html = viewSearch(); }
  else { html = viewHome(); tab = 'home'; }
  const showTab = ['home', 'books', 'stats', 'me'].includes(name);
  app.innerHTML = '<div class="page' + (showTab ? '' : ' no-tab') + '">' + html + (showTab ? tabbar(tab) : '') + '</div>' + (detailId ? detailSheet() : '');
  if (name === 'search' && focusSearch) {
    focusSearch = false;
    const inp = document.getElementById('searchInput');
    if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 50);
  }
}

function tabbar(active) {
  const items = [
    ['home', '今日', ICON.home],
    ['books', '词书', ICON.book],
    ['stats', '统计', ICON.chart],
    ['me', '我的', ICON.user],
  ];
  return '<nav class="tabbar">' + items.map(([id, label, icon]) =>
    '<a class="tab ' + (active === id ? 'on' : '') + '" href="#/' + id + '">' + icon + '<span>' + label + '</span></a>'
  ).join('') + '</nav>';
}

/* ---------------- home ---------------- */
function viewHome() {
  const book = state.settings.book;
  const today = ensureDay(state);
  const due = dueIds(book).length;
  const left = Math.max(0, (state.settings.newPerDay | 0) - (today.newBook[book] || 0));
  const un = unstudied(book).length;
  const taskNew = Math.min(left, un);
  const total = due + taskNew;
  const done = (today.newBook[book] || 0) + (today.revBook[book] || 0);
  const goal = Math.max(today.goalBook[book] || 0, total, done, 1);
  const pct = Math.min(100, Math.round((done / goal) * 100));
  const st = streak(state);
  const wrong = Object.keys(state.wrong).filter((id) => ALL[id]).length;
  const now = new Date();
  const f = fmtDate(now);
  const c = 2 * Math.PI * 52;
  const learn = learnedCount(book);
  const meta = META[book];

  return `
  <header class="top home-top">
    <div>
      <div class="date">${f.md} · ${f.wd}</div>
      <h1>今天</h1>
    </div>
    <div class="streak">🔥 <b>${st}</b><span>天</span></div>
  </header>
  <main class="main">
    <section class="hero">
      <div class="ring">
        <svg viewBox="0 0 120 120">
          <circle class="ring-bg" cx="60" cy="60" r="52"/>
          <circle class="ring-fg" cx="60" cy="60" r="52" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}"/>
        </svg>
        <div class="ring-num"><b>${pct}</b><span>%</span></div>
      </div>
      <div class="hero-info">
        <div class="hero-title">${total > 0 ? '今日任务' : (done > 0 ? '今日已完成' : '开始今天的学习')}</div>
        <div class="hero-sub">${total > 0 ? due + ' 个复习 · ' + taskNew + ' 个新词' : '没有待复习，也没有新词任务'}</div>
        <button class="btn primary" data-act="${total > 0 ? 'start' : 'extra'}">${total > 0 ? (done > 0 ? '继续学习' : '开始学习') : '再背 10 个'}</button>
      </div>
    </section>

    <section class="quick">
      <button class="quick-card" data-act="go" data-to="wrong">
        <span class="q-ico red">!</span>
        <b>错词本</b>
        <small>${wrong} 个待巩固</small>
      </button>
      <button class="quick-card" data-act="go" data-to="search">
        <span class="q-ico blue">${ICON.search}</span>
        <b>搜索词库</b>
        <small>查单词 / 释义</small>
      </button>
    </section>

    <button class="book-chip" data-act="go" data-to="books">
      <div class="book-chip-l">
        <span class="tag">当前词书</span>
        <b>${meta.name}</b>
        <small>已学 ${learn} / ${entriesOf(book).length}</small>
      </div>
      <div class="book-chip-r">
        <div class="bar slim"><span style="width:${Math.round(learn / Math.max(1, entriesOf(book).length) * 100)}%"></span></div>
      </div>
    </button>
  </main>`;
}

/* ---------------- books ---------------- */
function viewBooks() {
  const active = state.settings.book;
  const cards = BOOKS.map((id) => {
    const total = entriesOf(id).length;
    const learn = learnedCount(id);
    const due = dueIds(id).length;
    const pct = Math.round((learn / Math.max(1, total)) * 100);
    return `
    <button class="book-card ${active === id ? 'active' : ''}" data-act="useBook" data-id="${id}">
      <div class="book-top">
        <span class="book-name">${META[id].name}</span>
        ${active === id ? '<span class="badge">学习中</span>' : '<span class="badge ghost">切换</span>'}
      </div>
      <div class="book-meta">${total} 个 · 已学 ${learn} · 待复习 ${due}</div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="book-pct">${pct}%</div>
    </button>`;
  }).join('');

  return `
  <header class="top"><div><div class="date">三本词书</div><h1>词书</h1></div></header>
  <main class="main">
    <p class="hint">每本词书的进度独立保存，随时可以切换。</p>
    ${cards}
    <div class="panel note">
      <b>关于词表</b>
      <p>四级单词 4540 个（已合并同词多义）；四级词组 700 条；AWL 570 个词族。单词均带音标与例句，词组带中文释义。</p>
    </div>
  </main>`;
}

/* ---------------- stats ---------------- */
function viewStats() {
  const learned = Object.keys(state.cards).length;
  const due = allDueIds().length;
  const st = streak(state);
  const acc = accuracy(state, 7);

  let bars = '';
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const rec = state.days[k];
    days.push({ d, v: rec ? dayTotal(rec) : 0 });
  }
  const max = Math.max(1, ...days.map((x) => x.v));
  bars = days.map(({ d, v }) => {
    const h = Math.round((v / max) * 100);
    return `<div class="bar-col"><div class="bar-v">${v || ''}</div><div class="bar-track"><div class="bar-fill" style="height:${h}%"></div></div><div class="bar-lab">${d.getMonth() + 1}/${d.getDate()}</div></div>`;
  }).join('');

  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  const y = base.getFullYear(), m = base.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const nDays = new Date(y, m + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cal-cell blank"></div>';
  for (let d = 1; d <= nDays; d++) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = state.days[k];
    const t = rec ? dayTotal(rec) : 0;
    const lvl = t === 0 ? 0 : t < 20 ? 1 : t < 50 ? 2 : 3;
    cells += `<div class="cal-cell l${lvl} ${k === dayKey() ? 'today' : ''}" title="${k} · ${t} 个">${d}</div>`;
  }

  const bookBars = BOOKS.map((id) => {
    const total = entriesOf(id).length;
    const learn = learnedCount(id);
    return `<div class="row"><span>${META[id].name}</span><div class="bar slim grow"><span style="width:${Math.round(learn / Math.max(1, total) * 100)}%"></span></div><b class="num">${learn}/${total}</b></div>`;
  }).join('');

  return `
  <header class="top"><div><div class="date">学习记录</div><h1>统计</h1></div></header>
  <main class="main">
    <div class="stat-grid">
      <div class="stat"><b>${learned}</b><span>已学单词</span></div>
      <div class="stat"><b>${st}</b><span>连续打卡</span></div>
      <div class="stat"><b>${acc}%</b><span>近 7 日正确率</span></div>
      <div class="stat"><b>${due}</b><span>待复习</span></div>
    </div>
    <div class="panel">
      <div class="panel-head">最近 7 天</div>
      <div class="bars">${bars}</div>
    </div>
    <div class="panel">
      <div class="panel-head">打卡日历
        <span class="cal-nav">
          <button data-act="cal" data-d="-1">‹</button>
          <b>${y} 年 ${m + 1} 月</b>
          <button data-act="cal" data-d="1">›</button>
        </span>
      </div>
      <div class="cal-head">${'一二三四五六日'.split('').map((x) => '<span>' + x + '</span>').join('')}</div>
      <div class="cal">${cells}</div>
    </div>
    <div class="panel">
      <div class="panel-head">词书进度</div>
      ${bookBars}
    </div>
  </main>`;
}

/* ---------------- me / settings ---------------- */
function viewMe() {
  const s = state.settings;
  const wrong = Object.keys(state.wrong).filter((id) => ALL[id]).length;
  return `
  <header class="top"><div><div class="date">设置与数据</div><h1>我的</h1></div></header>
  <main class="main">
    <div class="group">
      <div class="group-title">学习</div>
      <div class="row"><span>每日新词</span>
        <div class="stepper">
          <button data-act="step" data-k="newPerDay" data-d="-1">−</button><b>${s.newPerDay}</b><button data-act="step" data-k="newPerDay" data-d="1">+</button>
        </div>
      </div>
      <div class="row"><span>每日复习上限</span>
        <div class="stepper">
          <button data-act="step" data-k="reviewCap" data-d="-1">−</button><b>${s.reviewCap}</b><button data-act="step" data-k="reviewCap" data-d="1">+</button>
        </div>
      </div>
      <div class="row"><span>显示单词时自动发音</span>
        <button class="switch ${s.autoTTS ? 'on' : ''}" data-act="toggleTTS"><i></i></button>
      </div>
    </div>

    <div class="group">
      <div class="group-title">内容</div>
      <button class="row tap" data-act="go" data-to="wrong"><span>错词本</span><em>${wrong} 个 ›</em></button>
      <button class="row tap" data-act="go" data-to="search"><span>搜索词库</span><em>›</em></button>
    </div>

    <div class="group">
      <div class="group-title">数据</div>
      <button class="row tap" data-act="export"><span>导出备份</span><em>JSON</em></button>
      <label class="row tap" for="importFile"><span>导入备份</span><em>›</em></label>
      <input id="importFile" type="file" accept=".json,application/json" hidden>
      <button class="row tap danger" data-act="resetBook"><span>重置当前词书进度</span><em>›</em></button>
      <button class="row tap danger" data-act="resetAll"><span>清空全部记录</span><em>›</em></button>
    </div>

    <div class="group">
      <div class="group-title">关于</div>
      <div class="about">
        <p><b>背单词 · 四级 + AWL</b> v1.0</p>
        <p>词表：四级大纲词表 4540 词、四级词组 700 条、AWL 570 个词族。</p>
        <p>例句来自 Tatoeba（CC BY 2.0 FR），已转为简体中文；音标与释义来自公开词表整理。</p>
        <p>学习记录只保存在本机浏览器，不会上传。换手机前请先导出备份。</p>
      </div>
    </div>
  </main>`;
}

/* ---------------- wrong ---------------- */
function viewWrong() {
  const ids = Object.keys(state.wrong).filter((id) => ALL[id]);
  const list = ids.map((id) => {
    const e = ALL[id];
    return `<div class="list-row">
      <button class="list-main" data-act="detail" data-id="${esc(id)}">
        <b>${esc(e.w)}</b>
        <small>${esc(e.m)}</small>
      </button>
      <button class="icon-btn" data-act="unwrong" data-id="${esc(id)}" aria-label="移出错词本">${ICON.close}</button>
    </div>`;
  }).join('');

  return `
  <header class="top with-back">
    <button class="icon-btn" data-act="back" aria-label="返回">${ICON.back}</button>
    <h1>错词本</h1>
    <span class="count-pill">${ids.length}</span>
  </header>
  <main class="main">
    ${ids.length ? `<button class="btn primary wide" style="margin-bottom:14px" data-act="practiceWrong">练习这 ${ids.length} 个错词</button>` : ''}
    ${ids.length ? list : '<div class="empty">还没有错词。背词时选「忘记」的词会自动收进来。</div>'}
  </main>`;
}

/* ---------------- search ---------------- */
function searchResults() {
  const q = searchQ.trim().toLowerCase();
  if (!q) {
    return '<div class="empty"><p>输入英文单词或中文释义。</p><p class="muted">范围：四级 4540 词、词组 700 条、AWL 570 族。</p></div>';
  }
  const out = [];
  for (const id in ALL) {
    const e = ALL[id];
    const w = e.w.toLowerCase();
    if (w.includes(q) || e.m.toLowerCase().includes(q)) {
      out.push({ e, score: w.startsWith(q) ? 2 : w.includes(q) ? 1 : 0 });
      if (out.length > 400) break;
    }
  }
  out.sort((a, b) => b.score - a.score || a.e.w.length - b.e.w.length);
  if (!out.length) return '<div class="empty">没有找到「' + esc(searchQ) + '」</div>';
  return out.slice(0, 60).map(({ e }) => {
    const b = bookOf(e.id);
    return `<button class="list-row tap" data-act="detail" data-id="${esc(e.id)}">
      <div class="list-main"><b>${esc(e.w)}</b><small>${esc(e.m)}</small></div>
      <span class="tag">${META[b].tag}</span>
    </button>`;
  }).join('');
}

function viewSearch() {
  return `
  <header class="search-top">
    <button class="icon-btn" data-act="back" aria-label="返回">${ICON.back}</button>
    <div class="search-box">${ICON.search}<input id="searchInput" type="search" placeholder="搜索单词或中文释义" value="${esc(searchQ)}" autocomplete="off"></div>
  </header>
  <main class="main" id="searchMain">${searchResults()}</main>`;
}

/* ---------------- detail sheet ---------------- */
function detailSheet() {
  const e = ALL[detailId];
  if (!e) return '';
  const b = bookOf(e.id);
  const card = state.cards[e.id];
  const ex = (e.ex || []).map(([en, zh]) => `<div class="ex"><p class="ex-en">${esc(en)}</p><p class="ex-zh">${esc(zh)}</p></div>`).join('');
  const fam = e.fam && e.fam.members && e.fam.members.length > 1
    ? `<div class="fam"><div class="fam-head">词族 · ${esc(e.fam.head)}</div><div class="chips">${e.fam.members.map((m) => '<span class="chip">' + esc(m) + '</span>').join('')}</div></div>`
    : '';
  const isWrong = !!state.wrong[e.id];
  return `<div class="sheet-mask">
    <div class="sheet">
      <div class="sheet-grab"></div>
      <div class="sheet-head">
        <span class="tag">${META[b].tag}${e.sub ? ' · Sublist ' + e.sub : ''}</span>
        <button class="icon-btn" data-act="closeDetail" aria-label="关闭">${ICON.close}</button>
      </div>
      <div class="sheet-word">${esc(e.w)}</div>
      <div class="sheet-ph">${e.ph ? '/ ' + esc(e.ph) + ' /' : ''}
        <button class="icon-btn sound" data-act="speak" data-w="${esc(e.w)}" aria-label="发音">${ICON.sound}</button>
      </div>
      <div class="sheet-mean">${e.pos ? '<span class="pos">' + esc(e.pos) + '</span>' : ''}${esc(e.m)}</div>
      ${ex || '<p class="muted small">这个词暂无例句。</p>'}
      ${fam}
      <div class="sheet-actions">
        <button class="btn ghost" data-act="fav" data-id="${esc(e.id)}">${state.fav[e.id] ? '★ 已收藏' : '☆ 收藏'}</button>
        ${isWrong ? `<button class="btn ghost" data-act="unwrong" data-id="${esc(e.id)}">移出错词本</button>` : ''}
        <button class="btn primary" data-act="speak" data-w="${esc(e.w)}">读一遍</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- study ---------------- */
function makeSession(customIds, mode = 'wrong') {
  if (customIds) {
    const ids = shuffle(customIds.filter((id) => ALL[id])).slice(0, 100);
    if (!ids.length) return null;
    return { ids, i: 0, revealed: false, total: ids.length, good: 0, hard: 0, again: 0, readded: new Set(), spoken: new Set(), book: null, mode };
  }
  const book = state.settings.book;
  const today = ensureDay(state);
  const due = dueIds(book).sort((a, b) => state.cards[a].due - state.cards[b].due);
  const cap = Math.max(0, state.settings.reviewCap | 0);
  const reviews = due.slice(0, cap);
  const left = Math.max(0, (state.settings.newPerDay | 0) - (today.newBook[book] || 0));
  const news = newWordOrder(book).slice(0, left);
  const ids = [...reviews, ...news];
  if (!ids.length) return null;
  today.goalBook[book] = Math.max(today.goalBook[book] || 0, ids.length);
  save(state);
  return { ids, i: 0, revealed: false, total: ids.length, good: 0, hard: 0, again: 0, readded: new Set(), spoken: new Set(), book, mode: 'normal' };
}

function startSession(customIds, mode) {
  session = makeSession(customIds, mode);
  if (!session) { toast('今天没有待办，休息一下吧'); return; }
  go('#/study');
  if (location.hash === '#/study') render();
}

function renderStudy(app) {
  if (!session) {
    session = makeSession();
    if (!session) { go('#/home'); return; }
  }
  if (session.done) { app.innerHTML = doneView(); return; }
  const id = session.ids[session.i];
  const e = ALL[id];
  if (!e) {
    session.i += 1;
    if (session.i >= session.ids.length) { session.done = true; app.innerHTML = doneView(); }
    else renderStudy(app);
    return;
  }
  const card = state.cards[id] || newCard(id);
  const isNew = !state.cards[id];
  const bk = bookOf(id);
  const pct = Math.min(100, Math.round((session.i / session.total) * 100));
  const ex = (e.ex || []).slice(0, 2).map(([en, zh]) => `<div class="ex"><p class="ex-en">${esc(en)}</p><p class="ex-zh">${esc(zh)}</p></div>`).join('');
  const fam = e.fam && e.fam.members && e.fam.members.length > 1
    ? `<div class="fam"><div class="fam-head">词族 · ${esc(e.fam.head)}</div><div class="chips">${e.fam.members.map((m) => '<span class="chip">' + esc(m) + '</span>').join('')}</div></div>`
    : '';

  app.innerHTML = `
  <div class="study">
    <header class="study-top">
      <button class="icon-btn" data-act="quit" aria-label="退出">${ICON.close}</button>
      <div class="study-bar"><span style="width:${pct}%"></span></div>
      <div class="study-count">${Math.min(session.i + 1, session.total)}<small>/${session.total}</small></div>
    </header>
    <main class="study-main" data-act="reveal">
      <div class="study-tag">${META[bk].tag} · ${isNew ? '新词' : '复习'}${e.sub ? ' · Sublist ' + e.sub : ''}${session.mode === 'wrong' ? ' · 错词' : ''}</div>
      <div class="word ${bk === 'phrases' ? 'phrase' : ''}">${esc(e.w)}</div>
      <div class="phon">${e.ph ? '/ ' + esc(e.ph) + ' /' : ''}
        <button class="icon-btn sound" data-act="speak" data-w="${esc(e.w)}" aria-label="发音">${ICON.sound}</button>
      </div>
      ${session.revealed ? `
        <div class="reveal">
          <div class="meaning">${e.pos ? '<span class="pos">' + esc(e.pos) + '</span>' : ''}${esc(e.m)}</div>
          ${ex}
          ${fam}
        </div>` : '<div class="hint">轻触卡片查看释义</div>'}
    </main>
    <footer class="study-actions">
      ${session.revealed ? `
        <div class="grades">
          <button class="grade again" data-act="grade" data-g="again"><b>忘记</b><small>${previewLabel(card, 'again')}</small></button>
          <button class="grade hard" data-act="grade" data-g="hard"><b>模糊</b><small>${previewLabel(card, 'hard')}</small></button>
          <button class="grade good" data-act="grade" data-g="good"><b>认识</b><small>${previewLabel(card, 'good')}</small></button>
        </div>` : '<button class="btn primary wide" data-act="reveal">显示答案</button>'}
    </footer>
  </div>`;

  if (!session.spoken.has(id)) {
    session.spoken.add(id);
    if (state.settings.autoTTS) setTimeout(() => speak(e.w), 120);
  }
}

function doneView() {
  const st = streak(state);
  const total = session ? session.good + session.hard + session.again : 0;
  return `<div class="done">
    <div class="done-check">${ICON.check}</div>
    <h1>本次完成</h1>
    <p class="muted">共学习 ${total} 张卡片</p>
    <div class="done-stats">
      <div><b>${session ? session.good : 0}</b><span>认识</span></div>
      <div><b>${session ? session.hard : 0}</b><span>模糊</span></div>
      <div><b>${session ? session.again : 0}</b><span>忘记</span></div>
      <div><b>${st}</b><span>连续天数</span></div>
    </div>
    <div class="done-actions">
      <button class="btn primary wide" data-act="againSession">再来一组</button>
      <button class="btn ghost wide" data-act="go" data-to="home">返回今日</button>
    </div>
  </div>`;
}

/* ---------------- actions ---------------- */
function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (e.target.classList && e.target.classList.contains('sheet-mask')) { detailId = null; render(); return; }
  if (!t) return;  const act = t.dataset.act;
  switch (act) {
    case 'go': go('#/' + t.dataset.to); break;
    case 'back': back(); break;
    case 'start': startSession(); break;
    case 'extra': {
      const ids = newWordOrder(state.settings.book).slice(0, 10);
      if (!ids.length) { toast('这本词书已经学完了'); return; }
      startSession(ids, 'extra');
      break;
    }
    case 'reveal': reveal(); break;
    case 'grade': doGrade(t.dataset.g); break;
    case 'quit': {
      if (session && session.i > 0 && !session.done && !confirm('退出本次学习？已学的内容会保存。')) return;
      session = null;
      go('#/home');
      break;
    }
    case 'useBook': {
      const id = t.dataset.id;
      if (id === state.settings.book) { toast('正在学这本'); return; }
      state.settings.book = id;
      save(state);
      toast('已切换到「' + META[id].name + '」');
      render();
      break;
    }
    case 'detail': detailId = t.dataset.id; render(); break;
    case 'closeDetail': detailId = null; render(); break;
    case 'speak': speak(t.dataset.w); break;
    case 'fav': {
      const id = t.dataset.id;
      if (state.fav[id]) delete state.fav[id]; else state.fav[id] = Date.now();
      save(state); render();
      break;
    }
    case 'unwrong': {
      delete state.wrong[t.dataset.id];
      save(state); toast('已移出错词本'); render();
      break;
    }
    case 'practiceWrong': {
      const ids = Object.keys(state.wrong).filter((id) => ALL[id]);
      if (!ids.length) { toast('错词本是空的'); return; }
      startSession(ids, 'wrong');
      break;
    }
    case 'againSession': {
      const ids = makeSession();
      if (ids) { session = ids; render(); }
      else {
        const extra = newWordOrder(state.settings.book).slice(0, 10);
        if (!extra.length) { toast('这本词书已经学完了'); return; }
        startSession(extra, 'extra');
      }
      break;
    }
    case 'step': {
      const k = t.dataset.k;
      const d = Number(t.dataset.d);
      const cfg = { newPerDay: [5, 100, 5], reviewCap: [20, 300, 10] }[k];
      let v = (state.settings[k] | 0) + d * cfg[2];
      v = Math.max(cfg[0], Math.min(cfg[1], v));
      state.settings[k] = v;
      save(state); render();
      break;
    }
    case 'toggleTTS':
      state.settings.autoTTS = !state.settings.autoTTS;
      save(state); render();
      break;
    case 'cal':
      calOffset += Number(t.dataset.d);
      render();
      break;
    case 'export': exportBackup(); break;
    case 'resetBook': resetBook(); break;
    case 'resetAll': resetAll(); break;
    default: break;
  }
}

function reveal() {
  if (!session || session.done) return;
  if (!session.revealed) { session.revealed = true; render(); }
}

function doGrade(g) {
  if (!session || !session.revealed) return;
  const id = session.ids[session.i];
  const prev = state.cards[id];
  const wasNew = !prev;
  const base = prev || newCard(id);
  const { card } = grade(base, g);
  state.cards[id] = card;

  const day = ensureDay(state);
  const bk = bookOf(id);
  if (wasNew) { day.new += 1; day.newBook[bk] = (day.newBook[bk] || 0) + 1; }
  else { day.rev += 1; day.revBook[bk] = (day.revBook[bk] || 0) + 1; }
  if (g === 'good') { day.good += 1; session.good += 1; }
  else if (g === 'hard') { day.hard += 1; session.hard += 1; }
  else { day.again += 1; session.again += 1; state.wrong[id] = Date.now(); }

  if (g === 'again' && !session.readded.has(id)) {
    session.readded.add(id);
    session.ids.push(id);
    session.total += 1;
  }
  save(state);

  session.i += 1;
  session.revealed = false;
  if (session.i >= session.ids.length) session.done = true;
  render();
}

function onInput(e) {
  if (e.target.id === 'searchInput') {
    searchQ = e.target.value;
    const main = document.getElementById('searchMain');
    if (main) main.innerHTML = searchResults();
  }
}

function onChange(e) {
  if (e.target.id === 'importFile') {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        if (!s || s.v !== 2 || typeof s.cards !== 'object') throw new Error('bad');
        if (!confirm('导入会覆盖当前学习记录，确定继续？')) return;
        save(s);
        location.reload();
      } catch (err) {
        toast('备份文件格式不正确');
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }
}

function onKey(e) {
  if (location.hash.indexOf('#/search') === 0) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (location.hash !== '#/study' || !session || session.done) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (!session.revealed) reveal();
  } else if (session.revealed && (e.key === '1' || e.key === '2' || e.key === '3')) {
    doGrade(e.key === '1' ? 'again' : e.key === '2' ? 'hard' : 'good');
  } else if (e.key === 'Escape') {
    session = null;
    go('#/home');
  }
}

/* ---------------- data actions ---------------- */
function exportBackup() {
  try {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '背单词备份-' + dayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('备份已导出');
  } catch (e) { toast('导出失败'); }
}

function resetBook() {
  const book = state.settings.book;
  const n = learnedCount(book);
  if (!confirm('清空「' + META[book].name + '」的学习进度？共 ' + n + ' 个词，操作不可恢复。')) return;
  Object.keys(state.cards).forEach((id) => { if (bookOf(id) === book) delete state.cards[id]; });
  Object.keys(state.wrong).forEach((id) => { if (bookOf(id) === book) delete state.wrong[id]; });
  save(state);
  toast('已重置');
  render();
}

function resetAll() {
  if (!confirm('清空全部学习记录（三本词书、错词、打卡）？操作不可恢复。')) return;
  save(defaults());
  location.reload();
}
