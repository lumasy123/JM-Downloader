/* 黑名单、收藏、反感、评分：名单数据、拉黑 / 收藏弹窗、喜好管理弹层、评分窗口。
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
// 反感的标签：不是拉黑，本子照样显示；搜索排序按「收藏标签数 - 反感标签数」
let dislikeTags = [];
let dislikeTagSet = new Set();

function applyFavorites(res) {
  favTags = res.tags || [];
  favTagSet = new Set(favTags.map(normTag));
  favAuthors = res.authors || [];
  favAuthorSet = new Set(favAuthors.map(normTag));
  dislikeTags = res.dislikes || [];
  dislikeTagSet = new Set(dislikeTags.map(normTag));
}

async function loadFavorites() {
  applyFavorites(await api.get('/api/favorites'));
}

// 一个标签只能在收藏、反感、拉黑其中一种里；作者只能收藏或拉黑其中一种
const TAG_HOMES = [
  { list: 'fav', kind: 'tags', label: '收藏', full: '收藏标签', set: () => favTagSet },
  { list: 'fav', kind: 'dislikes', label: '反感', full: '反感标签', set: () => dislikeTagSet },
  { list: 'black', kind: 'tags', label: '拉黑', full: '拉黑标签', set: () => blockedTagSet, danger: true },
];
const AUTHOR_HOMES = [
  { list: 'fav', kind: 'authors', label: '收藏', full: '收藏作者', set: () => favAuthorSet },
  { list: 'black', kind: 'authors', label: '拉黑', full: '拉黑作者', set: () => blockedAuthorSet, danger: true },
];

// 要加的名字已经在另一种名单里：弹窗问放到哪一种。返回 { keep: 照原样加的, moves: [[名单, 名字]], changed: 挪了几个 }
async function resolveHomes(list, kind, add, known = []) {
  const homes = kind === 'authors' ? AUTHOR_HOMES : TAG_HOMES;
  const target = homes.find((h) => h.list === list && h.kind === kind);
  const skip = new Set(known.map(normTag));
  const keep = [];
  const moves = [];
  const notes = [];
  for (const name of add) {
    const k = normTag(name);
    const other = homes.find((h) => h !== target && h.set().has(k));
    if (!target || !other || skip.has(k)) { keep.push(name); continue; }
    const choice = await choiceDialog({
      title: `「${name}」已经在${other.full}里了`,
      message: kind === 'authors'
        ? '一位作者只能收藏或拉黑其中一种，要放到哪一种？'
        : '一个标签只能放在收藏、反感、拉黑其中一种里，要放到哪一种？',
      choices: homes.map((h) => ({ label: h.label, value: h, primary: h === target, danger: h.danger })),
    });
    if (!choice || choice === other) continue;   // 取消，或者选了原来那种：不动
    if (choice === target) keep.push(name); else moves.push([choice, name]);
    notes.push(`「${name}」从${other.full}移到了${choice.full}`);
  }
  return { keep, moves, notes };
}

// 黑名单 / 收藏 / 反感里的标签、作者一次加减一批，改完把界面上的标记刷新一遍。
// 要加的已经在别的名单里时先问放哪种（opts.known 里的是用户刚在弹窗里明确挑过的，不再问）。
// 返回 { moved }：从别的名单挪过来的名字
async function setNames(list, kind, add = [], remove = [], opts = {}) {
  const { keep, moves, notes } = opts.noAsk
    ? { keep: add, moves: [], notes: [] }
    : await resolveHomes(list, kind, add, opts.known);
  add = keep;
  for (const [home, name] of moves) await setNames(home.list, home.kind, [name], [], { noAsk: true });
  if (notes.length) toast(notes.join('；'));
  if (!add.length && !remove.length) return { moved: notes };
  const res = await api.post('/api/names', { list, kind, add, remove });
  if (res.error) { toast(res.error); return false; }
  const moved = [...notes, ...(res.moved || [])];
  applyBlacklist(res.blacklist);
  applyFavorites(res.favorites);
  feedStale = true;   // 收藏、拉黑变了，动态要重新取
  markAllCards();
  markDetailTags();
  updateNameCounts();
  return { moved };
}

async function openBlacklistSheet() {
  const items = await loadBlacklist();
  await loadFavorites();
  updateNameCounts();
  $('#sheet-title').textContent = '喜好管理';
  const list = $('#sheet-body');
  list.innerHTML = '';
  list.appendChild(prefTabs('black-books'));

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

/* ---- 标签按钮：点一下按这个标签搜（onTap 为空就只是个展示）。拉黑 / 收藏在卡片上的按钮里挑 ---- */
function bindTagPress(btn, tag, onTap) {
  btn.onclick = (e) => {
    e.stopPropagation();
    if (onTap) onTap();
  };
}

