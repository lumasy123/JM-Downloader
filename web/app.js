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
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  bookmark: 'M6 3h12v18l-6-4.5L6 21z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z',
  transfer: 'M7 4v13M3.5 13.5 7 17l3.5-3.5M17 20V7M13.5 10.5 17 7l3.5 3.5',
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
  'jm-search-mode': 'and',   // 多个关键字：and 同时包含 / or 包含其一
  'jm-fav-sort': 'page',     // 搜索按收藏排序：page 只排当前页 / pool 前几页合起来排
  'jm-feed-tab': 'authors',  // 动态页上次看的是哪一栏：authors / tags
  'jm-pet-chat': 'normal',   // 看板娘话量：quiet / normal / chatty
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

/* ---- 弹层（面板、分组抽屉、确认框、提示）打开时往历史里压一条：
 * 安卓返回键先关最上面的弹层，而不是直接退页面、在书架首页时直接退出 App ---- */
const OVERLAYS = ['#dialog', '#sheet', '#drawer', '#tip'];
let overlayPushed = false;
let skipPop = false;
const overlayOpen = () => OVERLAYS.find((s) => !$(s).classList.contains('hidden'));
function closeTopOverlay(sel) {
  if (sel === '#dialog') $('#dialog [data-no]').click();
  else if (sel === '#sheet') closeSheet();
  else if (sel === '#drawer') closeDrawer();
  else $(sel).classList.add('hidden');
}
const overlayWatch = new MutationObserver(() => {
  const open = overlayOpen();
  if (open && !overlayPushed) {
    overlayPushed = true;
    history.pushState({ ...(history.state || {}), overlay: true }, '');
  } else if (!open && overlayPushed) {
    // 用按钮关掉的：把刚才压进去的那条撤掉，不然要多按一次返回
    overlayPushed = false;
    skipPop = true;
    history.back();
  }
});
OVERLAYS.forEach((sel) => overlayWatch.observe($(sel), { attributes: true, attributeFilter: ['class'] }));

