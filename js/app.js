/* =====================================================================
 *  더 스파이크 크로스 공략집 — 화면 동작
 * ---------------------------------------------------------------------
 *  · Firebase 가 연결돼 있으면 관리자가 게시한 내용을 불러와 보여줍니다.
 *  · 연결 전이거나 불러오기에 실패하면 js/content.js, js/characters.js 를 씁니다.
 *  · 내용 수정은 관리자 모드(js/admin.js)에서만 할 수 있어요.
 * ===================================================================== */
(() => {
  'use strict';

  const FB = window.FIREBASE_CONFIG || {};
  const remoteEnabled = !!(FB.apiKey && FB.projectId);
  const FS_BASE = remoteEnabled
    ? `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FB.projectId)}/databases/(default)/documents`
    : '';
  const KEY_PARAM = remoteEnabled ? `key=${encodeURIComponent(FB.apiKey)}` : '';

  const INTRO_KEY = 'tsc.intro.seen';
  const INTRO_EVERY_KEY = 'tsc.intro.every';
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 작은 도구들 ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const multiline = (s) => esc(s).replace(/\n/g, '<br>');
  const safeColor = (c) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c || '') ? c : '#ff5b22');
  const str = (v) => (v == null ? '' : String(v));
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : []);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  // 저장소 접근은 개인정보 보호 모드 등에서 막힐 수 있어 항상 try 로 감쌉니다.
  const store = {
    get(key, session) { try { return (session ? sessionStorage : localStorage).getItem(key); } catch (e) { return null; } },
    set(key, val, session) { try { (session ? sessionStorage : localStorage).setItem(key, val); return true; } catch (e) { return false; } },
    remove(key, session) { try { (session ? sessionStorage : localStorage).removeItem(key); } catch (e) { /* 무시 */ } }
  };

  const listeners = {};
  const on = (name, fn) => (listeners[name] = listeners[name] || []).push(fn);
  const emit = (name, detail) => (listeners[name] || []).forEach((fn) => fn(detail));

  /* =====================================================================
   *  데이터 정리 (빠진 항목을 채우고 형식을 맞춤)
   * ===================================================================== */
  const SECTION_DEFAULTS = {
    about: { nav: '게임 소개', eyebrow: 'ABOUT', title: '더 스파이크 크로스란?' },
    characters: { nav: '캐릭터', eyebrow: 'CHARACTERS', title: '캐릭터 도감' },
    modes: { nav: '게임 모드', eyebrow: 'GAME MODES', title: '게임 모드' },
    currency: { nav: '재화', eyebrow: 'CURRENCY', title: '재화 획득 가이드' },
    links: { nav: '공식 채널', eyebrow: 'OFFICIAL', title: '공식 채널' },
    updates: { nav: '업데이트', eyebrow: 'UPDATE', title: '업데이트 소식' },
    history: { nav: '출시·복각', eyebrow: 'RELEASE HISTORY', title: 'S+ 출시 · 복각 기록' }
  };

  // 사이트 테마 (관리자 모드 → 테마에서 골라요)
  // 새 테마를 만들 때: 여기에 한 줄 추가하고, css 파일에 html.theme-아이디 { ... } 로 꾸며요. (예: css/halloween.css)
  const THEMES = [
    { id: 'default', name: '원래 테마', desc: '남색 코트 · 주황 · 하늘색 — 사이트 기본 디자인',
      preview: 'radial-gradient(circle at 76% 34%, #ff8a4c 0 13%, transparent 14%), radial-gradient(60% 70% at 20% 90%, rgba(50, 212, 255, .45), transparent 70%), linear-gradient(135deg, #142042, #060a14)' },
    { id: 'halloween', name: '할로윈', desc: '보라색 밤하늘 · 달 · 박쥐 · 거미 · 유령 · 마녀 모자 · 묘비 언덕',
      preview: 'radial-gradient(circle at 74% 30%, #ffe3a3 0 12%, transparent 13%), radial-gradient(circle at 26% 76%, #ff7a1a 0 10%, transparent 11%), radial-gradient(60% 70% at 30% 90%, rgba(162, 89, 255, .45), transparent 70%), linear-gradient(135deg, #2b1748, #0a0612)' }
  ];

  // 게시된 내용에 공식 채널이 아직 없으면 content.js 의 기본 링크를 보여줍니다.
  const DEFAULT_LINKS = list(obj(window.SITE_CONTENT).links);
  // 게시된 내용에 캐릭터 조합이 아직 없으면 content.js 의 기본 조합을 보여줍니다.
  const DEFAULT_COMBOS = list(obj(window.SITE_CONTENT).combos);

  function normalizeContent(input) {
    const src = obj(input);
    const site = obj(src.site);
    const secs = obj(src.sections);
    const about = obj(src.about);
    const sections = {};
    const fileSecs = obj(obj(window.SITE_CONTENT).sections);
    Object.keys(SECTION_DEFAULTS).forEach((k) => {
      // 게시된 내용에 없는 섹션(새로 생긴 섹션)은 content.js 의 문구를 씁니다
      const s = obj(secs[k] !== undefined ? secs[k] : fileSecs[k]);
      const d = SECTION_DEFAULTS[k];
      sections[k] = {
        nav: str(s.nav) || d.nav,
        eyebrow: s.eyebrow == null ? d.eyebrow : str(s.eyebrow),
        title: s.title == null ? d.title : str(s.title),
        desc: str(s.desc)
      };
    });
    return {
      site: {
        title: str(site.title) || '더 스파이크 크로스 공략집',
        logo: str(site.logo),
        // 글자 로고: 작은 글자 · 큰 글자 · 아랫줄 (ZIP = 모음'집')
        logoTop: site.logoTop == null ? 'THE' : str(site.logoTop),
        logoMain: str(site.logoMain) || 'ZIP',
        logoSub: site.logoSub == null ? '더 스파이크 크로스 모음집' : str(site.logoSub),
        welcome: str(site.welcome),
        welcomeSub: str(site.welcomeSub),
        tagline: str(site.tagline),
        introEveryVisit: site.introEveryVisit === true,
        pixelArt: site.pixelArt === true,
        cardImageFit: site.cardImageFit === 'contain' ? 'contain' : 'cover',
        // 사이트 테마 (THEMES 의 id). 고른 적이 없으면 원래 테마
        theme: THEMES.some((t) => t.id === site.theme) ? site.theme : 'default'
      },
      sections,
      about: {
        lead: str(about.lead),
        paragraphs: list(about.paragraphs).map(str),
        info: list(about.info).map(obj).map((i) => ({ label: str(i.label), value: str(i.value) })),
        features: list(about.features).map(obj).map((f) => ({ icon: str(f.icon), image: str(f.image), title: str(f.title), desc: str(f.desc) })),
        screenshots: list(about.screenshots).map(obj).map((s) => ({ image: str(s.image), caption: str(s.caption) }))
      },
      modes: list(src.modes).map(obj).map((m) => ({
        icon: str(m.icon), image: str(m.image), name: str(m.name),
        tags: list(m.tags).map(str), summary: str(m.summary),
        details: list(m.details).map(obj).map((d) => ({ title: str(d.title), items: list(d.items).map(str) }))
      })),
      currencies: list(src.currencies).map(obj).map((c) => ({
        icon: str(c.icon), image: str(c.image), name: str(c.name), type: str(c.type), desc: str(c.desc),
        sources: list(c.sources).map(obj).map((s) => ({ where: str(s.where), amount: str(s.amount), note: str(s.note) })),
        uses: list(c.uses).map(str),
        tips: list(c.tips).map(str)
      })),
      // 캐릭터 출시 · 복각 기록 (charId 로 캐릭터와 연결)
      history: list(src.history).map(obj).map((h) => ({
        charId: str(h.charId), first: str(h.first),
        reruns: list(h.reruns).map(str).filter((s) => s.trim()),
        note: str(h.note)
      })),
      // 캐릭터 조합: 함께 편성하면 능력치 보너스 (members 는 캐릭터 id, bonus 는 { attack: 7, jump: 4 }, desc 는 그 밖의 효과 설명)
      combos: (src.combos === undefined ? DEFAULT_COMBOS : list(src.combos)).map(obj).map((k) => {
        const b = obj(k.bonus);
        const bonus = {};
        STAT_DEFS.forEach((d) => { const n = Number(b[d.key]); if (Number.isFinite(n) && n) bonus[d.key] = n; });
        return { name: str(k.name), members: list(k.members).map(str).filter(Boolean), bonus, desc: str(k.desc) };
      }),
      // 메인 화면 복각 알림 (skin 이 비어 있으면 캐릭터 복각)
      rerunNotices: list(src.rerunNotices).map(obj).map((r) => ({
        charId: str(r.charId), skin: str(r.skin), start: str(r.start), end: str(r.end)
      })),
      // 업데이트 · 트레일러 (목록 맨 위가 최신, 크게 보여요)
      updates: list(src.updates).map(obj).map((u) => ({
        title: str(u.title), date: str(u.date), video: str(u.video), desc: str(u.desc), image: str(u.image),
        featured: u.featured === true
      })),
      links: (src.links === undefined ? DEFAULT_LINKS : list(src.links)).map(obj).map((l) => ({
        name: str(l.name), url: str(l.url), desc: str(l.desc)
      })),
      footer: { note: str(obj(src.footer).note) }
    };
  }

  /* ---------- 고정 목록: 스탯 · 포지션 · 등급 · 캐릭터 색 ---------- */
  const POSITIONS = ['스파이커', '미들블로커', '세터']; // 이 순서로 묶어서 보여줘요
  const POS_CODES = { '스파이커': 'WS', '미들블로커': 'MB', '세터': 'Se' };
  const GRADES = ['S+', 'S', 'S-', 'A+', 'A', 'A-']; // 앞에 있을수록 먼저 보여요
  const CHAR_COLORS = [
    ['#ff5b22', '주황'], ['#ff3b5c', '빨강'], ['#ff5fa2', '분홍'], ['#b06bff', '보라'], ['#5b7cff', '파랑'],
    ['#32d4ff', '하늘'], ['#2ee6b6', '민트'], ['#5ad45a', '초록'], ['#ffc42e', '노랑'], ['#c7d0e8', '은색']
  ];
  const STAT_ICONS = {
    attack: { label: '공격 (불꽃)', svg: '<path fill="currentColor" d="M12.2 1.8c.5 2.7 2.9 4.3 4.3 6.6 1.9 3.1 1.5 7.4-1.2 9.6-.6-2.3-1.9-3.6-3.4-4.6.2 1.8-.4 3.3-1.6 4.4-1.3-1-2-2.6-1.7-4.4-1.7 1.4-2.4 3.2-2 5.3C4.7 17 3.9 13.5 5.3 10.6c.8-1.7 2.1-2.6 3.1-3.3-.1 1.4.3 2.6 1.3 3.3C9.2 7.4 10.6 4.4 12.2 1.8z"/><circle cx="12" cy="19.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 18.4c1.4.6 2.9.6 4.4-.2M12.4 15.9c.6 1.1.8 2.4.4 3.9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' },
    defense: { label: '수비 (방패)', svg: '<path d="M12 2.6 4.6 5.4v5.9c0 4.7 3.1 8.5 7.4 10.1 4.3-1.6 7.4-5.4 7.4-10.1V5.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 2.6v18.8c4.3-1.6 7.4-5.4 7.4-10.1V5.4z" fill="currentColor"/>' },
    speed: { label: '스피드 (달리기)', svg: '<circle cx="16.2" cy="4.2" r="2.2" fill="currentColor"/><path d="M9.2 9.2 13 7.6l3 2.6 3.2 1M13 7.6l-1.6 5.2 3.6 2.6-1.2 5M11.4 12.8 8.2 16.4H4.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 8.6h4.2M.8 12h4M2.6 15.4h1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    jump: { label: '점프 (화살표)', svg: '<path d="M4 21c1.6-6.4 5.6-10.8 12.2-13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M11.4 6.2 18.6 6l-2.3 6.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.6 21.4c1.1-3.2 3-5.6 5.6-7.2M3 15.6c.8-2.2 2-4 3.5-5.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>' },
    ball: { label: '배구공', svg: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12c-1.2-3.4-3.9-6-7.6-7M12 12c3.6-.6 6.7.4 8.9 2.9M12 12c-2.4 2.7-3.5 5.9-3.1 8.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    bolt: { label: '번개', svg: '<path d="M13.5 2 4.8 13.4h6.3L10 22l9.2-12.1h-6.4z" fill="currentColor"/>' },
    star: { label: '별', svg: '<path d="m12 2.6 2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z" fill="currentColor"/>' },
    target: { label: '과녁', svg: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>' }
  };
  // 스탯은 이 4가지로 고정 (max 는 입력 한도)
  const STAT_DEFS = [
    { key: 'attack', name: '공격력', max: 300, color: '#ff7a2e', icon: 'attack' },
    { key: 'defense', name: '수비력', max: 300, color: '#e4ff3a', icon: 'defense' },
    { key: 'speed', name: '스피드', max: 300, color: '#7fe3cc', icon: 'speed' },
    { key: 'jump', name: '점프력', max: 300, color: '#ff2e63', icon: 'jump' }
  ];
  // 예전 데이터의 스탯 이름도 알아보기 (스파이크 → 공격력, 블로킹 → 수비력)
  const STAT_ALIASES = { attack: ['attack', 'spike'], defense: ['defense', 'block', 'receive'], speed: ['speed'], jump: ['jump'] };
  const statIcon = (name) => `<svg class="stat-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${(STAT_ICONS[name] || STAT_ICONS.star).svg}</svg>`;

  function normPosition(p) {
    const s = str(p).replace(/\s+/g, '');
    if (POSITIONS.includes(s)) return s;
    if (/블로커|blocker/i.test(s)) return '미들블로커';
    if (/스파이커|spiker|공격수/i.test(s)) return '스파이커';
    if (/세터|setter/i.test(s)) return '세터';
    return '';
  }
  function normGrade(g) {
    const s = str(g).trim().toUpperCase().replace(/＋/g, '+').replace(/[－−–]/g, '-');
    return GRADES.includes(s) ? s : '';
  }
  const gradeRank = (g) => { const i = GRADES.indexOf(g); return i < 0 ? GRADES.length : i; };
  const gradeClass = (g) => ({ 'S+': 'splus', S: 's', 'S-': 'sminus', 'A+': 'aplus', A: 'a', 'A-': 'aminus' }[g] || 'none');

  function normalize(input) {
    const src = obj(input);
    const statDefs = clone(STAT_DEFS);
    const positions = [...POSITIONS];
    const ids = new Set();
    const characters = list(src.characters).map(obj).map((c, i) => {
      let id = str(c.id) || 'char-' + (i + 1);
      while (ids.has(id)) id += '-' + (i + 1);
      ids.add(id);
      // 스탯은 { min, max } 범위. 예전처럼 숫자 하나면 최소 = 최대로 바꿉니다.
      const rawStats = obj(c.stats);
      const stats = {};
      statDefs.forEach((d) => {
        const from = STAT_ALIASES[d.key].find((k) => rawStats[k] != null);
        const raw = from ? rawStats[from] : undefined;
        let a;
        let b;
        if (Array.isArray(raw)) { a = Number(raw[0]); b = Number(raw[1]); }
        else if (raw && typeof raw === 'object') { a = Number(raw.min); b = Number(raw.max); }
        else { a = Number(raw); b = a; }
        if (!Number.isFinite(a)) a = 0;
        if (!Number.isFinite(b)) b = a;
        a = clamp(Math.round(a), 0, d.max);
        b = clamp(Math.round(b), 0, d.max);
        if (b < a) [a, b] = [b, a];
        stats[d.key] = { min: a, max: b };
      });
      const totalNum = Number(c.total);
      const total = c.total == null || c.total === '' || !Number.isFinite(totalNum) ? null : Math.max(0, Math.round(totalNum));
      return {
        id,
        name: str(c.name),
        alias: str(c.alias),           // 별명 · 이명
        grade: normGrade(c.grade),     // S+ ~ A-
        isNew: c.isNew === true,       // 신규 캐릭터 강조
        position: normPosition(c.position),
        color: str(c.color),
        image: str(c.image), description: str(c.description),
        profile: list(c.profile).map(obj).map((p) => ({ label: str(p.label), value: str(p.value) })),
        stats,
        total,
        traits: list(c.traits).map(obj).map((t) => ({ icon: str(t.icon), name: str(t.name), tag: str(t.tag), desc: str(t.desc) })),
        skins: list(c.skins).map(obj).map((s) => ({ name: str(s.name), rarity: str(s.rarity), image: str(s.image), howToGet: str(s.howToGet), isNew: s.isNew === true }))
      };
    });
    return { statDefs, positions, characters };
  }

  /* =====================================================================
   *  상태
   * ===================================================================== */
  const state = {
    content: normalizeContent(clone(window.SITE_CONTENT || {})),
    data: normalize(clone(window.CHARACTER_DATA || {})),
    source: 'local',        // 'local' = 기본 파일, 'remote' = 관리자가 게시한 내용
    published: '',          // 마지막으로 게시된 내용 (변경 여부 비교용)
    publishedVersion: 0,
    filter: 'all',
    query: '',
    editing: false,
    openId: null,
    skinIndex: -1
  };

  const site = () => state.content.site;
  const snapshot = () => JSON.stringify({ content: state.content, characters: state.data });
  const isDirty = () => snapshot() !== state.published;

  function applySnapshot(data) {
    const d = obj(data);
    state.content = normalizeContent(d.content);
    state.data = normalize(d.characters);
  }

  function markPublished(version) {
    state.published = snapshot();
    state.publishedVersion = version || 0;
    state.source = 'remote';
    emit('change');
  }

  let changeTimer = 0;
  function persist() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => emit('change'), 200);
  }

  function revertToPublished() {
    applySnapshot(JSON.parse(state.published));
    refreshEverything();
    emit('change');
  }

  // 관리자가 게시한 내용 읽기 (방문자는 가벼운 REST 요청 한 번만)
  async function fetchPublished() {
    if (!remoteEnabled) return null;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 7000);
    try {
      const res = await fetch(`${FS_BASE}/site/data?${KEY_PARAM}`, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      if (res.status === 404) return { empty: true };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const doc = await res.json();
      const f = doc.fields || {};
      const json = f.json && f.json.stringValue;
      if (!json) return { empty: true };
      return { data: JSON.parse(json), version: Number(f.version && f.version.integerValue) || 0 };
    } catch (e) {
      console.warn('[공략집] 게시된 내용을 불러오지 못해 기본 내용으로 보여줍니다.', e);
      return { failed: true };
    } finally {
      clearTimeout(timer);
    }
  }

  const statHigh = (c, key) => (c.stats[key] ? c.stats[key].max : 0);
  const statSum = (c) => state.data.statDefs.reduce((s, d) => s + statHigh(c, d.key), 0);
  // 총합 스테이터스: 직접 입력한 값이 있으면 그 값, 없으면 최대값 합계
  const statTotal = (c) => (c.total != null ? c.total : statSum(c));
  const getChar = (id) => state.data.characters.find((c) => c.id === id) || null;
  const current = () => (state.openId === null ? null : getChar(state.openId));
  const rankOf = (c, key) => 1 + state.data.characters.filter((o) => statHigh(o, key) > statHigh(c, key)).length;

  const allPositions = () => [...POSITIONS];

  /* =====================================================================
   *  이미지
   *  · "images/..." 같은 경로 → 사이트 폴더의 파일
   *  · "fs:아이디"            → 관리자 모드에서 올린 이미지 (Firestore 에 저장)
   * ===================================================================== */
  const previewMap = Object.create(null); // 방금 올린 이미지를 바로 보여주기 위한 임시 주소
  const isRemoteRef = (ref) => /^fs:/.test(ref || '');

  function directSrc(ref) {
    if (!ref) return '';
    if (previewMap[ref]) return previewMap[ref];
    if (isRemoteRef(ref)) return remoteEnabled ? null : '';
    return ref;
  }

  const remoteImages = new Map();
  function loadRemoteImage(ref, size) {
    const id = ref.slice(3);
    const key = `${id}|${size}`;
    if (remoteImages.has(key)) return remoteImages.get(key);
    const p = (async () => {
      const url = `${FS_BASE}/images/${encodeURIComponent(id)}?${KEY_PARAM}&mask.fieldPaths=${size}`;
      let cache = null;
      let res = null;
      try { cache = 'caches' in window ? await caches.open('tsc-images-v1') : null; } catch (e) { cache = null; }
      if (cache) { try { res = await cache.match(url); } catch (e) { res = null; } }
      if (!res) {
        res = await fetch(url);
        if (!res.ok) throw new Error('이미지를 불러오지 못했어요 (' + res.status + ')');
        if (cache) cache.put(url, res.clone()).catch(() => {});
      }
      const doc = await res.json();
      const field = (doc.fields || {})[size];
      const dataUrl = field && field.stringValue;
      if (!dataUrl) {
        if (size === 'thumb') return loadRemoteImage(ref, 'full');
        throw new Error('빈 이미지');
      }
      const blob = await (await fetch(dataUrl)).blob();
      return URL.createObjectURL(blob);
    })();
    remoteImages.set(key, p);
    p.catch(() => remoteImages.delete(key));
    return p;
  }

  function getImageURL(ref, size = 'full') {
    const d = directSrc(ref);
    return d !== null ? Promise.resolve(d) : loadRemoteImage(ref, size);
  }

  function setImg(img, ref, fallback, size = 'thumb') {
    const key = `${ref || ''}|${size}|${fallback}`;
    if (img.dataset.key === key) return;
    img.dataset.key = key;
    const token = (img._tok = (img._tok || 0) + 1);
    const direct = directSrc(ref);
    if (direct !== null) {
      img.classList.remove('is-pending');
      img.onerror = direct ? () => { img.onerror = null; img.src = fallback; } : null;
      img.src = direct || fallback;
      return;
    }
    img.onerror = null;
    img.classList.add('is-pending');
    loadRemoteImage(ref, size).then(
      (url) => {
        if (img._tok !== token) return;
        img.onload = () => { img.onload = null; img.classList.remove('is-pending'); };
        img.src = url;
      },
      () => {
        if (img._tok !== token) return;
        img.src = fallback;
        img.classList.remove('is-pending');
      }
    );
  }

  function hydrateImages(root = document) {
    $$('img[data-img]', root).forEach((img) => setImg(img, img.dataset.img, BLANK, img.dataset.size || 'thumb'));
  }

  // 이미지가 없을 때 보여줄 실루엣
  const phCache = new Map();
  function placeholder(name, color, variant = 0) {
    const col = safeColor(color);
    const key = `${name}|${col}|${variant}`;
    if (phCache.has(key)) return phCache.get(key);
    const initial = esc(Array.from(String(name || '?').trim())[0] || '?');
    const stripes = variant
      ? `<g opacity=".09" stroke="#fff" stroke-width="16">${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 64 - 220}" y1="400" x2="${i * 64 + 80}" y2="0"/>`).join('')}</g>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><radialGradient id="g" cx=".5" cy=".32" r=".78"><stop offset="0" stop-color="${col}" stop-opacity=".7"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><rect width="300" height="400" fill="#0c1430"/><rect width="300" height="400" fill="url(#g)"/>${stripes}<g fill="#fff" fill-opacity=".15"><circle cx="150" cy="148" r="56"/><path d="M38 400c4-88 52-150 112-150s108 62 112 150z"/></g><text x="150" y="170" text-anchor="middle" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-weight="700" font-size="58" fill="#fff" fill-opacity=".85">${initial}</text></svg>`;
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    phCache.set(key, uri);
    return uri;
  }

  // 상세 창 큰 이미지: 다음 이미지를 미리 불러온 뒤 부드럽게 교체
  let swapToken = 0;
  function swapImage(img, ref, fallback, instant) {
    const key = `${ref || ''}|${fallback}`;
    if (img.dataset.key === key && img.getAttribute('src')) return;
    img.dataset.key = key;
    const token = ++swapToken;
    const apply = (url, ok) => {
      if (token !== swapToken) return;
      img.src = url;
      let shown = false;
      const show = () => {
        if (shown || token !== swapToken) return;
        shown = true;
        img.classList.remove('is-swapping');
        emit('stageimage', { img, path: ref, ok });
      };
      if (img.decode) img.decode().then(show, show); else show();
      setTimeout(show, 600); // decode 가 늦어져도 이미지가 꼭 보이도록
    };
    const start = () => {
      getImageURL(ref, 'full').then((src) => {
        if (token !== swapToken) return;
        if (!src) return apply(fallback, false);
        const pre = new Image();
        pre.onload = () => apply(src, true);
        pre.onerror = () => apply(fallback, false);
        pre.src = src;
      }, () => apply(fallback, false));
    };
    img.classList.add('is-swapping');
    if (instant || reduceMotion) start(); else setTimeout(start, 170);
  }

  function rarityClass(r) {
    const s = String(r || '').toLowerCase();
    if (/전설|레전드|legend|ssr|ur\b/.test(s)) return 'rarity--legend';
    if (/에픽|영웅|epic|\bsr\b/.test(s)) return 'rarity--epic';
    if (/레어|희귀|rare/.test(s)) return 'rarity--rare';
    if (/한정|이벤트|limited|event/.test(s)) return 'rarity--limited';
    return 'rarity--common';
  }

  /* =====================================================================
   *  로고 · 배구공
   * ===================================================================== */
  // 주황 · 흰색 · 파랑 패널이 소용돌이치는 공 (SUPER RiSE SPIKER 공 디자인)
  // 소용돌이 중심을 왼쪽 아래로 살짝 옮겨서 입체감을 줍니다.
  const BALL = (() => {
    const V = [26, 37];
    const BASE = [[0, 0], [-1, -13], [-11, -28], [-32, -40]].map(([x, y]) => [V[0] + x, V[1] + y]);
    const rot = ([x, y], deg) => {
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [V[0] + (x - V[0]) * c - (y - V[1]) * s, V[1] + (x - V[0]) * s + (y - V[1]) * c];
    };
    const f = (p) => p.map((n) => n.toFixed(2)).join(' ');
    const curve = (deg) => BASE.map((p) => rot(p, deg));
    const seam = (deg) => { const [a, b, c, d] = curve(deg); return `M${f(a)}C${f(b)} ${f(c)} ${f(d)}`; };
    const wedge = (d1, d2) => {
      const [a0, a1, a2, a3] = curve(d1);
      const [, b1, b2, b3] = curve(d2);
      return `M${f(a0)}C${f(a1)} ${f(a2)} ${f(a3)}L${f(b3)}C${f(b2)} ${f(b1)} ${f(a0)}Z`;
    };
    const colors = ['#ee6a37', '#f4f0e6', '#2e7bcc', '#ee6a37', '#f4f0e6', '#2e7bcc'];
    return {
      panels: colors.map((col, i) => `<path fill="${col}" d="${wedge(i * 60, i * 60 + 60)}"/>`).join(''),
      seams: [0, 60, 120, 180, 240, 300].map((d) => `<path d="${seam(d)}"/>`).join(''),
      stitches: [30, 90, 150, 210, 270, 330].map((d) => `<path d="${seam(d)}"/>`).join('')
    };
  })();

  let ballSeq = 0;
  function ballSVG(brand) {
    const id = 'tscball' + ++ballSeq;
    return `<svg class="ball-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="${id}c"><circle cx="32" cy="32" r="29"/></clipPath>
        <radialGradient id="${id}g" cx="34%" cy="26%" r="80%">
          <stop offset="0" stop-color="#fff" stop-opacity=".5"/>
          <stop offset=".42" stop-color="#fff" stop-opacity="0"/>
          <stop offset=".8" stop-color="#0a1230" stop-opacity=".18"/>
          <stop offset="1" stop-color="#040818" stop-opacity=".55"/>
        </radialGradient>
      </defs>
      <g clip-path="url(#${id}c)">
        <circle cx="32" cy="32" r="29" fill="#f4f0e6"/>
        ${BALL.panels}
        <g class="b-stitch">${BALL.stitches}</g>
        <g class="b-seam">${BALL.seams}</g>
        ${brand ? `<g class="b-brand" transform="rotate(-22 43 30)">
          <text class="b-brand__word" x="43" y="25.6" text-anchor="middle">SUPER</text>
          <text x="43" y="32.4" text-anchor="middle">R<tspan class="b-brand__i">i</tspan>SE</text>
          <text class="b-brand__sub" x="43" y="35.6" text-anchor="middle">Up to Victory!</text>
          <text class="b-brand__word" x="43" y="39.4" text-anchor="middle">SPIKER</text>
        </g>` : ''}
        <circle cx="32" cy="32" r="29" fill="url(#${id}g)"/>
      </g>
      <circle class="b-rim" cx="32" cy="32" r="29"/>
    </svg>`;
  }

  // 글자 로고 (관리자 모드 → 사이트 설정 → 글자 로고에서 바꿀 수 있어요)
  const logoText = () => `${site().logoTop} ${site().logoMain} ${site().logoSub}`.trim();
  function logoHTML(variant) {
    const s = site();
    return `<span class="logo logo--${variant}">
      <span class="logo__ball">${ballSVG()}</span>
      <span class="logo__words">
        <span class="logo__line1">${s.logoTop ? `<span class="logo__the">${esc(s.logoTop)}</span>` : ''}<span class="logo__main">${esc(s.logoMain)}</span></span>
        ${s.logoSub ? `<span class="logo__sub">${esc(s.logoSub)}</span>` : ''}
      </span>
    </span>`;
  }

  // 로고 이미지가 있으면 불러온 뒤 교체. 반환값: 로고가 준비되면 끝나는 Promise
  let logoKey = null;
  function renderLogos(force) {
    const ref = site().logo;
    const key = `${ref}|${logoText()}`;
    if (!force && logoKey === key) return Promise.resolve();
    logoKey = key;
    const slots = $$('[data-logo]').filter((el) => !el.closest('.intro.is-playing'));
    slots.forEach((el) => { el.innerHTML = logoHTML(el.dataset.logo); });
    if (!ref) return Promise.resolve();
    return getImageURL(ref, 'full').then((url) => new Promise((resolve) => {
      if (!url || logoKey !== key) return resolve();
      const test = new Image();
      test.onload = () => {
        if (logoKey === key) {
          slots.forEach((el) => {
            el.innerHTML = `<img class="logo-img logo-img--${el.dataset.logo}" src="${esc(url)}" alt="${esc(logoText())}">`;
          });
        }
        resolve();
      };
      test.onerror = () => resolve();
      test.src = url;
    })).catch(() => {});
  }

  /* =====================================================================
   *  인트로
   * ===================================================================== */
  function runIntro(skip, ready, done) {
    const intro = $('#intro');
    if (!intro) return done();
    const seen = store.get(INTRO_KEY, true);
    // 게시된 설정은 아직 불러오는 중일 수 있어, 지난번에 본 설정값을 기억해 두고 씁니다.
    const every = remoteEnabled ? store.get(INTRO_EVERY_KEY) === '1' : site().introEveryVisit;
    if (skip || (seen && !every)) { intro.remove(); return done(); }
    document.body.classList.add('is-locked');

    let closed = false;
    let started = false;
    const close = () => {
      if (closed) return;
      closed = true;
      store.set(INTRO_KEY, '1', true);
      intro.classList.add('is-playing', 'is-leaving');
      document.body.classList.remove('is-locked');
      window.removeEventListener('keydown', onKey);
      setTimeout(done, 280);
      setTimeout(() => intro.remove(), 1200);
    };
    const onKey = (e) => {
      if (!started) return;
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); close(); }
    };
    $('#introEnter').addEventListener('click', close);
    $('#introSkip').addEventListener('click', close);
    window.addEventListener('keydown', onKey);

    // 글꼴과 게시된 내용이 준비된 뒤 시작 (최대 2.5초 대기)
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([Promise.all([fonts, ready]), wait(2500)]).then(() => {
      if (closed) return;
      $('#introWelcome').textContent = site().welcome || '환영합니다!';
      $('#introSub').textContent = site().welcomeSub;
      started = true;
      requestAnimationFrame(() => {
        intro.classList.add('is-playing');
        setTimeout(() => { if (!closed) $('#introEnter').focus({ preventScroll: true }); }, 1900);
      });
    });
  }

  /* =====================================================================
   *  히어로
   * ===================================================================== */
  let heroPlayed = false;
  function heroCounts() {
    const s = state.content.sections;
    return [
      [s.characters.nav, state.data.characters.length],
      ['스킨', state.data.characters.reduce((n, c) => n + c.skins.length, 0)],
      [s.modes.nav, state.content.modes.length],
      [s.currency.nav, state.content.currencies.length]
    ];
  }
  function renderHeroText() {
    $('#heroTagline').innerHTML = multiline(site().tagline);
    const box = $('#heroStats');
    if (!box.children.length) {
      box.innerHTML = heroCounts().map(([k, v]) => `<div><dt>${esc(k)}</dt><dd data-count="${v}">0</dd></div>`).join('');
    }
    updateHeroCounts();
  }
  function updateHeroCounts() {
    const rows = $$('#heroStats > div');
    heroCounts().forEach(([label, v], i) => {
      const row = rows[i];
      if (!row) return;
      $('dt', row).textContent = label;
      const dd = $('dd', row);
      dd.dataset.count = v;
      if (heroPlayed) dd.textContent = v;
    });
  }
  function playHero() {
    const hero = $('#home');
    hero.classList.add('is-in');
    heroPlayed = true;
    $$('[data-count]', hero).forEach((el, i) => countUp(el, Number(el.dataset.count), 1000 + i * 120, 450 + i * 90));
  }
  function countUp(el, to, dur, delay) {
    if (reduceMotion || !to) { el.textContent = to; return; }
    setTimeout(() => {
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(Number(el.dataset.count) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
  }

  /* =====================================================================
   *  섹션: 제목 · 게임 소개 · 모드 · 재화 · 푸터
   * ===================================================================== */
  const editButton = (key, label) => `<button class="sec-edit" type="button" data-edit="${key}">✎ ${esc(label)}</button>`;

  function renderSectionHeads() {
    const secs = state.content.sections;
    $$('[data-section-head]').forEach((el) => {
      const key = el.dataset.sectionHead;
      const s = secs[key] || {};
      if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', '');
      el.innerHTML = `
        <span class="shead__eyebrow"><i>${esc(el.dataset.num)}</i>${esc(s.eyebrow)}</span>
        <h2 class="shead__title">${esc(s.title)}</h2>
        ${s.desc ? `<p class="shead__desc">${multiline(s.desc)}</p>` : ''}
        ${editButton(key, key === 'characters' ? '섹션 제목 · 조합 편집' : '이 섹션 편집')}`;
    });
    $$('.nav__links a[data-section]').forEach((a) => {
      const s = secs[a.dataset.section];
      if (s) a.textContent = s.nav;
    });
    moveIndicator();
  }

  function iconHTML(item) {
    if (item && item.image) return `<span class="icon"><img data-img="${esc(item.image)}" data-size="thumb" alt="" decoding="async"></span>`;
    return `<span class="icon" aria-hidden="true">${esc((item && item.icon) || '•')}</span>`;
  }

  function renderAbout() {
    const a = state.content.about;
    const shots = a.screenshots.filter((s) => s.image);
    const box = $('#aboutBody');
    box.innerHTML = `
      <div class="about__grid">
        <div class="about__text" data-reveal>
          ${a.lead ? `<p class="about__lead">${multiline(a.lead)}</p>` : ''}
          ${a.paragraphs.map((p) => `<p>${multiline(p)}</p>`).join('')}
        </div>
        ${a.info.length ? `
        <aside class="about__info" data-reveal style="--d:120ms">
          <h3>게임 정보</h3>
          <dl>${a.info.map((i) => `<div><dt>${esc(i.label)}</dt><dd>${multiline(i.value)}</dd></div>`).join('')}</dl>
        </aside>` : ''}
      </div>
      ${a.features.length ? `<div class="features">${a.features.map((f, i) => `
        <article class="feature" data-reveal style="--d:${(i % 4) * 90}ms">
          ${iconHTML(f)}
          <h3>${esc(f.title)}</h3>
          <p>${multiline(f.desc)}</p>
        </article>`).join('')}</div>` : ''}
      ${shots.length ? `<div class="shots">${shots.map((s, i) => `
        <figure class="shot" data-reveal style="--d:${(i % 3) * 90}ms" data-zoom="${esc(s.image)}" data-caption="${esc(s.caption)}">
          <img data-img="${esc(s.image)}" data-size="thumb" alt="${esc(s.caption || '게임 스크린샷')}" decoding="async">
          ${s.caption ? `<figcaption>${esc(s.caption)}</figcaption>` : ''}
        </figure>`).join('')}</div>` : ''}`;
    hydrateImages(box);
  }

  const openModes = new Set();
  function renderModes() {
    const box = $('#modesGrid');
    box.innerHTML = state.content.modes.map((m, i) => {
      const details = m.details.filter((d) => d.items.length);
      const open = openModes.has(i) && details.length > 0;
      // 대표 이미지가 있으면 왼쪽에 크게, 없으면 작은 아이콘(이모지)
      const cover = m.image
        ? `<figure class="mode__cover" data-zoom="${esc(m.image)}" data-caption="${esc(m.name)}">
             <img data-img="${esc(m.image)}" data-size="full" alt="${esc(m.name)}" decoding="async">
           </figure>`
        : '';
      const tags = m.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
      return `
      <article class="mode${cover ? ' has-cover' : ''}${open ? ' is-open' : ''}" data-reveal data-i="${i}" style="--d:${(i % 2) * 90}ms">
        ${cover}
        <div class="mode__head">
          ${cover ? (tags ? `<div class="mode__tags">${tags}</div>` : '') : `<div class="mode__top">${iconHTML(m)}<div class="mode__tags">${tags}</div></div>`}
          <h3 class="mode__name">${esc(m.name)}</h3>
        </div>
        <div class="mode__body">
          ${m.summary ? `<p class="mode__sum">${multiline(m.summary)}</p>` : ''}
          ${details.length ? `
          <button class="mode__more" type="button" aria-expanded="${open}" aria-controls="mode-detail-${i}">
            <span>${open ? '접기' : '자세히 보기'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="collapse" id="mode-detail-${i}">
            <div class="collapse__inner"><div class="collapse__body">
              ${details.map((d) => `<div class="detail"><h4>${esc(d.title)}</h4><ul>${d.items.map((it) => `<li>${multiline(it)}</li>`).join('')}</ul></div>`).join('')}
            </div></div>
          </div>` : ''}
        </div>
      </article>`;
    }).join('');
    hydrateImages(box);
  }

  function renderCurrencies() {
    const box = $('#currencyGrid');
    box.innerHTML = state.content.currencies.map((c, i) => {
      const tips = c.tips.filter((t) => t.trim());
      return `
      <article class="cur" data-reveal style="--d:${(i % 2) * 100}ms">
        <header class="cur__head">
          ${iconHTML(c)}
          <div><h3>${esc(c.name)}</h3>${c.type ? `<span class="cur__type">${esc(c.type)}</span>` : ''}</div>
        </header>
        ${c.desc ? `<p class="cur__desc">${multiline(c.desc)}</p>` : ''}
        ${c.sources.length ? `
        <h4>획득 방법</h4>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col">획득처</th><th scope="col">획득량</th><th scope="col">비고</th></tr></thead>
          <tbody>${c.sources.map((s) => `<tr><td>${esc(s.where)}</td><td>${esc(s.amount)}</td><td>${esc(s.note)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
        ${c.uses.length ? `<h4>사용처</h4><div class="pills">${c.uses.map((u) => `<span>${esc(u)}</span>`).join('')}</div>` : ''}
        ${tips.length ? `<div class="tipbox"><b>TIP</b><ul>${tips.map((t) => `<li>${multiline(t)}</li>`).join('')}</ul></div>` : ''}
      </article>`;
    }).join('');
    hydrateImages(box);
  }

  function renderFooter() {
    $('#footerNote').innerHTML = multiline(state.content.footer.note);
  }

  /* ---------- 공식 채널 ---------- */
  const LINK_KINDS = {
    youtube: { color: '#ff0033', svg: '<path d="M9.4 7.4v9.2l7.7-4.6z" fill="#fff"/>' },
    instagram: { color: '#d6249f', svg: '<rect x="4.5" y="4.5" width="15" height="15" rx="4.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16.4" cy="7.6" r="1.15" fill="#fff"/>' },
    cafe: { color: '#03c75a', svg: '<path d="M7 6h3.5l3.9 5.7V6H18v12h-3.5l-3.9-5.7V18H7z" fill="#fff"/>' },
    discord: { color: '#5865f2', svg: '<path d="M8.2 7.2a12 12 0 0 1 7.6 0l.6-.9c1.3.3 2.4.8 3.3 1.4 1.3 2.5 1.8 5 1.5 8.1-1.2.9-2.4 1.5-3.6 1.8l-.8-1.2c.5-.2 1-.4 1.4-.7-3.3 1.5-7.1 1.5-10.4 0 .4.3.9.5 1.4.7l-.8 1.2c-1.2-.3-2.4-.9-3.6-1.8-.3-3.1.2-5.6 1.5-8.1.9-.6 2-1.1 3.3-1.4z" fill="#fff"/><circle cx="9.6" cy="12.4" r="1.4" fill="#5865f2"/><circle cx="14.4" cy="12.4" r="1.4" fill="#5865f2"/>' },
    x: { color: '#16181c', svg: '<path d="M6 5h3.3l3.3 4.6L16.5 5H19l-5.1 6 5.6 8h-3.3l-3.6-5-4.4 5H5.7l5.6-6.5z" fill="#fff"/>' },
    home: { color: '#ff5b22', svg: '<circle cx="12" cy="12" r="7.6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M4.6 12h14.8M12 4.4c2.2 2.2 3.2 4.8 3.2 7.6s-1 5.4-3.2 7.6c-2.2-2.2-3.2-4.8-3.2-7.6s1-5.4 3.2-7.6z" fill="none" stroke="#fff" stroke-width="1.6"/>' }
  };

  // http(s) 주소만 허용 (주소 앞에 https:// 가 없으면 붙여 줍니다)
  function safeUrl(u) {
    let s = str(u).trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
      s = 'https://' + s.replace(/^\/+/, '');
    }
    try { return new URL(s).href; } catch (e) { return ''; }
  }
  function linkKind(url) {
    const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; } })();
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return 'youtube';
    if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
    if (/^cafe\.naver\.com$|^m\.cafe\.naver\.com$/.test(host)) return 'cafe';
    if (/(^|\.)discord\.(gg|com)$/.test(host)) return 'discord';
    if (/(^|\.)(x|twitter)\.com$/.test(host)) return 'x';
    return 'home';
  }
  function shortUrl(url) {
    try {
      const u = new URL(url);
      return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
    } catch (e) { return url; }
  }
  /* ---------- S+ 출시 · 복각 기록 ---------- */
  // '2025.03.01', '2025-3-1', '2025년 3월 1일' 모두 날짜로 알아봐요 ('2025.06 ○○ 스킨 2번째 복각' 같은 설명은 날짜로 보지 않아요)
  function parseDate(s) {
    const m = String(s || '').match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  const todayStart = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  const dayDiff = (a, b) => Math.round((a - b) / 86400000);

  function historyFor(h) {
    const c = getChar(h.charId);
    if (!c) return null;
    const today = todayStart();
    const first = parseDate(h.first);
    const dates = [first, ...h.reruns.map(parseDate)].filter(Boolean);
    const past = dates.filter((d) => d <= today);
    const future = dates.filter((d) => d > today);
    const last = past.length ? new Date(Math.max(...past)) : null;
    const next = future.length ? new Date(Math.min(...future)) : null;
    return { ...h, c, firstDate: first, last, next, today };
  }

  // 날짜 칸에 설명도 함께 적으니, 적은 글자를 그대로 보여줘요
  function historyRowsHTML(e, compact) {
    const rerunChips = e.reruns.length
      ? e.reruns.map((r) => { const d = parseDate(r); return `<span class="hist-chip${d && d > e.today ? ' is-future' : ''}">${esc(r)}</span>`; }).join('')
      : '<span class="hist-none">아직 없음</span>';
    const since = e.last ? dayDiff(e.today, e.last) : null;
    return `
      <dl class="hist__rows">
        <div><dt>첫 출시</dt><dd class="hist__first">${esc(e.first || '미입력')}</dd></div>
        <div><dt>복각 <b>${e.reruns.length}회</b></dt><dd class="hist__chips">${rerunChips}</dd></div>
      </dl>
      ${e.last || e.next ? `<p class="hist__since">
        ${e.last ? `마지막 등장 ${esc(fmtDate(e.last))} · <b>${since === 0 ? '오늘' : `${since}일 전`}</b>` : ''}
        ${e.next ? `${e.last ? '<br>' : ''}<span class="hist__next">다음 예정 ${esc(fmtDate(e.next))} · D-${dayDiff(e.next, e.today)}</span>` : ''}
      </p>` : ''}
      ${!compact && e.note ? `<p class="hist__note">${multiline(e.note)}</p>` : ''}`;
  }

  function renderHistory() {
    const section = $('#history');
    if (!section) return;
    const entries = state.content.history.map(historyFor).filter(Boolean);
    const empty = !entries.length;
    section.hidden = empty && !state.editing;
    const navLink = $('.nav__links a[data-section="history"]');
    if (navLink) navLink.hidden = empty && !state.editing;

    // 순서는 관리자 편집 창의 목록 순서 그대로 (↑ ↓ 로 바꿔요)
    const grid = $('#historyGrid');
    grid.innerHTML = empty
      ? '<p class="muted">아직 기록이 없어요. 위의 ✎ 이 섹션 편집에서 \'S+ 캐릭터 모두 불러오기\'를 눌러 시작해 보세요.</p>'
      : entries.map((e) => `
        <article class="hist" style="--c:${safeColor(e.c.color)}">
          <button type="button" class="hist__art" data-open-char="${esc(e.c.id)}" aria-label="${esc(e.c.name)} 상세 보기"><img data-hist-img="${esc(e.c.id)}" alt="" decoding="async"></button>
          <div class="hist__body">
            <div class="hist__head">
              ${gradeBadge(e.c.grade, ' grade--sm')}
              <button type="button" class="hist__name" data-open-char="${esc(e.c.id)}">${esc(e.c.name || '이름 없음')}</button>
              ${e.c.alias ? `<small>${esc(e.c.alias)}</small>` : ''}
            </div>
            ${historyRowsHTML(e)}
          </div>
        </article>`).join('');
    $$('img[data-hist-img]', grid).forEach((img) => {
      const c = getChar(img.dataset.histImg);
      if (c) setImg(img, c.image, placeholder(c.name, c.color), 'thumb');
    });
  }

  /* ---------- 업데이트 · 트레일러 ---------- */
  const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg>';

  // 유튜브 주소(watch · youtu.be · shorts · live · embed) → 영상 ID. mp4 같은 파일도 재생해요.
  function parseVideo(url) {
    const href = safeUrl(url);
    if (!href) return null;
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (/^(youtube|youtube-nocookie)\.com$/.test(host)) {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else { const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/); if (m) id = m[2]; }
    }
    if (/^[\w-]{11}$/.test(id)) {
      const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
      const tm = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      const start = tm ? (Number(tm[1] || 0) * 3600 + Number(tm[2] || 0) * 60 + Number(tm[3] || 0)) : 0;
      return { type: 'youtube', id, href, start };
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { type: 'file', href };
    return { type: 'link', href };
  }

  let updIndex = 0;
  const allUpdates = () => state.content.updates.map((u, i) => ({ ...u, i, media: parseVideo(u.video) }));

  function updThumb(u) {
    if (u.image) return `<img data-img="${esc(u.image)}" data-size="full" alt="" decoding="async">`;
    if (u.media && u.media.type === 'youtube') return `<img src="https://i.ytimg.com/vi/${u.media.id}/maxresdefault.jpg" data-yt="${u.media.id}" alt="" decoding="async">`;
    return `<span class="upd-noimg" aria-hidden="true">${ballSVG()}</span>`;
  }
  // 고화질 썸네일이 없는 영상은 기본 썸네일로
  function fixYtThumbs(root) {
    $$('img[data-yt]', root).forEach((img) => {
      const fallback = () => {
        if (img.dataset.fb) return;
        img.dataset.fb = '1';
        img.src = `https://i.ytimg.com/vi/${img.dataset.yt}/hqdefault.jpg`;
      };
      const check = () => { if (img.naturalWidth && img.naturalWidth <= 120) fallback(); };
      img.addEventListener('error', fallback);
      if (img.complete) check(); else img.addEventListener('load', check);
    });
  }

  // 파일을 직접 연 화면(file://)에서는 유튜브가 사이트 주소를 몰라 '오류 153'으로 재생을 막아요.
  // 그때는 사이트 안에서 재생하지 않고 유튜브 새 탭으로 열어 줍니다.
  const canEmbed = (m) => !!m && (m.type === 'file' || (m.type === 'youtube' && location.protocol !== 'file:'));

  function featureHTML(u) {
    const m = u.media;
    const label = `${esc(u.title || '업데이트 영상')} 재생`;
    let player;
    if (!m) player = `<div class="upd-play upd-play--empty">${updThumb(u)}<span class="upd-empty">영상 주소가 아직 없어요</span></div>`;
    else if (!canEmbed(m)) player = `<a class="upd-play" href="${esc(m.href)}" target="_blank" rel="noopener noreferrer" aria-label="${label} (새 탭)">${updThumb(u)}<span class="upd-play__btn">${PLAY_ICON}</span></a>`;
    else player = `<button class="upd-play" type="button" data-play aria-label="${label}">${updThumb(u)}<span class="upd-play__btn">${PLAY_ICON}</span></button>`;
    const fileNote = m && m.type === 'youtube' && !canEmbed(m)
      ? '<p class="upd-note">지금은 파일을 직접 연 화면이라 유튜브 새 탭으로 열려요. tools/미리보기.bat 이나 인터넷에 올린 주소에서는 사이트 안에서 바로 재생돼요.</p>'
      : '';
    return `
      <div class="upd-feature">
        <div class="upd-media"><div class="upd-player" id="updPlayer">${player}</div>${fileNote}</div>
        <div class="upd-info">
          <div class="upd-meta">${u.i === 0 ? '<span class="upd-latest">LATEST</span>' : ''}${u.date ? `<span class="upd-date">${esc(u.date)}</span>` : ''}</div>
          <h3 class="upd-title">${esc(u.title || '새 업데이트')}</h3>
          ${u.desc ? `<p class="upd-desc">${multiline(u.desc)}</p>` : ''}
          ${m && m.type !== 'file' ? `<a class="btn btn--ghost btn--sm upd-ext" href="${esc(m.href)}" target="_blank" rel="noopener noreferrer">${m.type === 'youtube' ? '유튜브에서 보기' : '영상 페이지 열기'} ↗</a>` : ''}
        </div>
      </div>`;
  }

  function renderUpdates() {
    const ups = allUpdates();
    const empty = !ups.length;
    $('#updates').hidden = empty && !state.editing;
    const navLink = $('.nav__links a[data-section="updates"]');
    if (navLink) navLink.hidden = empty && !state.editing;
    if (updIndex >= ups.length) updIndex = 0;

    const body = $('#updatesBody');
    body.innerHTML = empty
      ? '<p class="muted">아직 등록된 업데이트가 없어요. 위의 ✎ 이 섹션 편집에서 트레일러 주소를 넣어 보세요.</p>'
      : featureHTML(ups[updIndex]) + (ups.length > 1 ? `
        <div class="upd-list">${ups.map((u) => `
          <button type="button" class="upd-item${u.i === updIndex ? ' is-active' : ''}" data-upd="${u.i}" aria-pressed="${u.i === updIndex}">
            <span class="upd-item__thumb">${updThumb(u)}<span class="upd-item__play">${PLAY_ICON}</span></span>
            <span class="upd-item__text">${u.date ? `<small>${esc(u.date)}</small>` : ''}<b>${esc(u.title || '새 업데이트')}</b></span>
          </button>`).join('')}
        </div>` : '');
    hydrateImages(body);
    fixYtThumbs(body);

    // 메인 화면 'UPDATE' 안내
    const hero = $('#heroUpdate');
    const featured = ups.filter((u) => u.featured);
    hero.hidden = !featured.length;
    hero.innerHTML = featured.length ? `
      <span class="hero__new-tag hero__update-tag">UPDATE</span>
      ${featured.map((u) => `
        <button type="button" class="hero__new-btn hero__update-btn" data-play-update="${u.i}">
          <span class="hero__update-play">${PLAY_ICON}</span>
          <b>${esc(u.title || '새 업데이트')}</b>${u.date ? `<small>${esc(u.date)}</small>` : ''}
        </button>`).join('')}` : '';
  }

  function playFeature() {
    const u = state.content.updates[updIndex];
    const box = $('#updPlayer');
    const m = u && parseVideo(u.video);
    if (!m || !box || !canEmbed(m)) return;
    const title = esc(u.title || '업데이트 영상');
    if (m.type === 'youtube') {
      box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${m.id}?autoplay=1&rel=0&playsinline=1${m.start ? `&start=${m.start}` : ''}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    } else if (m.type === 'file') {
      box.innerHTML = `<video src="${esc(m.href)}" title="${title}" controls autoplay playsinline></video>`;
    }
  }

  function selectUpdate(i, autoplay) {
    if (!state.content.updates[i]) return;
    const changed = i !== updIndex;
    updIndex = i;
    renderUpdates();
    const feat = $('.upd-feature');
    if (changed && feat && !reduceMotion) {
      feat.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: EASE });
    }
    if (autoplay) playFeature();
  }

  const linkIcon = (kind) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${LINK_KINDS[kind].svg}</svg>`;
  const validLinks = () => state.content.links.map((l) => ({ ...l, href: safeUrl(l.url) })).filter((l) => l.href);

  function renderLinks() {
    const links = validLinks();
    const section = $('#links');
    // 링크가 하나도 없으면 섹션과 메뉴를 숨겨요 (편집 중에는 보이게)
    const empty = !links.length && !state.editing;
    section.hidden = empty;
    const navLink = $('.nav__links a[data-section="links"]');
    if (navLink) navLink.hidden = empty;
    $('#linksGrid').innerHTML = links.length ? links.map((l, i) => {
      const kind = linkKind(l.href);
      return `
      <a class="link-card" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" data-reveal style="--d:${(i % 4) * 80}ms;--lc:${LINK_KINDS[kind].color}">
        <span class="link-card__icon link-ico--${kind}">${linkIcon(kind)}</span>
        <span class="link-card__text">
          <b>${esc(l.name || shortUrl(l.href))}</b>
          <small>${esc(shortUrl(l.href))}</small>
          ${l.desc ? `<em>${esc(l.desc)}</em>` : ''}
        </span>
        <svg class="link-card__go" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>
      </a>`;
    }).join('') : '<p class="muted">아직 등록된 링크가 없어요.</p>';
    $('#footerSocial').innerHTML = links.map((l) => {
      const kind = linkKind(l.href);
      return `<a class="social link-ico--${kind}" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(l.name || shortUrl(l.href))}" title="${esc(l.name || shortUrl(l.href))}">${linkIcon(kind)}</a>`;
    }).join('');
  }

  function applySiteSettings() {
    const s = site();
    document.title = s.title || '더 스파이크 크로스 공략집';
    document.body.classList.toggle('pixel-art', s.pixelArt);
    document.documentElement.style.setProperty('--card-fit', s.cardImageFit);
    // 테마: html 에 theme-아이디 를 붙여요 (원래 테마는 아무것도 붙이지 않아요)
    THEMES.forEach((t) => document.documentElement.classList.toggle('theme-' + t.id, t.id !== 'default' && s.theme === t.id));
  }

  // 관리자가 글을 고칠 때마다 다시 그리는 부분 (캐릭터 목록 제외)
  function renderContent() {
    applySiteSettings();
    renderLogos();
    renderHeroText();
    renderSectionHeads();
    renderAbout();
    renderModes();
    renderCurrencies();
    renderUpdates();
    renderHistory();
    renderHeroRerun();
    renderLinks();
    renderFooter();
    if (state.editing) revealAllNow(); else observeReveal();
  }

  /* =====================================================================
   *  캐릭터 목록 (필터 · 검색 · 정렬)
   * ===================================================================== */
  function renderChips() {
    const wrap = $('#posChips');
    const positions = allPositions();
    if (state.filter !== 'all' && !positions.includes(state.filter)) state.filter = 'all';
    wrap.innerHTML = [['all', '전체'], ...positions.map((p) => [p, p])]
      .map(([v, label]) => `<button type="button" class="chip${state.filter === v ? ' is-active' : ''}" data-filter="${esc(v)}" aria-pressed="${state.filter === v}">${esc(label)}</button>`)
      .join('') + '<span class="chips__pill" aria-hidden="true"></span>';
    movePill(false);
  }
  function movePill(animate = true) {
    const wrap = $('#posChips');
    const pill = $('.chips__pill', wrap);
    const active = $('.chip.is-active', wrap);
    if (!pill || !active) return;
    if (!animate) pill.style.transition = 'none';
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
    if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
  }

  // 포지션 묶음(스파이커 → 미들블로커 → 세터 → 미정) 안에서 등급순 (S+ → … → A- → 등급 없음).
  // 같은 등급끼리는 관리자가 정한 순서. 상세 창의 이전/다음도 이 순서를 따라요.
  const posRank = (p) => { const i = POSITIONS.indexOf(p); return i < 0 ? POSITIONS.length : i; };
  function visibleList() {
    const q = state.query.trim().toLowerCase();
    const out = state.data.characters.filter((c) => {
      if (state.filter !== 'all' && c.position !== state.filter) return false;
      if (!q) return true;
      const hay = [c.name, c.alias, c.position, c.grade, ...c.traits.map((t) => `${t.name} ${t.tag}`), ...c.skins.map((s) => s.name)].join(' ').toLowerCase();
      return hay.includes(q);
    });
    return out.sort((a, b) => posRank(a.position) - posRank(b.position) || gradeRank(a.grade) - gradeRank(b.grade));
  }

  const gradeBadge = (g, extra = '') => (g ? `<span class="grade grade--${gradeClass(g)}${extra}">${esc(g)}</span>` : '');

  // 메인 화면의 '신규 캐릭터' 안내
  function renderHeroNew() {
    const box = $('#heroNew');
    if (!box) return;
    const fresh = visibleOrder(state.data.characters).filter((c) => c.isNew);
    box.hidden = !fresh.length;
    box.innerHTML = fresh.length ? `
      <span class="hero__new-tag">NEW</span>
      <span class="hero__new-label">신규 캐릭터</span>
      ${fresh.map((c) => `
        <button type="button" class="hero__new-btn" data-open-char="${esc(c.id)}" style="--c:${safeColor(c.color)}">
          ${gradeBadge(c.grade, ' grade--sm')}
          <b>${esc(c.name || '이름 없음')}</b>${c.alias ? `<small>${esc(c.alias)}</small>` : ''}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>`).join('')}` : '';
  }
  const visibleOrder = (arr) => [...arr].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade));

  // 메인 화면의 '신규 스킨' 안내 (누르면 그 스킨이 선택된 상세 창이 열려요)
  function renderHeroNewSkin() {
    const box = $('#heroNewSkin');
    if (!box) return;
    const fresh = visibleOrder(state.data.characters).flatMap((c) =>
      c.skins.map((s, i) => ({ c, s, i })).filter((x) => x.s.isNew));
    box.hidden = !fresh.length;
    box.innerHTML = fresh.length ? `
      <span class="hero__new-tag">NEW</span>
      <span class="hero__new-label">신규 스킨</span>
      ${fresh.map(({ c, s, i }) => `
        <button type="button" class="hero__new-btn" data-open-char="${esc(c.id)}" data-open-skin="${i}" style="--c:${safeColor(c.color)}">
          ${gradeBadge(c.grade, ' grade--sm')}
          <b>${esc(c.name || '이름 없음')}</b><small>${esc(s.name || '이름 없는')} 스킨</small>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>`).join('')}` : '';
  }

  // 메인 화면 안내 줄 (신규 캐릭터 · 신규 스킨 · 복각)
  function renderHeroRows() {
    renderHeroNew();
    renderHeroNewSkin();
    renderHeroRerun();
  }

  // 메인 화면의 'RERUN' (복각) 안내: 시작 전엔 D-day, 기간 중엔 '복각 중', 종료일이 지나면 숨겨요
  const shortDate = (d) => `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
  function rerunEntries() {
    const today = todayStart();
    return state.content.rerunNotices.map((r) => {
      const c = getChar(r.charId);
      if (!c) return null;
      const start = parseDate(r.start);
      const end = parseDate(r.end);
      if (end && end < today) return null;
      const soon = !!(start && start > today);
      let when;
      if (soon) when = `${shortDate(start)} 복각 예정 · D-${dayDiff(start, today)}`;
      else if (end) when = dayDiff(end, today) === 0 ? '복각 중 · 오늘 마감' : `복각 중 · ~${shortDate(end)}`;
      else when = '복각 중';
      return { ...r, c, soon, start, when, skinIndex: r.skin ? c.skins.findIndex((s) => s.name === r.skin) : -1 };
    }).filter(Boolean)
      // 진행 중인 복각 먼저, 예정은 가까운 날짜부터
      .sort((a, b) => (a.soon - b.soon) || ((a.start || 0) - (b.start || 0)));
  }
  function renderHeroRerun() {
    const box = $('#heroRerun');
    if (!box) return;
    const items = rerunEntries();
    box.hidden = !items.length;
    box.innerHTML = items.length ? `
      <span class="hero__new-tag hero__rerun-tag">RERUN</span>
      <span class="hero__new-label">복각</span>
      ${items.map((r) => `
        <button type="button" class="hero__new-btn hero__rerun-btn${r.soon ? ' is-soon' : ''}" data-open-char="${esc(r.c.id)}"${r.skinIndex >= 0 ? ` data-open-skin="${r.skinIndex}"` : ''} style="--c:${safeColor(r.c.color)}">
          ${gradeBadge(r.c.grade, ' grade--sm')}
          <b>${esc(r.c.name || '이름 없음')}</b>${r.skin ? `<small>${esc(r.skin)} 스킨</small>` : ''}
          <span class="hero__rerun-when">${esc(r.when)}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>`).join('')}` : '';
  }

  const cardEls = new Map();
  let gridReady = false;

  function createCard(c) {
    const el = document.createElement('article');
    el.className = 'ccard';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.dataset.id = c.id;
    el.innerHTML = `
      <div class="ccard__inner">
        <div class="ccard__art">
          <img alt="" loading="lazy" decoding="async">
          <div class="ccard__tags"><span class="ccard__new">NEW</span><span class="ccard__pos"></span></div>
          <span class="ccard__grade"></span>
        </div>
        <div class="ccard__body">
          <h3 class="ccard__name"></h3>
          <p class="ccard__alias"></p>
          <div class="ccard__meta"><span>총합<b class="ccard__total"></b></span><span>스킨<b class="ccard__skins"></b></span></div>
        </div>
        <span class="ccard__shine" aria-hidden="true"></span>
      </div>`;
    el.addEventListener('click', () => openCharacter(el.dataset.id));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCharacter(el.dataset.id); }
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    });
    updateCard(el, c);
    return el;
  }

  function updateCard(el, c) {
    el.style.setProperty('--c', safeColor(c.color));
    const img = $('img', el);
    setImg(img, c.image, placeholder(c.name, c.color), 'thumb');
    img.alt = `${c.name || '캐릭터'} 이미지`;
    const pos = $('.ccard__pos', el);
    pos.textContent = c.position;
    pos.hidden = !c.position;
    $('.ccard__new', el).hidden = !c.isNew;
    el.classList.toggle('is-new', c.isNew);
    $('.ccard__grade', el).innerHTML = gradeBadge(c.grade);
    $('.ccard__name', el).textContent = c.name || '이름 없음';
    $('.ccard__alias', el).textContent = c.alias;
    $('.ccard__total', el).textContent = statTotal(c);
    $('.ccard__skins', el).textContent = c.skins.length;
    el.setAttribute('aria-label', `${c.name || '캐릭터'} 상세 보기`);
  }

  function refreshCard(id) {
    const c = getChar(id);
    const el = cardEls.get(id);
    if (c && el) updateCard(el, c);
  }

  // 포지션 묶음 (한 번 만들어 두고 계속 씀)
  const groupEls = new Map();
  let extraGrid = null;
  function groupFor(pos) {
    if (groupEls.has(pos)) return groupEls.get(pos);
    const sec = document.createElement('section');
    sec.className = 'cgroup';
    sec.dataset.pos = pos || 'none';
    sec.innerHTML = `
      <header class="cgroup__head">
        <span class="cgroup__code">${esc(POS_CODES[pos] || '—')}</span>
        <h3 class="cgroup__name">${esc(pos || '포지션 미정')}</h3>
        <span class="cgroup__count"></span>
      </header>
      <div class="cgrid"></div>`;
    if (!gridReady) $('.cgroup__head', sec).setAttribute('data-reveal', '');
    groupEls.set(pos, sec);
    return sec;
  }

  function renderCharacters() {
    const grid = $('#charGrid');
    const shownList = visibleList();
    const animate = gridReady && !reduceMotion;

    // FLIP: 바뀌기 전 위치 기억
    const first = new Map();
    if (animate) cardEls.forEach((el, id) => { if (!el.hidden && el.isConnected) first.set(id, el.getBoundingClientRect()); });

    const alive = new Set(state.data.characters.map((c) => c.id));
    cardEls.forEach((el, id) => { if (!alive.has(id)) { el.remove(); cardEls.delete(id); } });

    // 포지션별로 나눠 담기
    const order = [...POSITIONS, ''];
    const byPos = new Map(order.map((p) => [p, []]));
    shownList.forEach((c) => byPos.get(POSITIONS.includes(c.position) ? c.position : '').push(c));

    const shown = new Set();
    order.forEach((pos) => {
      const items = byPos.get(pos);
      const sec = groupFor(pos);
      grid.appendChild(sec);
      sec.hidden = !items.length;
      $('.cgroup__count', sec).textContent = `${items.length}명`;
      const g = $('.cgrid', sec);
      items.forEach((c, i) => {
        let el = cardEls.get(c.id);
        if (!el) {
          el = createCard(c);
          cardEls.set(c.id, el);
          if (!gridReady) {
            el.setAttribute('data-reveal', '');
            el.style.setProperty('--d', (i % 4) * 80 + 'ms');
          }
        } else {
          updateCard(el, c);
        }
        el.hidden = false;
        shown.add(c.id);
        g.appendChild(el);
      });
    });
    cardEls.forEach((el, id) => { if (!shown.has(id)) el.hidden = true; });

    // 관리자 모드의 '새 캐릭터 추가' 카드 자리
    if (!extraGrid) { extraGrid = document.createElement('div'); extraGrid.className = 'cgrid cgrid--extra'; }
    grid.appendChild(extraGrid);
    emit('gridrender', extraGrid);
    $('#charEmpty').hidden = shownList.length > 0 || state.editing;
    renderHeroRows();

    // FLIP: 새 위치에서 이전 위치로부터 미끄러지듯 이동
    if (animate) {
      shownList.forEach((c) => {
        const el = cardEls.get(c.id);
        const f = first.get(c.id);
        if (f) {
          const l = el.getBoundingClientRect();
          const dx = f.left - l.left;
          const dy = f.top - l.top;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 650, easing: EASE });
          }
        } else if (el.classList.contains('is-in') || !el.hasAttribute('data-reveal')) {
          el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 550, easing: EASE, delay: 80, fill: 'backwards' });
        }
      });
    }
    if (!gridReady) observeReveal(grid);
    gridReady = true;
  }

  /* =====================================================================
   *  캐릭터 상세 창
   * ===================================================================== */
  const modal = $('#charModal');
  const panel = $('.modal__panel', modal);
  let lastFocus = null;

  function openCharacter(id, dir = 0) {
    const c = getChar(id);
    if (!c) return;
    const wasOpen = state.openId !== null;
    state.openId = id;
    state.skinIndex = -1;
    if (!wasOpen) lastFocus = document.activeElement;
    renderModal();
    if (!wasOpen) {
      panel.scrollTop = 0;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-locked');
      setTimeout(() => { const btn = $('.modal__actions [data-close]', modal); if (btn) btn.focus({ preventScroll: true }); }, 60);
    } else {
      panel.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (!reduceMotion) {
        $('#mGrid').animate(
          [{ opacity: 0, transform: `translateX(${dir * 26}px)` }, { opacity: 1, transform: 'none' }],
          { duration: 500, easing: EASE }
        );
      }
    }
    try { history.replaceState(null, '', '#c-' + encodeURIComponent(id)); } catch (e) { /* 무시 */ }
    emit('modalopen', c);
  }

  function closeCharacter() {
    if (state.openId === null) return;
    state.openId = null;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 무시 */ }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    emit('modalclose');
  }

  function navList() {
    const l = visibleList();
    return l.some((c) => c.id === state.openId) ? l : state.data.characters;
  }
  function step(d) {
    const l = navList();
    if (l.length < 2) return;
    const i = l.findIndex((c) => c.id === state.openId);
    openCharacter(l[(i + d + l.length) % l.length].id, d);
  }
  function updateModalCount() {
    const l = navList();
    const i = l.findIndex((c) => c.id === state.openId);
    const pad = (n) => String(n).padStart(2, '0');
    $('#mCount').textContent = i >= 0 ? `${pad(i + 1)} / ${pad(l.length)}` : '';
    $$('[data-nav]', modal).forEach((b) => { b.disabled = l.length < 2; });
  }

  function renderModal() {
    const c = current();
    if (!c) return;
    panel.style.setProperty('--c', safeColor(c.color));
    updateModalCount();
    renderSkinStrip();
    refreshStage(true);
    renderInfo();
  }

  function renderInfo() {
    const c = current();
    if (!c) return;
    const box = $('#mInfo');
    if (state.editing && api.editor) {
      api.editor.renderForm(box, c);
      return;
    }
    box.innerHTML = infoHTML(c);
    $$('img[data-combo-img]', box).forEach((img) => {
      const m = getChar(img.dataset.comboImg);
      if (m) setImg(img, m.image, placeholder(m.name, m.color), 'thumb');
    });
    animateCounts(box);
  }

  // 이 캐릭터가 들어간 조합 (함께 편성하면 능력치 보너스)
  function combosHTML(c) {
    const mine = state.content.combos.filter((k) => k.members.includes(c.id));
    if (!mine.length) return '';
    return `
      <section class="block">
        <div class="block__head"><h3 class="block__title">조합<small>${mine.length}</small></h3></div>
        <div class="combos">${mine.map((k) => {
          const bonus = state.data.statDefs.filter((d) => k.bonus[d.key]);
          return `
          <article class="combo">
            <h4 class="combo__name">${esc(k.name || '이름 없는 조합')}</h4>
            <div class="combo__mems">${k.members.map(getChar).filter(Boolean).map((m) => `
              <button type="button" class="combo__mem${m.id === c.id ? ' is-me' : ''}" style="--c:${safeColor(m.color)}"${m.id === c.id ? ' disabled' : ` data-open-char="${esc(m.id)}" aria-label="${esc(m.name)} 상세 보기"`}>
                <img data-combo-img="${esc(m.id)}" alt="" decoding="async">
                <span class="combo__tags">${gradeBadge(m.grade, ' grade--sm')}${POS_CODES[m.position] ? `<i>${esc(POS_CODES[m.position])}</i>` : ''}</span>
                <span class="combo__nm">${esc(m.name || '이름 없음')}</span>
              </button>`).join('')}
            </div>
            ${bonus.length ? `<p class="combo__bonus">${bonus.map((d) => `<span style="--sc:${d.color}">${statIcon(d.icon)}${esc(d.name)} <b>${k.bonus[d.key] > 0 ? '+' : ''}${k.bonus[d.key]}</b></span>`).join('')}</p>` : ''}
            ${k.desc.trim() ? `<p class="combo__desc" style="--sc:#ffc94a">${statIcon('star')}<span>${multiline(k.desc.trim())}</span></p>` : ''}
          </article>`;
        }).join('')}</div>
      </section>`;
  }

  // 스탯 숫자가 0부터 올라가는 효과
  function animateCounts(root) {
    const els = $$('[data-count-to]', root);
    if (!els.length || reduceMotion || document.hidden) return;
    const dur = 750;
    let t0 = 0;
    els.forEach((el) => { el.textContent = '0'; });
    const tick = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      els.forEach((el) => { el.textContent = Math.round(Number(el.dataset.countTo) * e); });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // 화면 그리기가 늦어져도 최종 숫자는 꼭 보이도록
    setTimeout(() => els.forEach((el) => { el.textContent = el.dataset.countTo; }), dur + 300);
  }

  function infoHTML(c) {
    const defs = state.data.statDefs;
    const n = state.data.characters.length;
    const head = `
      <div class="mi__head">
        <div class="mi__badges">
          ${gradeBadge(c.grade, ' grade--lg')}
          ${c.isNew ? '<span class="new-badge">NEW</span>' : ''}
          ${c.position ? `<span class="pos-badge">${esc(c.position)}</span>` : ''}
        </div>
        ${c.alias ? `<p class="mi__alias">${esc(c.alias)}</p>` : ''}
        <h2 class="mi__name" id="mName">${esc(c.name || '이름 없음')}</h2>
      </div>`;
    const desc = c.description ? `<p class="mi__desc">${multiline(c.description)}</p>` : '';
    const profile = c.profile.length
      ? `<dl class="profile">${c.profile.map((p) => `<div><dt>${esc(p.label)}</dt><dd>${esc(p.value)}</dd></div>`).join('')}</dl>`
      : '';
    const num = (v) => `<b data-count-to="${v}">${v}</b>`;
    const range = (s) => (s.min === s.max ? num(s.max) : `${num(s.min)}<i>~</i>${num(s.max)}`);
    const stats = defs.length ? `
      <section class="block">
        <div class="block__head"><h3 class="block__title">스탯</h3></div>
        <div class="srows">
          ${defs.map((d, i) => {
            const s = c.stats[d.key] || { min: 0, max: 0 };
            return `<div class="srow" style="--sc:${d.color};--i:${i}">
              ${statIcon(d.icon)}
              <span class="srow__name">${esc(d.name)}</span>
              <span class="srow__val">${range(s)}</span>
              ${n > 1 ? `<span class="srow__tip">최대값 기준 ${n}명 중 ${rankOf(c, d.key)}위</span>` : ''}
            </div>`;
          }).join('')}
          <div class="srow srow--total" style="--i:${defs.length}">
            <span class="srow__name">총합 스테이터스</span>
            <span class="srow__val">${num(statTotal(c))}</span>
          </div>
        </div>
      </section>` : '';
    const traits = `
      <section class="block">
        <div class="block__head"><h3 class="block__title">특성<small>${c.traits.length}</small></h3></div>
        ${c.traits.length ? `<ul class="traits">${c.traits.map((t, i) => `
          <li class="trait" style="--i:${i}">
            <div class="trait__head">
              ${t.icon ? `<span class="trait__icon" aria-hidden="true">${esc(t.icon)}</span>` : ''}
              <b>${esc(t.name || '이름 없는 특성')}</b>
              ${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ''}
            </div>
            ${t.desc ? `<p>${multiline(t.desc)}</p>` : ''}
          </li>`).join('')}</ul>` : '<p class="muted">등록된 특성이 없어요.</p>'}
      </section>`;
    // 출시 · 복각 기록이 있으면 함께 보여줘요
    const hEntry = state.content.history.find((h) => h.charId === c.id);
    const he = hEntry && historyFor(hEntry);
    const history = he ? `
      <section class="block">
        <div class="block__head"><h3 class="block__title">출시 · 복각</h3></div>
        <div class="hist hist--inline">${historyRowsHTML(he)}</div>
      </section>` : '';
    return head + desc + profile + stats + combosHTML(c) + history + traits;
  }

  function renderSkinStrip() {
    const c = current();
    if (!c) return;
    const wrap = $('#mSkins');
    const items = [{ name: '기본', image: c.image, base: true }, ...c.skins];
    if (state.skinIndex >= c.skins.length) state.skinIndex = -1;
    $('#mSkinCount').textContent = c.skins.length ? `${c.skins.length}개` : '없음';
    wrap.innerHTML = items.map((s, i) => {
      const isOn = i - 1 === state.skinIndex;
      return `<button type="button" class="skin${isOn ? ' is-active' : ''}" role="option" aria-selected="${isOn}" data-skin="${i - 1}">
        <span class="skin__thumb"><img alt="" loading="lazy" decoding="async">${s.isNew ? '<span class="skin__new">NEW</span>' : ''}</span>
        <span class="skin__label">${esc(s.base ? '기본' : s.name || `스킨 ${i}`)}</span>
      </button>`;
    }).join('');
    $$('img', wrap).forEach((img, i) => setImg(img, items[i].image, placeholder(i ? items[i].name || c.name : c.name, c.color, i ? 1 : 0), 'thumb'));
  }

  function selectSkin(index) {
    const c = current();
    if (!c) return;
    index = clamp(index, -1, c.skins.length - 1);
    if (index === state.skinIndex) return;
    state.skinIndex = index;
    $$('.skin', $('#mSkins')).forEach((b) => {
      const isOn = Number(b.dataset.skin) === index;
      b.classList.toggle('is-active', isOn);
      b.setAttribute('aria-selected', isOn);
    });
    refreshStage(false, true);
    emit('skinchange', index);
  }

  function refreshStage(instant, animateInfo) {
    const c = current();
    if (!c) return;
    const skin = state.skinIndex >= 0 ? c.skins[state.skinIndex] : null;
    const ref = skin ? skin.image : c.image;
    const fb = placeholder(skin ? skin.name || c.name : c.name, c.color, skin ? 1 : 0);
    const img = $('#mImg');
    img.alt = skin ? `${c.name} - ${skin.name} 스킨` : `${c.name} 기본 모습`;
    swapImage(img, ref, fb, instant);

    const info = $('#mSkinInfo');
    info.innerHTML = skin
      ? `<div class="skin-info__row">${skin.isNew ? '<span class="new-badge">NEW</span>' : ''}<b>${esc(skin.name || '이름 없는 스킨')}</b>${skin.rarity ? `<span class="rarity ${rarityClass(skin.rarity)}">${esc(skin.rarity)}</span>` : ''}</div>
         ${skin.howToGet ? `<p>획득 방법 · ${multiline(skin.howToGet)}</p>` : ''}`
      : `<div class="skin-info__row"><b>기본 모습</b></div>${c.skins.length ? '<p>아래에서 스킨을 골라 미리 볼 수 있어요.</p>' : ''}`;
    if (animateInfo && !reduceMotion) {
      info.classList.remove('is-changing');
      void info.offsetWidth;
      info.classList.add('is-changing');
    }
  }

  /* ---------- 라이트박스 ---------- */
  const lightbox = $('#lightbox');
  function openLightbox(src, caption) {
    if (!src) return;
    $('#lbImg').src = src;
    $('#lbImg').alt = caption || '';
    $('#lbCap').textContent = caption || '';
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
  }
  function closeLightbox() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
  }

  /* =====================================================================
   *  메뉴 · 스크롤 · 등장 애니메이션
   * ===================================================================== */
  function moveIndicator() {
    const ind = $('.nav__indicator');
    const a = $('.nav__links a.is-active');
    if (!ind) return;
    if (!a) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
  }

  function initNav() {
    const nav = $('#nav');
    const progress = $('#progress');
    const links = $$('.nav__links a');
    const toggle = $('#navToggle');

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        nav.classList.toggle('is-scrolled', y > 10);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const setActive = (id) => {
      links.forEach((a) => a.classList.toggle('is-active', a.dataset.section === id));
      moveIndicator();
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
      }, { rootMargin: '-45% 0px -50% 0px' });
      ['home', 'updates', 'about', 'characters', 'history', 'gacha', 'modes', 'currency', 'links'].forEach((id) => {
        const s = document.getElementById(id);
        if (s) io.observe(s);
      });
    }

    const closeMenu = () => {
      nav.classList.remove('is-menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '메뉴 열기');
    };
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('is-menu');
      nav.classList.toggle('is-menu', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    links.forEach((a) => a.addEventListener('click', closeMenu));
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-menu') && !nav.contains(e.target)) closeMenu();
    });

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => { moveIndicator(); movePill(false); });
    }, { passive: true });
  }

  const revealIO = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
    : null;

  function observeReveal(root = document) {
    $$('[data-reveal]:not(.is-in)', root).forEach((el) => (revealIO ? revealIO.observe(el) : el.classList.add('is-in')));
  }
  function revealAllNow() {
    $$('[data-reveal]:not(.is-in)').forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- 알림 ---------- */
  let toastTimer = 0;
  function toast(msg, type = '', ms = 2800) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast is-show' + (type ? ' is-' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-show'), ms);
  }

  /* =====================================================================
   *  편집 모드 연결 (실제 편집 기능은 admin.js)
   * ===================================================================== */
  function setEditing(on) {
    state.editing = !!on;
    document.body.classList.toggle('is-editing', state.editing);
    renderUpdates(); // 비어 있는 섹션도 편집 중에는 보이게
    renderHistory();
    renderLinks();
    if (state.editing) revealAllNow(); else observeReveal();
    renderCharacters();
    if (state.openId !== null) renderInfo();
    emit('editing', state.editing);
  }

  // 스탯 항목 · 포지션처럼 캐릭터 구조가 바뀐 뒤
  function refreshAll() {
    renderChips();
    renderCharacters();
    updateHeroCounts();
    if (state.openId !== null) {
      if (getChar(state.openId)) renderModal();
      else closeCharacter();
    }
  }

  // 내용 전체가 바뀐 뒤 (되돌리기 · 임시본 불러오기 · 백업 불러오기)
  function refreshEverything() {
    renderContent();
    refreshAll();
  }

  /* =====================================================================
   *  이벤트 연결
   * ===================================================================== */
  function bindUI() {
    $('#charSearch').addEventListener('input', (e) => { state.query = e.target.value; renderCharacters(); });

    $('#posChips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state.filter = b.dataset.filter;
      $$('.chip', b.parentNode).forEach((x) => {
        const isOn = x === b;
        x.classList.toggle('is-active', isOn);
        x.setAttribute('aria-pressed', String(isOn));
      });
      movePill();
      b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      renderCharacters();
    });


    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return closeCharacter();
      const nav = e.target.closest('[data-nav]');
      if (nav) return step(Number(nav.dataset.nav));
      const skin = e.target.closest('#mSkins [data-skin]');
      if (skin) return selectSkin(Number(skin.dataset.skin));
      if (e.target.closest('#mStage')) {
        const img = $('#mImg');
        openLightbox(img.currentSrc || img.src, img.alt);
      }
    });

    // 상세 창 안에서만 Tab 이동
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', panel)
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    lightbox.addEventListener('click', closeLightbox);

    document.addEventListener('click', (e) => {
      const openChar = e.target.closest('[data-open-char]');
      if (openChar) {
        openCharacter(openChar.dataset.openChar);
        // 메인 화면 복각 안내에서 누르면 그 스킨을 바로 보여줘요
        if (openChar.dataset.openSkin) selectSkin(Number(openChar.dataset.openSkin));
        return;
      }
      // 업데이트 영상: 큰 화면 재생 · 목록에서 고르기 · 메인 화면 UPDATE 버튼
      if (e.target.closest('[data-play]')) { playFeature(); return; }
      const upd = e.target.closest('[data-upd]');
      if (upd) {
        selectUpdate(Number(upd.dataset.upd), true);
        const player = $('#updPlayer');
        if (player) player.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
        return;
      }
      const heroUpd = e.target.closest('[data-play-update]');
      if (heroUpd) {
        $('#updates').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
        selectUpdate(Number(heroUpd.dataset.playUpdate), true);
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) { emit('editsection', edit.dataset.edit); return; }
      const z = e.target.closest('[data-zoom]');
      if (z) getImageURL(z.dataset.zoom, 'full').then((url) => openLightbox(url, z.dataset.caption)).catch(() => {});
    });

    $('#modesGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.mode__more');
      if (!b) return;
      const card = b.closest('.mode');
      const i = Number(card.dataset.i);
      const open = !card.classList.contains('is-open');
      card.classList.toggle('is-open', open);
      if (open) openModes.add(i); else openModes.delete(i);
      b.setAttribute('aria-expanded', String(open));
      $('span', b).textContent = open ? '접기' : '자세히 보기';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (lightbox.classList.contains('is-open')) return closeLightbox();
        if (api.editor && api.editor.handleEscape && api.editor.handleEscape()) return;
        if (state.openId !== null) return closeCharacter();
      }
      if (state.openId !== null && !lightbox.classList.contains('is-open') && !e.target.closest('input, textarea, select, [contenteditable]')) {
        if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
      }
    });
  }

  /* =====================================================================
   *  공개 API (admin.js 에서 사용)
   * ===================================================================== */
  const api = window.TSC = {
    state, $, $$, esc, multiline, clone, clamp, store, on, emit, BLANK, remoteEnabled,
    normalizeContent, normalize, snapshot, isDirty, applySnapshot, markPublished, persist, revertToPublished,
    previewMap, setImg, getImageURL, hydrateImages, placeholder, safeColor, rarityClass,
    statTotal, statSum, getChar, current, allPositions,
    STAT_ICONS, statIcon, POSITIONS, GRADES, CHAR_COLORS, THEMES, gradeBadge,
    renderChips, renderCharacters, refreshCard, updateHeroCounts, renderHeroRows, refreshAll, refreshEverything, renderContent,
    openCharacter, closeCharacter, renderModal, renderInfo, renderSkinStrip, refreshStage, selectSkin, updateModalCount,
    setEditing, toast, observeReveal,
    ready: null,
    editor: null
  };

  /* =====================================================================
   *  시작
   * ===================================================================== */
  function init() {
    applySiteSettings(); // 게시된 내용을 불러오는 동안에도 테마가 보이게
    $('[data-ball]').innerHTML = `<div class="ball-float">${ballSVG(true)}</div>`;
    bindUI();
    initNav();

    let logoReady = Promise.resolve();
    const ready = fetchPublished().then((res) => {
      if (res && res.data) {
        applySnapshot(res.data);
        state.source = 'remote';
        state.publishedVersion = res.version;
      }
      state.published = snapshot();
      store.set(INTRO_EVERY_KEY, site().introEveryVisit ? '1' : '0');
      applySiteSettings();
      logoReady = renderLogos(true);
      renderHeroText();
      renderSectionHeads();
      renderAbout();
      renderChips();
      renderCharacters();
      renderModes();
      renderCurrencies();
      renderUpdates();
      renderHistory();
      renderLinks();
      renderFooter();
      observeReveal();
      emit('ready', res);
      return res;
    });
    api.ready = ready;
    // 캐릭터 이름 · 사진 · 등급을 고치면 출시 · 복각 기록에도 바로 반영
    on('change', () => renderHistory());

    const deepId = location.hash.startsWith('#c-') ? decodeURIComponent(location.hash.slice(3)) : null;
    runIntro(!!deepId, ready.then(() => logoReady), () => ready.then(() => {
      playHero();
      if (deepId && getChar(deepId)) openCharacter(deepId);
    }));

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { movePill(false); moveIndicator(); });
    }
  }

  init();
})();