/* ---- 星级显示：精确到 0.1 颗，从左往右填，4.3 分就是 4 颗满 + 第 5 颗亮左边 3/10 ---- */
function starBar(value) {
  const el = document.createElement('span');
  el.className = 'stars';
  const fill = document.createElement('i');
  // 先取到一位小数，和旁边写的分数对得上（4.25 显示 4.3，就亮 4.3 颗）
  const v = Math.round(Math.max(0, Math.min(5, value || 0)) * 10) / 10;
  fill.style.width = v / 5 * 100 + '%';
  el.appendChild(fill);
  el.setAttribute('aria-label', value != null ? `${value.toFixed(1)} 分` : '还没打分');
  return el;
}

/* ---- 评分：自定义的几条标准，每条 0.5~5 分（可以打半颗星），平均分用来排序、筛选 ---- */
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

// 评分窗口：每条标准一排五颗星，能直接增删改评分项；底下是这本的笔记
async function openRatingSheet(book, onChange) {
  if (!ratingCriteria.length) await loadCriteria();
  $('#sheet-title').textContent = '评分和笔记';
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
  tip.textContent = '点第几颗星就是几分，再点同一颗变成半颗（比如点两下第 4 颗是 3.5 分），再点又回到整颗；综合分是各项的平均。点评分项的名字可以改名，点旁边的 × 删掉这一项。';

  // 笔记：只存在这台设备上，离开输入框就存
  const noteTitle = document.createElement('p');
  noteTitle.className = 'pick-title';
  noteTitle.textContent = '笔记';
  const note = document.createElement('textarea');
  note.className = 'note-input';
  note.rows = 3;
  note.maxLength = 2000;
  note.placeholder = '写点笔记……（只存在这台设备上）';
  const fresh = () => shelfItems.find((b) => b.id === book.id) || book;
  note.value = fresh().note || '';
  let savedNote = note.value.trim();
  const commitNote = async () => {
    const text = note.value.trim();
    if (text === savedNote) return;
    savedNote = text;
    if (await saveNote(book.id, text) && onChange) onChange();
  };
  note.onchange = commitNote;
  note.onblur = commitNote;
  body.append(edit, tip, noteTitle, note);
  refresh();
  $('#sheet').classList.remove('hidden');
}

// 评分项改名：打过的分跟着改名
async function renameCriterion(from, to) {
  to = String(to || '').trim();
  if (!to || to === from) return false;
  const res = await api.post('/api/rating/criteria/rename', { from, to });
  if (res.error) { toast(res.error); return false; }
  await loadCriteria();
  await loadShelf();
  return true;
}

// 删评分项前先问一句
async function confirmDropCriterion(c) {
  if (ratingCriteria.length <= 1) { toast('至少留一项'); return false; }
  return confirmDialog({
    title: `删掉评分项「${c}」？`,
    message: '各本书在这一项打过的分会留着，以后加回同名的评分项还在。',
    ok: '删除', danger: true,
  });
}

// 把一个名字元素原地换成输入框改名；回车或离开输入框就保存
function editCriterionInline(el, c, after) {
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 12;
  input.value = c;
  input.className = 'crit-edit';
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (save && await renameCriterion(c, input.value)) toast(`已改名为「${input.value.trim()}」`);
    after();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
  input.onclick = (e) => e.stopPropagation();
  el.replaceWith(input);
  input.focus();
  input.select();
}

async function saveCriteria(list) {
  const res = await api.post('/api/rating/criteria', { criteria: list });
  if (res.error) { toast(res.error); return false; }
  await loadCriteria();
  await loadShelf();   // 平均分跟着评分项变
  return true;
}

// 点第 n 颗星：没到这颗就打 n 分；正好 n 分就减成半颗（n - 0.5）；是半颗的再点回到 n 分
const nextScore = (cur, n) => (cur === n ? n - 0.5 : n);

// 一颗可以亮一半的星：底下一颗空心的，上面叠一颗实心的按宽度裁
function halfStar(frac, size) {
  return svg('star', size)
    + `<span class="sfill" style="width:${frac * size}px">${svg('star', size)}</span>`;
}

