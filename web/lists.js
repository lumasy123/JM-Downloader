/* 黑名单、收藏、评分：名单数据、拉黑 / 收藏弹窗、名单管理弹层、评分窗口。
 * 在 app.js 之前加载：这里只有函数和变量，顶层不执行任何东西，app.js 加载时就能直接引用。
 */

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
  feedStale = true;   // 收藏、拉黑变了，动态要重新取
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

/* ---- 评分：自定义的几条标准，每条 1~5 分，平均分用来排序、筛选 ---- */
let ratingCriteria = [];

async function loadCriteria() {
  const res = await api.get('/api/ratings');
  ratingCriteria = res.criteria || [];
  const v = $('#criteria-value');
  if (v) v.textContent = ratingCriteria.join(' · ');
  return ratingCriteria;
}

async function setRating(id, criterion, score) {
  const res = await api.post('/api/rating', { id, criterion, score });
  if (res.error) { toast(res.error); return null; }
  const book = shelfItems.find((b) => b.id === id);
  if (book) {
    book.scores = res.scores;
    book.rating = res.rating;
  }
  if (window.petRated) petRated(res.rating, book);
  return res;
}

// 评分窗口：每条标准一排五颗星，底下能直接增删评分项
async function openRatingSheet(book, onChange) {
  if (!ratingCriteria.length) await loadCriteria();
  $('#sheet-title').textContent = '评分';
  const body = $('#sheet-body');
  body.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'rating-box';
  body.appendChild(box);
  const refresh = () => { renderRatingBox(box, book, onChange); };

  const edit = document.createElement('div');
  edit.className = 'input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 12;
  input.placeholder = '加一条评分项，例如：画面';
  const add = document.createElement('button');
  add.className = 'primary icon-only';
  add.innerHTML = svg('plus', 20);
  add.setAttribute('aria-label', '添加评分项');
  add.onclick = async () => {
    const c = input.value.trim();
    if (!c) return toast('请输入评分项名称');
    if (ratingCriteria.length >= 8) return toast('最多 8 项');
    if (await saveCriteria([...ratingCriteria, c])) { input.value = ''; refresh(); }
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') add.click(); };
  edit.append(input, add);
  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = '点第几颗星就是几分，再点同一颗清掉；综合分是各项的平均。点评分项名字旁的 × 可以删掉这一项（打过的分会留着，加回来还在）。';
  body.append(edit, tip);
  refresh();
  $('#sheet').classList.remove('hidden');
}

async function saveCriteria(list) {
  const res = await api.post('/api/rating/criteria', { criteria: list });
  if (res.error) { toast(res.error); return false; }
  await loadCriteria();
  await loadShelf();   // 平均分跟着评分项变
  return true;
}

// 评分明细：每条标准一排五颗星，点第几颗就是几分，再点同一颗清掉
function renderRatingBox(box, book, onChange) {
  // 书架刷新后换成最新的那份数据
  book = shelfItems.find((b) => b.id === book.id) || book;
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'rating-head';
  const title = document.createElement('span');
  title.textContent = '评分';
  const avg = document.createElement('span');
  avg.className = 'rating-avg';
  avg.textContent = book.rating != null ? `综合 ${book.rating.toFixed(1)}` : '还没打分';
  head.append(title, avg);
  box.appendChild(head);
  for (const c of ratingCriteria) {
    const row = document.createElement('div');
    row.className = 'rating-row';
    const name = document.createElement('span');
    name.className = 'rating-name';
    name.textContent = c;
    const del = document.createElement('button');
    del.className = 'rdel';
    del.innerHTML = svg('close', 12);
    del.setAttribute('aria-label', `删掉评分项「${c}」`);
    del.onclick = async () => {
      if (ratingCriteria.length <= 1) return toast('至少留一项');
      if (await saveCriteria(ratingCriteria.filter((x) => x !== c))) {
        renderRatingBox(box, book, onChange);
        if (onChange) onChange();
      }
    };
    name.appendChild(del);
    row.appendChild(name);
    const cur = (book.scores || {})[c] || 0;
    for (let n = 1; n <= 5; n++) {
      const star = document.createElement('button');
      star.className = 'rstar' + (n <= cur ? ' on' : '');
      star.innerHTML = svg('star', 22);
      star.setAttribute('aria-label', `${c} ${n} 分`);
      star.onclick = async () => {
        if (await setRating(book.id, c, n === cur ? 0 : n)) {
          renderRatingBox(box, book, onChange);
          if (onChange) onChange();
        }
      };
      row.appendChild(star);
    }
    box.appendChild(row);
  }
}

// 设置里改评分标准
async function openCriteriaSheet() {
  await loadCriteria();
  $('#sheet-title').textContent = '评分标准';
  const body = $('#sheet-body');
  body.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 12;
  input.placeholder = '加一条标准，例如：画面';
  const add = document.createElement('button');
  add.className = 'primary icon-only';
  add.innerHTML = svg('plus', 20);
  add.setAttribute('aria-label', '添加');
  const save = async (list) => {
    const res = await api.post('/api/rating/criteria', { criteria: list });
    if (res.error) return toast(res.error);
    await loadCriteria();
    await loadShelf();   // 平均分跟着标准变
    openCriteriaSheet();
  };
  add.onclick = () => {
    const c = input.value.trim();
    if (!c) return toast('请输入标准名');
    if (ratingCriteria.length >= 8) return toast('最多 8 条');
    save([...ratingCriteria, c]);
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') add.click(); };
  row.append(input, add);
  body.appendChild(row);
  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = '每本书按这几条各打 1~5 分，书架按平均分排序、筛选。点一下去掉一条（打过的分会留着，加回来还在）。';
  body.appendChild(tip);
  const chips = document.createElement('div');
  chips.className = 'tagchips';
  for (const c of ratingCriteria) {
    const chip = document.createElement('button');
    chip.className = 'tagchip';
    chip.innerHTML = '<span></span>' + svg('close', 14);
    chip.querySelector('span').textContent = c;
    chip.onclick = () => {
      if (ratingCriteria.length <= 1) return toast('至少留一条');
      save(ratingCriteria.filter((x) => x !== c));
    };
    chips.appendChild(chip);
  }
  body.appendChild(chips);
  $('#sheet').classList.remove('hidden');
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