window.addEventListener('popstate', (e) => {
  if (skipPop) { skipPop = false; return; }
  const open = overlayOpen();
  if (open) {
    overlayPushed = false;   // 历史已经退回去了，关掉就行
    closeTopOverlay(open);
    return;
  }
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
  ['rated4', '4 分以上'], ['rated3', '3 分以上'], ['unrated', '未评分'],
];

function readState(b) {
  const pos = getProgress(b.id);
  if (pos <= 0) return 'unread';
  return pos >= b.pages - 1 ? 'finished' : 'reading';
}

function matchFilter(b, f) {
  if (f === 'all') return true;
  if (f === 'partial') return !b.complete;
  if (f === 'rated4') return b.rating != null && b.rating >= 4;
  if (f === 'rated3') return b.rating != null && b.rating >= 3;
  if (f === 'unrated') return b.rating == null;
  return readState(b) === f;
}
let shelfSort = localStorage.getItem('jm-shelf-sort') || 'added';
let activeTasks = new Map();   // 正在下 / 排队中的任务，书架据此显示「下载中」

const lastRead = (id) => parseInt(localStorage.getItem('jm-read-' + id) || '0', 10);
// 在这台设备上点开阅读的次数
const openCount = (id) => parseInt(localStorage.getItem('jm-opens-' + id) || '0', 10);

const SORTERS = {
  added: (a, b) => b.added_at - a.added_at,
  read: (a, b) => (lastRead(b.id) - lastRead(a.id)) || (b.added_at - a.added_at),
  name: (a, b) => a.name.localeCompare(b.name, 'zh'),
  pages: (a, b) => b.pages - a.pages,
  // 评分：按各条标准的平均分，没打分的排最后
  rating: (a, b) => ((b.rating ?? -1) - (a.rating ?? -1)) || (b.added_at - a.added_at),
  opens: (a, b) => (openCount(b.id) - openCount(a.id)) || (lastRead(b.id) - lastRead(a.id)),
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
  return [...books].sort(SORTERS[shelfSort] || SORTERS.added);
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
  const view = pref('jm-shelf-view');
  grid.classList.toggle('wall', view === 'wall');
  $('#shelf-empty').classList.toggle('hidden', live.length > 0);
  $('#shelf-tools').classList.toggle('hidden', live.length === 0);
  $('#shelf-nomatch').classList.toggle('hidden', !live.length || books.length > 0);

  // 只重建变了的卡片：书的数据、阅读进度、下载状态、多选状态都没变的直接复用，
  // 几百本的书架加个星、改个笔记、下完一本时不用整页重画，封面图也不会闪
  const cache = shelfCardCache;
  const nodes = books.map((book) => {
    const task = activeTasks.get(book.id);
    const sig = JSON.stringify([book, getProgress(book.id), openCount(book.id), task && task.status,
      selecting, selected.has(book.id), activeGroup, view]);
    const hit = cache.get(book.id);
    if (hit && hit.sig === sig) return hit.el;
    const el = buildBookCard(book);
    cache.set(book.id, { sig, el });
    return el;
  });
  const keep = new Set(books.map((b) => b.id));
  for (const id of [...cache.keys()]) if (!keep.has(id) && !live.some((b) => b.id === id)) cache.delete(id);
  grid.replaceChildren(...nodes);
  renderFilters();
  renderContinue();
  if (live.length && currentView === 'shelf') showTip('shelf');
}

const shelfCardCache = new Map();   // 漫画id -> { sig, el }

function buildBookCard(book) {
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
        <div class="bfoot">
          <span class="jmid"></span>
          <span class="opens"></span>
          <span class="rate"></span>
          <span class="readinfo"></span>
        </div>
        <div class="bnote"></div>
      </div>`;
    const cover = el.querySelector('.cover');

    const noteEl = el.querySelector('.bnote');
    if (book.note) noteEl.textContent = book.note; else noteEl.remove();
    const foot = el.querySelector('.bfoot');
    el.querySelector('img').src = book.cover;
    el.querySelector('.title').textContent = book.name;

    // 作者、标签、JM号、点开次数、评分、进度各占一个固定的位置，没有的留空，
    // 不同的本子同一项信息总在同一高度。作者在书架上只是显示，进详情页再点才复制
    const author = el.querySelector('.author');
    author.textContent = book.author || '';

    const tagBox = el.querySelector('.btags');
    for (const t of (book.tags || []).slice(0, 5)) {
      const s = document.createElement('span');
      s.textContent = t;
      tagBox.appendChild(s);
    }

    el.querySelector('.jmid').textContent = `JM${book.id} · ${book.pages}P`;
    el.querySelector('.opens').textContent = `点开 ${openCount(book.id)} 次`;
    if (book.rating != null) {
      // 综合星级：各条标准打分的平均，精确到 0.1 颗星，后面跟具体分数
      const rate = el.querySelector('.rate');
      rate.append(starBar(book.rating), ' ' + book.rating.toFixed(1));
      rate.title = `综合评分 ${book.rating.toFixed(1)}`;
    }
    const readInfo = el.querySelector('.readinfo');

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
      readInfo.appendChild(mark);
    }
    if (book.group && !activeGroup) {
      const tag = document.createElement('span');
      tag.className = 'grouptag';
      tag.innerHTML = svg('folder', 11);
      tag.append(book.group);
      readInfo.appendChild(tag);
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
    return el;
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

// 多选一：choices = [{ label, value, primary, danger }]，取消返回 null
function choiceDialog({ title, message = '', choices }) {
  return new Promise((resolve) => {
    const dlg = $('#dialog');
    const actions = dlg.querySelector('.dialog-actions');
    const saved = actions.innerHTML;
    dlg.querySelector('h3').textContent = title;
    dlg.querySelector('p').textContent = message;
    const done = (value) => {
      dlg.classList.add('hidden');
      dlg.onclick = null;
      actions.innerHTML = saved;
      actions.classList.remove('choices');
      resolve(value);
    };
    actions.innerHTML = '';
    actions.classList.add('choices');
    for (const c of choices) {
      const b = document.createElement('button');
      b.className = (c.primary ? 'primary' : 'ghost') + (c.danger ? ' danger' : '');
      b.textContent = c.label;
      b.onclick = () => done(c.value);
      actions.appendChild(b);
    }
    const no = document.createElement('button');
    no.className = 'ghost';
    no.dataset.no = '';
    no.textContent = '取消';
    no.onclick = () => done(null);
    actions.appendChild(no);
    dlg.onclick = (e) => { if (e.target === dlg) done(null); };
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

// 带「撤销」的提示条；旁边的「确定」直接关掉，连续操作时不用等它自己消失
function snackbar(text, actionText, onAction, ms = 6000) {
  const bar = $('#snackbar');
  bar.querySelector('span').textContent = text;
  const btn = bar.querySelector('[data-undo]');
  btn.textContent = actionText;
  btn.onclick = () => { hideSnackbar(); onAction(); };
  bar.querySelector('[data-ok]').onclick = hideSnackbar;
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

  const titleEl = $('#detail-title');
  titleEl.textContent = data.name;
  titleEl.title = data.name;
  titleEl.classList.remove('full');
  // 标题太长只显示一行；鼠标移上去（手机上点一下）展开成多行
  titleEl.onclick = () => titleEl.classList.toggle('full');
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
      <button class="ghost icon-only" id="btn-space" title="压缩 / 导出" aria-label="压缩 / 导出">${svg('box', 20)}</button>
      <button class="ghost icon-only" id="btn-group" title="移动到分组" aria-label="移动到分组">${svg('folder', 20)}</button>
      <button class="ghost icon-only" id="btn-delete" title="删除这本" aria-label="删除这本">${svg('trash', 20)}</button>
    </div>
    <div id="chapter-list"></div>
    <div class="bm-list hidden" id="bm-list"></div>
    <button class="rating-btn hidden" id="btn-rating"></button>
    <p class="detail-notetext hidden" id="detail-note"></p>`;

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

  // 标签只是展示（点了不跳转）；末尾一个按钮，挑这本的标签收藏 / 标成反感
  const tagBox = body.querySelector('.detail-tags');
  for (const tag of data.tags || []) {
    const btn = document.createElement('span');
    btn.className = 'tag';
    btn.textContent = tag;
    markTagClass(btn);
    tagBox.appendChild(btn);
  }
  if (tagBox.children.length) {
    const fav = document.createElement('button');
    fav.className = 'tag tag-fav-btn';
    fav.innerHTML = svg('heart', 12) + '<span>收藏标签</span>';
    fav.onclick = () => openPickSheet('fav', {
      id: data.id, name: data.name, author: data.author, tags: data.tags || [],
    });
    tagBox.appendChild(fav);
  } else {
    tagBox.remove();
  }

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
  $('#btn-space').onclick = () => openSpaceSheet(book || { id: data.id, name: data.name });
  $('#btn-delete').onclick = () => removeAlbum(data.id, data.name);

  // 书签：点一下直接跳到那一页
  if (book) {
    loadBookmarks(data.id).then((pages) => {
      const box = $('#bm-list');
      if (!box || !pages.length) return;
      box.innerHTML = '<span class="bm-title">书签</span>';
      for (const p of pages) {
        const chip = document.createElement('button');
        chip.className = 'tag';
        chip.textContent = `第 ${p + 1} 页`;
        chip.onclick = () => openReader(data.id, p);
        box.appendChild(chip);
      }
      box.classList.remove('hidden');
    });
  }

  // 评分：只给书架上已下载的打；平时只是一个按钮，点了弹出明细
  // 评分和笔记在同一个弹窗里；详情页上是一个按钮，笔记写过的话在按钮下面显示出来
  const ratingBtn = $('#btn-rating');
  const noteEl = $('#detail-note');
  const paintRating = () => {
    const cur = (book && shelfItems.find((b) => b.id === book.id)) || book;
    const r = cur && cur.rating;
    ratingBtn.innerHTML = '<span class="rl">评分 · 笔记</span><span class="rv"></span><span class="arrow">›</span>';
    const rv = ratingBtn.querySelector('.rv');
    if (r != null) rv.append(starBar(r), ' ' + r.toFixed(1)); else rv.textContent = '还没打分';
    const note = (cur && cur.note) || '';
    noteEl.textContent = note;
    noteEl.classList.toggle('hidden', !note);
  };
  if (book) {
    ratingBtn.classList.remove('hidden');
    paintRating();
    ratingBtn.onclick = () => openRatingSheet(book, paintRating);
    noteEl.onclick = ratingBtn.onclick;
    body.querySelector('.cnt').textContent += ` · 点开 ${openCount(data.id)} 次`;
  }

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
    // 下面放不下几本，直接跳到下载页按作者搜，顺手把作者名复制了
    const more = document.createElement('button');
    more.className = 'ghost more-btn';
    more.textContent = `搜 ${data.author} 的其他作品`;
    more.onclick = async () => {
      await copyText(data.author);
      switchView('download');
      $('#search-input').value = data.author;
      setKind('author');
      doSearch(1);
      toast(`已复制「${data.author}」，按作者搜索`);
    };
    $('#chapter-list').before(more);
    showTip('detail');
  }
}

