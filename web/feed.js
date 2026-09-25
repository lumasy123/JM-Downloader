/* 探索（下载页按收藏标签挑 15 本）和「动态」页（连载更新、关注作者、关注标签）。
 * 在 app.js 之后加载：要用到 app.js 里的 $、api、makeCard 这些。
 */

/* ------------------------------------------------------------ 探索 */
// 按收藏的标签挑 15 本还没下载的，命中收藏标签越多越靠前；「换一批」不和这一轮已经给过的重复
const exploreSeen = new Set();

async function doExplore(more = false) {
  await Promise.all([loadBlacklist(), loadFavorites()]);
  if (!favTags.length) {
    toast('先收藏几个标签：搜索结果里点「收藏」，挑喜欢的标签');
    return;
  }
  if (!more) exploreSeen.clear();
  const box = $('#search-results');
  const hint = $('#search-hint');
  $('#pager').classList.add('hidden');
  $('#search-history').classList.add('hidden');
  const oldBar = $('#direct-bar');
  if (oldBar) oldBar.remove();
  hint.textContent = '正在按收藏的标签找……';
  renderSearchSkeleton();
  $('#view-download').scrollTop = 0;
  const res = await api.post('/api/explore', { exclude: [...exploreSeen] }).catch(() => ({ error: '网络错误' }));
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

function feedCard(item, part) {
  const card = makeCard(item);
  const info = card.querySelector('.info');
  const when = document.createElement('div');
  when.className = 'upd';
  if (part === 'updates') {
    when.textContent = `本地 ${item.local} 话 → 现在 ${item.remote} 话`;
    // 已经下过的书：下载按钮改成补下新章节（已有的图会跳过）
    const dl = card.querySelector('.dl');
    dl.disabled = false;
    dl.textContent = `补下 ${item.remote - item.local} 话新章节`;
    dl.onclick = async () => {
      dl.disabled = true;
      const res = await api.post('/api/download', { id: item.id });
      if (res.error) { toast(res.error); dl.disabled = false; return; }
      dl.textContent = '已加入下载';
      pollTasks();
    };
  } else {
    when.textContent = (item.updated ? timeAgo(item.updated * 1000) + '更新' : '一个月内更新')
      + (part === 'tags' && item.fav_tags ? ` · 命中 ${item.fav_tags.length} 个收藏标签` : '');
  }
  info.insertBefore(when, info.querySelector('.tags'));

  // 不感兴趣：这本不再出现在动态里，顺手可以去拉黑作者或标签
  if (part !== 'updates') {
    const nope = document.createElement('button');
    nope.className = 'nope';
    nope.textContent = '不感兴趣';
    nope.onclick = async () => {
      await api.post('/api/feed/dismiss', { id: item.id });
      card.remove();
      Object.values(feedData).forEach((d) => { d.items = d.items.filter((x) => x.id !== item.id); });
      snackbar('不再显示这本', '拉黑作者 / 标签', () => openPickSheet('black', item), 6000);
    };
    card.querySelector('.acts').appendChild(nope);
  }
  return card;
}

function renderFeed() {
  const tab = feedTab();
  $$('#feed-seg button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const ups = (feedData.updates || {}).items || [];
  $('#feed-updates').replaceChildren(...ups.map((it) => feedCard(it, 'updates')));
  $('#feed-updates-title').classList.toggle('hidden', !ups.length);
  for (const part of ['authors', 'tags']) {
    const box = $(FEED_BOXES[part]);
    box.classList.toggle('hidden', part !== tab);
    box.replaceChildren(...(part === tab ? ((feedData[part] || {}).items || []).map((it) => feedCard(it, part)) : []));
  }

  const items = (feedData[tab] || {}).items || [];
  const hint = $('#feed-tab-hint');
  if (feedLoading && !feedData[tab]) {
    hint.textContent = tab === 'tags' ? '正在按收藏的标签找新本……要逐本查标签，第一次会慢一点' : '正在查收藏作者的新本……';
  } else if (tab === 'authors' && !favAuthors.length) {
    hint.textContent = '还没有收藏作者。在搜索结果里点「收藏」，收藏的作者一个月内出的新本会出现在这里。';
  } else if (tab === 'tags' && !favTags.length) {
    hint.textContent = '还没有收藏标签。在搜索结果里点「收藏」，这里会找一个月内和收藏标签最搭的新本。';
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
