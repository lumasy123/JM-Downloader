/* ------------------------------------------------------------ 一键遮挡 */
// 顶栏上的眼睛按钮一点：所有封面滑进一块纯色盖住，标签除了白名单（中文、汉化这类）全部盖掉。
// 标题、作者名不遮。标签是一直预先标好的（加 .mw-all），开关只切 body 的 masked，所以盖上去是一个动画。
(() => {
  // 不遮的标签：语言、出版形式这类说明性质的。繁简都列上，设置里还能自己加
  const DEFAULT_ALLOW = [
    '中文', '漢化', '汉化', '日語', '日语', '日文', '英語', '英语', '英文', '韓語', '韩语',
    '全彩', '彩色', '黑白', '同人', '原創', '原创', '短篇', '長篇', '长篇', '單行本', '单行本',
    '連載', '连载', '完結', '完结', '雜誌', '杂志', '畫集', '画集',
  ];
  // 书架卡片、详情页、搜索结果、标签黑名单里的标签
  const TAG_SEL = '.btags span, .detail-tags .tag, .card .tags .tag, .tagchip';

  let allow = new Set();
  function buildAllow() {
    const custom = (pref('jm-mask-allow') || '').split(/\s+/).filter(Boolean);
    allow = new Set([...DEFAULT_ALLOW, ...custom].map((t) => t.toLowerCase()));
  }
  function allowed(el) {
    const t = el.textContent.trim().toLowerCase();
    return allow.has(t) || /^c\d{2,3}$/.test(t);   // C108 这类 Comiket 场次也算说明性质
  }

  function mark(el) {
    if (el._mtext === el.textContent) return;
    el.classList.toggle('mw-all', !allowed(el));
    el._mtext = el.textContent;
  }
  function scan(root) {
    if (!(root instanceof Element)) return;
    if (root.matches(TAG_SEL)) mark(root);
    root.querySelectorAll(TAG_SEL).forEach(mark);
  }

  // 页面上新画出来的标签（书架、搜索结果、详情）都自动标一遍
  let pending = new Set();
  let queued = false;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.type === 'characterData' ? r.target.parentElement : r.target;
      if (t) pending.add(t.closest(TAG_SEL) || t);
    }
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const list = pending;
      pending = new Set();
      list.forEach(scan);
    });
  });

  /* ---------------- 顶栏按钮 */
  const EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
  const EYE_OFF = 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17.5 17.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2';
  const icon = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" `
    + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  const buttons = [];
  for (const sel of ['#shelf-top', '#view-download .topbar', '#view-tasks .topbar', '#view-feed .topbar',
    '#view-mine .topbar', '#view-detail .topbar', '#view-import .topbar']) {
    const bar = $(sel);
    if (!bar) continue;
    const b = document.createElement('button');
    b.className = 'icon-btn mask-btn';
    b.onclick = () => setPref('jm-mask', masked() ? '0' : '1');
    // 书架顶栏右边已有切换视图按钮，插在它前面；其他顶栏放最右
    const before = { '#shelf-top': $('#btn-view'), '#view-import .topbar': $('#imp-all'),
      '#view-feed .topbar': $('#feed-refresh') }[sel] || null;
    bar.insertBefore(b, before);
    buttons.push(b);
  }

  const masked = () => pref('jm-mask') === '1';
  let applied = null;
  window.maskApply = function maskApply() {
    const on = masked();
    document.body.classList.toggle('masked', on);
    for (const b of buttons) {
      b.innerHTML = icon(on ? EYE_OFF : EYE);
      b.title = on ? '取消遮挡' : '一键遮挡';
      b.setAttribute('aria-label', b.title);
      b.classList.toggle('on', on);
    }
    if (applied !== null && applied !== on) toast(on ? '有人来了？封面和标签都挡住啦！' : '安全了~遮挡已取消。');
    applied = on;
  };
  // 设置里改了白名单：重建，全部重新标一遍
  window.maskAllow = function maskAllow() {
    buildAllow();
    document.querySelectorAll(TAG_SEL).forEach((el) => { el._mtext = null; });
    scan(document.body);
  };

  buildAllow();
  scan(document.body);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  maskApply();
})();
