/* 号单导出 / 导入：选内容、复制文字或分享文件；导入预览里挑书和名单。
 * 在 app.js 之后加载。
 */

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

/* ---- 「我的」→ 导出 / 导入：一个弹层，顶上切换导出、导入，再挑要哪些内容 ---- */
function transferTabs(active) {
  const row = document.createElement('div');
  row.className = 'chips pref-tabs';
  for (const [key, label, open] of [['export', '导出', () => exportJmList(null)], ['import', '导入', openListImportSheet]]) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (key === active ? ' active' : '');
    chip.textContent = label;
    chip.onclick = () => { if (key !== active) open(); };
    row.appendChild(chip);
  }
  return row;
}
const openTransferSheet = () => exportJmList(null);

// 完整备份那一块：号单只有 JM 号和名单，备份文件还带分组、阅读进度、评分、笔记、书签
function backupBlock(isExport) {
  const box = document.createElement('div');
  box.className = 'backup-block';
  const h = document.createElement('p');
  h.className = 'pick-title';
  h.textContent = isExport ? '完整备份（文件）' : '从备份文件恢复';
  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = isExport
    ? '除了上面这些，还带分组、阅读进度、评分、笔记、书签，存成一个 .json 文件；换设备或重装后用「导入」恢复。'
    : '选之前「导出」的 .json 备份文件，分组、阅读进度、评分、笔记、书签都会合并回来，不会覆盖已有的。';
  const btn = document.createElement('button');
  btn.className = 'ghost wide';
  btn.textContent = isExport ? '导出备份文件' : '选择备份文件';
  btn.onclick = () => (isExport ? exportBackup() : $('#backup-file').click());
  box.append(h, tip, btn);
  return box;
}

