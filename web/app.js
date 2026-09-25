'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ------------------------------------------------------------------ 图标 */
// 统一的线条图标：24×24、2px 描边、颜色跟随文字，所以在各种按钮里都能直接用
const ICONS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  back: 'M15 18l-6-6 6-6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  books: 'M4 5h4v14H4zM10 5h4v14h-4zM16.3 5.8l3.4.9-3 12.5-3.4-.9z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  retry: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  rotate: 'M3 10h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM13 3a8 8 0 0 1 8 8M21 11l-2.2-2M21 11l2-2.2',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  book: 'M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3zM21 5.5A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  rows: 'M4 5h5v5H4zM4 14h5v5H4zM12 6.5h8M12 15.5h8',
  selectAll: 'M3 12.5l3.5 3.5L14 8.5M10 16l1 1 9-9.5',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  play: 'M8 5.5v13l10.5-6.5z',
  next: 'M9 6l6 6-6 6',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
};

function svg(name, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" `
    + `stroke="currentColor" stroke-width="2" stroke-linecap="round" `
    + `stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

/** 纯图标按钮。label 同时用作无障碍名和长按提示，意思不会丢。 */
function iconButton(name, label, cls, size = 18) {
  const b = document.createElement('button');
  b.className = cls;
  b.innerHTML = svg(name, size);
  b.title = label;
  b.setAttribute('aria-label', label);
  return b;
}

// 页面里写死的图标位：<span data-icon="menu"></span>
$$('[data-icon]').forEach((el) => {
  el.innerHTML = svg(el.dataset.icon, Number(el.dataset.size) || 22);
});

/* ------------------------------------------------------------ 偏好 / 主题 */
// 只影响本机界面的偏好存在本地；下载相关的设置存在服务端 config.json
const PREF_DEFAULTS = {
  'jm-read-mode': 'scroll',
  'jm-volume-keys': '1',
  'jm-autohide': '1',
  'jm-theme': 'system',
  'jm-shelf-view': 'list',
  'jm-spread': '1',
  'jm-privacy': '1',
  'jm-show-blocked': '0',
  'jm-pet': '1',
  'jm-mask': '0',
  'jm-mask-allow': '',
  'jm-search-mode': 'and',
  'jm-fav-sort': 'page',
  'jm-feed-tags': '1',       // 动态页显示和收藏标签最搭的新本     // 搜索按收藏排序：page 只排当前页 / pool 前几页合起来排   // 多个关键字：and 同时包含 / or 包含其一
};

function pref(key) {
  const v = localStorage.getItem(key);
  return v == null ? PREF_DEFAULTS[key] : v;
}

function setPref(key, value) {
  localStorage.setItem(key, value);
  if (key === 'jm-theme') applyTheme();
  if (key === 'jm-shelf-view') { updateViewButton(); renderShelf(); }
  if (key === 'jm-privacy') applyPrivacy();
  if (key === 'jm-pet' && window.petApply) petApply();
  if (key === 'jm-mask' && window.maskApply) maskApply();
  if (key === 'jm-mask-allow' && window.maskAllow) maskAllow();
  if (key === 'jm-search-mode') applySearchMode();
  if (key === 'jm-feed-tags') feedStale = true;
}

// 切到后台时最近任务里不显示 App 画面
function applyPrivacy() {
  native('setPrivacy', pref('jm-privacy') === '1');
}

// 安卓 App 里才有 AndroidApp 这些原生接口；网页版里安静地跳过
const hasNative = (name) =>
  !!(window.AndroidApp && typeof window.AndroidApp[name] === 'function');
function native(name, ...args) {
  if (!hasNative(name)) return undefined;
  try { return window.AndroidApp[name](...args); } catch (_) { return undefined; }
}

function systemIsDark() {
  // App 里 WebView 的 prefers-color-scheme 跟的是 App 自己的主题而不是手机，所以先问原生
  if (hasNative('isNightMode')) return !!native('isNightMode');
  return !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme() {
  const t = pref('jm-theme');
  const dark = t === 'dark' || (t === 'system' && systemIsDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#14141a' : '#f3f3f7';
  if (currentView !== 'reader') native('setSystemBars', !dark);
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (pref('jm-theme') === 'system') applyTheme();
  });
}

const api = {
  async get(url) {
    const r = await fetch(url);
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    return r.json();
  },
};

let toastTimer;
function toast(msg) {
  if (window.petToast && petToast(msg)) return;   // 看板娘在屏幕上时由她来说
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ------------------------------------------------------------------ 视图 */
let currentView = 'shelf';
applyTheme();

const SUBPAGES = ['detail', 'settings', 'import'];

function switchView(name, push = true) {
  const leaving = currentView;
  currentView = name;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.goto === name));
  const chrome = ['reader', ...SUBPAGES].includes(name);
  $('#tabbar').classList.toggle('hidden', chrome);
  document.body.classList.remove('immersive');

  // 进入子页面从右边滑进来，其余切换淡入；按返回键回来的也只淡入；阅读器不做动画
  const el = $('#view-' + name);
  if (el && name !== 'reader' && leaving !== name) {
    const back = Date.now() - lastBackAt < 400;
    el.classList.remove('anim-push', 'anim-fade');
    void el.offsetWidth;   // 让动画能重新播放
    el.classList.add(SUBPAGES.includes(name) && !back ? 'anim-push' : 'anim-fade');
  }

  if (name !== 'shelf' && selecting) exitSelect();
  if (name === 'shelf' && leaving !== 'shelf') renderShelf();
  if (leaving === 'reader' && name !== 'reader') leaveReader();
  if (name === 'reader') enterReaderChrome();
  if (name === 'download') {
    if (!$('#search-results').children.length) renderHistory();
    showTip('download');
  }
  if (name === 'feed') openFeed();
  if (push) history.pushState({ view: name }, '');
}

function goBack() {
  history.back();
}

let lastBackAt = 0;

window.addEventListener('popstate', (e) => {
  lastBackAt = Date.now();
  // 页面总览开着时按返回键：先关总览，别直接退出阅读器
  if (!$('#overview').classList.contains('hidden')) {
    closeOverview();
    return;
  }
  // 多选时按返回键：先退出多选，人还留在书架
  if (selecting) {
    exitSelect();
    if (currentView === 'shelf') return;
  }
  const state = e.state || { view: 'shelf' };
  if (state.view === 'reader' && state.album) {
    openReader(state.album, null, false);
  } else if (state.view === 'detail' && state.album) {
    openDetail(state.album, false);
  } else {
    switchView(state.view || 'shelf', false);
  }
});

/* ----------------------------------------------------------------- 书架 */
let shelfItems = [];
let shelfGroups = [];
let activeGroup = '';        // '' = 全部，'\u0000none' = 只看未分组

const UNGROUPED = '\u0000none';

// 点了删除、还在"可撤销"窗口里的本子：界面上先藏起来，时间到了才真删
const hiddenIds = new Set();
const liveItems = () => shelfItems.filter((b) => !hiddenIds.has(b.id));

let shelfLoaded = false;

function renderShelfSkeleton() {
  const grid = $('#shelf-grid');
  grid.innerHTML = '';
  for (let k = 0; k < 4; k++) {
    const el = document.createElement('div');
    el.className = 'book ghostbook';
    el.innerHTML = '<div class="cover skeleton"></div><div class="binfo">'
      + '<div class="line skeleton"></div><div class="line skeleton short"></div>'
      + '<div class="line skeleton short"></div></div>';
    grid.appendChild(el);
  }
}

async function loadShelf() {
  if (!shelfLoaded) renderShelfSkeleton();
  const [shelf, groups] = await Promise.all([
    api.get('/api/shelf'),
    api.get('/api/groups'),
  ]);
  shelfItems = shelf.items || [];
  shelfGroups = groups.groups || [];
  shelfLoaded = true;
  renderShelf();
  if (!$('#drawer').classList.contains('hidden')) renderDrawer();
}

function groupLabel() {
  if (activeGroup === UNGROUPED) return '未分组';
  return activeGroup || '书架';
}

/* ------------------------------------------------------------ 左侧分组栏 */
function openDrawer() {
  renderDrawer();
  $('#drawer').classList.remove('hidden');
}

function closeDrawer() {
  $('#drawer').classList.add('hidden');
  $('#new-group').value = '';
}

function renderDrawer() {
  const list = $('#drawer-groups');
  list.innerHTML = '';

  const live = liveItems();
  const countOf = (g) => g === UNGROUPED
    ? live.filter((b) => !b.group).length
    : (g === '' ? live.length
       : live.filter((b) => b.group === g).length);

  const addRow = (value, label, manageable) => {
    const row = document.createElement('button');
    row.className = 'sheet-item' + (value === activeGroup ? ' current' : '');
    row.innerHTML = '<span class="name"></span><span class="count"></span>';
    row.querySelector('.name').textContent = label;
    row.querySelector('.count').textContent = countOf(value) + ' 本';
    row.onclick = () => {
      activeGroup = value;
      $('#shelf-title').textContent = groupLabel();
      renderShelf();
      closeDrawer();
    };
    if (manageable) {
      const rn = iconButton('edit', '改名', 'rn');
      rn.onclick = (e) => { e.stopPropagation(); startRename(row, value); };
      row.appendChild(rn);

      const del = iconButton('trash', '删除分组', 'del danger');
      del.onclick = (e) => { e.stopPropagation(); deleteGroup(value); };
      row.appendChild(del);
    }
    list.appendChild(row);
  };

  addRow('', '全部', false);
  addRow(UNGROUPED, '未分组', false);
  for (const g of shelfGroups) addRow(g, g, true);
}

// 就地把分组名换成输入框，省一个弹窗
function startRename(row, oldName) {
  row.innerHTML = '';
  const input = document.createElement('input');
  input.value = oldName;
  input.maxLength = 20;
  const ok = iconButton('check', '保存', 'rn');
  row.appendChild(input);
  row.appendChild(ok);
  input.focus();
  input.select();

  const submit = async () => {
    const name = input.value.trim();
    if (!name || name === oldName) return renderDrawer();
    const res = await api.post('/api/group/rename', { old: oldName, new: name });
    if (res.error) { toast(res.error); return renderDrawer(); }
    if (activeGroup === oldName) activeGroup = name;
    shelfGroups = res.groups || shelfGroups;
    $('#shelf-title').textContent = groupLabel();
    await loadShelf();
    renderDrawer();
  };
  ok.onclick = (e) => { e.stopPropagation(); submit(); };
  input.onclick = (e) => e.stopPropagation();
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}

async function createGroup() {
  const name = $('#new-group').value.trim();
  if (!name) return toast('请输入分组名称');
  const res = await api.post('/api/group/create', { name });
  if (res.error) return toast(res.error);
  shelfGroups = res.groups || [];
  $('#new-group').value = '';
  renderDrawer();
  toast(`已新建「${name}」`);
}

let shelfQuery = '';
let shelfFilter = 'all';

const SHELF_FILTERS = [
  ['all', '全部'], ['reading', '读到一半'], ['unread', '未读'],
  ['finished', '已读完'], ['partial', '未下完'],
];

function readState(b) {
  const pos = getProgress(b.id);
  if (pos <= 0) return 'unread';
  return pos >= b.pages - 1 ? 'finished' : 'reading';
}

function matchFilter(b, f) {
  if (f === 'all') return true;
  if (f === 'partial') return !b.complete;
  return readState(b) === f;
}
let shelfSort = localStorage.getItem('jm-shelf-sort') || 'added';
let activeTasks = new Map();   // 正在下 / 排队中的任务，书架据此显示「下载中」

const lastRead = (id) => parseInt(localStorage.getItem('jm-read-' + id) || '0', 10);

const SORTERS = {
  added: (a, b) => b.added_at - a.added_at,
  read: (a, b) => (lastRead(b.id) - lastRead(a.id)) || (b.added_at - a.added_at),
  name: (a, b) => a.name.localeCompare(b.name, 'zh'),
  pages: (a, b) => b.pages - a.pages,
};

function visibleBooks() {
  let books = liveItems();
  if (activeGroup === UNGROUPED) books = books.filter((b) => !b.group);
  else if (activeGroup) books = books.filter((b) => b.group === activeGroup);
  books = books.filter((b) => matchFilter(b, shelfFilter));

  // 空格隔开多个词；-词 排除，+词 必须有，其余的按「与 / 或」模式
  const words = shelfQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const not = words.filter((w) => w.length > 1 && w[0] === '-').map((w) => w.slice(1));
  const must = words.filter((w) => w.length > 1 && w[0] === '+').map((w) => w.slice(1));
  const plain = words.filter((w) => !((w[0] === '-' || w[0] === '+') && w.length > 1));
  if (words.length) {
    const hit = (b, w) => {
      // 允许输 "jm123" 这种带前缀的写法
      const idQuery = w.replace(/^jm/, '');
      return [b.name, b.author, b.note, ...(b.tags || [])]
        .some((s) => String(s || '').toLowerCase().includes(w))
        || (idQuery && b.id.includes(idQuery));
    };
    const any = pref('jm-search-mode') === 'or';
    books = books.filter((b) => !not.some((w) => hit(b, w))
      && must.every((w) => hit(b, w))
      && (!plain.length || (any ? plain.some((w) => hit(b, w)) : plain.every((w) => hit(b, w)))));
  }
  // 加了星的排最前，然后才按选的排序方式
  const sorter = SORTERS[shelfSort] || SORTERS.added;
  return [...books].sort((a, b) => (b.starred - a.starred) || sorter(a, b));
}

async function resumeDownload(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '已加入'; }
  const res = await api.post('/api/download', { id });
  if (res.error) {
    toast(res.error);
    if (btn) { btn.disabled = false; btn.textContent = '继续下载'; }
    return;
  }
  toast('继续下载，只补缺的页');
  pollTasks();
}

function renderShelf() {
  if (!shelfLoaded) return;   // 数据还没到，别把骨架屏换成"书架是空的"
  const grid = $('#shelf-grid');
  const books = visibleBooks();
  const live = liveItems();
  grid.innerHTML = '';
  grid.classList.toggle('wall', pref('jm-shelf-view') === 'wall');
  $('#shelf-empty').classList.toggle('hidden', live.length > 0);
  $('#shelf-tools').classList.toggle('hidden', live.length === 0);
  $('#shelf-nomatch').classList.toggle('hidden', !live.length || books.length > 0);

  for (const book of books) {
    const el = document.createElement('div');
    el.className = 'book';
    el.innerHTML = `
      <div class="cover">
        <img loading="lazy" alt="">
      </div>
      <div class="binfo">
        <div class="title"></div>
        <div class="author"></div>
        <div class="btags"></div>
        <div class="bnote"></div>
        <div class="bfoot">
          <span class="jmid"></span>
        </div>
      </div>`;
    const cover = el.querySelector('.cover');

    // 封面左上角的星星（中心压在封面的角上）：点一下加星 / 去星，不触发打开详情或长按多选
    const star = document.createElement('button');
    star.className = 'star' + (book.starred ? ' on' : '');
    star.innerHTML = svg('star', 16);
    star.title = book.starred ? '去掉星标' : '加星（排到最前）';
    star.setAttribute('aria-label', star.title);
    star.addEventListener('pointerdown', (e) => e.stopPropagation());
    star.onclick = (e) => { e.stopPropagation(); setStar(book.id, !book.starred); };
    el.appendChild(star);   // 封面会裁掉超出的部分，所以挂在卡片上

    const noteEl = el.querySelector('.bnote');
    if (book.note) noteEl.textContent = book.note; else noteEl.remove();
    const foot = el.querySelector('.bfoot');
    el.querySelector('img').src = book.cover;
    el.querySelector('.title').textContent = book.name;

    const author = el.querySelector('.author');
    if (book.author) {
      author.textContent = book.author;
      makeCopyable(author, book.author, () => !selecting);   // 多选时点作者仍是勾选
    } else {
      author.remove();
    }

    const tagBox = el.querySelector('.btags');
    for (const t of (book.tags || []).slice(0, 5)) {
      const s = document.createElement('span');
      s.textContent = t;
      tagBox.appendChild(s);
    }
    if (!tagBox.children.length) tagBox.remove();

    el.querySelector('.jmid').textContent = `JM${book.id} · ${book.pages}P`;

    // 阅读进度：封面底部一条细进度条 + 文字；翻过页才显示
    const read = getProgress(book.id);
    if (read > 0) {
      const finished = read >= book.pages - 1;
      const bar = document.createElement('div');
      bar.className = 'readbar' + (finished ? ' done' : '');
      bar.innerHTML = '<i></i>';
      bar.querySelector('i').style.width =
        Math.round(((read + 1) / book.pages) * 100) + '%';
      cover.appendChild(bar);

      const mark = document.createElement('span');
      mark.className = 'readmark' + (finished ? ' done' : '');
      mark.textContent = finished ? '已读完' : `读到 ${read + 1}/${book.pages}`;
      foot.appendChild(mark);
    }
    if (book.group && !activeGroup) {
      const tag = document.createElement('span');
      tag.className = 'grouptag';
      tag.innerHTML = svg('folder', 11);
      tag.append(book.group);
      foot.appendChild(tag);
    }

    // 没下完的：封面变暗加角标，信息区给出已下页数和继续下载
    if (!book.complete) {
      el.classList.add('partial');
      const flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = '未完成';
      cover.appendChild(flag);

      el.querySelector('.jmid').textContent = `JM${book.id} · 已下 ${book.pages}/${book.expected}P`;

      const btn = document.createElement('button');
      btn.className = 'resume';
      const task = activeTasks.get(book.id);
      if (task) {
        btn.textContent = task.status === 'queued' ? '排队中' : '下载中…';
        btn.disabled = true;
      } else {
        btn.textContent = '继续下载';
        btn.onclick = (e) => { e.stopPropagation(); resumeDownload(book.id, btn); };
      }
      foot.appendChild(btn);
    }
    if (selecting) {
      const check = document.createElement('span');
      check.className = 'check';
      if (selected.has(book.id)) {
        el.classList.add('selected');
        check.innerHTML = svg('check', 14);
      }
      cover.appendChild(check);
    }
    bindBookPress(el, book);
    grid.appendChild(el);
  }
  renderFilters();
  renderContinue();
  if (live.length && currentView === 'shelf') showTip('shelf');
}

function renderFilters() {
  const bar = $('#shelf-filters');
  bar.innerHTML = '';
  const live = liveItems();
  if (!live.length) return;
  for (const [key, label] of SHELF_FILTERS) {
    const n = live.filter((b) => matchFilter(b, key)).length;
    // 数量为 0 的筛选没意义，不占地方（当前选中的除外）
    if (key !== 'all' && !n && shelfFilter !== key) continue;
    const chip = document.createElement('button');
    chip.className = 'chip' + (shelfFilter === key ? ' active' : '');
    chip.textContent = key === 'all' ? label : `${label} ${n}`;
    chip.onclick = () => { shelfFilter = key; renderShelf(); };
    bar.appendChild(chip);
  }
}

// 书架最上面：最近读过、还没读完的那一本，点一下直接回到上次的位置
function renderContinue() {
  const box = $('#continue');
  const plain = !selecting && !activeGroup && !shelfQuery.trim() && shelfFilter === 'all';
  let pick = null;
  if (plain) {
    for (const b of liveItems()) {
      if (readState(b) !== 'reading') continue;
      if (!pick || lastRead(b.id) > lastRead(pick.id)) pick = b;
    }
  }
  box.classList.toggle('hidden', !pick);
  if (!pick) return;

  const pos = getProgress(pick.id);
  box.innerHTML = `
    <span class="mimg"><img alt=""></span>
    <div class="cinfo">
      <div class="clabel">继续阅读</div>
      <div class="ctitle"></div>
      <div class="csub"></div>
    </div>
    <button class="cgo" aria-label="继续阅读" title="继续阅读">${svg('play', 22)}</button>`;
  box.querySelector('img').src = pick.cover;
  box.querySelector('.ctitle').textContent = pick.name;
  box.querySelector('.csub').textContent =
    `读到 ${pos + 1}/${pick.pages} · ${timeAgo(lastRead(pick.id))}`;
  box.onclick = () => openReader(pick.id, pos);
}

/* ------------------------------------------------------------ 多选 */
let selecting = false;
const selected = new Set();
let suppressClick = false;

// 短按打开详情（多选时是勾选），长按进入多选
function bindBookPress(el, book) {
  let timer = null;
  let start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    suppressClick = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;           // 长按松手后那一下 click 不算点击
      if (navigator.vibrate) navigator.vibrate(12);
      if (selecting) toggleSelected(book.id);
      else enterSelect(book.id);
    }, 480);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());   // 长按别弹系统菜单
  el.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    if (selecting) toggleSelected(book.id);
    else openDetail(book.id);
  });
}

function enterSelect(firstId) {
  selecting = true;
  selected.clear();
  if (firstId) selected.add(firstId);
  history.pushState({ view: 'shelf', select: 1 }, '');   // 让返回键能退出多选
  updateSelectBar();
  renderShelf();
}

function exitSelect() {
  selecting = false;
  selected.clear();
  updateSelectBar();
  renderShelf();
}

function toggleSelected(id) {
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  updateSelectBar();
  renderShelf();
}

function updateSelectBar() {
  $('#shelf-top').classList.toggle('hidden', selecting);
  $('#select-bar').classList.toggle('hidden', !selecting);
  $('#sel-count').textContent = `已选 ${selected.size} 本`;
}

function selectAllVisible() {
  const ids = visibleBooks().map((b) => b.id);
  const all = ids.length && ids.every((id) => selected.has(id));
  selected.clear();
  if (!all) ids.forEach((id) => selected.add(id));
  updateSelectBar();
  renderShelf();
}

/* ------------------------------------------------------------ 分组弹层 */
let sheetAlbumId = null;   // 单本是字符串，批量是数组

function openGroupSheet(albumId, current) {
  sheetAlbumId = albumId;
  $('#sheet-title').textContent = Array.isArray(albumId)
    ? `把 ${albumId.length} 本移动到分组` : '移动到分组';
  const list = $('#sheet-body');
  list.innerHTML = '';

  const addRow = (value, label) => {
    const row = document.createElement('button');
    row.className = 'sheet-item' + (value === current ? ' current' : '');
    row.innerHTML = '<span class="name"></span>';
    row.querySelector('.name').textContent = label;
    row.onclick = () => assignGroup(value);
    list.appendChild(row);
  };

  addRow('', '不分组');
  for (const g of shelfGroups) addRow(g, g);
  if (!shelfGroups.length) {
    const tip = document.createElement('div');
    tip.className = 'hint center';
    tip.textContent = '还没有分组，去左上角 ☰ 里新建';
    list.appendChild(tip);
  }
  $('#sheet').classList.remove('hidden');
}

/* -------------------------------------------------------------- 黑名单 */
let blockedIds = new Set();

let blacklistTags = [];
let blockedTagSet = new Set();
let blacklistAuthors = [];
let blockedAuthorSet = new Set();
const normTag = (t) => String(t || '').trim().toLowerCase();

// 作者字段可能写着好几个人（「甲、乙」），拆开来一个个比对；和服务端 author_keys 一致
const authorKeys = (a) => {
  const text = String(a || '');
  return [text, ...text.split(/[、,，/／&＆;；]+/)].map(normTag).filter(Boolean);
};
const hasAuthor = (set, a) => authorKeys(a).some((k) => set.has(k));

function applyBlacklist(res) {
  blockedIds = new Set((res.items || []).map((x) => x.id));
  blacklistTags = res.tags || [];
  blockedTagSet = new Set(blacklistTags.map(normTag));
  blacklistAuthors = res.authors || [];
  blockedAuthorSet = new Set(blacklistAuthors.map(normTag));
}

async function loadBlacklist() {
  const res = await api.get('/api/blacklist');
  applyBlacklist(res);
  return res.items || [];
}

/* ---- 收藏：标签、作者（搜索时排前面、动态页追更新） ---- */
let favTags = [];
let favTagSet = new Set();
let favAuthors = [];
let favAuthorSet = new Set();

function applyFavorites(res) {
  favTags = res.tags || [];
  favTagSet = new Set(favTags.map(normTag));
  favAuthors = res.authors || [];
  favAuthorSet = new Set(favAuthors.map(normTag));
}

async function loadFavorites() {
  applyFavorites(await api.get('/api/favorites'));
}

// 黑名单 / 收藏里的标签、作者一次加减一批，改完把界面上的标记刷新一遍
async function setNames(list, kind, add = [], remove = []) {
  const res = await api.post('/api/names', { list, kind, add, remove });
  if (res.error) { toast(res.error); return false; }
  applyBlacklist(res.blacklist);
  applyFavorites(res.favorites);
  markAllCards();
  markDetailTags();
  updateNameCounts();
  return true;
}

async function openBlacklistSheet() {
  const items = await loadBlacklist();
  $('#sheet-title').textContent = `本子黑名单（${items.length}）`;
  $('#mine-blacklist-count').textContent = items.length ? `${items.length} 本` : '空';
  const list = $('#sheet-body');
  list.innerHTML = '';

  if (!items.length) {
    const tip = document.createElement('div');
    tip.className = 'hint center';
    tip.textContent = '还没有拉黑任何漫画';
    list.appendChild(tip);
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'sheet-item';
    row.innerHTML = `<span class="name"></span>`;
    const name = row.querySelector('.name');
    name.textContent = item.name || ('JM' + item.id);
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = 'JM' + item.id;
    name.appendChild(sub);

    const del = iconButton('close', '移出黑名单', 'del');
    del.onclick = async () => {
      await api.post('/api/blacklist/remove', { id: item.id });
      blockedIds.delete(item.id);
      markCard(item.id, false);
      openBlacklistSheet();
      snackbar('已移出黑名单', '撤销', async () => {
        await api.post('/api/blacklist/add', { id: item.id, name: item.name });
        blockedIds.add(item.id);
        markCard(item.id, true);
        if (!$('#sheet').classList.contains('hidden')) openBlacklistSheet();
      });
    };
    row.appendChild(del);
    list.appendChild(row);
  }
  $('#sheet').classList.remove('hidden');
}

/** 把搜索结果里对应的卡片切换成（或还原出）拉黑外观 */
function markCard(albumId, blocked) {
  for (const card of $$('.card')) {
    if (card.dataset.id !== albumId) continue;
    card.classList.toggle('blocked', blocked);
    const btn = card.querySelector('.block, .unblock');
    if (btn) {
      btn.className = blocked ? 'unblock' : 'block';
      btn.textContent = blocked ? '解除拉黑' : '拉黑';
    }
  }
}

/* ---- 标签按钮：点一下按这个标签搜。拉黑 / 收藏改到搜索卡片上的按钮里挑 ---- */
function bindTagPress(btn, tag, onTap) {
  btn.onclick = (e) => {
    e.stopPropagation();
    onTap();
  };
}

// 给已下载的本子加星 / 去星：书架上排最前
async function setStar(id, on) {
  const res = await api.post('/api/star', { id, on });
  if (res.error) { toast(res.error); return false; }
  const book = shelfItems.find((b) => b.id === id);
  if (book) book.starred = on;
  renderShelf();
  if (!(window.petStarred && petStarred(on, book))) toast(on ? '已加星，排到书架最前' : '已去掉星标');
  return true;
}

// 笔记只存在本机；空的就删掉
async function saveNote(id, text) {
  const res = await api.post('/api/note', { id, text });
  if (res.error) { toast(res.error); return false; }
  const book = shelfItems.find((b) => b.id === id);
  if (book) book.note = res.note;
  renderShelf();
  return true;
}

async function setTagBlocked(tag, on) {
  // 当前结果原地标出来 / 还原，下次搜索才会真的隐藏
  await setNames('black', 'tags', on ? [tag] : [], on ? [] : [tag]);
}

// 按卡片上已知的标签、作者，标出拉黑的原因和收藏的标签 / 作者
function markTagBlocked(card) {
  let tags = [];
  try { tags = JSON.parse(card.dataset.tags || '[]'); } catch (_) {}
  const hits = tags.filter((t) => blockedTagSet.has(normTag(t)));
  const authorEl = card.querySelector('.author');
  const authorBad = !!authorEl && hasAuthor(blockedAuthorSet, authorEl.textContent);
  const why = [];
  if (authorBad) why.push('作者已拉黑');
  if (hits.length) why.push('含拉黑标签：' + hits.join('、'));
  card.classList.toggle('tagblocked', why.length > 0);
  let reason = card.querySelector('.blkreason');
  if (why.length) {
    if (!reason) {
      reason = document.createElement('span');
      reason.className = 'blkreason';
      card.querySelector('.cover').appendChild(reason);
    }
    reason.textContent = why.join('；');
  } else if (reason) {
    reason.remove();
  }
  if (authorEl) {
    authorEl.classList.toggle('bad', authorBad);
    authorEl.classList.toggle('fav', hasAuthor(favAuthorSet, authorEl.textContent));
  }
  card.querySelectorAll('.tag').forEach((b) => {
    b.classList.toggle('bad', blockedTagSet.has(normTag(b.textContent)));
    b.classList.toggle('fav', favTagSet.has(normTag(b.textContent)));
  });
}

function markAllCards() {
  $$('.card').forEach(markTagBlocked);
}

function markDetailTags() {
  $$('.detail-tags .tag').forEach((b) => {
    b.classList.toggle('bad', blockedTagSet.has(normTag(b.textContent)));
    b.classList.toggle('fav', favTagSet.has(normTag(b.textContent)));
  });
}

/* ---- 搜索卡片上的「拉黑」「收藏」：弹窗里勾这本的作者、标签（拉黑还能勾这一本） ---- */
async function openPickSheet(list, item) {
  const black = list === 'black';
  let tags = null;
  const card = $$('.card').find((c) => c.dataset.id === item.id);
  if (card && card.dataset.tags) {
    try { tags = JSON.parse(card.dataset.tags); } catch (_) {}
  }
  if (!tags) {
    // 卡片的标签还没加载，先现查一下
    const info = await api.get('/api/info?id=' + encodeURIComponent(item.id)).catch(() => ({}));
    tags = info.tags || [];
  }
  const tagSet = black ? blockedTagSet : favTagSet;
  const authorSet = black ? blockedAuthorSet : favAuthorSet;

  $('#sheet-title').textContent = black ? '拉黑' : '收藏';
  const body = $('#sheet-body');
  body.innerHTML = '';
  const picks = [];   // { kind, name, was, chip }

  const section = (title, entries) => {
    if (!entries.length) return;
    const h = document.createElement('p');
    h.className = 'pick-title';
    h.textContent = title;
    const box = document.createElement('div');
    box.className = 'pickchips';
    for (const [kind, name, was, preset] of entries) {
      const chip = document.createElement('button');
      chip.className = 'pickchip';
      chip.textContent = name;
      const pick = { kind, name, was, chip };
      chip.classList.toggle('on', preset);
      chip.onclick = () => chip.classList.toggle('on');
      picks.push(pick);
      box.appendChild(chip);
    }
    body.append(h, box);
  };

  if (black) section('这一本', [['book', item.name || ('JM' + item.id), blockedIds.has(item.id), true]]);
  if (item.author) {
    const was = hasAuthor(authorSet, item.author);
    section('作者', [['authors', item.author, was, was]]);
  }
  section('标签', tags.map((t) => {
    const was = tagSet.has(normTag(t));
    return ['tags', t, was, was];
  }));

  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = black
    ? '点一下选中 / 取消。拉黑的作者、标签，之后搜索时带它们的本子都不显示；已拉黑的取消勾选就是解除。'
    : '点一下选中 / 取消。收藏的标签越多、有收藏作者的本子，搜索时排得越前；收藏的作者出新本会出现在「动态」里。';
  body.appendChild(tip);

  const row = document.createElement('div');
  row.className = 'sheet-actions';
  const ok = document.createElement('button');
  ok.className = black ? 'primary danger' : 'primary';
  ok.textContent = black ? '确定拉黑' : '保存收藏';
  ok.onclick = async () => {
    ok.disabled = true;
    const diff = { tags: { add: [], remove: [] }, authors: { add: [], remove: [] } };
    let bookChange = null;
    for (const p of picks) {
      const on = p.chip.classList.contains('on');
      if (on === p.was) continue;
      if (p.kind === 'book') bookChange = on;
      else diff[p.kind][on ? 'add' : 'remove'].push(p.name);
    }
    for (const kind of ['tags', 'authors']) {
      if (diff[kind].add.length || diff[kind].remove.length) {
        await setNames(list, kind, diff[kind].add, diff[kind].remove);
      }
    }
    if (bookChange !== null) await toggleBlock(item, true);
    $('#sheet').classList.add('hidden');
    const added = [...diff.tags.add, ...diff.authors.add];
    const n = added.length + (bookChange ? 1 : 0);
    if (!n && !diff.tags.remove.length && !diff.authors.remove.length && bookChange === null) return;
    if (black) {
      toast(n ? `已拉黑 ${n} 项，下次搜索起不再显示` : '已更新黑名单');
    } else if (!(added.length && window.petFavorited
      && petFavorited({ tags: diff.tags.add, authors: diff.authors.add }))) {
      toast(added.length ? `已收藏 ${added.length} 项` : '已更新收藏');
    }
  };
  row.appendChild(ok);
  body.appendChild(row);
  $('#sheet').classList.remove('hidden');
}

/* ---- 名单弹层：标签黑名单、作者黑名单、收藏的标签、收藏的作者共用 ---- */
const NAME_LISTS = {
  'black-tags': {
    list: 'black', kind: 'tags', title: '标签黑名单', unit: '个', count: '#mine-tagblack-count',
    placeholder: '输入要拉黑的标签', tip: '点一下移出黑名单。',
    empty: '还没有拉黑任何标签。在搜索结果里点「拉黑」，可以挑这本的标签拉黑。',
  },
  'black-authors': {
    list: 'black', kind: 'authors', title: '作者黑名单', unit: '位', count: '#mine-authorblack-count',
    placeholder: '输入要拉黑的作者', tip: '点一下移出黑名单。',
    empty: '还没有拉黑任何作者。在搜索结果里点「拉黑」，可以把这本的作者拉黑。',
  },
  'fav-tags': {
    list: 'fav', kind: 'tags', title: '收藏的标签', unit: '个', count: '#mine-favtags-count',
    placeholder: '输入要收藏的标签', tip: '点一下取消收藏。搜索时带这些标签越多的本子排得越前。',
    empty: '还没有收藏标签。在搜索结果里点「收藏」，可以挑喜欢的标签。',
  },
  'fav-authors': {
    list: 'fav', kind: 'authors', title: '收藏的作者', unit: '位', count: '#mine-favauthors-count',
    placeholder: '输入要收藏的作者', tip: '点一下取消收藏。搜索时这些作者的本子排在前面，「动态」里能看到他们的新本。',
    empty: '还没有收藏作者。在搜索结果里点「收藏」，可以收藏这本的作者。',
  },
};
const namesOf = (key) => ({
  'black-tags': blacklistTags, 'black-authors': blacklistAuthors,
  'fav-tags': favTags, 'fav-authors': favAuthors,
})[key];

function updateNameCounts() {
  for (const [key, cfg] of Object.entries(NAME_LISTS)) {
    const n = namesOf(key).length;
    const el = $(cfg.count);
    if (el) el.textContent = n ? `${n} ${cfg.unit}` : '空';
  }
}

async function openNameSheet(key) {
  const cfg = NAME_LISTS[key];
  await Promise.all([loadBlacklist(), loadFavorites()]);
  const names = namesOf(key);
  updateNameCounts();
  $('#sheet-title').textContent = `${cfg.title}（${names.length}）`;
  const body = $('#sheet-body');
  body.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 60;
  input.placeholder = cfg.placeholder;
  const add = document.createElement('button');
  add.className = 'primary icon-only';
  add.innerHTML = svg('plus', 20);
  add.title = '添加';
  add.setAttribute('aria-label', '添加');
  const submit = async () => {
    const name = input.value.trim();
    if (!name) return toast(cfg.placeholder.replace('输入', '请输入'));
    await setNames(cfg.list, cfg.kind, [name]);
    openNameSheet(key);
  };
  add.onclick = submit;
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  row.append(input, add);
  body.appendChild(row);

  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = names.length ? cfg.tip : cfg.empty;
  body.appendChild(tip);

  if (names.length) {
    const chips = document.createElement('div');
    chips.className = 'tagchips';
    for (const name of names) {
      const chip = document.createElement('button');
      chip.className = 'tagchip';
      chip.innerHTML = '<span></span>' + svg('close', 14);
      chip.querySelector('span').textContent = name;
      chip.title = cfg.list === 'black' ? '移出黑名单' : '取消收藏';
      chip.onclick = async () => {
        await setNames(cfg.list, cfg.kind, [], [name]);
        openNameSheet(key);
        snackbar(`已移出「${name}」`, '撤销', async () => {
          await setNames(cfg.list, cfg.kind, [name]);
          if (!$('#sheet').classList.contains('hidden')) openNameSheet(key);
        });
      };
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }
  $('#sheet').classList.remove('hidden');
}

async function toggleBlock(item, fromUndo = false) {
  if (blockedIds.has(item.id)) {
    await api.post('/api/blacklist/remove', { id: item.id });
    blockedIds.delete(item.id);
    markCard(item.id, false);
    if (!fromUndo) toast('已解除拉黑');
  } else {
    await api.post('/api/blacklist/add', { id: item.id, name: item.name });
    blockedIds.add(item.id);
    markCard(item.id, true);
    if (!fromUndo) snackbar('已拉黑，之后不会再搜到', '撤销', () => toggleBlock(item, true));
  }
}

function closeSheet() {
  $('#sheet').classList.add('hidden');
  sheetAlbumId = null;
}

async function assignGroup(group) {
  if (!sheetAlbumId) return;
  const batch = Array.isArray(sheetAlbumId);
  const res = await api.post('/api/group/assign',
    batch ? { ids: sheetAlbumId, group } : { id: sheetAlbumId, group });
  shelfGroups = res.groups || shelfGroups;
  closeSheet();
  toast(group ? `已移到「${group}」` : '已移出分组');
  if (batch && selecting) history.back();   // 批量操作完退出多选
  await loadShelf();
  if (!batch && detailData && currentView === 'detail') openDetail(detailData.id, false);
}

async function deleteGroup(group) {
  if (!await confirmDialog({
    title: `删除分组「${group}」？`,
    message: '组里的漫画会回到"未分组"，不会被删掉。',
    ok: '删除', danger: true,
  })) return;
  const res = await api.post('/api/group/delete', { group });
  shelfGroups = res.groups || [];
  if (activeGroup === group) activeGroup = '';
  $('#shelf-title').textContent = groupLabel();
  await loadShelf();
  renderDrawer();
  toast(`已删除「${group}」`);
}

/* ------------------------------------------------------ 确认弹窗 */
function confirmDialog({ title, message = '', ok = '确定', danger = false }) {
  return new Promise((resolve) => {
    const dlg = $('#dialog');
    dlg.querySelector('h3').textContent = title;
    dlg.querySelector('p').textContent = message;
    const yes = dlg.querySelector('[data-yes]');
    yes.textContent = ok;
    yes.classList.toggle('danger', danger);
    const done = (value) => {
      dlg.classList.add('hidden');
      dlg.onclick = null;
      resolve(value);
    };
    yes.onclick = () => done(true);
    dlg.querySelector('[data-no]').onclick = () => done(false);
    dlg.onclick = (e) => { if (e.target === dlg) done(false); };   // 点空白处等于取消
    dlg.classList.remove('hidden');
  });
}

/* ------------------------------------------------------ 点作者名复制 */
// guard 返回 false 时不拦截点击（比如书架多选时，点作者还是勾选这本）
function makeCopyable(el, text, guard) {
  el.classList.add('copyable');
  el.title = '点一下复制作者名';
  el.addEventListener('click', async (e) => {
    if (guard && !guard()) return;
    e.stopPropagation();
    toast((await copyText(text)) ? `已复制「${text}」` : '复制失败');
  });
}

/* ------------------------------------------------------ 首次使用提示 */
// 这些操作界面上没有显眼的按钮，不说就发现不了；每条只提示一次
const TIPS = {
  shelf: '长按一本可以多选：批量分组、删除、导出号单。在书架顶部往下拉可以刷新。',
  detail: '点作者名可以复制，方便去搜这个作者的其他作品。',
  tagblock: '点「拉黑」可以挑这一本、作者、标签一起拉黑；点「收藏」可以收藏喜欢的作者和标签，之后带这些的本子搜索时排在前面。',
  download: '直接输入 JM 号就能下载，多个号用空格隔开；也可以按标题、作者、标签搜索。',
  'reader-scroll': '双指缩放，双击放大 / 还原，点一下显示或隐藏菜单。右上角可以切换成翻页模式。',
  'reader-ltr': '点屏幕右侧下一页、左侧上一页，中间呼出菜单；也可以左右滑动或按音量键。',
  'reader-rtl': '日漫模式：和实体书一样，点屏幕左侧是下一页，右侧是上一页。',
};

function showTip(key) {
  const box = $('#tip');
  if (!TIPS[key] || localStorage.getItem('jm-tip-' + key)) return;
  // 刚打开时书架先画出来，看板娘的脚本还没跑；等它就位再决定谁来讲
  if (!window.petTip && pref('jm-pet') === '1') return setTimeout(() => showTip(key));
  if (!box.classList.contains('hidden')) return;   // 一次只提示一条
  localStorage.setItem('jm-tip-' + key, '1');
  const popup = () => {
    box.querySelector('p').textContent = TIPS[key];
    box.classList.remove('hidden');
  };
  // 看板娘在就让她来讲；讲到一半被收起来了，再退回弹窗
  if (window.petTip && petTip(TIPS[key], (handBack) => handBack && popup())) return;
  popup();
}

/* ------------------------------------------------------ 时间格式 */
function timeAgo(ms) {
  if (!ms) return '';
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  if (min < 1440) return `${Math.floor(min / 60)} 小时前`;
  return `${Math.floor(min / 1440)} 天前`;
}

function formatDuration(sec) {
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`;
  return `${Math.floor(sec / 3600)} 小时 ${Math.round((sec % 3600) / 60)} 分`;
}

