/* =====================================================================
 *  스킨 뽑기 시뮬레이터 — 이벤트 스킨 추첨
 * ---------------------------------------------------------------------
 *  · 보상 8개를 하나씩 뽑아요. 뽑은 보상은 다시 나오지 않고, 8회차에는 남은 1개를 확정 획득해요.
 *  · 확률 (게임 공지 · 인게임 확률표 기준)
 *      1등상 : 회차별 확률표 그대로 (firstRates)
 *      2등상 : 합산 24% — 3등상을 3개 획득한 다음 추첨부터 합산 30%
 *      3등상 : 나머지 (100% − 1등상 − 2등상)
 *      같은 등수 안에서는 남은 보상끼리 똑같이 나눠요. (예: 3등상 76% ÷ 5개 = 15.2%)
 *      어느 등수의 보상이 다 떨어지면 그 확률은 남은 보상에 넘어가요.
 *        (3등상이 없으면 2등상으로, 2등상도 없으면 1등상으로)
 *  · 새 스킨 추첨 이벤트를 넣을 때는 아래 SKIN_EVENTS 의 { ... } 덩어리를 복사해서 맨 위에 붙이세요.
 *    기록은 이 화면에만 남고, 새로고침하면 처음부터 시작해요. (실제 게임 결과와는 관계없어요)
 *
 *  · 뽑기 시뮬레이터 섹션 맨 위에 '뽑기 시뮬레이터 · 스킨 시뮬레이터' 카테고리를 만들고,
 *    스킨 시뮬레이터를 고르면 그 아래 내용이 스킨 추첨 화면으로 바뀌어요. (상단 메뉴는 '뽑기 시뮬레이터' 하나)
 *
 *  [이 기능을 빼고 싶을 때]
 *   js/skingacha.js · css/skingacha.css 를 지우고,
 *   index.html 에서 '스킨 뽑기' 라고 적힌 줄(css · js)을 지우면 돼요. 카테고리도 함께 없어져요.
 * ===================================================================== */