// 详情页底部：这个作者的其他作品，横向一排。需要联网，失败就不显示
// 返回 'ok' / 'none'（没有其他作品）/ 'error'

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
  const prev = getProgress(id);
  localStorage.setItem('jm-pos-' + id, String(i));
  localStorage.setItem('jm-read-' + id, String(Date.now()));   // 给「最近阅读」排序用
  countReading(id, i - prev);
}

/* ---- 阅读统计：每天看了多少页、看了哪几本，只存在本机 ---- */
const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function loadStats() {
  try { return JSON.parse(localStorage.getItem('jm-stats') || '{}'); } catch (_) { return {}; }
}
// 往后翻 1~3 页算正常在看；拖进度条那种大跳不算
function countReading(id, step) {
  if (step < 1 || step > 3) return;
  const stats = loadStats();
  const day = stats[dayKey()] || (stats[dayKey()] = { p: 0, b: [] });
  day.p += step;
  if (!day.b.includes(id)) day.b.push(id);
  const days = Object.keys(stats).sort();
  days.slice(0, Math.max(0, days.length - 400)).forEach((k) => delete stats[k]);   // 只留一年多
  try { localStorage.setItem('jm-stats', JSON.stringify(stats)); } catch (_) {}
}

function openStatsSheet() {
  const stats = loadStats();
  const now = Date.now();
  const sum = (days) => {
    let pages = 0;
    const books = new Set();
    for (let k = 0; k < days; k++) {
      const d = stats[dayKey(now - k * 86400000)];
      if (d) { pages += d.p; d.b.forEach((x) => books.add(x)); }
    }
    return { pages, books: books.size };
  };
  const today = sum(1);
  const week = sum(7);
  const month = sum(30);
  const live = liveItems();
  const finished = live.filter((b) => readState(b) === 'finished').length;
  const rated = live.filter((b) => b.rating != null);
  const avg = rated.length ? (rated.reduce((n, b) => n + b.rating, 0) / rated.length).toFixed(1) : null;

  $('#sheet-title').textContent = '阅读记录';
  const body = $('#sheet-body');
  body.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  for (const [num, label] of [
    [today.pages, '今天看了（页）'], [week.pages, '近 7 天（页）'], [month.pages, '近 30 天（页）'],
    [month.books, '近 30 天看过（本）'], [finished, '一共读完（本）'], [avg ?? '—', `平均评分（${rated.length} 本）`],
  ]) {
    const cell = document.createElement('div');
    cell.className = 'stat';
    cell.innerHTML = '<b></b><span></span>';
    cell.querySelector('b').textContent = num;
    cell.querySelector('span').textContent = label;
    grid.appendChild(cell);
  }
  body.appendChild(grid);

  // 近 7 天每天的页数
  const bars = document.createElement('div');
  bars.className = 'stat-bars';
  const week7 = [...Array(7)].map((_, k) => {
    const t = now - (6 - k) * 86400000;
    return [new Date(t).getDate() + '日', (stats[dayKey(t)] || { p: 0 }).p];
  });
  const max = Math.max(1, ...week7.map((x) => x[1]));
  for (const [label, p] of week7) {
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = '<i></i><small></small>';
    col.querySelector('i').style.height = Math.round((p / max) * 100) + '%';
    col.title = `${p} 页`;
    col.querySelector('small').textContent = label;
    bars.appendChild(col);
  }
  body.appendChild(bars);

  // 最近看过的
  const recent = live.filter((b) => lastRead(b.id)).sort((a, b) => lastRead(b.id) - lastRead(a.id)).slice(0, 20);
  const h = document.createElement('p');
  h.className = 'pick-title';
  h.textContent = recent.length ? '最近看过' : '还没看过书，去书架挑一本吧';
  body.appendChild(h);
  for (const b of recent) {
    const row = document.createElement('button');
    row.className = 'sheet-item';
    row.innerHTML = '<span class="name"></span>';
    const name = row.querySelector('.name');
    name.textContent = b.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const pos = getProgress(b.id);
    sub.textContent = `${timeAgo(lastRead(b.id))} · 读到 ${pos + 1}/${b.pages}`
      + (b.rating != null ? ` · ★ ${b.rating.toFixed(1)}` : '');
    name.appendChild(sub);
    row.onclick = () => { closeSheet(); openDetail(b.id); };
    body.appendChild(row);
  }
  $('#sheet').classList.remove('hidden');
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
  localStorage.setItem('jm-opens-' + id, String(openCount(id) + 1));
  $('#finish-rate').classList.add('hidden');
  loadBookmarks(id).then((pages) => {
    if (reader.id === id) { reader.bookmarks = new Set(pages); paintBookmarkBtn(); }
  });
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
    id, imgs: [], srcs: [], index: 0, starts: [], names: [], chapter: -1, bookmarks: new Set(),
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

/* ---- 页面书签：阅读器顶栏的按钮加 / 去，详情页列出来，页面总览里标出来 ---- */
async function loadBookmarks(id) {
  const res = await api.get('/api/bookmarks?id=' + encodeURIComponent(id)).catch(() => ({}));
  return res.pages || [];
}
function paintBookmarkBtn() {
  const btn = $('#btn-bookmark');
  const on = !!(reader.bookmarks && reader.bookmarks.has(reader.index));
  btn.classList.toggle('on', on);
  btn.title = on ? '去掉这一页的书签' : '给这一页加书签';
  btn.setAttribute('aria-label', btn.title);
}
$('#btn-bookmark').onclick = async () => {
  if (!shelfItems.some((b) => b.id === reader.id)) return toast('只能给书架上的本子加书签');
  const page = reader.index;
  const on = !reader.bookmarks.has(page);
  const res = await api.post('/api/bookmark', { id: reader.id, page, on });
  if (res.error) return toast(res.error);
  reader.bookmarks = new Set(res.pages);
  paintBookmarkBtn();
  toast(on ? `第 ${page + 1} 页加了书签` : '书签去掉了');
};

/* ---- 读完顺手打分：翻到最后一页、这本还没打过分时，底下浮出一排星星 ---- */
const finishRateShown = new Set();   // 这次打开 App 里弹过的，不再弹
function maybeAskRating(i) {
  const box = $('#finish-rate');
  const book = shelfItems.find((b) => b.id === reader.id);
  if (i < reader.srcs.length - 1 || !book || book.rating != null || finishRateShown.has(book.id)) return;
  finishRateShown.add(book.id);
  const stars = box.querySelector('.fr-stars');
  stars.innerHTML = '';
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement('button');
    b.className = 'rstar';
    b.innerHTML = svg('star', 24);
    b.setAttribute('aria-label', `${n} 分`);
    b.onclick = async () => {
      // 一键打分：每个评分项都打成这个分，综合分就是它；想细分再点「细分」
      if (!ratingCriteria.length) await loadCriteria();
      for (const c of ratingCriteria) await setRating(book.id, c, n);
      box.classList.add('hidden');
      toast(`给《${book.name.slice(0, 12)}》打了 ${n} 分`);
    };
    stars.appendChild(b);
  }
  box.querySelector('.fr-more').onclick = () => { box.classList.add('hidden'); openRatingSheet(book, () => {}); };
  box.querySelector('.fr-close').innerHTML = svg('close', 16);
  box.querySelector('.fr-close').onclick = () => box.classList.add('hidden');
  box.classList.remove('hidden');
}