/* ------------------------------------------------------ 可撤销的提示条 */
let snackTimer = null;

function snackbar(text, actionText, onAction, ms = 6000) {
  const bar = $('#snackbar');
  bar.querySelector('span').textContent = text;
  const btn = bar.querySelector('button');
  btn.textContent = actionText;
  btn.onclick = () => { hideSnackbar(); onAction(); };
  bar.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(hideSnackbar, ms);
}

function hideSnackbar() {
  clearTimeout(snackTimer);
  $('#snackbar').classList.remove('show');
}

/* ------------------------------------------------------ 删除（可撤销） */
// 先把本子从界面上藏起来，6 秒内能撤销；时间到了、或者 App 切到后台时才真删文件
let pendingDelete = null;

function softDelete(ids, label) {
  commitDelete();                       // 上一批还在等的先落实
  ids.forEach((id) => hiddenIds.add(id));
  renderShelf();
  const timer = setTimeout(commitDelete, 6000);
  const batch = { ids, timer };
  pendingDelete = batch;
  snackbar(label, '撤销', () => {
    clearTimeout(timer);
    if (pendingDelete === batch) pendingDelete = null;
    ids.forEach((id) => hiddenIds.delete(id));
    renderShelf();
    toast('已撤销');
  });
}

async function commitDelete() {
  if (!pendingDelete) return;
  const { ids, timer } = pendingDelete;
  pendingDelete = null;
  clearTimeout(timer);
  for (const id of ids) {
    await api.del('/api/album?id=' + encodeURIComponent(id));
    localStorage.removeItem('jm-pos-' + id);
    localStorage.removeItem('jm-read-' + id);
  }
  ids.forEach((id) => hiddenIds.delete(id));
  await loadShelf();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) commitDelete();
});

