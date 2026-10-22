/* =====================================================================
 *  뽑기 시뮬레이터 — 이벤트 모집 배너
 * ---------------------------------------------------------------------
 *  · 이벤트마다 탭이 하나씩 생기고, 고른 이벤트의 배너만 보여요.
 *    새 이벤트를 넣을 때는 아래 EVENTS 의 { ... } 덩어리 하나를 복사해서 맨 위에 붙이고 내용을 바꾸세요.
 *  · 게임 확률표 그대로 1명 · 10명 모집을 해 보는 재미용 시뮬레이터예요.
 *    (실제 게임 결과와는 관계없어요)
 *  · 선수 이름 · 사진 · 등급은 캐릭터 도감(관리자가 게시한 내용)에서 가져와요.
 *    도감에 없는 등급(A+ 이하)은 'B등급 선수'처럼 등급으로만 보여요.
 *  · 공 색깔
 *      빨간 공 : S+ 선수, 그리고 스킨과 함께 나온 이벤트 픽업 선수 (S · S-)
 *      노란 공 : S ~ S- 선수
 *      흰 공   : 그 밖의 선수
 *  · 픽업 선수는 '선수만' 또는 '스킨 + 선수'로 나와요. (스킨만 나오는 경우는 없어요)
 *  · 웨스턴 · 서머트레이닝: 모집할 때마다 반환 재화(스카우트 포인트)를 함께 받아요.
 *  · 한기태 픽업부터: 스카우트 대신 '픽업 모집 게이지'가 차고, 다 채우면 픽업 선수를 확정 획득해요.
 *  · 이미 뽑은 선수가 또 나오면 '노력의 조각'으로 표시해요.
 *    (기록은 이 화면에만 남고, 새로고침하면 처음부터 시작해요)
 *
 *  [이 기능을 빼고 싶을 때]
 *   js/gacha.js · css/gacha.css 파일을 지우고,
 *   index.html 에서 '뽑기 시뮬레이터' 라고 적힌 줄(메뉴 · 섹션 · css · js)을 지우면 돼요.
 * ===================================================================== */