function updateCounter(i) {
  reader.index = i;
  $('#reader-counter').textContent = `${i + 1} / ${reader.srcs.length}`;
  paintBookmarkBtn();
  maybeAskRating(i);
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
    item.className = 'ov-item' + (k === reader.index ? ' current' : '')
      + (reader.bookmarks && reader.bookmarks.has(k) ? ' bm' : '');
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
  const rank = (t) => blockedTagSet.has(normTag(t)) * 2 + (favTagSet.has(normTag(t)) || dislikeTagSet.has(normTag(t)));
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

// 卡片滚到跟前才查标签；同一时间进来的攒在一起，一次请求查完
const pendingTagBoxes = new Map();   // id -> [标签容器]
let tagFlushTimer = null;

function flushTagBoxes() {
  tagFlushTimer = null;
  const batch = [...pendingTagBoxes.entries()].slice(0, 40);
  batch.forEach(([id]) => pendingTagBoxes.delete(id));
  if (pendingTagBoxes.size) tagFlushTimer = setTimeout(flushTagBoxes, 0);
  if (!batch.length) return;
  api.get('/api/info?ids=' + batch.map(([id]) => id).join(','))
    .then((res) => {
      for (const [id, boxes] of batch) {
        const info = (res.items || {})[id];
        if (info && info.tags && info.tags.length) boxes.forEach((box) => renderTags(box, info.tags));
      }
    })
    .catch(() => {});   // 取不到标签不影响卡片其余部分
}

const infoObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const box = entry.target;
    infoObserver.unobserve(box);
    const id = box.dataset.id;
    if (!id) continue;
    if (!pendingTagBoxes.has(id)) pendingTagBoxes.set(id, []);
    pendingTagBoxes.get(id).push(box);
    if (!tagFlushTimer) tagFlushTimer = setTimeout(flushTagBoxes, 60);
  }
}, { rootMargin: '300px 0px' });