/* ----------------------------------------------------------------- 详情 */
let detailData = null;

async function openDetail(id, push = true) {
  const data = await api.get('/api/album?id=' + encodeURIComponent(id));
  if (data.error) return toast('没找到这本漫画');
  detailData = data;

  $('#detail-title').textContent = data.name;
  const saved = getProgress(id);

  const body = $('#detail-body');
  body.innerHTML = `
    <div class="hero">
      <img class="hero-bg" alt="">
      <div class="head">
        <span class="mimg dcover"><img alt=""></span>
        <div class="meta">
          <h2></h2>
          <p class="author"></p>
          <p class="id"></p>
          <p class="cnt"></p>
        </div>
      </div>
    </div>
    <p class="partial-note hidden"></p>
    <div class="detail-tags"></div>
    <div class="actions">
      <button class="primary" id="btn-read"></button>
      <button class="ghost hidden" id="btn-resume">继续下载</button>
      <button class="ghost icon-only" id="btn-star">${svg('star', 20)}</button>
      <button class="ghost icon-only" id="btn-group" title="移动到分组" aria-label="移动到分组">${svg('folder', 20)}</button>
      <button class="ghost icon-only" id="btn-delete" title="删除这本" aria-label="删除这本">${svg('trash', 20)}</button>
    </div>
    <div class="note-box">
      <textarea id="detail-note" rows="2" maxlength="2000" placeholder="写点笔记……（只存在这台设备上）"></textarea>
    </div>
    <div id="chapter-list"></div>`;

  body.querySelector('.head img').src = data.thumb;
  body.querySelector('.hero-bg').src = data.thumb;
  body.querySelector('h2').textContent = data.name;

  if (!data.complete) {
    const got = data.chapters.reduce((n, c) => n + c.pages.length, 0);
    const note = body.querySelector('.partial-note');
    note.textContent = `这本还没下完（${got}/${data.expected} 页），已下的部分可以先看。`;
    note.classList.remove('hidden');
    const resume = body.querySelector('#btn-resume');
    const task = activeTasks.get(data.id);
    if (task) {
      resume.textContent = task.status === 'queued' ? '排队中' : '下载中…';
      resume.disabled = true;
    } else {
      resume.onclick = () => resumeDownload(data.id, resume);
    }
    resume.classList.remove('hidden');
  }

  const authorEl = body.querySelector('.author');
  if (data.author) {
    authorEl.textContent = data.author;
    makeCopyable(authorEl, data.author);
  } else {
    authorEl.remove();
  }

  const tagBox = body.querySelector('.detail-tags');
  for (const tag of data.tags || []) {
    const btn = document.createElement('button');
    btn.className = 'tag' + (blockedTagSet.has(normTag(tag)) ? ' bad' : '');
    btn.textContent = tag;
    // 和搜索结果一致：点一下去搜这个标签
    bindTagPress(btn, tag, () => {
      switchView('download');
      $('#search-input').value = tag;
      setKind('tag');
      doSearch();
    });
    tagBox.appendChild(btn);
  }
  if (!tagBox.children.length) tagBox.remove();

  body.querySelector('.id').textContent = 'JM' + data.id;
  const total = data.chapters.reduce((n, c) => n + c.pages.length, 0);
  body.querySelector('.cnt').textContent = `${data.chapters.length} 话 · ${total} 页`;

  const book = shelfItems.find((b) => b.id === data.id);
  const group = book ? book.group : '';
  body.querySelector('.cnt').textContent +=
    group ? ` · 分组：${group}` : '';

  $('#btn-read').textContent = saved ? `继续阅读 (第 ${saved + 1} 页)` : '开始阅读';
  $('#btn-read').onclick = () => openReader(data.id, saved || 0);
  $('#btn-group').onclick = () => openGroupSheet(data.id, group);
  $('#btn-delete').onclick = () => removeAlbum(data.id, data.name);

  const starBtn = $('#btn-star');
  const paintStar = () => {
    const on = !!(book && book.starred);
    starBtn.classList.toggle('starred', on);
    starBtn.title = on ? '去掉星标' : '加星（书架上排到最前）';
    starBtn.setAttribute('aria-label', starBtn.title);
  };
  paintStar();
  starBtn.onclick = async () => {
    if (!book) return toast('只能给已下载的本子加星');
    if (await setStar(data.id, !book.starred)) paintStar();
  };

  // 笔记：离开输入框就存
  const note = $('#detail-note');
  note.value = (book && book.note) || '';
  note.onchange = () => saveNote(data.id, note.value.trim());

  const list = $('#chapter-list');
  let offset = 0;
  for (const ch of data.chapters) {
    const start = offset;
    const row = document.createElement('div');
    row.className = 'chapter';
    row.innerHTML = '<span class="nm"></span><span class="n"></span>';
    row.querySelector('.nm').textContent = ch.name;
    row.querySelector('.n').textContent = ch.pages.length + ' 页';
    row.onclick = () => openReader(data.id, start);
    list.appendChild(row);
    offset += ch.pages.length;
  }

  switchView('detail', false);
  if (push) history.pushState({ view: 'detail', album: id }, '');
  if (data.author) {
    // 需要联网而且不一定要看，做成按钮，点了才加载
    const more = document.createElement('button');
    more.className = 'ghost more-btn';
    more.textContent = `查看 ${data.author} 的其他作品`;
    more.onclick = async () => {
      more.disabled = true;
      more.textContent = '加载中…';
      const result = await loadMoreByAuthor(data);
      if (result === 'ok') {
        more.remove();
      } else {
        more.textContent = result === 'none' ? '没有找到其他作品' : '加载失败，点一下重试';
        more.disabled = result === 'none';
      }
    };
    $('#chapter-list').after(more);
    showTip('detail');
  }
}