// ids 为空：「我的」里的导出，整个书架和名单；多选时只导出选中的书
// 导出号单：先勾要导出的内容，再选「复制文字」（换设备最方便）或「分享 / 保存文件」
function exportJmList(ids) {
  $('#sheet-title').textContent = ids ? `导出选中的 ${ids.length} 本` : '导出 / 导入';
  const body = $('#sheet-body');
  body.innerHTML = '';
  if (!ids) {
    body.appendChild(transferTabs('export'));
    const h = document.createElement('p');
    h.className = 'pick-title';
    h.textContent = '号单（文字，可复制）';
    body.appendChild(h);
  }

  const parts = [
    ['shelf', ids ? '选中的书（JM 号）' : '书架（JM 号）', true],
    ['black', '黑名单（本子 · 标签 · 作者）', !ids],
    ['fav', '喜好（收藏的标签 · 作者，反感的标签）', !ids],
    ['groups', '书架分组', !ids],
    ['ratings', '评分和笔记', !ids],
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
  tip.textContent = '「复制文字」直接复制到剪贴板，发到另一台设备后，在那边「导出 / 导入」→「导入」里粘贴就行。';
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
  file.textContent = hasNative('shareFile') && !isDesktop() ? '分享文件' : '保存文件';
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
  if (!ids) body.appendChild(backupBlock(true));
  $('#sheet').classList.remove('hidden');
}

// 号单按「[书架]」「[黑名单·标签]」分段；没有分段的旧号单整段当书架
const LIST_SECTIONS = {
  书架: 'shelf',
  '黑名单·本子': 'black-books', '黑名单·标签': 'black-tags', '黑名单·作者': 'black-authors',
  '收藏·标签': 'fav-tags', '收藏·作者': 'fav-authors', '反感·标签': 'fav-dislikes',
  分组: 'groups', '评分·笔记': 'ratings',
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
      'fav-dislikes': lines('fav-dislikes'),
      // 分组：「分组名<Tab>JM号 JM号…」
      groups: lines('groups').map((l) => {
        const [name, rest = ''] = l.split('\t');
        return { name: name.trim().slice(0, 20), ids: parseJmList(rest).map((x) => x.id) };
      }).filter((g) => g.name),
      // 评分·笔记：「JM号<Tab>画面 4.5 · 剧情 3<Tab>笔记」
      ratings: lines('ratings').map((l) => {
        const [idPart, sc = '', note = ''] = l.split('\t');
        const id = (idPart.match(/\d+/) || [''])[0];
        const scores = {};
        for (const one of sc.split('·')) {
          const m = one.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
          if (m) scores[m[1].trim()] = Number(m[2]);
        }
        return { id, scores, note: note.trim() };
      }).filter((r) => r.id && (Object.keys(r.scores).length || r.note)),
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
  $('#sheet-title').textContent = '导出 / 导入';
  const body = $('#sheet-body');
  body.innerHTML = '';
  body.appendChild(transferTabs('import'));
  const h = document.createElement('p');
  h.className = 'pick-title';
  h.textContent = '号单（粘贴文字或选文件）';
  body.appendChild(h);
  const ta = document.createElement('textarea');
  ta.placeholder = '把另一台设备「复制文字」得到的号单粘贴到这里，\n也可以直接选一个号单文件。\n书、黑名单、喜好名单都会先给你预览，挑着导入';
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
  body.appendChild(backupBlock(false));
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
  'fav-tags': '收藏 · 标签', 'fav-authors': '收藏 · 作者', 'fav-dislikes': '反感 · 标签',
  groups: '书架分组', ratings: '评分 · 笔记',
};
// 这一项本机是不是已经有了
function nameHad(key, v) {
  if (key === 'groups' || key === 'ratings') return false;   // 合并导入：分组照着设，已打过的分不覆盖
  if (key === 'black-books') return blockedIds.has(v.id);
  if (key === 'black-tags') return blockedTagSet.has(normTag(v));
  if (key === 'black-authors') return blockedAuthorSet.has(normTag(v));
  if (key === 'fav-tags') return favTagSet.has(normTag(v));
  if (key === 'fav-dislikes') return dislikeTagSet.has(normTag(v));
  return favAuthorSet.has(normTag(v));
}
const nameKey = (key, v) => key + '|' + (typeof v === 'object' ? (v.id || v.name) : v);
// 名单项在界面上怎么写
function nameText(key, v) {
  if (key === 'black-books') return v.name || 'JM' + v.id;
  if (key === 'groups') return `${v.name}（${v.ids.length} 本）`;
  if (key === 'ratings') {
    const vals = Object.values(v.scores);
    const avg = vals.length ? ` ★${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}` : '';
    return `JM${v.id}${avg}${v.note ? ' · 有笔记' : ''}`;
  }
  return v;
}

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
      chip.textContent = nameText(key, v) + (had ? '（已有）' : '');
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
    ['fav-tags', 'fav', 'tags'], ['fav-authors', 'fav', 'authors'], ['fav-dislikes', 'fav', 'dislikes'],
  ]) {
    const add = pick(key);
    if (add.length) await setNames(list, kind, add);
  }
  for (const b of pick('black-books')) {
    await api.post('/api/blacklist/add', { id: b.id, name: b.name });
  }
  // 分组、评分、笔记：拼成备份的格式交给服务端合并（分组照着设，本机已有的分和笔记不覆盖）
  const groups = pick('groups');
  const ratings = pick('ratings');
  if (groups.length || ratings.length) {
    const assign = {};
    for (const g of groups) for (const id of g.ids) assign[id] = g.name;
    const scores = {};
    const notes = {};
    const criteria = new Set();
    for (const r of ratings) {
      if (Object.keys(r.scores).length) scores[r.id] = r.scores;
      Object.keys(r.scores).forEach((c) => criteria.add(c));
      if (r.note) notes[r.id] = r.note;
    }
    const res = await api.post('/api/backup/import', {
      app: 'jmshelf', groups: { groups: groups.map((g) => g.name), assign },
      ratings: { criteria: [...criteria], scores }, notes,
    });
    if (res.error) toast(res.error);
    await loadShelf();
    if (typeof loadCriteria === 'function') loadCriteria();
  }
  const n = importNamePick.size;
  importNamePick.clear();
  await loadBlacklist();
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

/* ---- 导入本地本子：一组图片、ZIP / CBZ、每页一张图的 PDF；电脑版还能直接选文件夹。
 * 文件一个个传给内置服务（带进度），服务端整理成和下载的一样的书，复制进书架（原文件删了也不影响） ---- */