(() => {
  'use strict';

  const T = window.TSC;
  const root = document.getElementById('gachaRoot');
  if (!T || !root) return;
  const { $, $$, esc } = T;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =====================================================================
   *  설정 — 이벤트 · 배너 · 확률
   * ===================================================================== */
  // A+ 이하는 모든 배너가 같아요 (확률 단위: %)
  const LOWER_TIERS = [
    { grades: ['A+'], badge: 'A+', label: 'A+', rate: 4 },
    { grades: ['A', 'A-'], badge: 'A', label: 'A ~ A-', rate: 12 },
    { grades: ['B+', 'B', 'B-'], badge: 'B', label: 'B+ ~ B-', rate: 45 },
    { grades: ['C+', 'C', 'C-'], badge: 'C', label: 'C+ ~ C-', rate: 28 },
    { grades: ['D+', 'D', 'D-'], badge: 'D', label: 'D+ ~ D-', rate: 7.5 }
  ];

  // 모집하면 돌려받는 재화 (반환 재화) — 이벤트 전용 재화가 생기면 한 줄 추가하세요.
  // mark 는 동전 아이콘에 들어가는 글자예요
  const POINTS = {
    pickup: { name: '픽업 스카우트 포인트', mark: 'P', color: '#ffb31f' },
    westernSkin: { name: '웨스턴 스킨 스카우트 포인트', mark: 'S', color: '#ff6a3d' },
    summerSkin: { name: '서머 트레이닝 스킨 스카우트 포인트', mark: 'S', color: '#3ec8ff' }
  };
  // 픽업 선수 교환에 쓰는 재화 — 배너의 exchange 가 이 재화로 픽업 선수를 교환하는 개수예요
  const EXCHANGE_POINT = 'pickup';

  // 픽업 모집 게이지 (한기태 픽업부터) — 모집 1명당 +1, 다 채우면 배너의 픽업 선수를 확정 획득해요.
  // 확정 획득할수록 필요한 게이지가 줄어요 (1번째, 2번째, … 마지막 값은 6번째 이후에 계속 쓰여요)
  const GAUGE_PER_PULL = 1;
  const GAUGES = {
    'S+': [125, 115, 105, 95, 85, 80],
    S: [100, 100, 95, 85, 80, 75]
  };

  // 이벤트 — 맨 위가 최신이고, 처음 들어오면 맨 위 이벤트가 보여요.
  //  name       탭 · 제목에 보이는 이름 (제목은 '○○ 모집 배너')
  //  period     기간 (선택) 예) '2026.10.22 ~ 11.05'
  //  color      이벤트 대표 색 (탭 · 제목 글자 색)
  //  notInGacha 이번 뽑기에서 안 나오는 선수 (콜로세움 선수 등) — 'S ~ S-' 모집에서 빠져요.
  //             도감 이름 그대로 적고, 이름이 같은 선수가 둘이면 '이름 (포지션)' 처럼 적어 주세요.
  //             배너의 픽업 선수도 이 이벤트의 'S ~ S-' 모집에서 자동으로 빠져요 (확률표 기준)
  //  banners    배너 목록
  //    char · skin  캐릭터 도감의 이름 · 스킨 이름과 같아야 사진이 나와요 (띄어쓰기는 무시)
  //    rates        [스킨 + 픽업 선수, 픽업 선수, S ~ S- 선수] (%)
  //    returns      모집 1명당 받는 반환 재화 개수 (10명 모집이면 10배)
  //    exchange     픽업 스카우트 포인트 몇 개로 픽업 선수를 교환할 수 있는지
  //  ─ 한기태 픽업부터 쓰는 방식 (rates 대신 아래를 적어요) ─
  //    pickups      픽업 선수 확률표 [{ char, grade, rate }] — 맨 위가 이 배너의 주인공
  //    poolRate     S ~ S- 기존 선수 확률 (%)
  //    lowerRates   [A+, A ~ A-, B+ ~ B-, C+ ~ C-, D+ ~ D-] 확률 (%)
  //    gauge        픽업 모집 게이지 (GAUGES['S+'] 또는 GAUGES.S)
  //    desc         배너 설명 (선택)
  const EVENTS = [
    {
      name: '한기태 픽업',
      period: '',
      color: '#ff4a4a',
      notInGacha: ['제니', '강세진', '아이리스', '서사라 (세터)', '서유나', '이사벨', '로베르토', 'NN'],
      banners: [
        { title: 'S+ 한기태 선수 모집', char: '한기태', grade: 'S+', color: '#ff4a4a',
          desc: '엘리트 스테이지로 합류한 S+ 미들블로커 한기태 선수를 포함한 선수들을 모집할 수 있습니다.',
          pickups: [{ char: '한기태', grade: 'S+', rate: 0.375 }, { char: '서유나', grade: 'S', rate: 0.1 }, { char: '강세진', grade: 'S', rate: 0.1 }],
          poolRate: 2.5, lowerRates: [4, 12, 45.425, 28, 7.5], gauge: GAUGES['S+'] },
        { title: 'S 서유나 선수 모집', char: '서유나', grade: 'S', color: '#ffc94a',
          pickups: [{ char: '서유나', grade: 'S', rate: 0.5 }, { char: '강세진', grade: 'S', rate: 0.15 }, { char: '한기태', grade: 'S+', rate: 0.08 }],
          poolRate: 2.5, lowerRates: [4, 12, 45.27, 28, 7.5], gauge: GAUGES.S },
        { title: 'S 강세진 선수 모집', char: '강세진', grade: 'S', color: '#6f8cff',
          pickups: [{ char: '강세진', grade: 'S', rate: 0.5 }, { char: '서유나', grade: 'S', rate: 0.15 }, { char: '한기태', grade: 'S+', rate: 0.08 }],
          poolRate: 2.5, lowerRates: [4, 12, 45.27, 28, 7.5], gauge: GAUGES.S }
      ]
    },
    {
      name: 'WESTERN EVENT',
      period: '',
      color: '#ffa24f',
      notInGacha: ['제니', '유리', '강세진', '아이리스', '서사라 (세터)', '서유나', '이사벨', '로베르토', 'NN'],
      banners: [
        { title: '레드후드 류현 선수 모집', char: '류현', skin: '레드 후드', grade: 'S+', color: '#ff3b30', rates: [0.375, 0.375, 2.75],
          returns: { pickup: 3, westernSkin: 3 }, exchange: 450 },
        { title: '바운티헌터 시프 선수 모집', char: '시프', skin: '바운티 헌터', grade: 'S', color: '#2fd3b0', rates: [0.5, 0.5, 2.5],
          returns: { pickup: 4, westernSkin: 4 }, exchange: 400 },
        { title: '갓파더 클레르 선수 모집', char: '클레르', skin: '갓파더', grade: 'S', color: '#e2b65c', rates: [0.5, 0.5, 2.5],
          returns: { pickup: 4, westernSkin: 4 }, exchange: 400 }
      ]
    },
    {
      name: '서머트레이닝',
      period: '',
      color: '#3ec8ff',
      notInGacha: ['제니', '유리', '강세진', '아이리스', '서사라 (세터)', '서유나', '이사벨', '로베르토', 'NN'],
      banners: [
        { title: '서머 트레이닝 루카스 선수 모집', char: '루카스', skin: '서머 트레이닝', grade: 'S+', color: '#ffb547', rates: [0.375, 0.375, 2.75],
          returns: { pickup: 3, summerSkin: 3 }, exchange: 450 },
        { title: '서머 트레이닝 한라 선수 모집', char: '한라', skin: '서머 트레이닝', grade: 'S', color: '#3ec8ff', rates: [0.5, 0.5, 2.5],
          returns: { pickup: 4, summerSkin: 4 }, exchange: 400 },
        { title: '서머 트레이닝 비올라 선수 모집', char: '비올라', skin: '서머 트레이닝', grade: 'S-', color: '#5ad4a0', rates: [0.5, 0.5, 2.5],
          returns: { pickup: 4, summerSkin: 4 }, exchange: 400 }
      ]
    }
  ];

  const TIER_COLORS = { 'A+': '#9b5cff', A: '#4f86ff', B: '#2fb8e0', C: '#5ad45a', D: '#9aa6c4' };
  const BALL_NAMES = { red: '빨간 공', yellow: '노란 공', white: '흰 공' };

  // 공 색깔 — S+ 와 스킨과 함께 나온 픽업 선수는 빨간 공, S ~ S- 는 노란 공
  const ballOf = (grade, withSkin) => (grade === 'S+' || withSkin ? 'red' : grade === 'S' || grade === 'S-' ? 'yellow' : 'white');

  /* ---------- 작은 도구들 ---------- */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  const fmtRate = (p) => `${Number(p.toFixed(3))}%`;
  const rand = () => {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  };

  const GRADE_CLASS = { 'S+': 'splus', S: 's', 'S-': 'sminus', 'A+': 'aplus', A: 'a', 'A-': 'aminus', B: 'b', C: 'c', D: 'd' };
  const badge = (g, extra = '') => `<span class="grade grade--${GRADE_CLASS[g] || 'none'}${extra}">${esc(g)}</span>`;

  const SHARD_ICON = '<svg class="gx-shard" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.8 4.6 9.4 12 22.2l7.4-12.8z" fill="currentColor"/><path d="M12 1.8v20.4M4.6 9.4h14.8M8.3 9.4 12 1.8l3.7 7.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.1" stroke-linejoin="round"/></svg>';
  const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  /* =====================================================================
   *  배구공 (사이트 로고 공과 같은 소용돌이 모양, 색만 다르게)
   * ===================================================================== */
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
    return {
      wedges: [0, 1, 2, 3, 4, 5].map((i) => wedge(i * 60, i * 60 + 60)),
      seams: [0, 60, 120, 180, 240, 300].map((d) => `<path d="${seam(d)}"/>`).join(''),
      stitches: [30, 90, 150, 210, 270, 330].map((d) => `<path d="${seam(d)}"/>`).join('')
    };
  })();
  const BALL_COLORS = {
    red: ['#ff4436', '#fff1ea', '#b5122c'],
    yellow: ['#ffc42e', '#fff8e0', '#e88a0c'],
    white: ['#f4f0e6', '#dde4f2', '#a3b2cf']
  };

  let ballSeq = 0;
  function ballSVG(kind) {
    const id = 'gxball' + ++ballSeq;
    const [a, b, c] = BALL_COLORS[kind] || BALL_COLORS.white;
    const fills = [a, b, c, a, b, c];
    return `<svg class="ball-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="${id}c"><circle cx="32" cy="32" r="29"/></clipPath>
        <radialGradient id="${id}g" cx="34%" cy="26%" r="80%">
          <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
          <stop offset=".42" stop-color="#fff" stop-opacity="0"/>
          <stop offset=".8" stop-color="#0a1230" stop-opacity=".18"/>
          <stop offset="1" stop-color="#040818" stop-opacity=".55"/>
        </radialGradient>
      </defs>
      <g clip-path="url(#${id}c)">
        <circle cx="32" cy="32" r="29" fill="${b}"/>
        ${BALL.wedges.map((d, i) => `<path fill="${fills[i]}" d="${d}"/>`).join('')}
        <g class="b-stitch">${BALL.stitches}</g>
        <g class="b-seam">${BALL.seams}</g>
        <circle cx="32" cy="32" r="29" fill="url(#${id}g)"/>
      </g>
      <circle class="b-rim" cx="32" cy="32" r="29"/>
    </svg>`;
  }
  const miniBall = (kind) => `<span class="gx-mini">${ballSVG(kind)}</span>`;

  /* ---------- 반환 재화 ---------- */
  let coinSeq = 0;
  function coinSVG(key) {
    const p = POINTS[key];
    const id = 'gxcoin' + ++coinSeq;
    return `<svg class="gx-coin" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10.6" fill="${p.color}"/>
      <circle cx="12" cy="12" r="10.6" fill="url(#${id})"/>
      <circle cx="12" cy="12" r="7.8" fill="none" stroke="#3a1d02" stroke-opacity=".35" stroke-width="1.2"/>
      <text x="12" y="16.1" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="11.5" fill="#3a1d02">${esc(p.mark)}</text>
    </svg>`;
  }
  const pointKeys = (b) => Object.keys(b.returns || {}).filter((k) => POINTS[k]);
  // sign: '×' 는 1명당 개수, '+' 는 받은 개수
  const pointsHTML = (b, n, sign) => pointKeys(b)
    .map((k) => `<span class="gx-pt">${coinSVG(k)}${esc(POINTS[k].name)} <b>${sign}${(b.returns[k] * n).toLocaleString()}</b></span>`)
    .join('');
  const pointsText = (b) => pointKeys(b).map((k) => `${POINTS[k].name} ×${b.returns[k]}`).join(' · ');

  // 픽업 선수 교환까지 얼마나 남았는지 (have: 지금까지 받은 픽업 스카우트 포인트)
  function exchangeState(b, have = 0) {
    const cost = Number(b.exchange) || 0;
    if (!cost || !POINTS[EXCHANGE_POINT]) return null;
    const per = (b.returns || {})[EXCHANGE_POINT] || 0;
    const left = Math.max(0, cost - have);
    return {
      cost, have, left, ready: left === 0,
      pct: Math.min(100, (have / cost) * 100),
      pullsTotal: per ? Math.ceil(cost / per) : 0,
      pullsLeft: per ? Math.ceil(left / per) : 0
    };
  }
  // 기록에 쓰는 짧은 배너 이름 ('S+ 한기태 선수 모집' → '한기태') — 등급은 배지로 따로 보여줘요
  const shortTitle = (b) => b.title.replace(/\s*선수 모집$/, '').replace(/^S[+-]?\s+/, '');
  // 배너는 '이벤트 번호:배너 번호' 로 가리켜요 (예: data-pull="0:1")
  const parseRef = (s) => String(s).split(':').map(Number);
  const bannerAt = (ei, bi) => (EVENTS[ei] && EVENTS[ei].banners[bi]) || null;
  // 배너의 픽업 선수 — 새 방식은 pickups, 예전 방식은 배너의 선수 한 명
  const pickupList = (b) => b.pickups || [{ char: b.char, grade: b.grade }];
  // 배너 주인공의 확률 — 예전 방식은 '스킨 + 선수'와 '선수만'을 합쳐요
  const mainRate = (b) => (b.pickups ? b.pickups[0].rate : b.rates[0] + b.rates[1]);
  const lowerRates = (b) => b.lowerRates || LOWER_TIERS.map((t) => t.rate);

  /* =====================================================================
   *  모집
   * ===================================================================== */
  const chars = () => T.state.data.characters;
  function findChar(name, grade) {
    const found = chars().filter((c) => norm(c.name) === norm(name));
    return found.find((c) => c.grade === grade) || found[0] || null;
  }
  const findSkin = (c, name) => (c ? c.skins.find((s) => norm(s.name) === norm(name)) || null : null);

  // '이름' 또는 '이름 (포지션)' 으로 선수를 알아봐요
  function isListed(c, entry) {
    const m = String(entry).match(/^(.*?)\s*\((.+)\)\s*$/);
    return m ? norm(c.name) === norm(m[1]) && norm(c.position) === norm(m[2]) : norm(c.name) === norm(entry);
  }
  // S+ 는 픽업 선수(류현 등)로만 나오고, 그 밖의 S+ 선수는 이벤트 배너에서 나오지 않아요.
  // 이벤트 픽업 선수 · 안 나오는 선수도 빠져요.
  function rosterPool(ev, grades) {
    const pickups = ev.banners.flatMap(pickupList).map((p) => findChar(p.char, p.grade)).filter(Boolean);
    return chars().filter((c) => c.grade !== 'S+' && grades.includes(c.grade)
      && !pickups.includes(c) && !ev.notInGacha.some((e) => isListed(c, e)));
  }

  function tiersOf(b) {
    const pool = { type: 'pool', grades: ['S', 'S-'], badge: 'S', label: 'S ~ S-' };
    const lower = lowerRates(b);
    const tail = LOWER_TIERS.map((t, i) => ({ type: 'pool', ...t, rate: lower[i] }));
    if (b.pickups) {
      return [...b.pickups.map((p) => ({ type: 'pickup', rate: p.rate, char: p.char, grade: p.grade })), { ...pool, rate: b.poolRate }, ...tail];
    }
    return [{ type: 'skin', rate: b.rates[0] }, { type: 'pickup', rate: b.rates[1] }, { ...pool, rate: b.rates[2] }, ...tail];
  }

  function makeResult(ev, b, t) {
    if (t.type === 'skin' || t.type === 'pickup') {
      const name = t.char || b.char;
      const grade = t.grade || b.grade;
      const c = findChar(name, grade);
      const withSkin = t.type === 'skin';
      const skin = withSkin ? findSkin(c, b.skin) : null;
      return {
        key: c ? c.id : 'name:' + name, id: c ? c.id : '',
        name, grade, ball: ballOf(grade, withSkin), pickup: true,
        skin: withSkin ? b.skin : '',
        sub: (c && c.position) || '픽업 선수',
        image: (skin && skin.image) || (c && c.image) || '',
        charImage: (c && c.image) || '',
        color: c ? c.color : b.color
      };
    }
    const pool = rosterPool(ev, t.grades);
    if (pool.length) {
      const c = pool[Math.floor(rand() * pool.length)];
      return {
        key: c.id, id: c.id, name: c.name, grade: c.grade, ball: ballOf(c.grade, false),
        skin: '', sub: c.position || c.alias || '', image: c.image, charImage: c.image, color: c.color
      };
    }
    // 도감에 없는 등급은 등급으로만 보여줘요 (중복 표시 없음)
    return {
      key: '', id: '', name: `${t.badge}등급 선수`, grade: t.badge, ball: ballOf(t.badge, false), generic: true,
      skin: '', sub: t.label, image: '', charImage: '', color: TIER_COLORS[t.badge] || '#9aa6c4'
    };
  }

  function roll(ev, b) {
    const tiers = tiersOf(b);
    let r = rand() * tiers.reduce((s, t) => s + t.rate, 0);
    const tier = tiers.find((t) => (r -= t.rate) < 0) || tiers[tiers.length - 1];
    return makeResult(ev, b, tier);
  }

  // 이번 화면에서 뽑은 기록 (새로고침하면 처음부터) — 보유 선수는 모든 이벤트가 함께 써요
  const stats = { pulls: 0, red: 0, yellow: 0, shards: 0 };
  const owned = new Map(); // key → { id, name, grade, ball, image, color, count, skins }
  const perBanner = new Map(); // '이벤트:배너' → { ei, bi, pulls, points: { 재화: 개수 } }
  const gauges = new Map();    // '이벤트:배너' → { value: 모은 게이지, claims: 확정 획득 횟수 }

  // 픽업 모집 게이지 — 지금 몇 칸인지, 다음 확정 획득에 몇 칸이 필요한지
  function gaugeState(ei, bi) {
    const b = bannerAt(ei, bi);
    if (!b || !b.gauge) return null;
    const s = gauges.get(`${ei}:${bi}`) || { value: 0, claims: 0 };
    const need = b.gauge[Math.min(s.claims, b.gauge.length - 1)];
    const left = Math.max(0, need - s.value);
    return {
      have: s.value, need, left, ready: left === 0, claims: s.claims,
      pct: Math.min(100, (s.value / need) * 100),
      pullsLeft: Math.ceil(left / GAUGE_PER_PULL)
    };
  }

  // 보유 선수에 넣어요 — 이미 있으면 노력의 조각
  function addOwned(r) {
    if (!r.key) return;
    const got = owned.get(r.key);
    r.dup = !!got;
    if (got) {
      got.count += 1;
      stats.shards += 1;
    } else {
      // 빨간 공은 픽업 등급(S+ · 이벤트 S)일 때만 — 목록에서는 등급 색으로 보여줘요
      owned.set(r.key, { key: r.key, id: r.id, name: r.name, grade: r.grade, ball: ballOf(r.grade, false), image: r.charImage, color: r.color, count: 1, skins: new Set() });
    }
    if (r.skin) owned.get(r.key).skins.add(r.skin);
  }

  function pull(ei, bi, n) {
    const ev = EVENTS[ei];
    const b = bannerAt(ei, bi);
    if (!b) return;
    const results = Array.from({ length: n }, () => roll(ev, b));
    const key = `${ei}:${bi}`;
    const pb = perBanner.get(key) || { ei, bi, pulls: 0, points: {} };
    pb.pulls += n;
    pointKeys(b).forEach((k) => { pb.points[k] = (pb.points[k] || 0) + b.returns[k] * n; });
    perBanner.set(key, pb);
    if (b.gauge) {
      const g = gauges.get(key) || { value: 0, claims: 0 };
      g.value += n * GAUGE_PER_PULL;
      gauges.set(key, g);
    }
    results.forEach((r) => {
      stats.pulls += 1;
      if (r.ball === 'red') stats.red += 1;
      else if (r.ball === 'yellow') stats.yellow += 1;
      addOwned(r);
    });
    renderStats();
    renderGauges();
    showResults(ei, bi, n, results);
  }

  // 게이지를 다 채우면 배너 주인공을 확정 획득해요
  function claim(ei, bi) {
    const b = bannerAt(ei, bi);
    const g = gaugeState(ei, bi);
    if (!b || !g || !g.ready) return;
    const s = gauges.get(`${ei}:${bi}`);
    s.value -= g.need;
    s.claims += 1;
    const r = makeResult(EVENTS[ei], b, { type: 'pickup' });
    addOwned(r);
    renderStats();
    renderGauges();
    showResults(ei, bi, 1, [r], true);
  }

  /* =====================================================================
   *  결과 창 (공 → 선수 카드)
   * ===================================================================== */
  document.body.insertAdjacentHTML('beforeend', `
    <div class="gx" id="gx" aria-hidden="true">
      <div class="gx__backdrop" data-gx-close></div>
      <div class="gx__panel" role="dialog" aria-modal="true" aria-labelledby="gxTitle">
        <div class="gx__bar">
          <div class="gx__head"><small id="gxEvent"></small><h2 id="gxTitle"></h2></div>
          <button class="icon-btn" type="button" data-gx-close aria-label="닫기">${X_ICON}</button>
        </div>
        <div class="gx__body" id="gxBody"></div>
        <div class="gx__foot" id="gxFoot" aria-live="polite"></div>
      </div>
    </div>`);
  const gx = $('#gx');
  const panel = $('.gx__panel', gx);
  const body = $('#gxBody');
  const foot = $('#gxFoot');

  let run = 0;          // 진행 중인 연출 번호 (새로 열거나 닫으면 바뀌어서 이전 연출이 멈춰요)
  let last = null;      // { ei, bi, n, results, claimed }
  let lastFocus = null;

  const slotHTML = (r, i) => `
    <div class="gslot gslot--${r.ball}" style="--i:${i}" data-ball="${r.ball}">
      <button class="gslot__ball" type="button" aria-label="${BALL_NAMES[r.ball]} 열기"><span class="gball"><span class="gball__in">${ballSVG(r.ball)}</span></span></button>
      <span class="gslot__fx" aria-hidden="true"></span>
      <div class="gcard gcard--${r.ball}" style="--cc:${T.safeColor(r.color)}">
        <div class="gcard__art">
          ${r.generic ? `<span class="gcard__tier" aria-hidden="true">${esc(r.grade)}</span>` : `<img data-gx-img="${i}" alt="" decoding="async">`}
          <span class="gcard__grade">${badge(r.grade, ' grade--sm')}</span>
          ${!r.generic && !r.dup ? '<span class="gcard__new">NEW</span>' : ''}
          ${r.dup ? `<span class="gcard__dup">${SHARD_ICON}<span>노력의 조각</span></span>` : ''}
        </div>
        <div class="gcard__body"><b>${esc(r.name)}</b>${r.skin
          ? `<small class="is-skin"><span class="gx-long">+ ${esc(r.skin)} 스킨</span><span class="gx-short">+ 스킨</span></small>`
          : `<small>${esc(r.sub) || '&nbsp;'}</small>`}</div>
      </div>
    </div>`;

  // claimed: 픽업 모집 게이지로 확정 획득한 결과
  function showResults(ei, bi, n, results, claimed = false) {
    const b = bannerAt(ei, bi);
    const token = ++run;
    last = { ei, bi, n, results, claimed };
    panel.style.setProperty('--gc', b.color);
    $('#gxEvent').textContent = EVENTS[ei].name;
    $('#gxTitle').textContent = claimed ? `${b.title} · 확정 획득` : `${b.title} · ${n}명`;
    body.innerHTML = `<div class="gx-grid${n === 1 ? ' gx-grid--one' : ''}">${results.map(slotHTML).join('')}</div>`;
    $$('img[data-gx-img]', body).forEach((img) => {
      const r = results[Number(img.dataset.gxImg)];
      img.alt = `${r.name}${r.skin ? ` - ${r.skin} 스킨` : ''}`;
      T.setImg(img, r.image, T.placeholder(r.name, r.color), 'thumb');
    });
    foot.innerHTML = `
      <p class="gx__hint">공을 누르면 바로 열려요</p>
      <div class="gx__acts"><button class="btn btn--ghost btn--sm" type="button" data-gx-skip>모두 열기</button></div>`;
    panel.scrollTop = 0;
    openOverlay();
    sequence(token);
  }

  // 공이 떨어진 뒤 하나씩 열려요. 빨간 공은 잠깐 흔들린 뒤에 열려요.
  async function sequence(token) {
    const slots = $$('.gslot', body);
    await wait(reduceMotion ? 0 : 700 + slots.length * 70);
    for (const s of slots) {
      if (token !== run) return;
      if (s.classList.contains('is-open')) continue;
      if (s.dataset.ball === 'red' && !reduceMotion) {
        s.classList.add('is-charging');
        await wait(620);
        if (token !== run) return;
      }
      openSlot(s);
      if (!reduceMotion) await wait(s.dataset.ball === 'white' ? 130 : 300);
    }
    if (token === run) finish();
  }

  function openSlot(s) {
    s.classList.remove('is-charging');
    s.classList.add('is-open');
  }

  function openAll() {
    run += 1;
    $$('.gslot', body).forEach(openSlot);
    finish();
  }

  function finish() {
    if (!last) return;
    const { ei, bi, n, results, claimed } = last;
    const b = bannerAt(ei, bi);
    const ref = `${ei}:${bi}`;
    const pb = perBanner.get(ref);
    const ex = exchangeState(b, pb ? pb.points[EXCHANGE_POINT] : 0);
    const g = gaugeState(ei, bi);
    let ret = '';
    if (g) {
      // 한기태 픽업부터: 픽업 모집 게이지
      ret = `<div class="gx__ret"><span class="gx__ret-label">픽업 모집 게이지</span>
        <span class="gx__ex${g.ready ? ' is-ready' : ''}">${claimed ? '' : `<b>+${n * GAUGE_PER_PULL}</b> · `}${g.have} / ${g.need} · ${g.ready
          ? `<b>${esc(b.char)} 확정 획득 가능!</b>` : `앞으로 <b>${g.pullsLeft}회</b> 모집 시 확정 획득`}</span>
        ${g.ready ? `<button class="ggauge__claim" type="button" data-claim="${ref}">확정 획득</button>` : ''}</div>`;
    } else {
      const pts = pointsHTML(b, n, '+') + (ex ? `
        <span class="gx__ex${ex.ready ? ' is-ready' : ''}">${ex.ready
          ? `<b>${esc(b.char)} 교환 가능!</b>`
          : `${esc(b.char)} 교환까지 <b>${ex.left.toLocaleString()}</b> 남음`} (${ex.have.toLocaleString()} / ${ex.cost.toLocaleString()})</span>` : '');
      if (pts) ret = `<div class="gx__ret"><span class="gx__ret-label">반환 재화</span>${pts}</div>`;
    }
    const cnt = { red: 0, yellow: 0, white: 0 };
    let shards = 0;
    results.forEach((r) => { cnt[r.ball] += 1; if (r.dup) shards += 1; });
    const hits = [...new Set(results.filter((r) => r.pickup).map((r) => (r.skin ? `${r.skin} 스킨 + ${r.name}` : r.name)))];
    foot.innerHTML = `
      ${hits.length ? `<p class="gx__hit"><span>${claimed ? '확정 획득!' : 'PICK UP!'}</span>${hits.map((h) => `<b>${esc(h)}</b>`).join(' · ')} 획득</p>` : ''}
      ${ret}
      <div class="gx__sum">
        ${claimed ? '' : ['red', 'yellow', 'white'].filter((k) => cnt[k]).map((k) => `<span class="gx-pill gx-pill--${k}">${miniBall(k)}${BALL_NAMES[k]} <b>${cnt[k]}</b></span>`).join('')}
        ${shards ? `<span class="gx-pill gx-pill--shard">${SHARD_ICON}노력의 조각 <b>${shards}</b></span>` : ''}
      </div>
      <div class="gx__acts">
        <button class="btn btn--ghost btn--sm" type="button" data-gx-close>확인</button>
        ${claimed
          ? `<button class="gx-ybtn" type="button" data-pull="${ref}" data-n="10">10명 모집</button>`
          : `<button class="gx-ybtn" type="button" data-gx-again>${n}명 더 모집</button>`}
      </div>`;
    const next = $('[data-claim]', foot) || $('.gx-ybtn', foot);
    if (next) next.focus({ preventScroll: true });
  }

  /* ---------- 확률표 ---------- */
  // 이벤트의 S 등급 픽업 선수 이름 (S ~ S- 모집에서 빠지는 선수)
  const sPickups = (ev) => [...new Set(ev.banners.flatMap(pickupList).filter((p) => p.grade !== 'S+').map((p) => p.char))];
  // 이 배너에서 나오지 않는 선수 (이 배너의 픽업 선수는 빼고)
  function notShown(ev, b) {
    const mine = new Set(pickupList(b).map((p) => norm(p.char)));
    return [...new Set([...ev.notInGacha, ...sPickups(ev)])].filter((n) => !mine.has(norm(n)));
  }

  function rateRows(ev, b) {
    if (b.pickups) {
      const lower = lowerRates(b);
      return [
        ...b.pickups.map((p) => ({ grade: p.grade, who: p.char, rate: p.rate, ball: ballOf(p.grade, false), pick: true })),
        { grade: 'S ~ S-', who: '기존 선수', rate: b.poolRate, ball: 'yellow' },
        ...LOWER_TIERS.map((t, i) => ({ grade: t.label, who: '', rate: lower[i], ball: 'white' }))
      ];
    }
    const ex = ['콜로세움 선수', ...sPickups(ev)].join(' · ');
    return [
      { grade: b.grade, who: `${b.skin} ${b.char} 스킨 + ${b.char}`, rate: b.rates[0], ball: ballOf(b.grade, true), pick: true },
      { grade: b.grade, who: b.char, rate: b.rates[1], ball: ballOf(b.grade, false), pick: true },
      { grade: 'S ~ S-', who: `S- 이상 선수 (${ex} 제외)`, rate: b.rates[2], ball: 'yellow' },
      ...LOWER_TIERS.map((t) => ({ grade: t.label, who: '', rate: t.rate, ball: 'white' }))
    ];
  }

  function showRates(ei, bi) {
    const ev = EVENTS[ei];
    const b = bannerAt(ei, bi);
    if (!b) return;
    run += 1;
    last = null;
    const rows = rateRows(ev, b);
    const ex = exchangeState(b);
    const red = rows.filter((r) => r.ball === 'red').reduce((s, r) => s + r.rate, 0) / 100;
    const redIn10 = (1 - Math.pow(1 - red, 10)) * 100;
    panel.style.setProperty('--gc', b.color);
    $('#gxEvent').textContent = ev.name;
    $('#gxTitle').textContent = `${b.title} 확률표`;
    body.innerHTML = `
      <div class="gx-rates">
        <div class="gx-rates__row gx-rates__row--head"><span>등급</span><span>선수</span><span>확률</span></div>
        ${rows.map((r) => `
          <div class="gx-rates__row${r.pick ? ' is-pick' : ''}">
            <span class="gx-rates__grade">${miniBall(r.ball)}${esc(r.grade)}</span>
            <span class="gx-rates__who">${esc(r.who)}</span>
            <span class="gx-rates__rate">${fmtRate(r.rate)}</span>
          </div>`).join('')}
      </div>
      <p class="gx__note">왼쪽 공 색깔은 모집할 때 보이는 공이에요. 10명 모집에서 빨간 공이 1개 이상 나올 확률은 약 <b>${redIn10.toFixed(1)}%</b>예요.<br>
        ${b.pickups ? '' : '픽업 선수는 선수만 나오거나 스킨 + 선수로 나와요. '}이번 모집에서 나오지 않는 선수: ${esc(notShown(ev, b).join(' · '))}
        ${pointKeys(b).length ? `<br>모집 1명당 반환 재화: ${esc(pointsText(b))}` : ''}
        ${ex ? `<br>${esc(b.char)} 교환: ${esc(POINTS[EXCHANGE_POINT].name)} ${ex.cost}개 (모집 ${ex.pullsTotal}명)` : ''}
        ${b.gauge ? `<br>픽업 모집 게이지: 모집 1명당 +${GAUGE_PER_PULL}. 다 채우면 ${esc(b.char)} 확정 획득 — 필요 게이지 ${b.gauge.join(' → ')} (${b.gauge.length}번째 이후 ${b.gauge[b.gauge.length - 1]})` : ''}</p>`;
    foot.innerHTML = `
      <div class="gx__acts">
        <button class="btn btn--ghost btn--sm" type="button" data-gx-close>닫기</button>
        <button class="gx-ybtn" type="button" data-pull="${ei}:${bi}" data-n="10">10명 모집</button>
      </div>`;
    panel.scrollTop = 0;
    openOverlay();
  }

  /* ---------- 창 열고 닫기 ---------- */
  function openOverlay() {
    if (gx.classList.contains('is-open')) return;
    lastFocus = document.activeElement;
    gx.classList.add('is-open');
    gx.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    setTimeout(() => { const btn = $('.gx__bar [data-gx-close]', gx); if (btn) btn.focus({ preventScroll: true }); }, 60);
  }

  function closeOverlay() {
    if (!gx.classList.contains('is-open')) return;
    run += 1;
    gx.classList.remove('is-open');
    gx.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  gx.addEventListener('click', (e) => {
    if (e.target.closest('[data-gx-close]')) return closeOverlay();
    if (e.target.closest('[data-gx-skip]')) return openAll();
    if (e.target.closest('[data-gx-again]')) return last && pull(last.ei, last.bi, last.n);
    const c = e.target.closest('[data-claim]');
    if (c) return claim(...parseRef(c.dataset.claim));
    const p = e.target.closest('[data-pull]');
    if (p) return pull(...parseRef(p.dataset.pull), Number(p.dataset.n));
    const ball = e.target.closest('.gslot__ball');
    if (ball) {
      openSlot(ball.closest('.gslot'));
      if (!$('.gslot:not(.is-open)', body)) { run += 1; finish(); }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!gx.classList.contains('is-open')) return;
    if (e.key === 'Escape') { closeOverlay(); return; }
    if (e.key !== 'Tab') return;
    // 창 안에서만 Tab 이동
    const f = $$('button, [href], [tabindex]:not([tabindex="-1"])', panel).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  });

  /* =====================================================================
   *  섹션 (이벤트 탭 · 배너 · 공 색깔 안내 · 내 모집 기록)
   * ===================================================================== */
  let evIndex = 0;      // 지금 보고 있는 이벤트 (맨 위 = 최신)
  let artReady = false; // 섹션 가까이 오면 배너 그림을 불러와요
  const section = root.closest('section') || root;

  const tabHTML = (ev, i) => `
    <button type="button" class="gtab" role="tab" id="gxTab${i}" aria-controls="gxBans" data-ev="${i}" style="--ev:${ev.color}">
      <b>${esc(ev.name)}</b>
      ${i === 0 ? '<span class="gtab__new">최신</span>' : ''}
      <small>${ev.period ? `${esc(ev.period)} · ` : ''}배너 ${ev.banners.length}개</small>
    </button>`;

  function bannerDesc(b) {
    if (b.desc) return b.desc;
    if (b.skin) return `V 포인트와 픽업 선수 모집권으로 ${b.skin} ${b.char} 스킨과 ${b.char} 선수를 포함한 다양한 선수를 모집할 수 있는 선수 모집입니다.`;
    const c = findChar(b.char, b.grade);
    return `${b.grade} ${(c && c.position) || ''} ${b.char} 선수를 포함한 선수들을 모집할 수 있습니다.`.replace(/\s+/g, ' ');
  }

  // 배너 카드의 픽업 모집 게이지 (모집 · 확정 획득할 때마다 다시 그려요)
  function gaugeHTML(ei, bi) {
    const b = bannerAt(ei, bi);
    const g = gaugeState(ei, bi);
    if (!g) return '';
    return `
      <div class="ggauge__top"><span>픽업 모집 게이지</span><b>${g.have} / ${g.need}</b></div>
      <div class="ggauge__row">
        <span class="ggauge__bar${g.ready ? ' is-ready' : ''}" role="progressbar" aria-label="픽업 모집 게이지" aria-valuemin="0" aria-valuemax="${g.need}" aria-valuenow="${Math.min(g.have, g.need)}"><i style="width:${g.pct.toFixed(1)}%"></i></span>
        <button class="ggauge__claim" type="button" data-claim="${ei}:${bi}"${g.ready ? '' : ' disabled'}>획득</button>
      </div>
      <p class="ggauge__msg${g.ready ? ' is-ready' : ''}">${g.ready
        ? `<b>${esc(b.char)} 확정 획득 가능!</b>`
        : `앞으로 <b>${g.pullsLeft}회</b> 모집 시 확정 획득!`}${g.claims ? ` · 확정 획득 ${g.claims}회` : ''}</p>`;
  }
  function renderGauges() {
    $$('[data-gauge]', root).forEach((el) => { el.innerHTML = gaugeHTML(...parseRef(el.dataset.gauge)); });
  }

  function bannerHTML(ei, b, bi) {
    const ref = `${ei}:${bi}`;
    const ex = exchangeState(b);
    const plus = (n) => (b.gauge ? `<small class="gx-ybtn__g">+${n * GAUGE_PER_PULL}</small>` : '');
    return `
      <article class="gban" style="--gc:${b.color}">
        <h3 class="gban__title">${esc(b.title)}</h3>
        <div class="gban__art">
          <img data-gban-img="${ref}" alt="${esc([b.skin, b.char].filter(Boolean).join(' '))}" decoding="async">
          <button class="gban__rates" type="button" data-rates="${ref}">확률표</button>
          <span class="gban__pick">${badge(b.grade, ' grade--sm')}<span>${esc(b.char)} <b>${fmtRate(mainRate(b))}</b></span></span>
          <p class="gban__desc">${esc(bannerDesc(b))}</p>
        </div>
        ${pointKeys(b).length ? `<p class="gban__ret"><span class="gban__ret-label">모집 1명당 반환 재화</span>${pointsHTML(b, 1, '×')}</p>` : ''}
        ${ex ? `<p class="gban__ex">${coinSVG(EXCHANGE_POINT)}${esc(POINTS[EXCHANGE_POINT].name)} <b>${ex.cost}</b>개로 ${esc(b.char)} 교환 · 모집 ${ex.pullsTotal}명</p>` : ''}
        ${b.gauge ? `<div class="ggauge" data-gauge="${ref}">${gaugeHTML(ei, bi)}</div>` : ''}
        <div class="gban__btns">
          <button class="gx-ybtn" type="button" data-pull="${ref}" data-n="1">1명 모집${plus(1)}</button>
          <button class="gx-ybtn" type="button" data-pull="${ref}" data-n="10">10명 모집${plus(10)}</button>
        </div>
      </article>`;
  }

  function loadBannerArt() {
    $$('img[data-gban-img]', root).forEach((img) => {
      const b = bannerAt(...parseRef(img.dataset.gbanImg));
      if (!b) return;
      const c = findChar(b.char, b.grade);
      const s = findSkin(c, b.skin);
      T.setImg(img, (s && s.image) || (c && c.image) || '', T.placeholder(b.char, b.color), 'full');
    });
  }

  const gradeRank = (g) => { const i = ['S+', 'S', 'S-', 'A+', 'A', 'A-'].indexOf(g); return i < 0 ? 9 : i; };
  const ownChip = (o) => `
    <button type="button" class="gown__chip gown__chip--${o.ball}"${o.id ? ` data-open-char="${esc(o.id)}" title="캐릭터 정보 보기"` : ' disabled'}>
      <span class="gown__ava" style="--cc:${T.safeColor(o.color)}"><img data-gown-img="${esc(o.key)}" alt="" decoding="async"></span>
      ${badge(o.grade, ' grade--sm')}
      <b>${esc(o.name)}</b>
      ${[...o.skins].map((s) => `<span class="gown__skin">+ ${esc(s)} 스킨</span>`).join('')}
      <span class="gown__n">×${o.count}</span>
    </button>`;

  function renderStats() {
    const box = $('#gxStat');
    if (!box) return;
    const got = [...owned.values()]
      .filter((o) => o.ball !== 'white')
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || b.count - a.count);
    box.innerHTML = `
      <div class="gstat__head">
        <h3>내 모집 기록</h3>
        ${stats.pulls ? '<button class="btn btn--ghost btn--sm" type="button" data-gacha-reset>기록 초기화</button>' : ''}
      </div>
      <dl class="gstat__nums">
        <div><dt>총 모집</dt><dd>${stats.pulls}<small>명</small></dd></div>
        <div class="is-red"><dt>${miniBall('red')}빨간 공</dt><dd>${stats.red}</dd></div>
        <div class="is-yellow"><dt>${miniBall('yellow')}노란 공</dt><dd>${stats.yellow}</dd></div>
        <div class="is-shard"><dt>${SHARD_ICON}노력의 조각</dt><dd>${stats.shards}</dd></div>
      </dl>
      ${perBanner.size ? `<h4 class="gstat__sub">배너별 기록 <small>반환 재화 · 교환 · 픽업 모집 게이지</small></h4>${pointsListHTML()}` : ''}
      ${got.length
        ? `<h4 class="gstat__sub">획득한 S등급 이상 선수 <small>${got.length}명</small></h4><div class="gown">${got.map(ownChip).join('')}</div>`
        : `<p class="muted gstat__empty">${stats.pulls ? '아직 S등급 이상 선수가 없어요. 한 번 더 모집해 보세요!' : '아직 모집 기록이 없어요. 위 배너에서 모집해 보세요.'}</p>`}
      <p class="gstat__note">기록은 이 화면에만 남고, 새로고침하면 처음부터 시작해요.</p>`;
    $$('img[data-gown-img]', box).forEach((img) => {
      const o = owned.get(img.dataset.gownImg);
      if (o) T.setImg(img, o.image, T.placeholder(o.name, o.color), 'thumb');
    });
  }

  // 배너별로 받은 반환 재화 · 픽업 선수 교환 진행
  // (같은 이름의 재화가 배너끼리 합쳐지는지 몰라서 배너마다 따로 보여줘요)
  function pointsListHTML() {
    const rows = [...perBanner.values()].sort((a, b) => a.ei - b.ei || a.bi - b.bi);
    // 여러 이벤트를 모집했으면 배너 이름 앞에 이벤트 이름을 붙여요
    const manyEvents = new Set(rows.map((r) => r.ei)).size > 1;
    const total = {};
    rows.forEach((r) => Object.keys(r.points).forEach((k) => { total[k] = (total[k] || 0) + r.points[k]; }));
    const pill = (k, v) => `<span class="gx-pt">${coinSVG(k)}${esc(POINTS[k].name)} <b>${v.toLocaleString()}</b></span>`;
    const pills = (pts) => Object.keys(POINTS).filter((k) => pts[k]).map((k) => pill(k, pts[k])).join('');
    return `
      <div class="gpb">${rows.map((r) => {
        const b = bannerAt(r.ei, r.bi);
        const ex = exchangeState(b, r.points[EXCHANGE_POINT]);
        const g = gaugeState(r.ei, r.bi);
        const pts = pills(r.points);
        return `
        <div class="gpb__row" style="--gc:${b.color}">
          <div class="gpb__head">${badge(b.grade, ' grade--sm')}<b>${esc(`${manyEvents ? `${EVENTS[r.ei].name} · ` : ''}${shortTitle(b)}`)}</b><span class="gpb__n">${r.pulls}명</span></div>
          ${pts ? `<div class="gpb__pts">${pts}</div>` : ''}
          ${g ? `
          <div class="gpb__ex${g.ready ? ' is-ready' : ''}">
            <span class="gpb__bar" role="progressbar" aria-label="픽업 모집 게이지" aria-valuemin="0" aria-valuemax="${g.need}" aria-valuenow="${Math.min(g.have, g.need)}"><i style="width:${g.pct.toFixed(1)}%"></i></span>
            <span>${g.ready ? `<b>${esc(b.char)} 확정 획득 가능!</b>` : `픽업 모집 게이지 · 앞으로 <b>${g.pullsLeft}회</b>`}${g.claims ? ` · 확정 획득 ${g.claims}회` : ''}</span>
            <small>${g.have} / ${g.need}</small>
          </div>` : ''}
          ${ex ? `
          <div class="gpb__ex${ex.ready ? ' is-ready' : ''}">
            <span class="gpb__bar" role="progressbar" aria-label="${esc(b.char)} 교환" aria-valuemin="0" aria-valuemax="${ex.cost}" aria-valuenow="${Math.min(ex.have, ex.cost)}"><i style="width:${ex.pct.toFixed(1)}%"></i></span>
            <span>${ex.ready ? `<b>${esc(b.char)} 교환 가능!</b>` : `${esc(b.char)} 교환까지 <b>${ex.left.toLocaleString()}</b> · 모집 ${ex.pullsLeft}명 더`}</span>
            <small>${ex.have.toLocaleString()} / ${ex.cost.toLocaleString()}</small>
          </div>` : ''}
        </div>`;
      }).join('')}</div>
      ${rows.length > 1 && pills(total) ? `<div class="gpb__total"><span>합계</span>${pills(total)}</div>` : ''}`;
  }

  function resetStats() {
    Object.keys(stats).forEach((k) => { stats[k] = 0; });
    owned.clear();
    perBanner.clear();
    gauges.clear();
    renderStats();
    renderGauges();
    T.toast('모집 기록을 초기화했어요.');
  }

  // 고른 이벤트의 제목 · 배너로 바꿔요
  function renderEvent(animate) {
    const ev = EVENTS[evIndex];
    section.style.setProperty('--ev', ev.color);
    $('#gxEvTitle').innerHTML = `<span class="gx-west">${esc(ev.name)}</span> 모집 배너`;
    $$('.gtab', root).forEach((t) => {
      const on = Number(t.dataset.ev) === evIndex;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    const box = $('#gxBans');
    box.setAttribute('aria-labelledby', `gxTab${evIndex}`);
    box.innerHTML = ev.banners.map((b, bi) => bannerHTML(evIndex, b, bi)).join('');
    box.scrollLeft = 0;
    if (artReady) loadBannerArt();
    if (animate && !reduceMotion) {
      box.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
  }

  function selectEvent(i, focus) {
    if (!EVENTS[i]) return;
    const changed = i !== evIndex;
    evIndex = i;
    if (changed) renderEvent(true);
    const tab = $(`#gxTab${i}`);
    if (tab) {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      if (focus) tab.focus({ preventScroll: true });
    }
  }

  function renderSection() {
    root.innerHTML = `
      <header class="shead gx-shead" data-reveal>
        <span class="shead__eyebrow"><i>EVENT</i>GACHA SIMULATOR</span>
        <h2 class="shead__title" id="gxEvTitle"></h2>
        <p class="shead__desc">게임 확률표 그대로 1명 · 10명 모집을 해 볼 수 있어요.<br>실제 게임 결과와는 관계없는 재미용 시뮬레이터예요.</p>
      </header>
      <div class="gtabs" role="tablist" aria-label="이벤트 고르기" data-reveal>${EVENTS.map(tabHTML).join('')}</div>
      <div class="gbans" id="gxBans" role="tabpanel" data-reveal style="--d:60ms"></div>
      <div class="glegend" data-reveal style="--d:80ms">
        <span>${miniBall('red')}<b>빨간 공</b>S+ · 스킨과 함께 나온 이벤트 픽업 선수</span>
        <span>${miniBall('yellow')}<b>노란 공</b>S ~ S- 선수</span>
        <span>${miniBall('white')}<b>흰 공</b>A+ 이하 선수</span>
        <span class="is-shard">${SHARD_ICON}<b>노력의 조각</b>이미 뽑은 선수가 또 나왔을 때</span>
      </div>
      <div class="gstat" id="gxStat" data-reveal style="--d:120ms"></div>`;
    renderEvent(false);
    renderStats();

    // 배너 그림은 섹션 가까이 왔을 때 불러와요
    const showArt = () => { artReady = true; loadBannerArt(); };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        showArt();
      }, { rootMargin: '600px 0px' });
      io.observe(root);
    } else {
      showArt();
    }
    T.observeReveal(root);
  }

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-ev]');
    if (tab) return selectEvent(Number(tab.dataset.ev));
    const c = e.target.closest('[data-claim]');
    if (c) return claim(...parseRef(c.dataset.claim));
    const p = e.target.closest('[data-pull]');
    if (p) return pull(...parseRef(p.dataset.pull), Number(p.dataset.n));
    const r = e.target.closest('[data-rates]');
    if (r) return showRates(...parseRef(r.dataset.rates));
    if (e.target.closest('[data-gacha-reset]')) resetStats();
  });

  // 탭에서 ← → 로 이벤트 넘기기
  root.addEventListener('keydown', (e) => {
    if (!e.target.closest('.gtab')) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      selectEvent(e.key === 'Home' ? 0 : EVENTS.length - 1, true);
    } else if (step) {
      e.preventDefault();
      selectEvent((evIndex + step + EVENTS.length) % EVENTS.length, true);
    }
  });

  // 게시된 캐릭터 도감을 불러온 뒤에 그려요
  T.ready.then(renderSection);
})();