// 详情页底部：这个作者的其他作品，横向一排。需要联网，失败就不显示
// 返回 'ok' / 'none'（没有其他作品）/ 'error'
async function loadMoreByAuthor(data) {
  let res;
  try {
    res = await api.get('/api/search?q=' + encodeURIComponent(data.author)
      + '&kind=author&page=1&show_blocked=' + pref('jm-show-blocked'));
  } catch (_) {
    return 'error';
  }
  if (res.error) return 'error';
  // 结果回来时人可能已经去看别的本子了
  if (!detailData || detailData.id !== data.id || currentView !== 'detail') return 'ok';
  const items = (res.items || []).filter((x) => x.id !== data.id).slice(0, 15);
  if (!items.length) return 'none';

  const sec = document.createElement('div');
  sec.className = 'more-author';
  sec.innerHTML = '<h3></h3><div class="strip"></div>';
  sec.querySelector('h3').textContent = `${data.author} 的其他作品`;
  const strip = sec.querySelector('.strip');
  for (const it of items) {
    const owned = shelfItems.find((b) => b.id === it.id);
    const mini = document.createElement('div');
    mini.className = 'mini';
    mini.innerHTML = '<div class="mcover"><img loading="lazy" alt=""></div><div class="mname"></div>';
    mini.querySelector('img').src = it.cover;
    mini.querySelector('.mname').textContent = it.name;
    if (owned) {
      const tag = document.createElement('span');
      tag.className = 'owned';
      tag.textContent = '已下载';
      mini.querySelector('.mcover').appendChild(tag);
    }
    // 已有的直接打开；没有的带到下载页，按 JM 号给出下载卡片
    mini.onclick = () => {
      if (owned) return openDetail(it.id);
      switchView('download');
      $('#search-input').value = 'JM' + it.id;
      doSearch();
    };
    strip.appendChild(mini);
  }
  $('#chapter-list').after(sec);
  return 'ok';
}

async function removeAlbum(id, name) {
  if (!await confirmDialog({
    title: '删除这本？',
    message: `《${name}》的本地文件会一起删掉。`,
    ok: '删除', danger: true,
  })) return;
  softDelete([id], `已删除《${name}》`);
  goBack();
}

/* --------------------------------------------------------------- 阅读器 */
const getProgress = (id) => parseInt(localStorage.getItem('jm-pos-' + id) || '0', 10);
function setProgress(id, i) {
  localStorage.setItem('jm-pos-' + id, String(i));
  localStorage.setItem('jm-read-' + id, String(Date.now()));   // 给「最近阅读」排序用
}

// 离当前页超过这么多页的图片会被卸载，长本一路翻下去内存不会一直涨
const KEEP_AROUND = 12;

let reader = {
  id: null, imgs: [], srcs: [], index: 0, starts: [], names: [], chapter: -1,
  title: '', mode: 'scroll', pageImg: null,
};
let lazyObserver = null;
let trackObserver = null;

async function openReader(id, startIndex, push = true) {
  let data = detailData && detailData.id === id
    ? detailData
    : await api.get('/api/album?id=' + encodeURIComponent(id));
  if (data.error) return toast('打开失败');
  detailData = data;

  const wrap = $('#reader-pages');
  wrap.innerHTML = '';
  wrap._ratios = [];                      // 换书了，页宽重新统计
  wrap.style.removeProperty('--page-ratio');
  reader = {
    id, imgs: [], srcs: [], index: 0, starts: [], names: [], chapter: -1,
    title: data.name, mode: pref('jm-read-mode'), pageImg: null,
  };

  if (lazyObserver) lazyObserver.disconnect();
  if (trackObserver) trackObserver.disconnect();

  // 跨过屏幕中线的那一张就是「当前页」，比逐张算坐标省很多性能
  trackObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const i = Number(entry.target.dataset.idx);
      if (i !== reader.index) {
        updateCounter(i);
        setProgress(reader.id, i);
        unloadFar(i);
      }
    }
  }, { root: $('#view-reader'), rootMargin: '-49% 0px -49% 0px', threshold: 0 });

  lazyObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
      lazyObserver.unobserve(img);
    }
  }, { rootMargin: '1500px 0px' });

  const multi = data.chapters.length > 1;
  const paged = reader.mode !== 'scroll';
  wrap.classList.toggle('paged', paged);
  data.chapters.forEach((ch) => {
    reader.starts.push(reader.srcs.length);
    reader.names.push(ch.name);
    ch.pages.forEach((src) => reader.srcs.push(src));
  });

  if (paged) {
    // 翻页模式只放一张图，换页时换 src，前后各预加载一页
    const img = document.createElement('img');
    img.alt = '';
    wrap.appendChild(img);
    reader.pageImg = img;
  } else {
    data.chapters.forEach((ch, ci) => {
      if (multi) {
        const div = document.createElement('div');
        div.className = 'divider';
        div.textContent = '— ' + ch.name + ' —';
        wrap.appendChild(div);
      }
      const end = ci + 1 < reader.starts.length ? reader.starts[ci + 1] : reader.srcs.length;
      for (let k = reader.starts[ci]; k < end; k++) {
        const img = document.createElement('img');
        img.dataset.src = reader.srcs[k];
        img.dataset.idx = String(k);
        img.alt = '';
        img.onload = () => {
          img.classList.add('loaded');
          // 记下宽高比：以后把这张卸载掉时，占位高度不变，页面不会跳
          if (!img.dataset.ratio && img.naturalWidth) {
            img.dataset.ratio = '1';
            img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
            notePageRatio(wrap, img.naturalWidth / img.naturalHeight);
          }
        };
        wrap.appendChild(img);
        reader.imgs.push(img);
        lazyObserver.observe(img);
        trackObserver.observe(img);
      }
    });
  }
  for (const sel of ['#btn-chapters', '#ch-prev', '#ch-next']) {
    $(sel).classList.toggle('hidden', !multi);
  }
  $('#btn-fit').classList.toggle('hidden', paged);   // 翻页模式总是整页适应屏幕

  resetZoom();
  document.body.classList.toggle(
    'fit-height', localStorage.getItem('jm-fit-height') === '1');

  $('#reader-title').textContent = data.name;
  const slider = $('#reader-slider');
  slider.max = String(reader.srcs.length);
  updateCounter(0);

  switchView('reader', false);
  if (push) history.pushState({ view: 'reader', album: id }, '');

  const target = startIndex == null ? getProgress(id) : startIndex;
  requestAnimationFrame(() => jumpTo(Math.min(target, reader.srcs.length - 1)));
}

function jumpTo(i) {
  if (reader.mode !== 'scroll') return showPage(i);
  const img = reader.imgs[i];
  if (!img) return;
  if (img.dataset.src) {
    img.src = img.dataset.src;
    delete img.dataset.src;
  }
  img.scrollIntoView({ block: 'start' });
  updateCounter(i);
  // 跳页后滚动监听会认为"页码没变"而不触发卸载，这里补一次
  unloadFar(i);
}

function updateCounter(i) {
  reader.index = i;
  $('#reader-counter').textContent = `${i + 1} / ${reader.srcs.length}`;
  const slider = $('#reader-slider');
  if (document.activeElement !== slider) slider.value = String(i + 1);

  // 多话的本子：标题显示当前是第几话，并更新上一话 / 下一话按钮
  if (reader.starts.length > 1) {
    let ci = 0;
    while (ci + 1 < reader.starts.length && reader.starts[ci + 1] <= i) ci++;
    if (ci !== reader.chapter) {
      reader.chapter = ci;
      $('#reader-title').textContent = `${reader.names[ci]} · ${reader.title}`;
      $('#ch-prev').disabled = ci === 0;
      $('#ch-next').disabled = ci === reader.starts.length - 1;
    }
  }
}

function unloadFar(center) {
  // 缩小时一屏能看到很多页，保留范围跟着放大，否则屏幕上的图会被卸掉又加载，来回闪
  const keep = Math.ceil(KEEP_AROUND / Math.min(zoom, 1));
  for (let k = 0; k < reader.imgs.length; k++) {
    if (Math.abs(k - center) <= keep) continue;
    const img = reader.imgs[k];
    // 没加载过的、或者还没拿到宽高比的不动（卸了会塌成 0 高度）
    if (!img.getAttribute('src') || !img.dataset.ratio) continue;
    img.dataset.src = img.getAttribute('src');
    img.removeAttribute('src');
    lazyObserver.observe(img);   // 滚回来时照常懒加载
  }
}

function openChapterSheet() {
  $('#sheet-title').textContent = '目录';
  const list = $('#sheet-body');
  list.innerHTML = '';
  reader.names.forEach((name, ci) => {
    const end = ci + 1 < reader.starts.length ? reader.starts[ci + 1] : reader.imgs.length;
    const row = document.createElement('button');
    row.className = 'sheet-item' + (ci === reader.chapter ? ' current' : '');
    row.innerHTML = '<span class="name"></span><span class="count"></span>';
    row.querySelector('.name').textContent = name;
    row.querySelector('.count').textContent = (end - reader.starts[ci]) + ' 页';
    row.onclick = () => { closeSheet(); jumpTo(reader.starts[ci]); };
    list.appendChild(row);
  });
  $('#sheet').classList.remove('hidden');
}

function jumpChapter(delta) {
  const ci = reader.chapter + delta;
  if (ci >= 0 && ci < reader.starts.length) jumpTo(reader.starts[ci]);
}

$('#btn-chapters').onclick = openChapterSheet;
$('#ch-prev').onclick = () => jumpChapter(-1);
$('#ch-next').onclick = () => jumpChapter(1);

/* ------------------------------------------------------------ 页面总览 */
// 所有页面的小图铺成网格，点哪页跳哪页，比拖进度条准
function openOverview() {
  const grid = $('#ov-grid');
  grid.innerHTML = '';
  const multi = reader.starts.length > 1;
  reader.srcs.forEach((src, k) => {
    const ci = multi ? reader.starts.indexOf(k) : -1;
    if (ci >= 0) {
      const head = document.createElement('div');
      head.className = 'ov-ch';
      head.textContent = reader.names[ci];
      grid.appendChild(head);
    }
    const item = document.createElement('div');
    item.className = 'ov-item' + (k === reader.index ? ' current' : '');
    item.innerHTML = '<img loading="lazy" alt=""><span></span>';
    item.querySelector('img').src = src.replace('/img/', '/pthumb/');   // 服务端生成的小图
    item.querySelector('span').textContent = k + 1;
    item.onclick = () => {
      history.back();   // 关掉总览（和按返回键同一条路）
      setTimeout(() => jumpTo(k), 0);
    };
    grid.appendChild(item);
  });
  $('#ov-title').textContent = `页面总览 · ${reader.srcs.length} 页`;
  $('#overview').classList.remove('hidden');
  clearTimeout(hideTimer);
  history.pushState({ view: 'reader', album: reader.id, overview: 1 }, '');
  requestAnimationFrame(() => {
    const cur = grid.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  });
}

function closeOverview() {
  $('#overview').classList.add('hidden');
  scheduleHide();
}

$('#btn-pages').onclick = openOverview;
$('#ov-close').onclick = () => history.back();

/* ------------------------------------------------------------ 翻页模式 */
// 横屏双页：翻页模式 + 横屏 + 设置里开着
function spreadOn() {
  return reader.mode !== 'scroll' && pref('jm-spread') === '1'
    && window.innerWidth > window.innerHeight;
}

// 第一页一般是封面，单独显示；之后两页一组：[1,2] [3,4] …，和实体书的对开一致
function spreadPages(i) {
  if (i <= 0) return [0];
  const start = i % 2 === 1 ? i : i - 1;
  return reader.srcs[start + 1] ? [start, start + 1] : [start];
}

function showPage(i) {
  i = Math.max(0, Math.min(reader.srcs.length - 1, i));
  resetZoom();
  const idxs = spreadOn() ? spreadPages(i) : [i];
  const wrap = $('#reader-pages');
  wrap.classList.toggle('spread', idxs.length > 1);
  wrap.innerHTML = '';
  // 日漫从右往左读：前一页放在右边
  for (const k of reader.mode === 'rtl' ? [...idxs].reverse() : idxs) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = reader.srcs[k];
    wrap.appendChild(img);
  }
  $('#view-reader').scrollTop = 0;
  const first = idxs[0];
  const last = idxs[idxs.length - 1];
  updateCounter(first);
  if (idxs.length > 1) {
    $('#reader-counter').textContent = `${first + 1}-${last + 1} / ${reader.srcs.length}`;
  }
  setProgress(reader.id, last);   // 进度记到看到的最后一页
  // 预加载前后两页，翻页时基本不用等
  for (const k of [last + 1, last + 2, first - 1, first - 2]) {
    if (reader.srcs[k]) new Image().src = reader.srcs[k];
  }
}

// delta：1 是下一页（双页时是下一组），-1 是上一页。竖向滚动模式下就翻一屏
function turnPage(delta) {
  if (reader.mode === 'scroll') {
    const v = $('#view-reader');
    v.scrollBy({ top: delta * v.clientHeight * 0.85, behavior: 'smooth' });
    return;
  }
  const idxs = spreadOn() ? spreadPages(reader.index) : [reader.index];
  const target = delta > 0 ? idxs[idxs.length - 1] + 1 : idxs[0] - 1;
  if (target < 0) return toast('已经是第一页');
  if (target >= reader.srcs.length) return toast('已经是最后一页');
  showPage(target);
}

// 点在屏幕哪一侧：左右翻页时右边是下一页，日漫模式反过来；中间返回 0
function sideToDelta(x) {
  const w = $('#view-reader').clientWidth;
  const side = x < w * 0.3 ? -1 : (x > w * 0.7 ? 1 : 0);
  return reader.mode === 'rtl' ? -side : side;
}