(() => {
  'use strict';

  const T = window.TSC;
  const gachaRoot = document.getElementById('gachaRoot');
  if (!T || !gachaRoot) return;
  const { $, $$, esc } = T;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =====================================================================
   *  카테고리 (뽑기 시뮬레이터 · 스킨 시뮬레이터)
   * ===================================================================== */
  const CAT_KEY = 'tsc.gacha.cat'; // 이 탭에서 마지막으로 본 카테고리
  gachaRoot.insertAdjacentHTML('beforebegin', `
    <div class="container">
      <div class="gcat" role="tablist" aria-label="시뮬레이터 고르기">
        <button type="button" class="gcat__btn" role="tab" id="gcatGacha" aria-controls="gachaRoot" data-gcat="gacha">
          <span class="gcat__ico" aria-hidden="true">⚾</span><b>뽑기 시뮬레이터</b><small>이벤트 선수 모집</small>
        </button>
        <button type="button" class="gcat__btn" role="tab" id="gcatSkin" aria-controls="skinGachaRoot" data-gcat="skin">
          <span class="gcat__ico" aria-hidden="true">✨</span><b>스킨 시뮬레이터</b><small>이벤트 스킨 추첨</small>
        </button>
      </div>
    </div>`);
  gachaRoot.insertAdjacentHTML('afterend', '<div class="container" id="skinGachaRoot" role="tabpanel" aria-labelledby="gcatSkin" hidden></div>');
  gachaRoot.setAttribute('role', 'tabpanel');
  gachaRoot.setAttribute('aria-labelledby', 'gcatGacha');
  const root = document.getElementById('skinGachaRoot');
  const catBtns = $$('.gcat__btn');

  function selectCat(cat, focus) {
    const skin = cat === 'skin';
    gachaRoot.hidden = skin;
    root.hidden = !skin;
    catBtns.forEach((b) => {
      const on = b.dataset.gcat === cat;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    T.store.set(CAT_KEY, cat, true);
    const panel = skin ? root : gachaRoot;
    if (!reduceMotion) panel.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }
  catBtns.forEach((b) => b.addEventListener('click', () => selectCat(b.dataset.gcat)));
  // ← → 로 카테고리 넘기기
  catBtns[0].parentNode.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    selectCat(document.activeElement && document.activeElement.dataset.gcat === 'skin' ? 'gacha' : 'skin', true);
  });
  selectCat(T.store.get(CAT_KEY, true) === 'skin' ? 'skin' : 'gacha');

  /* =====================================================================
   *  설정 — 스킨 추첨 이벤트 (맨 위가 최신)
   * ===================================================================== */
  //  char · skin   캐릭터 도감의 이름 · 스킨 이름과 같아야 사진이 나와요 (띄어쓰기는 무시)
  //  ticket        추첨권 이름
  //  freeTickets   이벤트 미션 · 패스로 받는 추첨권 개수
  //  buy           추첨권 1장 가격 (무료 추첨권을 다 쓰면 이 재화로 사요)
  //  costs         회차별 필요한 추첨권 (1회차부터)
  //  firstRates    회차별 1등상 확률 (%)
  //  second        2등상 합산 확률 — boostAfter 개의 3등상을 얻은 다음 추첨부터 boosted 로 올라요
  //  rewards       보상 (tier: 1 · 2 · 3등상, icon: 이모지 — 1등상은 스킨 사진)
  const SKIN_EVENTS = [
    {
      name: '호문쿨루스 이사벨',
      period: '2026년 10월 · 할로윈 이벤트',
      color: '#b06bff',
      char: '이사벨', skin: '호문쿨루스',
      ticket: '스킨 전용 추첨권',
      freeTickets: 2,
      buy: { name: 'S포인트', price: 80 },
      costs: [1, 1, 2, 2, 3, 3, 4, 4],
      firstRates: [0, 1, 1, 1, 5, 5, 10, 100],
      second: { base: 24, boosted: 30, boostAfter: 3 },
      rewards: [
        { tier: 1, name: '[레전더리] 호문쿨루스 이사벨', qty: 1, icon: 'skin' },
        { tier: 2, name: '호문쿨루스 이사벨 헤어', qty: 1, icon: '💇' },
        { tier: 2, name: '플라스크', qty: 1, icon: '🧪' },
        { tier: 3, name: '포지션별 선수 모집권', qty: 5, icon: '🎫' },
        { tier: 3, name: '블루 플레임', qty: 100, icon: '🔥', tint: 'blue' },
        { tier: 3, name: 'EXP', qty: 100000, icon: 'EXP' },
        { tier: 3, name: '으스스 듀라한 헤어', qty: 1, icon: '🔥', tint: 'purple' },
        { tier: 3, name: '일반 선수 모집권', qty: 10, icon: '🎟️' }
      ]
    }
  ];

  const TIER_NAMES = { 1: '1등상', 2: '2등상', 3: '3등상' };

  /* ---------- 작은 도구들 ---------- */
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  // 게임 화면처럼 소수점 넷째 자리까지 (0 은 '0 %')
  const fmtRate = (p) => (p <= 1e-9 ? '0 %' : `${p.toFixed(4)} %`);
  const fmtPct = (p) => `${Number(p.toFixed(1))}%`;
  const rand = () => {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  };
  const qtyText = (r) => `${r.name} x${r.qty.toLocaleString()}`;
  const tierCount = (ev, tier) => ev.rewards.filter((r) => r.tier === tier).length;

  /* =====================================================================
   *  확률 계산
   * ===================================================================== */
  // 등수별 합산 확률 (%) — round: 다음 회차, n1 · n2 · n3: 등수별 남은 보상 수, thirds: 지금까지 얻은 3등상 수
  function tierTotals(ev, round, n1, n2, n3, thirds) {
    const t = { 1: 0, 2: 0, 3: 0 };
    if (n1) t[1] = Math.min(100, ev.firstRates[round - 1] == null ? 100 : ev.firstRates[round - 1]);
    if (n2) t[2] = Math.min(100 - t[1], thirds >= ev.second.boostAfter ? ev.second.boosted : ev.second.base);
    if (n3) t[3] = 100 - t[1] - t[2];
    // 남는 확률은 남은 보상에 넘겨줘요 (3등상이 다 떨어졌을 때)
    const rest = 100 - t[1] - t[2] - t[3];
    if (rest > 1e-9) { if (n2) t[2] += rest; else if (n1) t[1] += rest; }
    return t;
  }

  // 지금 상태의 다음 1회 추첨 확률 — got: 이미 얻은 보상 번호
  function chances(ev, got) {
    const left = (tier) => ev.rewards.filter((r, i) => r.tier === tier && !got.includes(i)).length;
    const n = { 1: left(1), 2: left(2), 3: left(3) };
    const remaining = n[1] + n[2] + n[3];
    const thirds = tierCount(ev, 3) - n[3];
    const round = got.length + 1;
    const totals = remaining ? tierTotals(ev, round, n[1], n[2], n[3], thirds) : { 1: 0, 2: 0, 3: 0 };
    const items = ev.rewards.map((r, i) => {
      const owned = got.includes(i);
      return { ...r, i, owned, rate: owned || !n[r.tier] ? 0 : totals[r.tier] / n[r.tier] };
    });
    return {
      round, remaining, thirds, totals, items, done: !remaining,
      cost: remaining ? ev.costs[round - 1] || ev.costs[ev.costs.length - 1] : 0,
      boosted: thirds >= ev.second.boostAfter
    };
  }

  // 1등상이 몇 회차에 나올지 (지금 상태부터 끝까지 모든 경우를 계산해요)
  // → { byRound: { 회차: 확률(0~1) }, tickets: 평균 추가 추첨권, rounds: 평균 회차 }
  function firstPrizeOdds(ev, got) {
    const now = chances(ev, got);
    if (now.done || !now.items.some((x) => x.tier === 1 && !x.owned)) return null;
    const total = ev.rewards.length;
    const n3All = tierCount(ev, 3);
    const byRound = {};
    let tickets = 0;
    const go = (n2, n3, p, spent) => {
      const round = total - (1 + n2 + n3) + 1;
      const cost = ev.costs[round - 1] || 0;
      const t = tierTotals(ev, round, 1, n2, n3, n3All - n3);
      const hit = p * (t[1] / 100);
      byRound[round] = (byRound[round] || 0) + hit;
      tickets += hit * (spent + cost);
      if (n2 && t[2]) go(n2 - 1, n3, p * (t[2] / 100), spent + cost);
      if (n3 && t[3]) go(n2, n3 - 1, p * (t[3] / 100), spent + cost);
    };
    const left = (tier) => now.items.filter((x) => x.tier === tier && !x.owned).length;
    go(left(2), left(3), 1, 0);
    const rounds = Object.keys(byRound).reduce((s, r) => s + Number(r) * byRound[r], 0);
    return { byRound, tickets, rounds };
  }

  // 사용한 추첨권 중 무료 추첨권을 넘은 만큼 산 재화
  const boughtCost = (ev, used) => Math.max(0, used - ev.freeTickets) * ev.buy.price;

  /* =====================================================================
   *  추첨 (기록은 이 화면에만 남아요)
   * ===================================================================== */
  const runs = new Map(); // 이벤트 번호 → { got: [보상 번호], log: [{ round, cost, i }], spent }
  const runOf = (ei) => {
    if (!runs.has(ei)) runs.set(ei, { got: [], log: [], spent: 0 });
    return runs.get(ei);
  };

  function drawOnce(ei) {
    const ev = SKIN_EVENTS[ei];
    const st = runOf(ei);
    const c = chances(ev, st.got);
    if (c.done) return null;
    const pool = c.items.filter((x) => x.rate > 0);
    let r = rand() * pool.reduce((s, x) => s + x.rate, 0);
    const pick = pool.find((x) => (r -= x.rate) < 0) || pool[pool.length - 1];
    st.got.push(pick.i);
    st.spent += c.cost;
    st.log.push({ round: c.round, cost: c.cost, i: pick.i });
    return { ...pick, round: c.round, cost: c.cost };
  }

  let lastResult = null; // { ei, picks: [...], mode: 'one' | 'first' }

  function draw(ei, mode) {
    const ev = SKIN_EVENTS[ei];
    const picks = [];
    if (mode === 'first') {
      // 1등상이 나올 때까지 (이미 얻었으면 끝까지는 하지 않아요)
      while (!runOf(ei).got.some((i) => ev.rewards[i].tier === 1)) {
        const p = drawOnce(ei);
        if (!p) break;
        picks.push(p);
      }
    } else {
      const p = drawOnce(ei);
      if (p) picks.push(p);
    }
    if (!picks.length) return;
    lastResult = { ei, picks, mode };
    render(true);
  }

  function reset(ei) {
    runs.delete(ei);
    lastResult = null;
    render(false);
    T.toast('추첨 기록을 초기화했어요.');
  }

  /* =====================================================================
   *  화면
   * ===================================================================== */
  let evIndex = 0;
  let artReady = false;

  const findChar = (name) => T.state.data.characters.find((c) => norm(c.name) === norm(name)) || null;
  const findSkin = (c, name) => (c ? c.skins.find((s) => norm(s.name) === norm(name)) || null : null);

  function iconHTML(ev, r) {
    if (r.icon === 'skin') return `<span class="skg-ico skg-ico--skin"><img data-skg-img="thumb" alt="" decoding="async"></span>`;
    if (r.icon === 'EXP') return '<span class="skg-ico skg-ico--exp" aria-hidden="true">EXP</span>';
    return `<span class="skg-ico${r.tint ? ` skg-ico--${r.tint}` : ''}" aria-hidden="true">${esc(r.icon)}</span>`;
  }

  // 등수 → 보상 순서 (같은 등수에서는 아직 안 얻은 보상이 위)
  const sorted = (items) => [...items].sort((a, b) => a.tier - b.tier || a.owned - b.owned || a.i - b.i);

  function tableHTML(ev, c, fresh) {
    return `
      <div class="skg-tbl" role="table" aria-label="다음 1회 당첨 확률">
        <div class="skg-tbl__row skg-tbl__row--head" role="row"><span role="columnheader">등수</span><span role="columnheader">아이템</span><span role="columnheader">획득 상태</span><span role="columnheader">확률</span></div>
        ${sorted(c.items).map((x) => `
        <div class="skg-tbl__row skg-tier--${x.tier}${x.owned ? ' is-owned' : ''}${fresh.has(x.i) ? ' is-fresh' : ''}" role="row">
          <span class="skg-tbl__tier" role="cell">${TIER_NAMES[x.tier]}</span>
          <span class="skg-tbl__item" role="cell">${iconHTML(ev, x)}<b>${esc(qtyText(x))}</b></span>
          <span class="skg-tbl__state" role="cell">${x.owned ? '획득 완료' : '미획득'}</span>
          <span class="skg-tbl__rate" role="cell">${fmtRate(x.rate)}</span>
        </div>`).join('')}
        <div class="skg-tbl__row skg-tbl__row--sum" role="row"><span role="cell">합계 확률</span><span role="cell"></span><span role="cell"></span><span class="skg-tbl__rate" role="cell">${c.done ? '—' : '100 %'}</span></div>
      </div>`;
  }

  function resultHTML(ev) {
    if (!lastResult || lastResult.ei !== evIndex) {
      return `<p class="skg-res__hint">추첨하기를 누르면 여기에 결과가 나와요.</p>`;
    }
    const { picks, mode } = lastResult;
    const used = picks.reduce((s, p) => s + p.cost, 0);
    const first = picks.find((p) => p.tier === 1);
    const lastPick = picks[picks.length - 1];
    const head = mode === 'first'
      ? (first
        ? `<p class="skg-res__sum"><b>${first.round}회차</b>에 1등상 획득! · 이번에 추첨권 <b>${used}개</b> 사용 (${picks.length}회 추첨)</p>`
        : `<p class="skg-res__sum">추첨권 <b>${used}개</b>로 ${picks.length}회 추첨했어요.</p>`)
      : '';
    return `${head}
      <div class="skg-res__card skg-tier--${lastPick.tier}${lastPick.tier === 1 ? ' is-legend' : ''}">
        ${iconHTML(ev, lastPick)}
        <div><small>${lastPick.round}회차 · ${TIER_NAMES[lastPick.tier]}${lastPick.tier === 1 ? ' · LEGENDARY!' : ''}</small><b>${esc(qtyText(lastPick))}</b></div>
      </div>
      ${mode === 'first' && picks.length > 1 ? `<ol class="skg-res__list">${picks.map((p) => `<li class="skg-tier--${p.tier}"><span>${p.round}회차</span>${TIER_NAMES[p.tier]} · ${esc(qtyText(p))}</li>`).join('')}</ol>` : ''}`;
  }

  // 회차별 확률표 (공지의 추첨 확률 안내)
  function roundTableHTML(ev, c) {
    return `
      <div class="skg-rounds" role="table" aria-label="회차별 필요한 추첨권과 1등상 확률">
        <div class="skg-rounds__row skg-rounds__row--head" role="row"><span role="columnheader">회차</span><span role="columnheader">필요한 추첨권</span><span role="columnheader">1등상 확률</span></div>
        ${ev.costs.map((cost, i) => `
        <div class="skg-rounds__row${!c.done && c.round === i + 1 ? ' is-now' : ''}${c.round > i + 1 ? ' is-past' : ''}" role="row">
          <span role="cell">${i + 1}회차</span><span role="cell">${cost}개</span><span role="cell">${fmtPct(ev.firstRates[i])}</span>
        </div>`).join('')}
      </div>`;
  }

  // 1등상까지 평균 비용 · 회차별로 1등상이 나올 확률
  function oddsHTML(ev, st) {
    const fresh = firstPrizeOdds(ev, []);
    const started = st.got.length > 0;
    const now = started ? firstPrizeOdds(ev, st.got) : null;
    const show = now || fresh;
    const max = Math.max(...Object.values(show.byRound));
    const allTickets = ev.costs.reduce((s, n) => s + n, 0);
    return `
      <p class="skg-odds__lead">${now ? '지금부터' : '처음부터'} 1등상까지 평균 <b>${show.rounds.toFixed(1)}회차</b> · 추첨권 평균 <b>${show.tickets.toFixed(1)}개</b>${now ? ' 더' : ''}</p>
      <div class="skg-odds__bars">${ev.costs.map((_, i) => {
        const p = show.byRound[i + 1] || 0;
        return `<div class="skg-odds__bar${p ? '' : ' is-zero'}"><span class="skg-odds__fill" style="--h:${max ? (p / max) * 100 : 0}%"></span><b>${fmtPct(p * 100)}</b><small>${i + 1}회</small></div>`;
      }).join('')}</div>
      <p class="skg-odds__note">막대는 1등상이 그 회차에 나올 확률이에요.
        끝까지 뽑으면 추첨권 ${allTickets}개 — 무료 ${ev.freeTickets}개를 빼면 ${esc(ev.buy.name)} ${boughtCost(ev, allTickets).toLocaleString()}
        · 처음부터 평균으로는 ${esc(ev.buy.name)} 약 ${Math.round(Math.max(0, fresh.tickets - ev.freeTickets) * ev.buy.price).toLocaleString()}</p>`;
  }

  function render(animate) {
    const ev = SKIN_EVENTS[evIndex];
    const st = runOf(evIndex);
    const c = chances(ev, st.got);
    const gotFirst = st.got.some((i) => ev.rewards[i].tier === 1);
    // 표에서 강조하는 보상: 방금 뽑은 1개
    const fresh = new Set(lastResult && lastResult.ei === evIndex ? [lastResult.picks[lastResult.picks.length - 1].i] : []);
    root.style.setProperty('--ev', ev.color); // 섹션 배경은 뽑기 시뮬레이터 색 그대로, 스킨 화면 글자 색만
    $('#skgTitle').innerHTML = `<span class="gx-west">${esc(ev.name)}</span> 스킨 추첨`;
    $$('.gtab', root).forEach((t) => {
      const on = Number(t.dataset.skgEv) === evIndex;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $('#skgBody').innerHTML = `
      <div class="skg" style="--gc:${ev.color}">
        <div class="skg__art">
          <img data-skg-img="full" alt="${esc(`${ev.skin} ${ev.char} 스킨`)}" decoding="async">
          <div class="skg__art-cap"><span class="skg__legend">LEGENDARY</span><b>${esc(qtyText(ev.rewards.find((r) => r.tier === 1)))}</b>${ev.period ? `<small>${esc(ev.period)}</small>` : ''}</div>
        </div>
        <div class="skg__main">
          <div class="skg__status">
            ${c.done
              ? '<p><b>모든 보상을 획득했어요!</b></p>'
              : `<p>다음 <b>${c.round}/${ev.rewards.length}회차</b> · 이번 소모: ${esc(ev.ticket)} <b>${c.cost}개</b></p>`}
            <p class="skg__sub">남은 보상 ${c.remaining}/${ev.rewards.length}개 · 3등상 누적 획득 ${c.thirds}/${tierCount(ev, 3)}개${c.boosted && !c.done ? ` · <span class="skg__boost">2등상 합산 ${ev.second.boosted}%로 증가!</span>` : ''}</p>
          </div>
          ${c.done ? '' : `<p class="skg__totals">등수별 합산 확률 · 1등상 <b>${fmtRate(c.totals[1])}</b> · 2등상 <b>${fmtRate(c.totals[2])}</b> · 3등상 <b>${fmtRate(c.totals[3])}</b></p>`}
          ${tableHTML(ev, c, fresh)}
          <div class="skg-res" aria-live="polite">${resultHTML(ev)}</div>
          <div class="skg__btns">
            <button class="gx-ybtn" type="button" data-skg-draw="one"${c.done ? ' disabled' : ''}>추첨하기<small>${c.done ? '모두 획득' : `${esc(ev.ticket)} ${c.cost}개`}</small></button>
            <button class="gx-ybtn skg-btn--alt" type="button" data-skg-draw="first"${c.done || gotFirst ? ' disabled' : ''}>1등상 나올 때까지</button>
            <button class="btn btn--ghost btn--sm" type="button" data-skg-reset${st.got.length ? '' : ' disabled'}>처음부터</button>
          </div>
          <p class="skg__spent">사용한 추첨권 <b>${st.spent}개</b>${st.spent > ev.freeTickets
            ? ` · 무료 ${ev.freeTickets}개를 빼고 ${esc(ev.buy.name)} <b>${boughtCost(ev, st.spent).toLocaleString()}</b> (1개 ${ev.buy.price})`
            : ` · 무료 추첨권 ${ev.freeTickets}개 안이에요`}</p>
        </div>
      </div>
      <div class="skg-info">
        <section class="skg-card">
          <h3>회차별 확률표</h3>
          ${roundTableHTML(ev, c)}
          <p class="skg-card__note">첫 번째 추첨에서는 1등상이 나오지 않아요. 8회차에는 남은 보상 1개를 확정 획득해요.</p>
        </section>
        <section class="skg-card">
          <h3>1등상까지 얼마나 들까?</h3>
          ${gotFirst ? '<p class="skg-odds__lead"><b>1등상을 이미 획득했어요!</b> 처음부터를 누르면 다시 계산해요.</p>' : oddsHTML(ev, st)}
        </section>
        <section class="skg-card skg-card--rules">
          <h3>확률 적용 규칙</h3>
          <ul>
            <li>확률은 남은 보상을 기준으로 다음 1회 추첨에 적용돼요. 얻은 보상은 다시 나오지 않아요.</li>
            <li>1등상은 회차별 확률표대로, 2등상은 합산 ${ev.second.base}%, 3등상은 나머지예요. 같은 등수의 남은 보상끼리 똑같이 나눠요.</li>
            <li>3등상을 ${ev.second.boostAfter}개 획득하면 다음 추첨부터 2등상 합산 확률이 ${ev.second.boosted}%로 올라요.</li>
            <li>무료 ${esc(ev.ticket)} ${ev.freeTickets}개 (미션 · 이벤트 패스) · 추가 1개 ${esc(ev.buy.name)} ${ev.buy.price}</li>
          </ul>
          <p class="skg-card__note">게임 공지와 인게임 확률표를 바탕으로 만든 재미용 시뮬레이터예요. 실제 게임 결과와는 관계없고, 기록은 새로고침하면 처음부터 시작해요.</p>
        </section>
      </div>`;
    if (artReady) loadArt();
    if (animate && !reduceMotion) {
      const card = $('.skg-res__card', root);
      if (card) card.animate([{ opacity: 0, transform: 'scale(.92) translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
  }

  function loadArt() {
    const ev = SKIN_EVENTS[evIndex];
    const c = findChar(ev.char);
    const s = findSkin(c, ev.skin);
    $$('img[data-skg-img]', root).forEach((img) => {
      T.setImg(img, (s && s.image) || (c && c.image) || '', T.placeholder(ev.char, ev.color, 1), img.dataset.skgImg);
    });
  }

  function renderSection() {
    root.innerHTML = `
      <header class="shead gx-shead" data-reveal>
        <span class="shead__eyebrow"><i>SKIN</i>SKIN DRAW SIMULATOR</span>
        <h2 class="shead__title" id="skgTitle"></h2>
        <p class="shead__desc">보상 8개를 하나씩 뽑는 이벤트 스킨 추첨이에요. 뽑을 때마다 남은 보상에 맞춰 확률이 바뀌어요.<br>실제 게임 결과와는 관계없는 재미용 시뮬레이터예요.</p>
      </header>
      ${SKIN_EVENTS.length > 1 ? `<div class="gtabs" role="tablist" aria-label="스킨 추첨 고르기" data-reveal>${SKIN_EVENTS.map((ev, i) => `
        <button type="button" class="gtab" role="tab" data-skg-ev="${i}" style="--ev:${ev.color}"><b>${esc(ev.name)}</b>${i === 0 ? '<span class="gtab__new">최신</span>' : ''}<small>${esc(ev.period || '')}</small></button>`).join('')}</div>` : ''}
      <div id="skgBody" data-reveal style="--d:60ms"></div>`;
    render(false);

    // 스킨 그림은 섹션 가까이 왔을 때 불러와요
    const showArt = () => { artReady = true; loadArt(); };
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
    const tab = e.target.closest('[data-skg-ev]');
    if (tab) {
      evIndex = Number(tab.dataset.skgEv);
      lastResult = null;
      render(false);
      return;
    }
    const d = e.target.closest('[data-skg-draw]');
    if (d && !d.disabled) return draw(evIndex, d.dataset.skgDraw);
    if (e.target.closest('[data-skg-reset]')) reset(evIndex);
  });

  // 시험용: 콘솔에서 TSC.skinGacha.chances(0, [6]) 처럼 확률을 확인할 수 있어요
  T.skinGacha = { events: SKIN_EVENTS, chances: (ei, got) => chances(SKIN_EVENTS[ei], got), odds: (ei, got) => firstPrizeOdds(SKIN_EVENTS[ei], got || []) };

  // 게시된 캐릭터 도감(스킨 사진)을 불러온 뒤에 그려요
  T.ready.then(renderSection);
})();
