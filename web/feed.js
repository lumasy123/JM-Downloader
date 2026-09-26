/* 探索（下载页按收藏标签挑 15 本）和「动态」页（连载更新、关注作者、关注标签）。
 * 在 app.js 之后加载：要用到 app.js 里的 $、api、makeCard 这些。
 */

/* ------------------------------------------------------------ 收藏推荐（空状态用） */
// 还没收藏的时候，别只写一句话：把书架上出现最多的标签、作者摆出来，一点就收藏
const NOT_TOPIC = new Set(['中文', '漢化', '汉化', '日語', '日语', '日文', '英語', '英语', '英文', '韓語', '韩语']);
function shelfTop(kind, n = 10) {
  const count = new Map();
  for (const b of shelfItems) {
    const names = kind === 'tags' ? (b.tags || []) : (b.author ? [b.author] : []);
    for (const t of names) if (!NOT_TOPIC.has(String(t).trim())) count.set(t, (count.get(t) || 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, n);
}
function favSuggest(kind, onAdded) {
  const box = document.createElement('div');
  box.className = 'suggest';
  const title = document.createElement('p');
  title.className = 'pick-title';
  const set = kind === 'tags' ? favTagSet : favAuthorSet;
  const top = shelfTop(kind).filter(([t]) => !set.has(normTag(t)));
  title.textContent = top.length
    ? `书架上常见的${kind === 'tags' ? '标签' : '作者'}，点一下就收藏：`
    : `书架上还没有能推荐的${kind === 'tags' ? '标签' : '作者'}，去搜索结果里点「收藏」挑吧。`;
  box.appendChild(title);
  const chips = document.createElement('div');
  chips.className = 'pickchips';
  for (const [name, n] of top) {
    const chip = document.createElement('button');
    chip.className = 'pickchip';
    chip.textContent = `${name} · ${n}`;
    chip.onclick = async () => {
      chip.disabled = true;
      await setNames('fav', kind, [name]);
      chip.classList.add('on');
      if (onAdded) onAdded();
    };
    chips.appendChild(chip);
  }
  box.appendChild(chips);
  const manage = document.createElement('button');
  manage.className = 'ghost';
  manage.textContent = kind === 'tags' ? '管理收藏的标签' : '管理收藏的作者';
  manage.onclick = () => openNameSheet(kind === 'tags' ? 'fav-tags' : 'fav-authors');
  box.appendChild(manage);
  return box;
}

/* ------------------------------------------------------------ 探索 */
// 按收藏的标签挑 15 本还没下载的，命中收藏标签越多越靠前；「换一批」不和这一轮已经给过的重复。
// 这一批显示出来时，下一批就在后台开始挑，点「换一批」基本不用等
const exploreSeen = new Set();
let explorePrefetch = null;   // { promise, done }

function fetchExplore() {
  const job = { done: false };
  job.promise = api.post('/api/explore', { exclude: [...exploreSeen] })
    .catch(() => ({ error: '网络错误' }))
    .then((res) => { job.done = true; return res; });
  return job;
}

async function doExplore(more = false) {
  await Promise.all([loadBlacklist(), loadFavorites()]);
  const box = $('#search-results');
  const hint = $('#search-hint');
  $('#pager').classList.add('hidden');
  $('#search-history').classList.add('hidden');
  const oldBar = $('#direct-bar');
  if (oldBar) oldBar.remove();
  $('#view-download').scrollTop = 0;
  if (!favTags.length) {
    // 没收藏标签：直接给出推荐，点完就能探索
    hint.textContent = '探索是按你收藏的标签挑本子的，先收藏几个吧。';
    box.replaceChildren(favSuggest('tags'));
    const go = document.createElement('button');
    go.className = 'primary wide explore-go';
    go.textContent = '收藏好了，开始探索';
    go.onclick = () => doExplore(false);
    box.appendChild(go);
    return;
  }
  if (!more) { exploreSeen.clear(); explorePrefetch = null; }

  let job = more && explorePrefetch ? explorePrefetch : fetchExplore();
  explorePrefetch = null;
  if (!job.done) {
    hint.textContent = '正在按收藏的标签帮你挑……';
    renderSearchSkeleton();
    if (more) toast('正在帮你挑下一批，马上好~');
  }
  let res = await job.promise;
  // 预取那批是按当时的「已看过」算的；万一和现在重复（比如中途又搜了别的），重新挑
  if (!res.error && (res.items || []).some((it) => exploreSeen.has(it.id))) {
    res = await fetchExplore().promise;
  }
  box.innerHTML = '';
  if (res.error && !(res.items || []).length) {
    hint.textContent = '探索失败：' + res.error;
    return;
  }
  res.items.forEach((it) => {
    exploreSeen.add(it.id);
    const card = makeCard(it);
    const info = card.querySelector('.info');
    const hit = document.createElement('div');
    hit.className = 'upd';
    hit.textContent = `命中 ${it.fav_tags.length} 个收藏标签`;
    info.insertBefore(hit, info.querySelector('.tags'));
    box.appendChild(card);
  });
  hint.textContent = res.items.length
    ? `从「${(res.tags || []).join('」「')}」里挑的 ${res.items.length} 本 · 命中收藏标签越多越靠前`
    : '这一批没找到合适的，换一批试试';
  const pager = $('#pager');
  pager.innerHTML = '';
  const again = document.createElement('button');
  again.className = 'primary';
  again.textContent = '换一批';
  again.onclick = () => doExplore(true);
  pager.appendChild(again);
  pager.classList.remove('hidden');
  // 下一批现在就开始挑
  explorePrefetch = fetchExplore();
}
$('#btn-explore').onclick = () => doExplore(false);

/* ------------------------------------------------------------ 动态 */
// 三块分开取、先到先显示：书架连载更新、收藏作者的新本、（可选）和收藏标签最搭的新本。
// 服务端各缓存一小时，刚启动时还会在后台先算好
const FEED_BOXES = { updates: '#feed-updates', authors: '#feed-authors', tags: '#feed-tags' };
const feedData = {};        // part -> { items, built_at, new }
let feedStale = true;
let feedLoading = false;

// 动态分两栏：关注作者 / 关注标签；书架连载更新两栏都显示在最上面
function feedTab() {
  return pref('jm-feed-tab') === 'tags' ? 'tags' : 'authors';
}
function feedParts() {
  return ['updates', feedTab()];
}
$$('#feed-seg button').forEach((b) => {
  b.onclick = () => {
    setPref('jm-feed-tab', b.dataset.tab);
    renderFeed();
    if (!feedData[b.dataset.tab]) loadFeed(false);
  };
});

// 动态里一行一本：小封面、标题、作者和时间，右边下载 / 不感兴趣。点这一行去看完整的卡片
function feedRow(item, part) {
  const row = document.createElement('div');
  row.className = 'frow';
  row.dataset.id = item.id;
  row.innerHTML = `
    <span class="mimg fcover"><img loading="lazy" alt=""></span>
    <div class="finfo"><div class="fname"></div><div class="fmeta"></div></div>
    <div class="facts"></div>`;
  const img = row.querySelector('img');
  img.src = item.cover;
  img.onerror = () => { img.style.visibility = 'hidden'; };
  row.querySelector('.fname').textContent = item.name || ('JM' + item.id);
  const meta = row.querySelector('.fmeta');
  if (part === 'updates') {
    meta.textContent = `本地 ${item.local} 话 → 现在 ${item.remote} 话`;
  } else {
    meta.textContent = [item.author,
      item.updated ? timeAgo(item.updated * 1000) + '更新' : '一个月内',
      part === 'tags' && item.fav_tags ? `命中 ${item.fav_tags.length} 个收藏标签` : '',
    ].filter(Boolean).join(' · ');
  }

  const acts = row.querySelector('.facts');
  const dl = document.createElement('button');
  dl.className = 'fdl';
  const owned = shelfItems.find((b) => b.id === item.id);
  if (part === 'updates') {
    dl.textContent = `补 ${item.remote - item.local} 话`;
  } else if (owned && owned.complete) {
    dl.textContent = '已下载';
    dl.disabled = true;
  } else {
    dl.textContent = owned ? '继续' : '下载';
  }
  dl.onclick = async (e) => {
    e.stopPropagation();
    dl.disabled = true;
    const res = await api.post('/api/download', { id: item.id });
    if (res.error) { toast(res.error); dl.disabled = false; return; }
    dl.textContent = '已加入';
    pollTasks();
  };
  acts.appendChild(dl);

  // 不感兴趣：这本不再出现在动态里，顺手可以去拉黑作者或标签
  if (part !== 'updates') {
    const nope = document.createElement('button');
    nope.className = 'fnope';
    nope.innerHTML = svg('close', 16);
    nope.title = '不感兴趣';
    nope.setAttribute('aria-label', '不感兴趣');
    nope.onclick = async (e) => {
      e.stopPropagation();
      await api.post('/api/feed/dismiss', { id: item.id });
      row.remove();
      Object.values(feedData).forEach((d) => { d.items = d.items.filter((x) => x.id !== item.id); });
      snackbar('不再显示这本', '拉黑作者 / 标签', () => openPickSheet('black', item), 6000);
    };
    acts.appendChild(nope);
  }
  // 点这一行：到下载页按 JM 号查出完整卡片（标签、拉黑、收藏都在那）
  row.onclick = () => {
    switchView('download');
    $('#search-input').value = 'JM' + item.id;
    doSearch(1);
  };
  return row;
}

function renderFeed() {
  const tab = feedTab();
  $$('#feed-seg button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const ups = (feedData.updates || {}).items || [];
  $('#feed-updates').replaceChildren(...ups.map((it) => feedRow(it, 'updates')));
  $('#feed-updates-title').classList.toggle('hidden', !ups.length);
  for (const part of ['authors', 'tags']) {
    const box = $(FEED_BOXES[part]);
    box.classList.toggle('hidden', part !== tab);
    box.replaceChildren(...(part === tab ? ((feedData[part] || {}).items || []).map((it) => feedRow(it, part)) : []));
  }

  const items = (feedData[tab] || {}).items || [];
  const hint = $('#feed-tab-hint');
  const empty = $('#feed-empty');
  const noFav = tab === 'authors' ? !favAuthors.length : !favTags.length;
  empty.replaceChildren(...(noFav ? [favSuggest(tab, () => { feedStale = true; })] : []));
  if (feedLoading && !feedData[tab]) {
    hint.textContent = tab === 'tags' ? '正在按收藏的标签找新本……要逐本查标签，第一次会慢一点' : '正在查收藏作者的新本……';
  } else if (tab === 'authors' && !favAuthors.length) {
    hint.textContent = '还没有收藏作者。收藏了的作者一个月内出的新本会出现在这里。';
  } else if (tab === 'tags' && !favTags.length) {
    hint.textContent = '还没有收藏标签。收藏以后这里会找一个月内和收藏标签最搭的新本。';
  } else if (!items.length) {
    hint.textContent = '近 30 天没有新本';
  } else {
    hint.textContent = tab === 'authors' ? '收藏作者近 30 天的新本' : '和收藏标签重合越多越靠前 · 近 30 天';
  }
  const built = (feedData[tab] || {}).built_at;
  $('#feed-hint').textContent = built ? `${timeAgo(built * 1000)}更新 · 点右上角刷新` : '';
}

async function loadFeed(force = false) {
  if (feedLoading) return;
  feedLoading = true;
  renderFeed();
  try {
    for (const part of feedParts()) {
      if (part === 'authors' && !favAuthors.length) { feedData.authors = { items: [] }; continue; }
      if (part === 'tags' && !favTags.length) { feedData.tags = { items: [] }; continue; }
      const res = await api.get(`/api/feed?part=${part}&force=${force ? 1 : 0}`).catch(() => ({ error: '网络错误' }));
      if (res.error) { toast('动态获取失败：' + res.error); continue; }
      feedData[part] = res;
      renderFeed();   // 每到一块就先显示
    }
    feedStale = false;
  } finally {
    feedLoading = false;
    renderFeed();
  }
}

async function openFeed() {
  await Promise.all([loadBlacklist(), loadFavorites()]);
  // 数据过期了、或者当前这栏还没取过（比如启动时只在后台取了连载那块），就去取
  if (feedStale || feedParts().some((p) => !feedData[p])) await loadFeed(false);
  else renderFeed();
  // 进了动态页就算看过了：红点消掉，这些新本不再提醒
  const keys = ['updates', 'authors'].flatMap((p) => ((feedData[p] || {}).items || []).map((x) => x.key || x.id));
  if (keys.length) api.post('/api/feed/seen', { ids: keys });
  $('#feed-dot').classList.remove('on');
}
$('#feed-refresh').onclick = () => loadFeed(true);

// App 开着的时候，隔一阵看看：收藏作者出新本、书架连载出新章节，底栏「动态」亮红点，看板娘提醒
async function checkFeed() {
  if (currentView === 'feed') return;
  const fresh = [];
  for (const part of ['updates', 'authors']) {
    if (part === 'authors' && !favAuthors.length) continue;
    const res = await api.get(`/api/feed?part=${part}`).catch(() => null);
    if (!res || res.error) continue;
    feedData[part] = res;
    fresh.push(...res.items.filter((x) => (res.new || []).includes(x.key || x.id)).map((x) => ({ ...x, part })));
  }
  // 标签那块最慢：顺手在后台算好，进动态页时直接有
  if (favTags.length) {
    api.get('/api/feed?part=tags').then((res) => { if (!res.error) feedData.tags = res; }).catch(() => {});
  }
  feedStale = false;
  if (!fresh.length) return;
  $('#feed-dot').classList.add('on');
  if (window.petFeed && petFeed(fresh)) return;
  const ups = fresh.filter((x) => x.part === 'updates').length;
  snackbar(ups === fresh.length ? `书架上有 ${ups} 本连载更新了` : `收藏的作者出了 ${fresh.length - ups} 本新本`
    + (ups ? `，${ups} 本连载有更新` : ''), '去看看', () => switchView('feed'), 8000);
}
setTimeout(async () => { await loadFavorites(); checkFeed(); }, 6000);
setInterval(checkFeed, 3 * 3600 * 1000);