const MODE_NAMES = { scroll: '竖向滚动', ltr: '左右翻页', rtl: '日漫（从右往左）' };
function setReadMode(mode) {
  if (mode === reader.mode) return;
  localStorage.setItem('jm-read-mode', mode);
  openReader(reader.id, reader.index, false);
  toast(MODE_NAMES[mode]);
}

const modeMenu = $('#mode-menu');
const closeModeMenu = () => modeMenu.classList.add('hidden');
const modeMenuOpen = () => !modeMenu.classList.contains('hidden');

$('#btn-mode').onclick = (e) => {
  e.stopPropagation();          // 别让下面"点别处就关"的监听马上把它关掉
  if (modeMenuOpen()) return closeModeMenu();
  modeMenu.innerHTML = '';
  for (const mode of ['scroll', 'ltr', 'rtl']) {
    const item = document.createElement('button');
    item.className = 'popitem' + (mode === reader.mode ? ' current' : '');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(mode === reader.mode));
    item.innerHTML = '<span></span>' + (mode === reader.mode ? svg('check', 16) : '');
    item.querySelector('span').textContent = MODE_NAMES[mode];
    item.onclick = () => { closeModeMenu(); setReadMode(mode); };
    modeMenu.appendChild(item);
  }
  // 贴着按钮下方、右对齐弹出
  const r = $('#btn-mode').getBoundingClientRect();
  modeMenu.style.top = `${r.bottom + 6}px`;
  modeMenu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  modeMenu.classList.remove('hidden');
  clearTimeout(hideTimer);      // 菜单开着时工具栏别自动收起
};

// 点菜单以外的地方就关掉
document.addEventListener('click', (e) => {
  if (modeMenuOpen() && !modeMenu.contains(e.target)) closeModeMenu();
});

// 音量键：安卓端拦下按键后调这里
window.onVolumeKey = (dir) => { if (currentView === 'reader') turnPage(dir); };

// 电脑上的键盘翻页
document.addEventListener('keydown', (e) => {
  if (currentView !== 'reader') return;
  const map = { ArrowRight: 1, ArrowLeft: -1, PageDown: 1, PageUp: -1, ' ': 1 };
  let d = map[e.key];
  if (d == null) return;
  const horizontal = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
  if (horizontal && reader.mode === 'scroll') return;
  if (horizontal && reader.mode === 'rtl') d = -d;
  e.preventDefault();
  turnPage(d);
});

/* ------------------------------------------------ 工具栏自动隐藏 / 亮度 */
let hideTimer = null;

function scheduleHide() {
  clearTimeout(hideTimer);
  if (pref('jm-autohide') !== '1' || currentView !== 'reader') return;
  hideTimer = setTimeout(() => {
    // 亮度面板开着时别收，人正在调
    if (currentView === 'reader' && $('#light-panel').classList.contains('hidden')
        && !modeMenuOpen()) {
      document.body.classList.add('immersive');
    }
  }, 3000);
}

function toggleBars() {
  const hidden = document.body.classList.toggle('immersive');
  if (!hidden) scheduleHide();
}

// 手在工具栏上操作时不要自动收起
for (const bar of ['#reader-top', '#reader-bottom', '#light-panel']) {
  $(bar).addEventListener('pointerdown', () => clearTimeout(hideTimer));
  $(bar).addEventListener('pointerup', scheduleHide);
}

function applyBrightness() {
  const v = localStorage.getItem('jm-brightness');   // 没存过 = 跟随系统
  const level = v == null ? null : Number(v) / 100;
  if (hasNative('setBrightness')) {
    native('setBrightness', level == null ? -1 : level);   // App 里直接调屏幕亮度
  } else {
    // 网页版调不了屏幕亮度，用黑色遮罩把画面压暗
    $('#dimmer').style.opacity = level == null ? '0' : String((1 - level) * 0.85);
  }
  $('#light-system').disabled = v == null;
  if (v != null) $('#light-slider').value = v;
}

$('#btn-light').onclick = () => {
  $('#light-panel').classList.toggle('hidden');
  scheduleHide();
};
$('#light-slider').addEventListener('input', (e) => {
  localStorage.setItem('jm-brightness', e.target.value);
  applyBrightness();
});
$('#light-system').onclick = () => {
  localStorage.removeItem('jm-brightness');
  applyBrightness();
};

function enterReaderChrome() {
  native('setSystemBars', false);            // 阅读器是黑底，状态栏用浅色图标
  native('setVolumeKeys', pref('jm-volume-keys') === '1');
  applyBrightness();
  scheduleHide();
  showTip(reader.mode === 'scroll' ? 'reader-scroll' : 'reader-' + reader.mode);
}

function leaveReader() {
  clearTimeout(hideTimer);
  native('setVolumeKeys', false);            // 离开阅读器，音量键还给系统
  native('setBrightness', -1);               // 亮度也还给系统
  $('#dimmer').style.opacity = '0';
  $('#light-panel').classList.add('hidden');
  $('#overview').classList.add('hidden');
  closeModeMenu();
  applyTheme();
}

$('#view-reader').addEventListener('scroll', () => {
  if (currentView !== 'reader' || reader.mode !== 'scroll' || !reader.srcs.length) return;
  const v = $('#view-reader');
  if (v.scrollTop + v.clientHeight < v.scrollHeight - 4) return;
  const last = reader.srcs.length - 1;
  if (reader.index !== last) {
    updateCounter(last);
    setProgress(reader.id, last);
  }
}, { passive: true });

$('#reader-slider').addEventListener('input', (e) => {
  jumpTo(parseInt(e.target.value, 10) - 1);
});

/* ---------------------------------------------------- 缩放 / 横屏 */
const ZOOM_MIN = 0.1;   // 缩到 10% 可以一屏看很多页，快速找位置
const ZOOM_MAX = 5;
let zoom = 1;

let hintTimer;
function showZoomHint(text) {
  const el = $('#zoom-hint');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), 700);
}

// focal 是相对阅读区左上角的坐标，缩放时让这个点待在原地
function applyZoom(next, focal) {
  next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  if (Math.abs(next - zoom) < 0.002) return;

  const view = $('#view-reader');
  const wrap = $('#reader-pages');
  const cx = focal ? focal.x : view.clientWidth / 2;
  const cy = focal ? focal.y : view.clientHeight / 2;
  // 缩小到比屏幕窄时页面是居中的，左边有一段空白，换算坐标时要扣掉
  const contentX = (view.scrollLeft + cx - wrap.offsetLeft) / zoom;
  const contentY = (view.scrollTop + cy) / zoom;

  zoom = next;
  wrap.style.setProperty('--zoom', String(zoom));
  view.scrollLeft = contentX * zoom + wrap.offsetLeft - cx;   // 读 offsetLeft 会拿到新布局
  view.scrollTop = contentY * zoom - cy;
  showZoomHint(Math.round(zoom * 100) + '%');
}

function resetZoom() {
  zoom = 1;
  $('#reader-pages').style.setProperty('--zoom', '1');
  $('#view-reader').scrollLeft = 0;
}

// 适应高度模式下统一的页宽：取这本书正常页面宽高比的中位数，横条、超长条不算
function notePageRatio(wrap, r) {
  if (r < 0.45 || r > 1.6) return;
  const list = (wrap._ratios = wrap._ratios || []);
  if (list.length >= 12) return;   // 前十几页就够了，之后不再变，免得页面跳
  list.push(r);
  const sorted = [...list].sort((a, b) => a - b);
  wrap.style.setProperty('--page-ratio', sorted[Math.floor(sorted.length / 2)].toFixed(4));
}

function setFitHeight(on, remember = true) {
  document.body.classList.toggle('fit-height', on);
  if (remember) localStorage.setItem('jm-fit-height', on ? '1' : '0');
  resetZoom();
  requestAnimationFrame(() => jumpTo(reader.index));
  showZoomHint(on ? '适应高度' : '适应宽度');
}

$('#btn-fit').onclick = () =>
  setFitHeight(!document.body.classList.contains('fit-height'));

async function toggleLandscape() {
  // APK 里有原生方法，网页里退回 Screen Orientation API
  if (window.AndroidApp && window.AndroidApp.toggleOrientation) {
    const now = window.AndroidApp.toggleOrientation();
    if (now === 'landscape' && !document.body.classList.contains('fit-height')) {
      setFitHeight(true, false);
    }
    return;
  }
  const isLandscape = screen.orientation && /landscape/.test(screen.orientation.type);
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
    await screen.orientation.lock(isLandscape ? 'portrait' : 'landscape');
    if (!isLandscape && !document.body.classList.contains('fit-height')) {
      setFitHeight(true, false);
    }
  } catch (e) {
    toast('该浏览器不支持锁定方向，请用系统的自动旋转');
  }
}
$('#btn-rotate').onclick = toggleLandscape;

// 屏幕转向后图片尺寸变了，重新定位到当前页
window.addEventListener('resize', () => {
  if (currentView !== 'reader') return;
  clearTimeout(window.__resizeTimer);
  window.__resizeTimer = setTimeout(() => jumpTo(reader.index), 200);
});

/* ------ 手势：双指缩放、双击放大、单击隐藏界面 ------ */
const pages = $('#reader-pages');
const touchDist = (t) => Math.hypot(
  t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

let pinch = null;
let tapStart = null;
let lastTapAt = 0;
let tapTimer = null;

pages.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    clearTimeout(tapTimer);
    tapStart = null;
    pinch = { dist: touchDist(e.touches), zoom0: zoom };
  } else if (e.touches.length === 1 && !pinch) {
    tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }
}, { passive: true });

pages.addEventListener('touchmove', (e) => {
  if (!pinch || e.touches.length !== 2) return;
  const rect = $('#view-reader').getBoundingClientRect();
  applyZoom(pinch.zoom0 * touchDist(e.touches) / pinch.dist, {
    x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
    y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
  });
}, { passive: true });

pages.addEventListener('touchend', (e) => {
  if (modeMenuOpen() && !pinch) {
    closeModeMenu();
    tapStart = null;
    return;
  }
  if (e.touches.length === 0 && pinch) {
    pinch = null;
    lastTapAt = 0;          // 捏完手指抬起，不要误判成点击
    tapStart = null;
    return;
  }
  if (!tapStart || e.touches.length) return;

  const t = e.changedTouches[0];
  const dx = t.clientX - tapStart.x;
  const dy = t.clientY - tapStart.y;
  const dt = Date.now() - tapStart.t;
  tapStart = null;
  const flat = Math.abs(zoom - 1) < 0.05;   // 放大后手指是在拖动画面，不翻页

  // 翻页模式：横向快速一划就翻页（左右翻页往左划是下一页，日漫反过来）
  if (reader.mode !== 'scroll' && flat && dt < 500
      && Math.abs(dx) > 50 && Math.abs(dy) < Math.abs(dx) * 0.6) {
    lastTapAt = 0;
    turnPage((dx < 0 ? 1 : -1) * (reader.mode === 'rtl' ? -1 : 1));
    return;
  }
  if (Math.hypot(dx, dy) > 12 || dt >= 300) return;

  // 翻页模式：点屏幕两侧直接翻页，不等双击判定，手感更跟手
  if (reader.mode !== 'scroll' && flat) {
    const d = sideToDelta(t.clientX);
    if (d) { lastTapAt = 0; turnPage(d); return; }
  }

  const now = Date.now();
  if (now - lastTapAt < 300) {          // 双击：不在 100% 就回到 100%，在 100% 就放大
    clearTimeout(tapTimer);
    lastTapAt = 0;
    const rect = $('#view-reader').getBoundingClientRect();
    applyZoom(Math.abs(zoom - 1) > 0.05 ? 1 : 2.5,
      { x: t.clientX - rect.left, y: t.clientY - rect.top });
  } else {                               // 单击：等一下，确认不是双击再切界面
    lastTapAt = now;
    tapTimer = setTimeout(toggleBars, 300);
  }
}, { passive: true });

// 电脑上用鼠标滚轮 + Ctrl 缩放，方便调试
pages.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const rect = $('#view-reader').getBoundingClientRect();
  applyZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12),
    { x: e.clientX - rect.left, y: e.clientY - rect.top });
}, { passive: false });
pages.addEventListener('click', (e) => {
  if (e.pointerType === 'touch' || !e.detail) return;
  // 电脑上用鼠标：翻页模式点两侧翻页，中间切换工具栏
  if (reader.mode !== 'scroll' && Math.abs(zoom - 1) < 0.05) {
    const d = sideToDelta(e.clientX);
    if (d) return turnPage(d);
  }
  toggleBars();
});

/* ----------------------------------------------------------------- 下载 */
let pollTimer = null;
const finished = new Set();