// 评分明细：每条标准一排五颗星，可以打半颗
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
  const redraw = () => {
    renderRatingBox(box, book, onChange);
    if (onChange) onChange();
  };
  for (const c of ratingCriteria) {
    const row = document.createElement('div');
    row.className = 'rating-row';
    const name = document.createElement('span');
    name.className = 'rating-name';
    const label = document.createElement('button');
    label.className = 'rname';
    label.textContent = c;
    label.title = '点一下改名';
    label.onclick = () => editCriterionInline(label, c, redraw);
    const del = document.createElement('button');
    del.className = 'rdel';
    del.innerHTML = svg('close', 12);
    del.setAttribute('aria-label', `删掉评分项「${c}」`);
    del.onclick = async () => {
      if (!await confirmDropCriterion(c)) return;
      if (await saveCriteria(ratingCriteria.filter((x) => x !== c))) redraw();
    };
    name.append(label, del);
    row.appendChild(name);
    const cur = (book.scores || {})[c] || 0;
    for (let n = 1; n <= 5; n++) {
      const star = document.createElement('button');
      const frac = Math.max(0, Math.min(1, cur - (n - 1)));
      star.className = 'rstar' + (frac > 0 ? ' on' : '');
      star.innerHTML = halfStar(frac, 22);
      star.setAttribute('aria-label', `${c} ${n} 分`);
      star.onclick = async () => {
        if (await setRating(book.id, c, nextScore(cur, n))) redraw();
      };
      row.appendChild(star);
    }
    const clear = document.createElement('button');
    clear.className = 'rclear' + (cur ? '' : ' invisible');
    clear.textContent = '清除';
    clear.setAttribute('aria-label', `清除「${c}」的分`);
    clear.onclick = async () => {
      if (await setRating(book.id, c, 0)) redraw();
    };
    row.appendChild(clear);
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
  tip.textContent = '每本书按这几条各打 0.5~5 分，书架按平均分排序、筛选。点名字改名，点 × 删掉一条（打过的分会留着，加回来还在）。';
  body.appendChild(tip);
  for (const c of ratingCriteria) {
    const item = document.createElement('div');
    item.className = 'sheet-item';
    const name = document.createElement('button');
    name.className = 'name rname';
    name.textContent = c;
    name.title = '点一下改名';
    name.onclick = () => editCriterionInline(name, c, openCriteriaSheet);
    const del = iconButton('close', `删掉「${c}」`, 'del');
    del.onclick = async () => {
      if (await confirmDropCriterion(c)) save(ratingCriteria.filter((x) => x !== c));
    };
    item.append(name, del);
    body.appendChild(item);
  }
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
  card.querySelectorAll('.tag').forEach(markTagClass);
}

function markTagClass(b) {
  const t = normTag(b.textContent);
  b.classList.toggle('bad', blockedTagSet.has(t));
  b.classList.toggle('fav', favTagSet.has(t));
  b.classList.toggle('dis', dislikeTagSet.has(t));
}

function markAllCards() {
  $$('.card').forEach(markTagBlocked);
}

function markDetailTags() {
  $$('.detail-tags .tag').forEach(markTagClass);
}

/* ---- 搜索卡片上的「拉黑」「收藏」：弹窗里勾这本的作者、标签（拉黑还能勾这一本）。
 * 收藏弹窗里的标签点一下收藏、再点一下改成反感、再点取消 ---- */