// 同名作品：去掉方括号 / 圆括号里的社团、汉化组、「中國翻譯」这些，比较剩下的正文
function titleCore(name) {
  return String(name || '')
    .replace(/[\[【［(（{][^\]】］)）}]*[\]】］)）}]/g, '')
    .replace(/[\s!！?？。、，,.·~～♡♥☆★:：|｜\-_]+/g, '')
    .toLowerCase();
}
function sameTitleOnShelf(item) {
  const core = titleCore(item.name);
  if (core.length < 5) return null;
  return shelfItems.find((b) => {
    if (b.id === item.id) return false;
    const c = b._core || (b._core = titleCore(b.name));
    return c.length >= 5 && (c.includes(core) || core.includes(c));
  }) || null;
}

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

  // 书架上有同一部作品的其他版本（别的汉化组、无修正版……）：标一下，免得重复下
  const twin = sameTitleOnShelf(item);
  if (twin && !shelfItems.some((b) => b.id === item.id)) {
    const badge = document.createElement('span');
    badge.className = 'owned twin';
    badge.textContent = '书架有同名';
    badge.title = `书架上的《${twin.name}》可能是同一部`;
    card.querySelector('.cover').appendChild(badge);
  }

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
  $$('[data-search-mode]').forEach((btn) => {
    btn.textContent = mode === 'or' ? '或' : '与';
    btn.title = mode === 'or' ? '多个词：包含其一（点一下切换）' : '多个词：同时包含（点一下切换）';
    btn.setAttribute('aria-label', btn.title);
  });
  if (typeof shelfItems !== 'undefined' && shelfQuery.trim().includes(' ')) renderShelf();
}
const toggleSearchMode = () => {
  setPref('jm-search-mode', pref('jm-search-mode') === 'or' ? 'and' : 'or');
  toast(pref('jm-search-mode') === 'or' ? '多个词：包含其一' : '多个词：同时包含');
};
$('#shelf-mode').onclick = toggleSearchMode;
$('#search-mode').onclick = () => {
  toggleSearchMode();
  // 已经搜了多个词的话，换了模式马上重搜
  const q = $('#search-input').value.trim();
  if (q.includes(' ') && !ID_INPUT.test(q) && $('#search-results').children.length) doSearch(1);
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
$('#mine-prefs').onclick = openPrefsSheet;

async function refreshMine() {
  await Promise.all([loadBlacklist(), loadFavorites()]);
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
/* ---- 单本的后台活：压缩画质、导出 ZIP / PDF ---- */
const JOB_NAMES = { compress: '压缩画质', zip: '导出 ZIP', pdf: '导出 PDF' };

async function runJob(id, kind, onProgress) {
  let job = await api.post('/api/album/job', { id, kind });
  while (!job.error && job.state === 'running') {
    if (onProgress) onProgress(job);
    await new Promise((r) => setTimeout(r, 800));
    job = await api.get(`/api/album/job?id=${id}&kind=${kind}`);
  }
  if (job.error || job.state === 'error') {
    toast(`${JOB_NAMES[kind]}失败：${job.error || '未知错误'}`);
    return null;
  }
  return job;
}

// 导出好的文件：安卓走系统分享，网页直接下载
function deliverFile(job) {
  if (hasNative('shareFile') && native('shareFile', job.path)) return;
  const a = document.createElement('a');
  a.href = '/backups/' + encodeURIComponent(job.name);
  a.download = job.name;
  a.click();
  toast(`已导出 ${job.name}`);
}

async function openSpaceSheet(book) {
  $('#sheet-title').textContent = '空间';
  const body = $('#sheet-body');
  body.innerHTML = '';
  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = '压缩画质：每页缩到最宽 1200 像素、重新压一遍，一般能省一半左右，手机上看不太出来；'
    + '只换真变小了的图，原图不保留。导出的 ZIP / PDF 可以存到别处，再从书架删掉省空间。';
  body.appendChild(tip);
  const status = document.createElement('p');
  status.className = 'hint center';
  const row = document.createElement('div');
  row.className = 'sheet-actions';
  for (const kind of ['compress', 'zip', 'pdf']) {
    const b = document.createElement('button');
    b.className = kind === 'compress' ? 'primary' : 'ghost';
    b.textContent = JOB_NAMES[kind];
    b.onclick = async () => {
      if (kind === 'compress' && !await confirmDialog({
        title: '压缩这本的画质？', message: '原图不保留，压完不能恢复。', ok: '压缩',
      })) return;
      row.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      const job = await runJob(book.id, kind, (j) => {
        status.textContent = `${JOB_NAMES[kind]}中… ${j.done}/${j.total || '?'} 页`;
      });
      row.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      if (!job) { status.textContent = ''; return; }
      if (kind === 'compress') {
        status.textContent = `压好了，省下 ${formatSize(job.freed)}`;
        toast(`省下 ${formatSize(job.freed)}`);
      } else {
        status.textContent = `导出好了：${job.name}`;
        deliverFile(job);
      }
    };
    row.appendChild(b);
  }
  body.append(row, status);
  $('#sheet').classList.remove('hidden');
}

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

  // 建议清理：读完了、而且一个月没打开过的，大的在前
  const MONTH = 30 * 86400000;
  const stale = s.books.filter((x) => {
    const book = shelfItems.find((b) => b.id === x.id);
    return book && !hiddenIds.has(x.id) && readState(book) === 'finished'
      && Date.now() - lastRead(x.id) > MONTH;
  });
  if (stale.length) {
    const h = document.createElement('p');
    h.className = 'pick-title';
    h.textContent = `建议清理 · 读完且一个月没打开的 ${stale.length} 本（${formatSize(stale.reduce((n, x) => n + x.size, 0))}）`;
    list.appendChild(h);
    for (const b of stale) {
      const book = shelfItems.find((x) => x.id === b.id);
      addRow(b.name, `${formatSize(b.size)} · ${timeAgo(lastRead(b.id))}看完`
        + (book.rating != null ? ` · ★ ${book.rating.toFixed(1)}` : ''),
      iconButton('box', '压缩或导出', 'del'), () => { closeSheet(); openSpaceSheet(book); });
    }
    const h2 = document.createElement('p');
    h2.className = 'pick-title';
    h2.textContent = '全部（按占用从大到小）';
    list.appendChild(h2);
  }

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

function backupBody() {
  return {
    // 分组和黑名单在服务端，阅读进度只存在这边的本地存储里，一起带过去
    progress: collectLocal('jm-pos-'),
    read: collectLocal('jm-read-'),
    opens: collectLocal('jm-opens-'),
    settings: {
      fitHeight: localStorage.getItem('jm-fit-height'),
      shelfSort: localStorage.getItem('jm-shelf-sort'),
    },
  };
}

// 每周自动备份一次（打开 App 时检查），只留最近 4 份，不打扰
async function autoBackup() {
  const last = parseInt(localStorage.getItem('jm-auto-backup-at') || '0', 10);
  if (Date.now() - last < 7 * 86400 * 1000) return;
  const res = await api.post('/api/backup/export', { ...backupBody(), auto: true }).catch(() => null);
  if (res && !res.error) localStorage.setItem('jm-auto-backup-at', String(Date.now()));
}
setTimeout(autoBackup, 20000);

async function exportBackup() {
  const res = await api.post('/api/backup/export', backupBody());
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
  for (const [id, n] of Object.entries(res.opens || {})) {
    if (n > openCount(id)) localStorage.setItem('jm-opens-' + id, String(n));
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
$('#mine-transfer').onclick = () => openTransferSheet();   // io.js 里定义，比这里晚加载
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
$('#mine-settings').onclick = () => { openSettings(); loadCriteria(); };
$('#set-criteria').onclick = openCriteriaSheet;
$('#mine-stats').onclick = openStatsSheet;

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