async function pollTasks() {
  const { tasks } = await api.get('/api/tasks');
  const list = $('#task-list');
  list.innerHTML = '';

  let running = false;
  for (const t of tasks) {
    if (t.status === 'running' || t.status === 'queued') running = true;
    if (t.status === 'done' && !finished.has(t.id)) {
      finished.add(t.id);
      if (!(window.petActive && petActive())) toast(`《${t.name}》下载完成`);   // 她在的话由 petTasks 报
      loadShelf();
    }
    const pct = t.total ? Math.min(100, Math.round((t.done / t.total) * 100)) : 0;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="col">
        <div class="name"></div>
        <div class="sub"></div>
        ${t.status === 'running' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
      </div>`;
    row.querySelector('.name').textContent = t.name;
    const sub = row.querySelector('.sub');
    if (t.status === 'queued') {
      sub.textContent = '排队中，等前面的下完';
      const cancel = iconButton('close', '取消排队', 'retry ghostly icon');
      cancel.onclick = async () => {
        cancel.disabled = true;
        const res = await api.post('/api/download/cancel', { id: t.id });
        if (res.error) { toast(res.error); cancel.disabled = false; return; }
        toast('已取消');
        pollTasks();
      };
      row.appendChild(cancel);
    } else if (t.status === 'running') {
      if (t.total) {
        const parts = [`${t.done} / ${t.total} 页`, `${pct}%`];
        if (t.speed > 0) parts.push(formatSize(t.speed) + '/s');
        if (t.eta != null) parts.push('约 ' + formatDuration(t.eta));
        sub.textContent = parts.join(' · ');
      } else {
        sub.textContent = t.message;
      }
    } else if (t.status === 'done') {
      sub.textContent = t.message;
    } else {
      sub.textContent = '失败：' + t.message;
      sub.classList.add('error');

      const retry = iconButton('retry', '重新下载', 'retry icon');
      retry.onclick = () => retryTask(t, retry);
      row.appendChild(retry);
    }
    list.appendChild(row);
  }

  $('#task-empty').classList.toggle('hidden', tasks.length > 0);
  if (window.petTasks) petTasks(tasks);   // 看板娘跟着下载状态做反应
  $('#task-dot').classList.toggle('on', running);

  // 书架上没下完的本子要显示「下载中 / 排队中」，任务集合变了才重画，不每秒重画
  const next = new Map(tasks
    .filter((t) => t.status === 'running' || t.status === 'queued')
    .map((t) => [t.id, t]));
  const key = (m) => [...m].map(([id, t]) => id + t.status).sort().join();
  if (key(next) !== key(activeTasks)) {
    activeTasks = next;
    renderShelf();
  }

  if (running) startNativeService();
  else nativeServiceOn = false;

  clearTimeout(pollTimer);
  if (running) pollTimer = setTimeout(pollTasks, 1000);
}

// 安卓端：有下载时拉起前台服务，App 退到后台或锁屏也能继续下
let nativeServiceOn = false;
function startNativeService() {
  if (nativeServiceOn) return;
  nativeServiceOn = true;
  if (window.AndroidApp && window.AndroidApp.startDownloadService) {
    try { window.AndroidApp.startDownloadService(); } catch (_) { /* 网页版没有这个接口 */ }
  }
}

async function retryTask(task, btn) {
  btn.disabled = true;
  // 服务端会先删掉下了一半的文件，再从头下一遍
  const res = await api.post('/api/download/retry', { id: task.id });
  if (res.error) {
    toast(res.error);
    btn.disabled = false;
    return;
  }
  finished.delete(task.id);
  toast('已重新开始下载');
  pollTasks();
}

/* ----------------------------------------------------------------- 搜索 */
let searchKind = 'site';
let searchPage = 1;
let searchQuery = '';
let searchForce = false;   // 上次是不是「纯数字也按关键字搜」

function renderTags(box, tags) {
  box.innerHTML = '';
  // 拉黑、收藏命中的标签排前面，否则可能正好被截掉看不到
  const rank = (t) => blockedTagSet.has(normTag(t)) * 2 + favTagSet.has(normTag(t));
  const sorted = [...tags].sort((a, b) => rank(b) - rank(a));
  for (const tag of sorted.slice(0, 6)) {
    const btn = document.createElement('button');
    btn.className = 'tag';
    btn.textContent = tag;
    // 点一下按这个标签再搜，和禁漫站内一样
    bindTagPress(btn, tag, () => {
      $('#search-input').value = tag;
      setKind('tag');
      doSearch();
    });
    box.appendChild(btn);
  }
  const card = box.closest('.card');
  if (card) {
    card.dataset.tags = JSON.stringify(tags);   // 记下全部标签，拉黑状态变化时重新比对
    markTagBlocked(card);
  }
}

const infoObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const box = entry.target;
    infoObserver.unobserve(box);
    const id = box.dataset.id;
    if (!id) continue;
    api.get('/api/info?id=' + encodeURIComponent(id))
      .then((info) => {
        if (info && info.tags && info.tags.length) renderTags(box, info.tags);
      })
      .catch(() => {});   // 取不到标签不影响卡片其余部分
  }
}, { rootMargin: '300px 0px' });

function makeCard(item) {
  const blocked = blockedIds.has(item.id);
  const card = document.createElement('div');
  card.className = 'card' + (blocked ? ' blocked' : '');
  card.dataset.id = item.id;
  card.innerHTML = `
    <div class="cover">
      <img loading="lazy" alt="">
      <span class="cat"></span>
    </div>
    <div class="info">
      <div class="name"></div>
      <div class="author"></div>
      <div class="tags"></div>
      <button class="dl">下载</button>
      <div class="acts">
        <button class="${blocked ? 'unblock' : 'block'}">${blocked ? '解除拉黑' : '拉黑'}</button>
        <button class="favbtn">收藏</button>
      </div>
    </div>`;
  // 已拉黑的一点就解除；没拉黑的弹窗挑要拉黑什么（这一本 / 作者 / 标签）
  card.querySelector('.block, .unblock').onclick = () =>
    (blockedIds.has(item.id) ? toggleBlock(item) : openPickSheet('black', item));
  card.querySelector('.favbtn').onclick = () => openPickSheet('fav', item);

  const img = card.querySelector('img');
  img.src = item.cover;
  img.onerror = () => { img.style.display = 'none'; };

  const cat = card.querySelector('.cat');
  if (item.category) cat.textContent = item.category; else cat.remove();

  card.querySelector('.name').textContent = item.name || ('JM' + item.id);

  const author = card.querySelector('.author');
  if (item.author) {
    author.textContent = item.author;
    makeCopyable(author, item.author);
  } else {
    author.remove();
  }

  // 标签：服务端为了过滤已经查过的直接用；没有的等卡片滚到跟前再取
  const tagBox = card.querySelector('.tags');
  tagBox.dataset.id = item.id;
  if (item.tags && item.tags.length) {
    // 卡片虽然还没挂到页面上，但 renderTags 找外层卡片用的是 closest，照样能找到
    renderTags(tagBox, item.tags);
  } else {
    infoObserver.observe(tagBox);
  }

  const dl = card.querySelector('.dl');
  dl.onclick = async () => {
    dl.disabled = true;
    dl.textContent = '已加入';
    const res = await api.post('/api/download', { id: item.id });
    if (res.error) {
      toast(res.error);
      dl.disabled = false;
      dl.textContent = '下载';
      return;
    }
    toast('已加入下载');
    pollTasks();
  };

  // 已经下过的标出来，免得重复下载；没下完的给继续下载
  const owned = shelfItems.find((b) => b.id === item.id);
  if (owned) {
    const badge = document.createElement('span');
    badge.className = 'owned' + (owned.complete ? '' : ' partial');
    badge.textContent = owned.complete ? '已在书架' : '未下完';
    card.querySelector('.cover').appendChild(badge);
    if (owned.complete) {
      dl.disabled = true;
      dl.textContent = '已下载';
    } else {
      dl.textContent = '继续下载';
    }
  }

  return card;
}

// 多个关键字的搜索模式：书架和下载页共用一个设置
function applySearchMode() {
  const mode = pref('jm-search-mode');
  $$('#search-mode .chip').forEach((c) => c.classList.toggle('active', c.dataset.mode === mode));
  const btn = $('#shelf-mode');
  btn.textContent = mode === 'or' ? '或' : '与';
  btn.title = mode === 'or' ? '多个词：包含其一（点一下切换）' : '多个词：同时包含（点一下切换）';
  btn.setAttribute('aria-label', btn.title);
  if (typeof shelfItems !== 'undefined' && shelfQuery.trim().includes(' ')) renderShelf();
}
$$('#search-mode .chip').forEach((c) => {
  c.onclick = () => {
    if (pref('jm-search-mode') === c.dataset.mode) return;
    setPref('jm-search-mode', c.dataset.mode);
    // 已经搜了多个词的话，换了模式马上重搜
    const q = $('#search-input').value.trim();
    if (q.includes(' ') && !ID_INPUT.test(q)) doSearch(1);
  };
});
$('#shelf-mode').onclick = () => {
  setPref('jm-search-mode', pref('jm-search-mode') === 'or' ? 'and' : 'or');
  toast(pref('jm-search-mode') === 'or' ? '多个词：包含其一' : '多个词：同时包含');
};
applySearchMode();

function setKind(kind) {
  searchKind = kind;
  $$('#search-kinds .chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.kind === kind));
}

// 纯数字（可以带 JM 前缀，多个用空格或逗号隔开）就当 JM 号处理
const ID_INPUT = /^\s*(jm)?\s*\d+(\s*[\s,，]\s*(jm)?\s*\d+)*\s*$/i;

function renderSearchSkeleton(n = 6) {
  const box = $('#search-results');
  box.innerHTML = '';
  for (let k = 0; k < n; k++) {
    const c = document.createElement('div');
    c.className = 'card ghostcard';
    c.innerHTML = '<div class="cover skeleton"></div><div class="info">'
      + '<div class="line skeleton"></div><div class="line skeleton"></div>'
      + '<div class="line skeleton short"></div></div>';
    box.appendChild(c);
  }
}

// forceKeyword：纯数字也按关键字搜（比如想搜年份）
async function doSearch(page = 1, forceKeyword = false) {
  const q = $('#search-input').value.trim();
  const box = $('#search-results');
  const hint = $('#search-hint');
  const pager = $('#pager');
  const oldBar = $('#direct-bar');
  if (oldBar) oldBar.remove();

  if (!q) {
    box.innerHTML = '';
    hint.textContent = '';
    pager.classList.add('hidden');
    renderHistory();
    return;
  }
  $('#search-history').classList.add('hidden');
  if (!forceKeyword && ID_INPUT.test(q)) return showDirect(q);
  if (page === 1) rememberSearch(q, searchKind);

  searchQuery = q;
  searchPage = page;
  pager.classList.add('hidden');
  if (page === 1) $('#search-input').blur();
  hint.textContent = '';
  renderSearchSkeleton();
  $('#view-download').scrollTop = 0;

  // 拉黑、收藏可能在别处改过，取一次保证按钮和标记显示正确
  await Promise.all([loadBlacklist(), loadFavorites()]);

  searchForce = forceKeyword;
  const res = await api.get('/api/search?q=' + encodeURIComponent(searchQuery)
    + '&kind=' + searchKind + '&page=' + searchPage + '&mode=' + pref('jm-search-mode')
    + '&fav=' + pref('jm-fav-sort')
    + '&show_blocked=' + pref('jm-show-blocked'));
  box.innerHTML = '';

  if (res.error) {
    hint.textContent = '搜索失败：' + res.error;
    return;
  }
  if (!res.items.length) {
    hint.textContent = page > 1 ? '这一页没有内容了' : '没有找到结果';
    if (page > 1) showPager(res);
    return;
  }

  for (const item of res.items) box.appendChild(makeCard(item));
  let text = `共 ${res.total} 个结果 · 第 ${searchPage} / ${res.pages} 页`;
  if (res.hidden) text += ` · 本页隐藏了 ${res.hidden} 本已拉黑的`;
  hint.textContent = text;
  showPager(res);
  showTip('tagblock');
}

// 输入的是 JM 号：直接查出这几本，给出下载卡片
async function showDirect(q) {
  const ids = [...new Set(q.match(/\d+/g))].slice(0, 30);
  const box = $('#search-results');
  $('#pager').classList.add('hidden');
  $('#search-hint').textContent = '';
  $('#search-input').blur();
  renderSearchSkeleton(Math.min(ids.length, 6));
  await loadBlacklist();

  const infos = await Promise.all(ids.map((id) =>
    api.get('/api/info?id=' + id).catch(() => ({ id, error: '网络错误' }))));
  box.innerHTML = '';
  const ok = infos.filter((x) => !x.error);
  const bad = infos.filter((x) => x.error).map((x) => 'JM' + x.id);

  const bar = document.createElement('div');
  bar.id = 'direct-bar';
  bar.className = 'direct-bar';
  bar.innerHTML = '<p class="hint"></p>';
  bar.querySelector('.hint').textContent = bad.length
    ? `按 JM 号查找：找到 ${ok.length} 本；${bad.join('、')} 不存在或查询失败`
    : `按 JM 号查找：找到 ${ok.length} 本`;

  const todo = ok.filter((x) => !shelfItems.some((b) => b.id === x.id && b.complete));
  if (todo.length > 1) {
    const all = document.createElement('button');
    all.className = 'primary';
    all.textContent = `全部下载（${todo.length}）`;
    all.onclick = async () => {
      all.disabled = true;
      for (const x of todo) await api.post('/api/download', { id: x.id });
      toast(`已加入 ${todo.length} 本`);
      pollTasks();
    };
    bar.appendChild(all);
  }
  // 纯数字也可能是想搜关键字（比如年份），留一个口子
  if (ids.length === 1) {
    const kw = document.createElement('button');
    kw.className = 'linkbtn';
    kw.textContent = `改为搜关键字「${q}」`;
    kw.onclick = () => doSearch(1, true);
    bar.appendChild(kw);
  }
  box.before(bar);

  for (const x of ok) {
    box.appendChild(makeCard({
      id: x.id, name: x.name, author: x.author, category: '',
      tags: x.tags || [], cover: '/cover/' + x.id,
    }));
  }
}

/* ---- 搜索历史 / 常用标签 ---- */
const KIND_LABELS = { site: '', work: '标题', author: '作者', tag: '标签' };

function rememberSearch(q, kind) {
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('jm-search-history') || '[]'); } catch (_) {}
  hist = [{ q, kind }, ...hist.filter((h) => !(h.q === q && h.kind === kind))].slice(0, 12);
  localStorage.setItem('jm-search-history', JSON.stringify(hist));
  // 按标签搜的次数记下来，常用的标签单独列一排
  if (kind === 'tag') {
    let counts = {};
    try { counts = JSON.parse(localStorage.getItem('jm-tag-counts') || '{}'); } catch (_) {}
    counts[q] = (counts[q] || 0) + 1;
    localStorage.setItem('jm-tag-counts', JSON.stringify(counts));
  }
}

function renderHistory() {
  const box = $('#search-history');
  let hist = [];
  let counts = {};
  try { hist = JSON.parse(localStorage.getItem('jm-search-history') || '[]'); } catch (_) {}
  try { counts = JSON.parse(localStorage.getItem('jm-tag-counts') || '{}'); } catch (_) {}
  const tags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]);
  box.innerHTML = '';
  box.classList.toggle('hidden', !hist.length && !tags.length);

  const section = (title, entries, onClear) => {
    if (!entries.length) return;
    const head = document.createElement('div');
    head.className = 'hhead';
    head.innerHTML = '<span></span>';
    head.querySelector('span').textContent = title;
    if (onClear) {
      const clear = document.createElement('button');
      clear.className = 'linkbtn';
      clear.textContent = '清空';
      clear.onclick = onClear;
      head.appendChild(clear);
    }
    const chips = document.createElement('div');
    chips.className = 'hchips';
    for (const { q, kind } of entries) {
      const chip = document.createElement('button');
      chip.className = 'hchip';
      chip.textContent = q;
      if (KIND_LABELS[kind]) {
        const small = document.createElement('small');
        small.textContent = KIND_LABELS[kind];
        chip.appendChild(small);
      }
      chip.onclick = () => {
        $('#search-input').value = q;
        setKind(kind);
        doSearch();
      };
      chips.appendChild(chip);
    }
    box.append(head, chips);
  };

  section('最近搜索', hist, () => {
    localStorage.removeItem('jm-search-history');
    renderHistory();
  });
  section('常用标签', tags.map((t) => ({ q: t, kind: 'tag' })), null);
}

// 要显示哪些页码：首页、尾页、当前页前后各两页，中间断开的用 … 表示。
// 例：共 40 页、当前第 2 页 → 1 2 3 4 … 40
function pageList(cur, total) {
  const keep = new Set([1, total]);
  for (let p = cur - 2; p <= cur + 2; p++) if (p >= 1 && p <= total) keep.add(p);
  const pages = [...keep].sort((a, b) => a - b);
  const out = [];
  pages.forEach((p, i) => {
    if (i && p - pages[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

function showPager(res) {
  const pager = $('#pager');
  const total = res.pages || 1;
  pager.innerHTML = '';
  pager.classList.toggle('hidden', total <= 1);
  if (total <= 1) return;

  // 翻页只出现在关键字搜索里，所以固定按关键字搜
  const addBtn = (html, page, cls = '', label = '') => {
    const b = document.createElement('button');
    b.className = 'pgbtn ' + cls;
    b.innerHTML = html;
    if (label) { b.title = label; b.setAttribute('aria-label', label); }
    if (page) b.onclick = () => doSearch(page, true); else b.disabled = true;
    pager.appendChild(b);
  };
  addBtn(svg('back', 18), searchPage > 1 ? searchPage - 1 : null, 'arrow', '上一页');
  for (const p of pageList(searchPage, total)) {
    if (p === '…') {
      const dots = document.createElement('span');
      dots.className = 'pgdots';
      dots.textContent = '…';
      pager.appendChild(dots);
    } else if (p === searchPage) {
      addBtn(String(p), null, 'current', `第 ${p} 页（当前）`);
    } else {
      addBtn(String(p), p, '', `第 ${p} 页`);
    }
  }
  addBtn(svg('next', 18), searchPage < total ? searchPage + 1 : null, 'arrow', '下一页');
}

/* ----------------------------------------------------------------- 绑定 */
$('#btn-search').onclick = () => doSearch();
$('#search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
$$('#search-kinds .chip').forEach((c) => {
  c.onclick = () => { setKind(c.dataset.kind); if (searchQuery) doSearch(); };
});
$('#show-blocked').checked = pref('jm-show-blocked') === '1';
$('#show-blocked').addEventListener('change', (e) => {
  setPref('jm-show-blocked', e.target.checked ? '1' : '0');
  // 正在看搜索结果的话，按新设置重新搜一次当前页
  if ($('#search-input').value.trim() && $('#search-results').children.length) {
    doSearch(searchPage || 1, searchForce);
  }
});

$('#sheet-close').onclick = closeSheet;
$('#sheet').addEventListener('click', (e) => {
  if (e.target === $('#sheet')) closeSheet();   // 点空白处关掉
});
$('#btn-new-group').onclick = createGroup;
$('#new-group').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createGroup();
});

$('#btn-drawer').onclick = openDrawer;
$('#drawer').addEventListener('click', (e) => {
  if (e.target === $('#drawer')) closeDrawer();   // 点遮罩关掉
});
$('#mine-blacklist').onclick = openBlacklistSheet;
$('#mine-tagblack').onclick = () => openNameSheet('black-tags');
$('#mine-authorblack').onclick = () => openNameSheet('black-authors');
$('#mine-favtags').onclick = () => openNameSheet('fav-tags');
$('#mine-favauthors').onclick = () => openNameSheet('fav-authors');

async function refreshMine() {
  const [items] = await Promise.all([loadBlacklist(), loadFavorites()]);
  $('#mine-blacklist-count').textContent = items.length ? `${items.length} 本` : '空';
  updateNameCounts();
  $('#mine-storage-size').textContent = '计算中…';
  const s = await api.get('/api/storage');
  $('#mine-storage-size').textContent = formatSize(s.books_total + s.cache);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

/* ------------------------------------------------------------ 存储空间 */
async function openStorageSheet() {
  const s = await api.get('/api/storage');
  $('#sheet-title').textContent = `存储空间 · ${formatSize(s.books_total + s.cache)}`;
  $('#mine-storage-size').textContent = formatSize(s.books_total + s.cache);
  const list = $('#sheet-body');
  list.innerHTML = '';

  // btn 为字符串时是文字按钮，为元素时直接用（图标按钮）
  const addRow = (title, subText, btn, onClick) => {
    const row = document.createElement('div');
    row.className = 'sheet-item';
    row.innerHTML = '<span class="name"></span>';
    const name = row.querySelector('.name');
    name.textContent = title;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = subText;
    name.appendChild(sub);
    if (typeof btn === 'string') {
      const b = document.createElement('button');
      b.className = 'del';
      b.textContent = btn;
      btn = b;
    }
    btn.onclick = onClick;
    row.appendChild(btn);
    list.appendChild(row);
  };

  // "清理"做成图标容易看成删除漫画，保留文字
  addRow('图片缓存', `${formatSize(s.cache)} · 搜索封面和书架缩略图，清掉会按需重新生成`,
    '清理', async () => {
      const res = await api.post('/api/storage/clear', {});
      toast(`已清理 ${formatSize(res.freed)}`);
      openStorageSheet();
    });

  // 占地方最多的排在前面，方便挑着删
  for (const b of s.books.filter((x) => !hiddenIds.has(x.id))) {
    addRow(b.name, `JM${b.id} · ${formatSize(b.size)}`,
      iconButton('trash', '删除这本', 'del danger'), async () => {
      if (!await confirmDialog({
        title: '删除这本？',
        message: `《${b.name}》的本地文件会一起删掉。`,
        ok: '删除', danger: true,
      })) return;
      softDelete([b.id], `已删除《${b.name}》`);
      openStorageSheet();
    });
  }
  $('#sheet').classList.remove('hidden');
}

/* ------------------------------------------------------------ 备份 */
function collectLocal(prefix) {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out[k.slice(prefix.length)] = Number(localStorage.getItem(k));
  }
  return out;
}

async function exportBackup() {
  const res = await api.post('/api/backup/export', {
    // 分组和黑名单在服务端，阅读进度只存在这边的本地存储里，一起带过去
    progress: collectLocal('jm-pos-'),
    read: collectLocal('jm-read-'),
    settings: {
      fitHeight: localStorage.getItem('jm-fit-height'),
      shelfSort: localStorage.getItem('jm-shelf-sort'),
    },
  });
  if (res.error) return toast(res.error);
  // 安卓上文件在 App 私有目录里，直接弹系统分享，发到网盘 / 聊天软件保存
  if (window.AndroidApp && window.AndroidApp.shareFile && window.AndroidApp.shareFile(res.path)) {
    return;
  }
  toast(`已导出到 ${res.path}`);
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    return toast('读不出这个文件，不是有效的备份');
  }
  const res = await api.post('/api/backup/import', data);
  if (res.error) return toast(res.error);

  // 阅读进度按"读得更远的为准"合并，不会把本机的进度倒退回去
  let merged = 0;
  for (const [id, pos] of Object.entries(res.progress || {})) {
    if (pos > getProgress(id)) {
      localStorage.setItem('jm-pos-' + id, String(pos));
      merged++;
    }
  }
  for (const [id, t] of Object.entries(res.read || {})) {
    if (t > lastRead(id)) localStorage.setItem('jm-read-' + id, String(t));
  }
  const st = res.settings || {};
  if (st.fitHeight != null && localStorage.getItem('jm-fit-height') == null) {
    localStorage.setItem('jm-fit-height', st.fitHeight);
  }

  await loadShelf();
  await refreshMine();
  toast(`已导入：${res.groups} 个分组，新增 ${res.blacklist} 条黑名单，${merged} 条阅读进度`);

  if (res.missing && res.missing.length
      && await confirmDialog({
        title: `有 ${res.missing.length} 本不在这台设备上`,
        message: '要把它们加入下载队列吗？',
        ok: '重新下载',
      })) {
    for (const m of res.missing) await api.post('/api/download', { id: m.id });
    toast(`已加入 ${res.missing.length} 本到下载队列`);
    pollTasks();
  }
}

$('#mine-storage').onclick = openStorageSheet;
$('#mine-export').onclick = exportBackup;
$('#mine-import').onclick = () => $('#backup-file').click();
$('#backup-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';   // 清掉，下次选同一个文件也能触发
  if (file) await importBackup(file);
});

$('#shelf-sort').value = shelfSort;
$('#shelf-sort').addEventListener('change', (e) => {
  shelfSort = e.target.value;
  localStorage.setItem('jm-shelf-sort', shelfSort);
  renderShelf();
});
$('#shelf-search').addEventListener('input', (e) => {
  shelfQuery = e.target.value;
  renderShelf();
});
$$('[data-goto]').forEach((b) => {
  b.onclick = () => {
    switchView(b.dataset.goto);
    if (b.dataset.goto === 'tasks') pollTasks();   // 没任务在跑时轮询是停的
    if (b.dataset.goto === 'mine') refreshMine();
  };
});
$$('[data-back]').forEach((b) => { b.onclick = goBack; });

/* ------------------------------------------------------ 书架视图 / 多选按钮 */
function updateViewButton() {
  const wall = pref('jm-shelf-view') === 'wall';
  const btn = $('#btn-view');
  btn.innerHTML = svg(wall ? 'rows' : 'grid');
  btn.title = wall ? '切换为列表' : '切换为封面墙';
  btn.setAttribute('aria-label', btn.title);
}
$('#btn-view').onclick = () =>
  setPref('jm-shelf-view', pref('jm-shelf-view') === 'wall' ? 'list' : 'wall');

$('#sel-exit').onclick = () => history.back();
$('#sel-all').onclick = selectAllVisible;
$('#sel-group').onclick = () => {
  if (!selected.size) return toast('先选几本');
  openGroupSheet([...selected], null);
};
$('#sel-delete').onclick = async () => {
  if (!selected.size) return toast('先选几本');
  const ids = [...selected];
  if (!await confirmDialog({
    title: `删除选中的 ${ids.length} 本？`,
    message: '本地文件会一起删掉。',
    ok: '删除', danger: true,
  })) return;
  history.back();                       // 退出多选
  softDelete(ids, `已删除 ${ids.length} 本`);
};

/* ------------------------------------------------------------ 下拉刷新 */
(() => {
  const view = $('#view-shelf');
  const ptr = $('#ptr');
  let startY = null;
  let dist = 0;
  const show = (d) => {
    ptr.style.transform = `translateY(${Math.min(d * 0.5, 80) - 50}px) rotate(${d * 2}deg)`;
    ptr.style.opacity = String(Math.min(1, d / 140));
  };
  const reset = () => {
    ptr.style.transition = 'transform .2s, opacity .2s';
    ptr.style.transform = 'translateY(-50px)';
    ptr.style.opacity = '0';
    setTimeout(() => { ptr.style.transition = ''; }, 220);
  };
  view.addEventListener('touchstart', (e) => {
    startY = view.scrollTop <= 0 && !selecting && e.touches.length === 1
      ? e.touches[0].clientY : null;
    dist = 0;
  }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    dist = e.touches[0].clientY - startY;
    if (dist <= 0 || view.scrollTop > 0) { dist = 0; return; }
    show(dist);
  }, { passive: true });
  view.addEventListener('touchend', async () => {
    if (startY == null) return;
    startY = null;
    if (dist > 140) {
      ptr.classList.add('loading');
      ptr.style.transform = 'translateY(20px)';
      await loadShelf();
      ptr.classList.remove('loading');
      toast('已刷新');
    }
    reset();
    dist = 0;
  });
})();

/* ------------------------------------------------------------ 动态 */
// 收藏作者一个月内的新本，和（可选）跟收藏标签最搭的新本。服务端缓存一小时
let feedData = null;
let feedStale = true;
let feedLoading = false;

function feedCard(item, withScore) {
  const card = makeCard(item);
  const info = card.querySelector('.info');
  const when = document.createElement('div');
  when.className = 'upd';
  when.textContent = (item.updated ? timeAgo(item.updated * 1000) + '更新' : '一个月内更新')
    + (withScore && item.fav_tags ? ` · 命中 ${item.fav_tags.length} 个收藏标签` : '');
  info.insertBefore(when, info.querySelector('.tags'));
  return card;
}

function renderFeed() {
  const data = feedData || { authors: [], tags: [] };
  const withTags = pref('jm-feed-tags') === '1';
  const hint = $('#feed-hint');
  const authorsBox = $('#feed-authors');
  const tagsBox = $('#feed-tags');
  authorsBox.innerHTML = '';
  tagsBox.innerHTML = '';
  data.authors.forEach((it) => authorsBox.appendChild(feedCard(it, false)));
  data.tags.forEach((it) => tagsBox.appendChild(feedCard(it, true)));

  $('#feed-authors-title').classList.toggle('hidden', !favAuthors.length);
  $('#feed-tags-title').classList.toggle('hidden', !withTags || !favTags.length);
  if (!favAuthors.length && !(withTags && favTags.length)) {
    hint.textContent = '还没有收藏作者或标签。在搜索结果里点「收藏」，收藏的作者出新本会出现在这里。';
  } else if (!data.authors.length && !data.tags.length) {
    hint.textContent = '近 30 天没有新本';
  } else {
    hint.textContent = feedData && feedData.built_at ? `${timeAgo(feedData.built_at * 1000)}更新 · 点右上角刷新` : '';
  }
}

async function loadFeed(force = false) {
  if (feedLoading) return;
  feedLoading = true;
  if (force || !feedData) {
    $('#feed-hint').textContent = '正在查收藏作者的新本……';
    if (!feedData) renderSearchSkeletonIn($('#feed-authors'));
  }
  try {
    const res = await api.get(`/api/feed?tags=${pref('jm-feed-tags') === '1' ? 1 : 0}&force=${force ? 1 : 0}`);
    if (res.error) {
      $('#feed-hint').textContent = '获取失败：' + res.error;
      return;
    }
    feedData = res;
    feedStale = false;
    renderFeed();
  } finally {
    feedLoading = false;
  }
}

async function openFeed() {
  await Promise.all([loadBlacklist(), loadFavorites()]);
  if (feedStale || !feedData) await loadFeed(false);
  else renderFeed();
  // 进了动态页就算看过了：红点消掉，这些新本不再提醒
  if (feedData && feedData.authors.length) {
    api.post('/api/feed/seen', { ids: feedData.authors.map((x) => x.id) });
  }
  $('#feed-dot').classList.remove('on');
}
$('#feed-refresh').onclick = () => loadFeed(true);

// 骨架屏：复用搜索结果的占位卡片
function renderSearchSkeletonIn(box) {
  box.innerHTML = '';
  for (let k = 0; k < 3; k++) {
    const c = document.createElement('div');
    c.className = 'card ghostcard';
    c.innerHTML = '<div class="cover skeleton"></div><div class="info">'
      + '<div class="line skeleton"></div><div class="line skeleton short"></div></div>';
    box.appendChild(c);
  }
}

// App 开着的时候，隔一阵看看收藏的作者有没有出新本：底栏「动态」亮红点，看板娘提醒
async function checkFeed() {
  if (!favAuthors.length || currentView === 'feed') return;
  const res = await api.get(`/api/feed?tags=${pref('jm-feed-tags') === '1' ? 1 : 0}`).catch(() => null);
  if (!res || res.error) return;
  feedData = res;
  feedStale = false;
  const fresh = res.authors.filter((x) => (res.new || []).includes(x.id));
  if (!fresh.length) return;
  $('#feed-dot').classList.add('on');
  if (window.petFeed && petFeed(fresh)) return;
  snackbar(`收藏的作者出了 ${fresh.length} 本新本`, '去看看', () => switchView('feed'), 8000);
}
setTimeout(async () => { await loadFavorites(); checkFeed(); }, 6000);
setInterval(checkFeed, 3 * 3600 * 1000);

/* ------------------------------------------------------------ 设置页 */
async function openSettings() {
  switchView('settings');
  const s = await api.get('/api/settings');
  $$('[data-setting]').forEach((el) => {
    const v = s[el.dataset.setting];
    if (v != null) el.value = String(v);
  });
  $$('[data-pref]').forEach((el) => {
    const v = pref(el.dataset.pref);
    if (el.type === 'checkbox') el.checked = v === '1'; else el.value = v;
  });
}

async function saveSetting(el) {
  const res = await api.post('/api/settings', { [el.dataset.setting]: el.value });
  if (res.error) return toast(res.error);
  const v = res[el.dataset.setting];
  if (v != null) el.value = String(v);   // 服务端可能把越界的值修正过
  toast('已保存');
}

$$('[data-setting]').forEach((el) => {
  // 下拉框选完就存；代理这种文本框等输入完（失焦或回车）再存
  el.addEventListener('change', () => saveSetting(el));
  if (el.tagName === 'INPUT') {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  }
});
$$('[data-pref]').forEach((el) => {
  el.addEventListener('change', () => {
    setPref(el.dataset.pref, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value);
  });
});
$('#mine-settings').onclick = openSettings;

/* ------------------------------------------------------------ 上次没下完的 */
async function checkPending() {
  const res = await api.get('/api/pending');
  const items = res.items || [];
  $('#pending-banner').classList.toggle('hidden', !items.length);
  if (!items.length) return;
  $('#pending-text').textContent = `上次还有 ${items.length} 本没下完`;
  snackbar(`上次还有 ${items.length} 本没下完`, '继续下载', resumePending, 10000);
}

async function resumePending() {
  const res = await api.post('/api/pending/resume', {});
  $('#pending-banner').classList.add('hidden');
  toast(`已继续 ${res.resumed} 本`);
  pollTasks();
}

$('#pending-resume').onclick = resumePending;
$('#pending-clear').onclick = async () => {
  await api.post('/api/pending/clear', {});
  $('#pending-banner').classList.add('hidden');
  hideSnackbar();
};

/* ------------------------------------------------------------ JM 号单 */
async function copyText(text) {
  if (hasNative('copyText')) { native('copyText', text); return true; }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // 老浏览器兜底：借一个隐藏的输入框复制
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ids 为空导出整个书架；多选时只导出选中的
// 导出号单：先勾要导出的内容，再选「复制文字」（换设备最方便）或「分享 / 保存文件」
function exportJmList(ids) {
  $('#sheet-title').textContent = ids ? `导出选中的 ${ids.length} 本` : '导出号单';
  const body = $('#sheet-body');
  body.innerHTML = '';

  const parts = [
    ['shelf', ids ? '选中的书（JM 号）' : '书架（JM 号）', true],
    ['black', '黑名单（本子 · 标签 · 作者）', !ids],
    ['fav', '收藏名单（标签 · 作者）', !ids],
  ];
  const boxes = document.createElement('div');
  boxes.className = 'pickchips';
  for (const [key, label, on] of parts) {
    const chip = document.createElement('button');
    chip.className = 'pickchip' + (on ? ' on' : '');
    chip.dataset.part = key;
    chip.textContent = label;
    chip.onclick = () => chip.classList.toggle('on');
    boxes.appendChild(chip);
  }
  body.appendChild(boxes);

  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = '「复制文字」直接复制到剪贴板，发到另一台设备后，在那边「导入号单」里粘贴就行。';
  body.appendChild(tip);

  const chosen = () => $$('#sheet-body .pickchip.on').map((c) => c.dataset.part);
  const build = async (file) => {
    const sel = chosen();
    if (!sel.length) { toast('至少选一项'); return null; }
    const res = await api.post('/api/list/export', { ids: ids || undefined, parts: sel, file });
    if (res.error) { toast(res.error); return null; }
    if (!res.total) { toast('选中的内容都是空的，没什么可导出'); return null; }
    return res;
  };

  const row = document.createElement('div');
  row.className = 'sheet-actions';
  const copy = document.createElement('button');
  copy.className = 'primary';
  copy.textContent = '复制文字';
  copy.onclick = async () => {
    const res = await build(false);
    if (res) toast((await copyText(res.text)) ? `已复制 ${res.total} 条` : '复制失败');
  };
  const file = document.createElement('button');
  file.className = 'ghost';
  file.textContent = hasNative('shareFile') ? '分享文件' : '保存文件';
  file.onclick = async () => {
    const res = await build(true);
    if (!res) return;
    if (hasNative('shareFile')) {
      native('shareFile', res.path);
    } else {
      // 网页版：直接让浏览器下载这个文本
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([res.text], { type: 'text/plain;charset=utf-8' }));
      a.download = res.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`已保存 ${res.name}`);
    }
  };
  row.append(file, copy);
  body.appendChild(row);
  $('#sheet').classList.remove('hidden');
}

// 号单按「[书架]」「[黑名单·标签]」分段；没有分段的旧号单整段当书架
const LIST_SECTIONS = {
  书架: 'shelf',
  '黑名单·本子': 'black-books', '黑名单·标签': 'black-tags', '黑名单·作者': 'black-authors',
  '收藏·标签': 'fav-tags', '收藏·作者': 'fav-authors',
};
function parseImport(text) {
  const chunks = { shelf: [] };
  let cur = 'shelf';
  let sectioned = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const head = raw.trim().match(/^\[(.+?)\]/);
    if (head && LIST_SECTIONS[head[1].trim()]) {
      cur = LIST_SECTIONS[head[1].trim()];
      sectioned = true;
      chunks[cur] = chunks[cur] || [];
      continue;
    }
    (chunks[cur] = chunks[cur] || []).push(raw);
  }
  const lines = (key) => (chunks[key] || []).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  // 书架段：行首 ★ 是加了星
  const stars = new Set();
  const shelfText = (sectioned ? lines('shelf') : String(text || '').split(/\r?\n/)).map((l) => {
    const m = l.match(/^\s*★\s*(?:jm)?\s*(\d+)/i);
    if (m) stars.add(m[1]);
    return l.replace(/^\s*★/, '');
  }).join('\n');
  return {
    books: parseJmList(shelfText),
    stars,
    names: {
      'black-books': parseJmList(lines('black-books').join('\n')),
      'black-tags': lines('black-tags'),
      'black-authors': lines('black-authors'),
      'fav-tags': lines('fav-tags'),
      'fav-authors': lines('fav-authors'),
    },
  };
}

/**
 * 从任意文字里认出 JM 号。支持：
 * - 本 App 导出的号单（JM号<Tab>标题<Tab>作者）
 * - 一行一个或一行几个的纯号码："422866 1421519"
 * - 夹在聊天记录里的 "JM422866" 这种写法
 * - 本 App 导出的备份 JSON（取里面的书目）
 */
function parseJmList(text) {
  const out = [];
  const seen = new Set();
  const add = (id, name = '', author = '') => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, name, author });
  };

  try {
    const data = JSON.parse(text);
    if (data && Array.isArray(data.shelf)) {
      data.shelf.forEach((b) => add(String(b.id || '').replace(/\D/g, ''), b.name || ''));
      return out;
    }
  } catch (_) { /* 不是 JSON，按文本处理 */ }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^(jm)?\s*\d+(\s*[,，\s]\s*(jm)?\s*\d+)*$/i.test(line)) {
      line.match(/\d+/g).forEach((id) => add(id));
      continue;
    }
    const m = line.match(/^(?:jm)?\s*(\d+)\s*(.*)$/i);
    if (m) {
      const [name = '', author = ''] = m[2].split('\t').map((x) => x.trim());
      add(m[1], name, author);
      continue;
    }
    // 号码没在行首：只认明确写了 JM 的，免得把聊天里的日期、数量当成号码
    for (const mm of line.matchAll(/jm\s*(\d{3,})/gi)) add(mm[1]);
  }
  return out;
}

function openListImportSheet() {
  $('#sheet-title').textContent = '导入号单';
  const body = $('#sheet-body');
  body.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.placeholder = '把另一台设备「复制文字」得到的号单粘贴到这里，\n也可以直接选一个号单文件。\n书、黑名单、收藏名单都会先给你预览，挑着导入';
  body.appendChild(ta);

  const row = document.createElement('div');
  row.className = 'sheet-actions';
  const pick = document.createElement('button');
  pick.className = 'ghost';
  pick.textContent = '选择文件';
  pick.onclick = () => $('#list-file').click();
  const go = document.createElement('button');
  go.className = 'primary';
  go.textContent = '识别';
  go.onclick = () => showImportList(ta.value);
  row.append(pick, go);
  body.appendChild(row);
  $('#sheet').classList.remove('hidden');
}

/* ---- 导入页：预览、挑选、批量下载 ---- */
let importItems = [];
const importSel = new Set();

// 这本能不能选：完整下过的、正在下载的、查不到的都不行
function importState(id) {
  const item = importItems.find((x) => x.id === id);
  if (item && item.missing) return { ok: false, tag: '查不到' };
  const task = activeTasks.get(id);
  if (task) return { ok: false, tag: task.status === 'queued' ? '排队中' : '下载中' };
  const owned = shelfItems.find((b) => b.id === id);
  if (owned && owned.complete) return { ok: false, tag: '已在书架' };
  if (owned) return { ok: true, tag: '未下完', partial: true };
  return { ok: true, tag: '' };
}

// 号单里的名单部分：{ 'black-tags': [...], ... }，以及书架里加了星的
let importNames = {};
let importStars = new Set();
const importNamePick = new Set();   // 选中要导入的名单项：「分组|名字」

const IMPORT_NAME_TITLES = {
  'black-books': '黑名单 · 本子', 'black-tags': '黑名单 · 标签', 'black-authors': '黑名单 · 作者',
  'fav-tags': '收藏 · 标签', 'fav-authors': '收藏 · 作者',
};
// 这一项本机是不是已经有了
function nameHad(key, v) {
  if (key === 'black-books') return blockedIds.has(v.id);
  if (key === 'black-tags') return blockedTagSet.has(normTag(v));
  if (key === 'black-authors') return blockedAuthorSet.has(normTag(v));
  if (key === 'fav-tags') return favTagSet.has(normTag(v));
  return favAuthorSet.has(normTag(v));
}
const nameKey = (key, v) => key + '|' + (key === 'black-books' ? v.id : v);

function renderImportNames() {
  const box = $('#import-names');
  box.innerHTML = '';
  const keys = Object.keys(IMPORT_NAME_TITLES).filter((k) => (importNames[k] || []).length);
  box.classList.toggle('hidden', !keys.length);
  if (!keys.length) return;
  for (const key of keys) {
    const h = document.createElement('p');
    h.className = 'pick-title';
    h.textContent = `${IMPORT_NAME_TITLES[key]}（${importNames[key].length}）`;
    const chips = document.createElement('div');
    chips.className = 'pickchips';
    for (const v of importNames[key]) {
      const chip = document.createElement('button');
      const had = nameHad(key, v);
      const k = nameKey(key, v);
      chip.className = 'pickchip' + (had ? ' had' : importNamePick.has(k) ? ' on' : '');
      chip.textContent = (key === 'black-books' ? (v.name || 'JM' + v.id) : v) + (had ? '（已有）' : '');
      chip.disabled = had;
      chip.onclick = () => {
        if (importNamePick.has(k)) importNamePick.delete(k); else importNamePick.add(k);
        renderImportNames();
      };
      chips.appendChild(chip);
    }
    box.append(h, chips);
  }
  const n = importNamePick.size;
  const go = document.createElement('button');
  go.className = 'primary wide';
  go.textContent = n ? `导入选中的名单（${n} 项）` : '没有要导入的名单';
  go.disabled = !n;
  go.onclick = importPickedNames;
  box.appendChild(go);
}

async function importPickedNames() {
  const pick = (key) => (importNames[key] || []).filter((v) => importNamePick.has(nameKey(key, v)));
  for (const [key, list, kind] of [
    ['black-tags', 'black', 'tags'], ['black-authors', 'black', 'authors'],
    ['fav-tags', 'fav', 'tags'], ['fav-authors', 'fav', 'authors'],
  ]) {
    const add = pick(key);
    if (add.length) await setNames(list, kind, add);
  }
  for (const b of pick('black-books')) {
    await api.post('/api/blacklist/add', { id: b.id, name: b.name });
  }
  const n = importNamePick.size;
  importNamePick.clear();
  await loadBlacklist();
  // 号单里加了星、而本机已经下载了的书，顺手加上星
  for (const id of importStars) {
    const book = shelfItems.find((b) => b.id === id);
    if (book && !book.starred) await api.post('/api/star', { id, on: true });
  }
  await loadShelf();
  toast(`已导入 ${n} 项名单`);
  renderImportNames();
  renderImportList();
}

async function showImportList(text) {
  const parsed = parseImport(text || '');
  const items = parsed.books;
  const nameCount = Object.values(parsed.names).reduce((n, l) => n + l.length, 0);
  if (!items.length && !nameCount) return toast('没认出 JM 号或名单');
  closeSheet();
  await Promise.all([loadBlacklist(), loadFavorites()]);
  importNames = parsed.names;
  importStars = parsed.stars;
  importNamePick.clear();
  // 名单里本机还没有的默认全选
  for (const [key, list] of Object.entries(importNames)) {
    for (const v of list) if (!nameHad(key, v)) importNamePick.add(nameKey(key, v));
  }
  renderImportNames();
  importItems = items;
  importSel.clear();
  // 能下的默认全选：导入号单通常就是为了把缺的补上
  items.forEach((x) => { if (importState(x.id).ok) importSel.add(x.id); });
  switchView('import');
  $('#view-import').scrollTop = 0;
  renderImportList();
}

// 标题、作者没带的，滚动到跟前再去查，号单再长也不会一下子发几百个请求
const importInfoObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    importInfoObserver.unobserve(el);
    const item = importItems.find((x) => x.id === el.dataset.id);
    if (!item) continue;
    api.get('/api/info?id=' + encodeURIComponent(item.id)).then((info) => {
      if (info.error) {
        // 查不到的号（写错了或已被删）下载必然失败，取消勾选并灰掉
        item.missing = true;
        importSel.delete(item.id);
        renderImportList();
        return;
      }
      item.name = item.name || info.name;
      item.author = item.author || info.author;
      fillImportCard(el, item);
    }).catch(() => {});
  }
}, { rootMargin: '400px 0px' });

function fillImportCard(el, item) {
  el.querySelector('.title').textContent =
    item.name || (item.missing ? '查不到这本（可能已被删除）' : '加载中…');
  const author = el.querySelector('.author');
  author.textContent = item.author || '';
  author.style.display = item.author ? '' : 'none';
}

function renderImportList() {
  const list = $('#import-list');
  list.innerHTML = '';
  let blocked = 0;
  for (const item of importItems) {
    const st = importState(item.id);
    if (!st.ok) blocked++;
    const el = document.createElement('div');
    el.className = 'book' + (st.ok ? '' : ' owned')
      + (importSel.has(item.id) ? ' selected' : '');
    el.dataset.id = item.id;
    el.innerHTML = `
      <div class="cover"><img loading="lazy" alt=""></div>
      <div class="binfo">
        <div class="title"></div>
        <div class="author"></div>
        <div class="bfoot"><span class="jmid"></span></div>
      </div>`;
    const img = el.querySelector('img');
    img.src = '/cover/' + item.id;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    el.querySelector('.jmid').textContent = 'JM' + item.id;
    fillImportCard(el, item);
    const authorEl = el.querySelector('.author');
    authorEl.classList.add('copyable');
    authorEl.addEventListener('click', async (e) => {
      if (!item.author) return;
      e.stopPropagation();   // 点作者是复制，不是勾选
      toast((await copyText(item.author)) ? `已复制「${item.author}」` : '复制失败');
    });

    if (st.tag) {
      const tag = document.createElement('span');
      tag.className = 'ownedtag' + (st.partial ? ' partial' : '');
      tag.textContent = st.tag;
      el.querySelector('.bfoot').appendChild(tag);
    }
    if (st.ok) {
      const check = document.createElement('span');
      check.className = 'check';
      if (importSel.has(item.id)) check.innerHTML = svg('check', 14);
      el.querySelector('.cover').appendChild(check);
      el.onclick = () => {
        if (importSel.has(item.id)) importSel.delete(item.id); else importSel.add(item.id);
        renderImportList();
      };
    }
    if (!item.name && !item.missing) importInfoObserver.observe(el);
    list.appendChild(el);
  }

  const total = importItems.length;
  $('#import-title').textContent = `导入号单（${total}）`;
  $('#import-hint').textContent = !total ? '号单里没有书，只有名单'
    : blocked ? `共 ${total} 本，其中 ${blocked} 本已有或正在下载，已灰掉`
      : `共 ${total} 本，都还没有`;
  $('#import-bar').classList.toggle('hidden', !total);
  $('#import-count').textContent = `已选 ${importSel.size} 本`;
  $('#imp-download').disabled = importSel.size === 0;
}

$('#imp-all').onclick = () => {
  const ids = importItems.filter((x) => importState(x.id).ok).map((x) => x.id);
  const all = ids.length && ids.every((id) => importSel.has(id));
  importSel.clear();
  if (!all) ids.forEach((id) => importSel.add(id));
  renderImportList();
};

$('#imp-download').onclick = async () => {
  const ids = [...importSel];
  if (!ids.length) return;
  $('#imp-download').disabled = true;
  for (const id of ids) await api.post('/api/download', { id });
  toast(`已加入 ${ids.length} 本到下载队列`);
  importSel.clear();
  await pollTasks();          // 刷新任务集合，刚加的会变成"排队中 / 下载中"
  renderImportList();
};

$('#mine-list-export').onclick = () => exportJmList(null);
$('#mine-list-import').onclick = openListImportSheet;
$('#list-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) showImportList(await file.text());
});
$('#sel-export').onclick = () => {
  if (!selected.size) return toast('先选几本');
  exportJmList([...selected]);
};

$('#tip button').onclick = () => $('#tip').classList.add('hidden');
$('#search-input').addEventListener('input', (e) => {
  // 清空搜索框、且当前没在显示结果时，把搜索历史亮出来
  if (!e.target.value.trim() && !$('#search-results').children.length) renderHistory();
});

history.replaceState({ view: 'shelf' }, '');
applyPrivacy();
updateViewButton();
loadShelf();
loadFavorites();   // 搜索排序、卡片上的收藏标记要用
loadBlacklist();
pollTasks();
checkPending();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