const TAG_STATES = ['', 'on', 'dis'];
async function openPickSheet(list, item) {
  const black = list === 'black';
  let tags = item.tags || null;
  const card = $$('.card').find((c) => c.dataset.id === item.id);
  if (!tags && card && card.dataset.tags) {
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
  const picks = [];   // { kind, name, was, chip }；was / 现在的状态：'' 没选、'on' 选中、'dis' 反感
  const stateOf = (chip) => TAG_STATES.find((s) => s && chip.classList.contains(s)) || '';

  const section = (title, entries, cycle) => {
    if (!entries.length) return;
    const h = document.createElement('p');
    h.className = 'pick-title';
    h.textContent = title;
    const box = document.createElement('div');
    box.className = 'pickchips';
    for (const [kind, name, was, preset] of entries) {
      const chip = document.createElement('button');
      chip.className = 'pickchip' + (preset ? ' ' + preset : '');
      chip.textContent = name;
      picks.push({ kind, name, was, chip });
      chip.onclick = () => {
        const cur = stateOf(chip);
        const next = cycle ? TAG_STATES[(TAG_STATES.indexOf(cur) + 1) % 3] : (cur ? '' : 'on');
        chip.classList.remove('on', 'dis');
        if (next) chip.classList.add(next);
      };
      box.appendChild(chip);
    }
    body.append(h, box);
  };

  if (black) section('这一本', [['book', item.name || ('JM' + item.id), blockedIds.has(item.id) ? 'on' : '', 'on']]);
  if (item.author) {
    const was = hasAuthor(authorSet, item.author) ? 'on' : '';
    section('作者', [['authors', item.author, was, was]]);
  }
  section('标签', tags.map((t) => {
    const k = normTag(t);
    const was = tagSet.has(k) ? 'on' : (!black && dislikeTagSet.has(k)) ? 'dis' : '';
    return ['tags', t, was, was];
  }), !black);

  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = black
    ? '点一下选中 / 取消。拉黑的作者、标签，之后搜索时带它们的本子都不显示；已拉黑的取消勾选就是解除。'
    : '标签点一下收藏，再点一下改成反感（红色），再点取消。搜索时按「收藏标签数 - 反感标签数」排序，有收藏作者的更前；收藏的作者出新本会出现在「动态」里。';
  body.appendChild(tip);

  const row = document.createElement('div');
  row.className = 'sheet-actions';
  const ok = document.createElement('button');
  ok.className = black ? 'primary danger' : 'primary';
  ok.textContent = black ? '确定拉黑' : '保存收藏';
  ok.onclick = async () => {
    ok.disabled = true;
    const diff = { tags: { add: [], remove: [] }, authors: { add: [], remove: [] }, dislikes: { add: [], remove: [] } };
    let bookChange = null;
    for (const p of picks) {
      const now = stateOf(p.chip);
      if (now === p.was) continue;
      if (p.kind === 'book') { bookChange = !!now; continue; }
      // 反感的标签单独一份名单；收藏 ↔ 反感互转时服务端会自动从另一边拿走
      const kindOf = (st) => (p.kind === 'tags' && st === 'dis' ? 'dislikes' : p.kind);
      if (now) diff[kindOf(now)].add.push(p.name);
      else diff[kindOf(p.was)].remove.push(p.name);
    }
    const known = picks.filter((p) => p.was).map((p) => p.name);
    let moved = 0;
    for (const kind of ['tags', 'authors', 'dislikes']) {
      if (diff[kind].add.length || diff[kind].remove.length) {
        const res = await setNames(list, kind, diff[kind].add, diff[kind].remove, { known });
        if (res) moved += res.moved.length;
      }
    }
    if (bookChange !== null) await toggleBlock(item, true);
    $('#sheet').classList.add('hidden');
    if (moved) return;   // 已经提示过「移到了…」
    const added = [...diff.tags.add, ...diff.authors.add];
    const n = added.length + (bookChange ? 1 : 0);
    const removed = diff.tags.remove.length + diff.authors.remove.length;
    if (!n && !removed && bookChange === null && !diff.dislikes.add.length && !diff.dislikes.remove.length) return;
    if (black) {
      toast(n ? `已拉黑 ${n} 项，下次搜索起不再显示` : '已更新黑名单');
    } else if (!(added.length && window.petFavorited
      && petFavorited({ tags: diff.tags.add, authors: diff.authors.add }))) {
      toast(added.length ? `已收藏 ${added.length} 项`
        : diff.dislikes.add.length ? `已把 ${diff.dislikes.add.length} 个标签标成反感` : '已更新喜好');
    }
  };
  row.appendChild(ok);
  body.appendChild(row);
  $('#sheet').classList.remove('hidden');
}

/* ---- 喜好管理：本子黑名单、拉黑的标签 / 作者、收藏的标签 / 作者、反感的标签，一个弹层里切换 ---- */
const NAME_LISTS = {
  'black-tags': {
    list: 'black', kind: 'tags', title: '标签黑名单', short: '拉黑标签', unit: '个',
    placeholder: '输入要拉黑的标签', tip: '点一下移出黑名单。',
    empty: '还没有拉黑任何标签。在搜索结果里点「拉黑」，可以挑这本的标签拉黑。',
  },
  'black-authors': {
    list: 'black', kind: 'authors', title: '作者黑名单', short: '拉黑作者', unit: '位',
    placeholder: '输入要拉黑的作者', tip: '点一下移出黑名单。',
    empty: '还没有拉黑任何作者。在搜索结果里点「拉黑」，可以把这本的作者拉黑。',
  },
  'fav-tags': {
    list: 'fav', kind: 'tags', title: '收藏的标签', short: '收藏标签', unit: '个',
    placeholder: '输入要收藏的标签', tip: '点一下取消收藏。搜索时按「收藏标签数 - 反感标签数」排序，越多越前。',
    empty: '还没有收藏标签。在搜索结果里点「收藏」，可以挑喜欢的标签。',
  },
  'fav-authors': {
    list: 'fav', kind: 'authors', title: '收藏的作者', short: '收藏作者', unit: '位',
    placeholder: '输入要收藏的作者', tip: '点一下取消收藏。搜索时这些作者的本子排在前面，「动态」里能看到他们的新本。',
    empty: '还没有收藏作者。在搜索结果里点「收藏」，可以收藏这本的作者。',
  },
  'fav-dislikes': {
    list: 'fav', kind: 'dislikes', title: '反感的标签', short: '反感标签', unit: '个',
    placeholder: '输入反感的标签',
    tip: '点一下取消反感。反感不是拉黑：带这些标签的本子照样显示，只是搜索时往后排（每个反感标签抵掉一个收藏标签）。',
    empty: '还没有反感的标签。反感不是拉黑：带这些标签的本子照样显示，只是搜索时往后排。在搜索结果里点「收藏」，标签点两下就是反感。',
  },
};
const namesOf = (key) => ({
  'black-tags': blacklistTags, 'black-authors': blacklistAuthors,
  'fav-tags': favTags, 'fav-authors': favAuthors, 'fav-dislikes': dislikeTags,
})[key];

// 「我的」里那一行的摘要：收藏、反感、拉黑各多少
function updateNameCounts() {
  const el = $('#mine-prefs-count');
  if (!el) return;
  const fav = favTags.length + favAuthors.length;
  const black = blockedIds.size + blacklistTags.length + blacklistAuthors.length;
  const parts = [];
  if (fav) parts.push(`收藏 ${fav}`);
  if (dislikeTags.length) parts.push(`反感 ${dislikeTags.length}`);
  if (black) parts.push(`拉黑 ${black}`);
  el.textContent = parts.join(' · ') || '收藏 · 反感 · 拉黑';
}

// 喜好管理顶上的一排切换
const PREF_TABS = [
  ['fav-tags'], ['fav-authors'], ['fav-dislikes'], ['black-tags'], ['black-authors'], ['black-books', '拉黑本子'],
];
function prefTabs(active) {
  const row = document.createElement('div');
  row.className = 'chips scroll pref-tabs';
  for (const [key, label] of PREF_TABS) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (key === active ? ' active' : '');
    const n = key === 'black-books' ? blockedIds.size : namesOf(key).length;
    chip.textContent = (label || NAME_LISTS[key].short) + (n ? ` ${n}` : '');
    chip.onclick = () => {
      if (key === active) return;
      localStorage.setItem('jm-pref-tab', key);
      if (key === 'black-books') openBlacklistSheet(); else openNameSheet(key);
    };
    row.appendChild(chip);
  }
  requestAnimationFrame(() => {
    const on = row.querySelector('.active');
    if (on) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  return row;
}

// 打开喜好管理：回到上次看的那一页
function openPrefsSheet() {
  const key = localStorage.getItem('jm-pref-tab') || 'fav-tags';
  if (key === 'black-books') openBlacklistSheet(); else openNameSheet(NAME_LISTS[key] ? key : 'fav-tags');
}

async function openNameSheet(key) {
  const cfg = NAME_LISTS[key];
  await Promise.all([loadBlacklist(), loadFavorites()]);
  const names = namesOf(key);
  updateNameCounts();
  $('#sheet-title').textContent = '喜好管理';
  const body = $('#sheet-body');
  body.innerHTML = '';
  body.appendChild(prefTabs(key));

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
  tip.textContent = names.length ? `${cfg.title} ${names.length} ${cfg.unit}。${cfg.tip}` : cfg.empty;
  body.appendChild(tip);

  if (names.length) {
    const chips = document.createElement('div');
    chips.className = 'tagchips';
    for (const name of names) {
      const chip = document.createElement('button');
      chip.className = 'tagchip';
      chip.innerHTML = '<span></span>' + svg('close', 14);
      chip.querySelector('span').textContent = name;
      chip.title = cfg.list === 'black' ? '移出黑名单' : cfg.kind === 'dislikes' ? '取消反感' : '取消收藏';
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
