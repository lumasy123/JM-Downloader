/* ------------------------------------------------------------ 看板娘 */
// 站在底栏上的小人。平时三张图叠起来：身体、小鲸鱼（单独呼吸）、闭眼贴片（眨眼）；
// 做反应时整张换成对应的动作图。底栏上能看到她的时候，提示、通知、首次使用教程都由她来说，
// 有的气泡里带按钮（下载完「去看看」、失败「重试」）。台词在 pet-lines.json。
// 点她会跳一下说句话，左右拖能换位置，长按收起来，收起后点底栏上的小鲸鱼叫回来。
// 一阵子没人操作她就低头看手里的漫画，时不时评论两句，有些会拿书架上的标签、作者打趣。
(() => {
  const pet = $('#pet');
  const call = $('#pet-call');
  const bubble = pet.querySelector('.pet-bubble');
  const move = pet.querySelector('.pet-move');
  const sprite = pet.querySelector('.pet-sprite');

  const READ_AFTER = 30 * 1000;   // 这么久没人碰就开始看漫画
  // 动作图：pet-<名字>.webp，由 pet_src/make_poses.py 生成
  const POSES = ['happy', 'sad', 'angry', 'wave', 'explain', 'surprised', 'ok',
    'read', 'read-laugh', 'read-shock', 'read-talk', 'read-flip', 'tease', 'peek', 'think', 'giggle'];

  // 台词都在 pet-lines.json 里，改台词不用动代码。加载好之前她只做动作不说话
  let LINES = {};
  const linesReady = fetch('/pet-lines.json', { cache: 'no-cache' })
    .then((r) => r.json()).then((j) => { LINES = j; }).catch(() => {});
  const L = (key) => LINES[key] || [];
  const S = (key) => (LINES.shelf && LINES.shelf[key]) || [];
  const pick = (list) => (list.length ? list[Math.floor(Math.random() * list.length)] : undefined);
  const short = (name) => (name.length > 14 ? name.slice(0, 13) + '…' : name);
  // 说一句带动作的话：line 是 [动作, 话]，vars 填 {n}、{name} 这些；
  // action 是气泡里的按钮 { label, run }，比如下载失败时的「重试」
  function speak(line, vars, ms, action) {
    if (!line) return;
    const [p, raw] = line;
    const text = raw.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
    const dur = Math.max(ms || 2200 + text.length * 90, action ? 6500 : 0);   // 带按钮的多留一会儿，来得及点
    if (p) pose(p, dur);
    say(text, dur, action);
  }

  for (const name of POSES) {
    const img = document.createElement('img');
    img.src = `/pet-${name}.webp`;
    img.alt = '';
    img.draggable = false;
    img.className = 'pet-pose';
    img.dataset.pose = name;
    sprite.appendChild(img);
  }

  /* ---------------- 当前显示哪张图：临时动作 > 看漫画 > 平时 */
  let tempPose = null;
  let reading = false;
  function render() {
    const active = tempPose || (reading ? 'read' : null);
    pet.classList.toggle('posed', !!active);
    sprite.querySelectorAll('.pet-pose').forEach((img) => {
      img.classList.toggle('on', img.dataset.pose === active);
    });
  }
  let poseTimer;
  function pose(name, ms) {
    tempPose = name;
    render();
    clearTimeout(poseTimer);
    poseTimer = setTimeout(() => { tempPose = null; render(); }, ms);
  }

  /* ---------------- 说话 */
  let sayTimer;
  let sticky = null;   // 教程气泡要点「知道了」才关，期间别的话不插进来
  function layoutBubble() {
    // 贴着屏幕边时气泡往里挪，小尾巴仍然指着她（按布局宽度算，不受弹出动画的缩放影响）
    const r = pet.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const half = bubble.offsetWidth / 2;
    const pad = 8;
    let shift = 0;
    if (center - half < pad) shift = pad - (center - half);
    else if (center + half > innerWidth - pad) shift = innerWidth - pad - (center + half);
    bubble.style.setProperty('--shift', shift + 'px');
  }
  function say(text, ms, action) {
    if (sticky) return;
    bubble.textContent = text;
    bubble.classList.remove('sticky');
    bubble.classList.toggle('actionable', !!action);
    if (action) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.onclick = () => {
        pet.classList.remove('talking');
        action.run(btn);
      };
      bubble.appendChild(btn);
    }
    layoutBubble();
    pet.classList.add('talking');
    // 开口时弹一下；正在做别的动作（开心跳、难过、生气摇头）就不打断
    if (!['hop', 'happy', 'sad', 'shake'].some((c) => move.classList.contains(c))) act('hop', 500);
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => pet.classList.remove('talking'), ms || 2200 + text.length * 90);
  }
  function explain(text, onDone) {
    stopReading();
    sticky = onDone;
    bubble.textContent = text;
    const ok = document.createElement('button');
    ok.textContent = '知道了';
    ok.onclick = () => {
      const done = sticky;
      sticky = null;
      pet.classList.remove('talking');
      tempPose = null;
      render();
      pose('ok', 1200);
      if (done) done();
    };
    bubble.appendChild(ok);
    bubble.classList.add('sticky');
    layoutBubble();
    pet.classList.add('talking');
    clearTimeout(sayTimer);
    clearTimeout(poseTimer);
    tempPose = 'explain';
    render();
    act('hop', 500);
  }

  // 一次性动作：同一个 class 连着触发时先摘掉再加，动画才会重播
  function act(name, ms) {
    move.classList.remove('hop', 'happy', 'sad', 'shake');
    void move.offsetWidth;
    move.classList.add(name);
    clearTimeout(act.t);
    act.t = setTimeout(() => move.classList.remove(name), ms);
  }

  /* ---------------- 位置：记的是中心点占底栏宽度的比例，横竖屏切换也不会跑出去 */
  let frac = parseFloat(localStorage.getItem('jm-pet-x'));
  if (!(frac >= 0 && frac <= 1)) frac = 0.84;

  function place() {
    const w = pet.offsetWidth || 88;
    const bw = innerWidth;
    const left = Math.max(2, Math.min(bw - w - 2, frac * bw - w / 2));
    pet.style.left = left + 'px';
    call.style.left = (left + w / 2) + 'px';
  }
  addEventListener('resize', place);

  /* ---------------- 眨眼（只在平时的样子下眨，动作图自带表情） */
  let blinkTimer;
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      pet.classList.add('blink');
      setTimeout(() => pet.classList.remove('blink'), 140);
      // 偶尔连眨两下
      if (Math.random() < 0.2) {
        setTimeout(() => pet.classList.add('blink'), 280);
        setTimeout(() => pet.classList.remove('blink'), 420);
      }
      scheduleBlink();
    }, 2500 + Math.random() * 4000);
  }

  /* ---------------- 看漫画时的评论：一部分拿书架上的标签、作者打趣 */
  // 能拿来打趣的标签：题材、服装、发型、角色属性、出处这类（中文、汉化几乎本本都有，不算）。
  // 直接写性行为的、和未成年相关的标签不在这里，她不会拿来说。繁简都收，统一显示成简体。
  const TAG_NAMES = {};
  [
    '全彩|彩色', '同人', '原创|原創', '短篇', '长篇|長篇', '单行本|單行本',
    '纯爱|純愛', '恋爱|戀愛', '百合', '后宫|後宮', '搞笑', '奇幻', '日常', '性转|性轉', '伪娘|偽娘',
    '校服', '制服', '水手服', '体操服|體操服', '泳装|泳裝', '女仆|女僕', '巫女', '修女', '护士|護士',
    '兔女郎', '旗袍', '和服', '浴衣', '丝袜|絲襪', '黑丝|黑絲', '过膝袜|過膝襪', '连裤袜|連褲襪',
    '双马尾|雙馬尾', '马尾|馬尾', '眼镜|眼鏡', '猫耳|貓耳', '兽耳|獸耳', '精灵|精靈', '魔物娘',
    '魔法少女', '大小姐', '姐姐', '辣妹', '人妻', '熟女', '项圈|項圈', '肌肉', '褐肤|褐膚',
  ].forEach((group) => {
    const names = group.split('|');
    names.forEach((n) => { TAG_NAMES[n] = names[0]; });
  });

  // 最近：读过的按最后阅读时间，没读过的按下载时间
  function recency(b) {
    const read = parseInt(localStorage.getItem('jm-read-' + b.id) || '0', 10);
    let added = b.added_at || 0;
    if (added && added < 1e12) added *= 1000;
    return Math.max(read, added);
  }
  function countTags(books) {
    const tags = new Map();
    const events = new Map();
    for (const b of books) {
      for (const raw of b.tags || []) {
        const t = String(raw).trim();
        if (TAG_NAMES[t]) tags.set(TAG_NAMES[t], (tags.get(TAG_NAMES[t]) || 0) + 1);
        else if (/^C\d{2,3}$/i.test(t)) events.set(t.toUpperCase(), (events.get(t.toUpperCase()) || 0) + 1);
      }
    }
    const top = (m) => [...m].sort((a, b) => b[1] - a[1]);
    return { tags: top(tags), events: top(events) };
  }
  // 从 [名字, 本数] 里挑一个来聊：3 本及以上的都有机会，没有就退到 2 本的；
  // 最近提过的先让一让，这样几个作者、几个标签会轮流被说到
  const mentioned = [];
  function pickPopular(entries) {
    let pool = entries.filter(([, n]) => n >= 3);
    if (!pool.length) pool = entries.filter(([, n]) => n >= 2);
    if (!pool.length) return [];
    const fresh = pool.filter(([name]) => !mentioned.includes(name));
    return pick(fresh.length ? fresh : pool);
  }
  function remember(name) {
    mentioned.push(name);
    if (mentioned.length > 6) mentioned.shift();
  }

  // 收藏的标签、作者里挑一个来聊（最近提过的先让一让）。标签同样只说中性的那些
  function favPicks() {
    const tags = ((typeof favTags !== 'undefined' && favTags) || [])
      .map((t) => TAG_NAMES[String(t).trim()]).filter(Boolean);
    const authors = (typeof favAuthors !== 'undefined' && favAuthors) || [];
    const fresh = (list) => {
      const f = list.filter((x) => !mentioned.includes(x));
      return pick(f.length ? f : list) || null;
    };
    return { tag: fresh(tags), author: fresh(authors) };
  }

  // 点开次数最多的几本里挑一本（5 次以上才算「经常点开」）
  function openedPick(books) {
    if (typeof openCount !== 'function') return null;
    const top = books.map((b) => [b, openCount(b.id)]).filter(([, n]) => n >= 5)
      .sort((a, b) => b[1] - a[1]).slice(0, 3);
    const hit = pick(top);
    return hit ? { name: short(hit[0].name), n: hit[1] } : null;
  }

  function shelfComment() {
    const books = (typeof shelfItems !== 'undefined' && shelfItems) || [];
    if (!books.length) return null;
    const all = countTags(books);
    const recent = countTags([...books].sort((a, b) => recency(b) - recency(a)).slice(0, 6));
    const ideas = [];   // [台词, 占位符]
    const add = (group, vars) => S(group).forEach((line) => ideas.push([line, vars]));

    const [tag, tagN] = pickPopular(all.tags);
    if (tag) add('tag', { tag, n: tagN });
    // 最近 6 本里最多的标签，并列时随机挑一个
    const topN = recent.tags.length ? recent.tags[0][1] : 0;
    const [hot, hotN] = topN >= 2 ? pick(recent.tags.filter(([, n]) => n === topN)) : [];
    if (hot) add('hotTag', { tag: hot, n: hotN });
    const authors = new Map();
    books.forEach((b) => b.author && authors.set(b.author, (authors.get(b.author) || 0) + 1));
    const [author, authorN] = pickPopular([...authors]);
    if (author) add('author', { author, n: authorN });
    if (all.events.length) add('event', { event: all.events[0][0] });
    const unread = books.filter((b) => !localStorage.getItem('jm-read-' + b.id)).length;
    if (unread) add('unread', { n: unread });
    const pages = books.reduce((n, b) => n + (b.pages || 0), 0);
    if (pages > 500) add('pages', { n: pages });
    // 收藏的放两份，比「书架上多的」更容易被说到
    const fav = favPicks();
    for (let k = 0; k < 2; k++) {
      if (fav.tag) add('favTag', { tag: fav.tag });
      if (fav.author) add('favAuthor', { author: fav.author });
    }
    const top = openedPick(books);
    if (top) add('opened', top);
    if (!ideas.length) return null;
    const choice = pick(ideas);
    // 真正说出口的才算提过
    const said = Object.values(choice[1]);
    for (const name of [tag, hot, author, fav.tag, fav.author]) if (name && said.includes(name)) remember(name);
    return choice;
  }
  let lastComment = '';
  function comment() {
    let line;
    let vars = null;
    for (let i = 0; i < 4; i++) {
      [line, vars] = (Math.random() < 0.45 && shelfComment()) || [pick(L('read')), null];
      if (!line || line[1] !== lastComment) break;
    }
    if (!line) return;
    lastComment = line[1];
    speak(line, vars, 3600);
  }

  // 点她时偶尔拿书架上的标签、作者说一句
  function shelfTap() {
    const books = (typeof shelfItems !== 'undefined' && shelfItems) || [];
    if (!books.length) return false;
    const ideas = [];
    const [tag, tagN] = pickPopular(countTags(books).tags);
    if (tag) S('tapTag').forEach((line) => ideas.push([line, { tag, n: tagN }]));
    const authors = new Map();
    books.forEach((b) => b.author && authors.set(b.author, (authors.get(b.author) || 0) + 1));
    const [author, authorN] = pickPopular([...authors]);
    if (author) S('tapAuthor').forEach((line) => ideas.push([line, { author, n: authorN }]));
    const fav = favPicks();
    for (let k = 0; k < 2; k++) {
      if (fav.tag) S('favTag').forEach((line) => ideas.push([line, { tag: fav.tag }]));
      if (fav.author) S('favAuthor').forEach((line) => ideas.push([line, { author: fav.author }]));
    }
    const top = openedPick(books);
    if (top) S('opened').forEach((line) => ideas.push([line, top]));
    const choice = pick(ideas);
    if (!choice) return false;
    const said = Object.values(choice[1]);
    for (const name of [tag, author, fav.tag, fav.author]) if (name && said.includes(name)) remember(name);
    speak(choice[0], choice[1]);
    return true;
  }

  function startReading() {
    if (reading || sticky) return;
    reading = true;
    render();
  }
  function stopReading() {
    if (!reading) return false;
    reading = false;
    render();
    return true;
  }

  /* ---------------- 话量：安静 / 正常 / 话多；深夜自动安静些（选了话多的除外） */
  function chatLevel() {
    const set = pref('jm-pet-chat') || 'normal';
    const h = new Date().getHours();
    if (set !== 'chatty' && (h >= 23 || h < 7)) return 'quiet';
    return set;
  }
  const CHAT = {
    quiet: { gap: 2.2, comment: 0.3, chatter: 0 },
    normal: { gap: 1, comment: 0.6, chatter: 0.1 },
    chatty: { gap: 0.6, comment: 0.85, chatter: 0.2 },
  };

  /* ---------------- 发呆：一阵子没人操作就看漫画；看的时候不时评论 */
  let lastActive = Date.now();
  let idleTimer;
  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (shown() && !document.hidden && !sticky && !tempPose) {
        const lv = CHAT[chatLevel()];
        if (reading) {
          if (Math.random() < lv.comment) comment();
        } else if (Date.now() - lastActive > READ_AFTER) {
          startReading();
        } else {
          const r = Math.random();
          if (r < 0.35) {
            pet.classList.add('wiggle');
            setTimeout(() => pet.classList.remove('wiggle'), 1200);
          } else if (r < 0.45) act('hop', 500);
          else if (r < 0.45 + lv.chatter) speak(pick(L('chatter')));
        }
      }
      scheduleIdle();
    }, (9000 + Math.random() * 14000) * CHAT[chatLevel()].gap);
  }

  // 在 App 里任何地方有操作都算回来了，她就合上漫画
  function active() {
    lastActive = Date.now();
    return stopReading();
  }
  document.addEventListener('pointerdown', (e) => {
    if (!pet.contains(e.target)) active();
  }, true);
  document.addEventListener('keydown', () => active(), true);

  /* ---------------- 点、拖、长按 */
  let pokes = [];
  function onTap() {
    if (sticky) return;
    if (active()) {
      speak(pick(L('interrupt')));
      return;
    }
    const now = Date.now();
    pokes = pokes.filter((t) => now - t < 3000);
    pokes.push(now);
    if (pokes.length >= 5) {
      pokes = [];
      act('shake', 500);
      speak(pick(L('poke')));
      return;
    }
    act('hop', 500);
    pet.classList.add('wiggle');
    setTimeout(() => pet.classList.remove('wiggle'), 1200);
    if (pokes.length === 3) speak(pick(L('pokeMild')));
    else if (running > 0 && Math.random() < 0.5) speak(pick(L('busy')), { n: running });
    else if (Math.random() < 0.35 && shelfTap()) { /* 已经说了 */ }
    else if (!localStorage.getItem('jm-tip-pet')) {
      localStorage.setItem('jm-tip-pet', '1');
      speak(['explain', '长按我可以把我收起来哦~'], null, 3600);
    } else speak(pick(L('tap')));
  }

  let drag = null;
  pet.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !e.target.closest('.pet-move')) return;
    e.preventDefault();
    pet.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, left: pet.offsetLeft, moved: false, long: false, lastX: e.clientX };
    drag.timer = setTimeout(() => {
      if (!drag || drag.moved || sticky) return;
      drag.long = true;
      hide(true);
    }, 600);
  });
  pet.addEventListener('pointermove', (e) => {
    if (!drag || drag.long) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      clearTimeout(drag.timer);
      active();
      pet.classList.add('drag');
      if (!sticky) speak(pick(L('drag')), null, 1800);
    }
    // 往哪边拖身子就往反方向歪一点，像被拎着走
    const v = Math.max(-12, Math.min(12, (e.clientX - drag.lastX) * 1.5));
    drag.lastX = e.clientX;
    pet.style.setProperty('--tilt', -v + 'deg');
    const w = pet.offsetWidth;
    frac = (drag.left + dx + w / 2) / innerWidth;
    frac = Math.max(0, Math.min(1, frac));
    place();
    if (pet.classList.contains('talking')) layoutBubble();
  });
  function endDrag() {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.moved) {
      pet.classList.remove('drag');
      pet.style.setProperty('--tilt', '0deg');
      act('hop', 500);
      if (!sticky && Math.random() < 0.6) speak(pick(L('drop')));
      try { localStorage.setItem('jm-pet-x', frac.toFixed(3)); } catch (_) {}
    } else if (!drag.long) {
      onTap();
    }
    drag = null;
  }
  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', () => {
    if (!drag) return;
    clearTimeout(drag.timer);
    pet.classList.remove('drag');
    drag = null;
  });
  pet.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- 显隐 */
  const shown = () => pref('jm-pet') === '1';
  // 现在看得到她吗：开着、底栏没藏（进阅读器、设置这些页面时底栏会藏）
  const visible = () => shown() && !$('#tabbar').classList.contains('hidden');
  window.petActive = visible;

  function hide(byUser) {
    if (byUser) {
      speak(pick(L('hide')), null, 900);
      setTimeout(() => setPref('jm-pet', '0'), 700);
    } else setPref('jm-pet', '0');
  }

  call.addEventListener('click', () => {
    setPref('jm-pet', '1');
    setTimeout(() => speak(pick(L('back'))), 450);
  });

  let applied = null;
  window.petApply = function petApply() {
    const on = shown();
    if (on === applied) return;
    const first = applied === null;
    applied = on;
    document.body.classList.toggle('pet-on', on);
    place();
    if (on) {
      call.classList.add('hidden');
      pet.classList.remove('gone', 'leaving');
      active();
      if (!first) {
        pet.classList.add('arriving');
        setTimeout(() => pet.classList.remove('arriving'), 600);
      }
    } else {
      // 收起时手上的教程气泡交还给弹窗，别就这么丢了
      if (sticky) {
        const pending = sticky;
        sticky = null;
        pending(true);
      }
      stopReading();
      if (first) {
        pet.classList.add('gone');
        call.classList.remove('hidden');
        return;
      }
      pet.classList.remove('talking', 'arriving');
      pet.classList.add('leaving');
      setTimeout(() => {
        if (shown()) return;
        pet.classList.add('gone');
        pet.classList.remove('leaving');
        call.classList.remove('hidden');
      }, 450);
    }
  };

  /* ---------------- 替 App 说话：通知、提示、教程 */
  // 按内容猜语气，配上对应动作
  function mood(msg) {
    if (/失败|错误|出错|没找到|读不出|不支持|无效|超时|打不开|error/i.test(msg)) return ['sad', 'sad'];
    if (/^请|^先|已经是|没认出|没什么|空的/.test(msg)) return ['explain', null];
    if (/^已|完成|成功/.test(msg)) return ['ok', 'hop'];
    return ['explain', null];
  }
  window.petToast = function petToast(msg) {
    if (!visible() || sticky) return false;
    active();
    const [p, a] = mood(msg);
    if (a) act(a, a === 'sad' ? 1400 : 500);
    pose(p, 2400 + msg.length * 90);
    say(msg);
    return true;
  };

  // 教程：她举着手指讲，点「知道了」才收。返回 false 表示她现在不方便，交给弹窗
  window.petTip = function petTip(text, onClosed) {
    if (!visible() || sticky) return false;
    explain(text, (handBack) => onClosed && onClosed(handBack));
    return true;
  };

  /* ---------------- 跟着下载任务做反应 */
  let running = 0;
  let primed = false;
  const seen = new Map();   // id -> 上次看到的状态
  /* ---------------- 收藏、加星、收藏作者出新本：她来说。不在屏幕上时返回 false，交给普通提示 */
  window.petFavorited = function petFavorited({ tags = [], authors = [] }) {
    if (!visible() || sticky) return false;
    active();
    const n = tags.length + authors.length;
    // 能念出名字的：作者，和中性的标签
    const say = [...authors, ...tags.map((t) => TAG_NAMES[String(t).trim()]).filter(Boolean)];
    act('hop', 500);
    if (n === 1 && say.length === 1) speak(pick(L('favAdd')), { name: say[0] });
    else if (n > 1) speak(pick(L('favAddMany')), { n });
    else speak(pick(L('favAddQuiet')));
    return true;
  };

  // 打分：按综合分给反应；连着点星星时别每下都说，隔几秒才说一次
  let lastRateTalk = 0;
  window.petRated = function petRated(rating, book) {
    if (!visible() || sticky || rating == null || Date.now() - lastRateTalk < 3500) return false;
    lastRateTalk = Date.now();
    active();
    const group = rating >= 4.5 ? 'rateHigh' : rating <= 2 ? 'rateLow' : 'rateMid';
    speak(pick(L(group)), { name: short((book && book.name) || '这本'), score: rating.toFixed(1) });
    return true;
  };

  window.petFeed = function petFeed(items) {
    if (!visible() || sticky || !items.length) return false;
    active();
    const go = { label: '去看看', run: () => switchView('feed') };
    act('happy', 1000);
    const ups = items.filter((x) => x.part === 'updates');
    const works = items.filter((x) => x.part !== 'updates');
    if (!works.length) {
      // 只有书架连载出了新章节
      if (ups.length === 1) speak(pick(L('serialNew')), { name: short(ups[0].name), n: ups[0].remote - ups[0].local }, 4200, go);
      else speak(pick(L('serialNewMany')), { n: ups.length }, 4200, go);
    } else if (works.length === 1 && !ups.length) {
      speak(pick(L('feedNew')), { author: works[0].author, name: short(works[0].name) }, 4200, go);
    } else {
      speak(pick(L('feedNewMany')), { n: items.length }, 4200, go);
    }
    return true;
  };

  window.petTasks = function petTasks(tasks) {
    const busy = tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
    const events = [];
    for (const t of tasks) {
      const before = seen.get(t.id);
      if (before !== t.status) {
        seen.set(t.id, t.status);
        if (primed) events.push(t);
      }
    }
    const wasIdle = running === 0;
    running = busy;
    pet.classList.toggle('busy', busy > 0);
    // 第一次轮询只记下现状，不对老任务做反应
    if (!primed) { primed = true; return; }
    if (!visible() || sticky || !events.length) return;
    active();

    const done = events.filter((t) => t.status === 'done');
    const failed = events.filter((t) => t.status === 'error');
    if (failed.length) {
      act('sad', 1400);
      if (failed.length > 1) {
        speak(pick(L('failMany')), { n: failed.length }, 3600, { label: '去看看', run: () => switchView('tasks') });
      } else {
        const t = failed[0];
        speak(pick(L('fail')), { name: short(t.name) }, 3600, { label: '重试', run: (btn) => retryTask(t, btn) });
      }
    } else if (done.length) {
      act('happy', 1000);
      if (done.length > 1) {
        speak(pick(L('doneMany')), { n: done.length }, 3600, { label: '去书架', run: () => switchView('shelf') });
      } else {
        const t = done[0];
        speak(pick(L('done')), { name: short(t.name) }, 3600, { label: '去看看', run: () => openDetail(t.id) });
      }
    } else if (wasIdle && busy > 0) {
      act('hop', 500);
      if (busy > 1) speak(pick(L('startMany')), { n: busy });
      else speak(pick(L('start')));
    }
  };

  petApply();
  render();
  scheduleBlink();
  scheduleIdle();
  // 打开 App 时打个招呼（教程气泡先出来了就不打扰）；等台词加载好再说
  linesReady.then(() => setTimeout(() => {
    if (visible() && !sticky && !tempPose) {
      const h = new Date().getHours();
      const key = h < 5 ? 'helloNight' : h < 11 ? 'helloMorning' : h < 14 ? 'helloNoon'
        : h < 18 ? 'helloAfternoon' : h < 23 ? 'helloEvening' : 'helloNight';
      speak(pick(L(key)));
    }
  }, 1200));
})();