const LOCAL_EXTS = /\.(jpe?g|png|webp|gif|zip|cbz|pdf)$/i;
function uploadImportFile(token, seq, name, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/import/file?token=${token}&seq=${seq}&name=${encodeURIComponent(name)}`);
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () => {
      let r = {};
      try { r = JSON.parse(x.responseText); } catch (_) { /* 下面按失败处理 */ }
      if (r.ok) resolve(); else reject(new Error(r.error || '上传失败'));
    };
    x.onerror = () => reject(new Error('上传失败'));
    x.send(file);
  });
}

function openLocalImportSheet() {
  let picked = [];   // [{ file, name }]
  $('#sheet-title').textContent = '导入本地本子';
  const body = $('#sheet-body');
  body.innerHTML = '';
  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.textContent = '可以选：一组图片（按文件名顺序排页）、ZIP / CBZ 压缩包（里面分了文件夹的按文件夹分话）、'
    + '每页一张图的 PDF。导入时会复制一份存进书架，原文件删掉也不影响。';
  body.appendChild(tip);

  const summary = document.createElement('p');
  summary.className = 'hint center';
  summary.textContent = '还没选文件';
  const picks = document.createElement('div');
  picks.className = 'sheet-actions import-picks';
  const makePick = (label, setup) => {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = label;
    btn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      setup(input);
      input.onchange = () => {
        const list = [...input.files].filter((f) => LOCAL_EXTS.test(f.name));
        if (!list.length) return toast('没有能导入的文件');
        // 选文件夹时带上子文件夹名，各话的页不会混在一起（服务端按名字自然排序）
        picked = list.map((f) => ({ file: f, name: (f.webkitRelativePath || f.name).split('/').slice(1).join('__') || f.name }));
        if (!input.webkitdirectory) picked = list.map((f) => ({ file: f, name: f.name }));
        const size = list.reduce((n, f) => n + f.size, 0);
        summary.textContent = `已选 ${list.length} 个文件，共 ${formatSize(size)}`;
        if (!title.value) {
          const first = list[0];
          title.value = input.webkitdirectory
            ? (first.webkitRelativePath || '').split('/')[0]
            : /\.(zip|cbz|pdf)$/i.test(first.name) ? first.name.replace(/\.[^.]+$/, '') : '';
        }
        go.disabled = false;
      };
      input.click();
    };
    picks.appendChild(btn);
  };
  makePick('选图片', (i) => { i.accept = 'image/*'; });
  makePick('选压缩包 / PDF', (i) => { i.accept = '.zip,.cbz,.pdf,application/zip,application/pdf'; });
  if (isDesktop()) makePick('选文件夹', (i) => { i.webkitdirectory = true; });
  body.append(picks, summary);

  const field = (label, placeholder) => {
    const h = document.createElement('p');
    h.className = 'pick-title';
    h.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'meta-input';
    input.placeholder = placeholder;
    body.append(h, input);
    return input;
  };
  const title = field('书名', '不填就叫「本地导入」');
  const author = field('作者', '可以不填');
  const tags = field('标签', '多个标签用空格隔开，可以不填');

  const progress = document.createElement('p');
  progress.className = 'hint center';
  const row = document.createElement('div');
  row.className = 'sheet-actions';
  const go = document.createElement('button');
  go.className = 'primary';
  go.textContent = '开始导入';
  go.disabled = true;
  go.onclick = async () => {
    go.disabled = true;
    picks.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const { token } = await api.post('/api/import/begin', {});
    const total = picked.reduce((n, p) => n + p.file.size, 0) || 1;
    let sent = 0;
    try {
      for (let i = 0; i < picked.length; i++) {
        const { file, name } = picked[i];
        await uploadImportFile(token, i, name, file, (loaded) => {
          progress.textContent = `上传中 ${Math.floor(((sent + loaded) / total) * 100)}%（${i + 1}/${picked.length}）`;
        });
        sent += file.size;
      }
      progress.textContent = '整理中……';
      const res = await api.post('/api/import/finish', {
        token, name: title.value.trim(), author: author.value.trim(), tags: tags.value.split(/\s+/).filter(Boolean),
      });
      if (res.error) throw new Error(res.error);
      closeSheet();
      toast(`已导入《${res.name}》，${res.pages} 页`);
      await loadShelf();
      openDetail(res.id);
    } catch (e) {
      api.post('/api/import/cancel', { token });
      progress.textContent = '';
      toast('导入失败：' + e.message);
      go.disabled = false;
      picks.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  };
  row.appendChild(go);
  body.append(progress, row);
  $('#sheet').classList.remove('hidden');
}
$('#mine-local-import').onclick = openLocalImportSheet;

$('#list-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) showImportList(await file.text());
});
$('#sel-export').onclick = () => {
  if (!selected.size) return toast('先选几本');
  exportJmList([...selected]);
};
