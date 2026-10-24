/* =====================================================================
 *  관리자 모드 — 아이디 · 비밀번호 로그인 · 모든 내용 편집 · 게시
 * ---------------------------------------------------------------------
 *  · 맨 아래 '관리자' 버튼 → 아이디 · 비밀번호로 로그인
 *    (계정은 Firebase 콘솔 → Authentication → 사용자에서 직접 만듭니다.
 *     비밀번호는 이 코드 어디에도 들어있지 않아요)
 *  · Firestore 규칙에 등록된 계정(UID)만 관리자 모드에 들어갈 수 있어요.
 *    (화면에서 막는 것과 별개로, 실제 저장 권한은 Firebase 서버가 확인합니다)
 *  · 고친 내용은 '게시하기'를 눌러야 방문자에게 보입니다.
 * ===================================================================== */
(() => {
  'use strict';

  const T = window.TSC;
  if (!T) return;
  const { state, $, $$, esc } = T;

  const FB = window.FIREBASE_CONFIG || {};
  const configured = !!(FB.apiKey && FB.projectId && FB.authDomain && FB.appId);
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const ADMIN_FLAG = 'tsc.admin';
  const EDITING_KEY = 'tsc.editing';
  const DRAFT_KEY = 'tsc.draft.v2';
  const RARITIES = ['일반', '레어', '에픽', '전설', '한정'];
  const TRAIT_TAGS = ['패시브', '액티브', '궁극기', '고유'];

  // 올리는 이미지 크기 (긴 변 기준 px). 화면 표시 크기의 2~3배라 고해상도 화면에서도 선명해요.
  const PRESETS = {
    character: { full: 1200, thumb: 560 },
    skin: { full: 1200, thumb: 560 },
    screenshot: { full: 1920, thumb: 800 },
    mode: { full: 1400, thumb: 700 },
    icon: { full: 256, thumb: 128 },
    logo: { full: 1200, thumb: 480 }
  };
  const FULL_LIMIT = 860000;  // Firestore 문서 1개 최대 1MB 안에 들어가도록
  const THUMB_LIMIT = 120000;

  let fb = null;          // { auth, db }
  let adminUser = null;

  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
  const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  /* =====================================================================
   *  화면 요소
   * ===================================================================== */
  document.body.insertAdjacentHTML('beforeend', `
    <button class="edit-fab" id="editFab" type="button" aria-label="편집 화면 켜기">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>
      <span>편집 모드</span><span class="badge" id="editFabBadge" title="게시하지 않은 변경 사항이 있어요" hidden></span>
    </button>

    <div class="edit-dock" id="editDock" role="toolbar" aria-label="관리자 도구">
      <div class="edit-dock__status" id="editStatus"><span class="dot"></span><span class="txt"></span></div>
      <div class="edit-dock__actions">
        <button class="ed-btn ed-btn--primary" type="button" data-act="publish">게시하기</button>
        <button class="ed-btn" type="button" data-act="site">사이트 설정</button>
        <button class="ed-btn" type="button" data-act="add">+ 캐릭터</button>
        <button class="ed-btn" type="button" data-act="revert">되돌리기</button>
        <button class="ed-btn" type="button" data-act="backup">백업</button>
        <button class="ed-btn ed-btn--ghost" type="button" data-act="preview" title="방문자 화면으로 보기">미리보기</button>
        <button class="ed-btn ed-btn--ghost" type="button" data-act="logout">로그아웃</button>
      </div>
    </div>

    <aside class="drawer" id="edDrawer" aria-hidden="true">
      <div class="drawer__backdrop" data-drawer-close></div>
      <div class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="edDrawerTitle">
        <div class="drawer__head">
          <div><span class="ed__badge">✎ 편집 중</span><h2 id="edDrawerTitle"></h2></div>
          <button class="icon-btn" type="button" data-drawer-close aria-label="닫기">${X_ICON}</button>
        </div>
        <div class="drawer__body" id="edDrawerBody"></div>
      </div>
    </aside>

    <div class="sheet" id="adBackup" aria-hidden="true">
      <div class="sheet__backdrop" data-sheet-close></div>
      <div class="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="adBackupTitle">
        <div class="sheet__head">
          <h2 id="adBackupTitle">백업</h2>
          <button class="icon-btn" type="button" data-sheet-close aria-label="닫기">${X_ICON}</button>
        </div>
        <section>
          <h3>내려받기</h3>
          <p>지금 화면의 모든 내용(글 · 캐릭터 · 설정)을 파일 하나로 저장해요. 큰 수정 전에 받아두면 안심이에요. (올린 이미지 자체는 Firebase 에 그대로 남아 있어요)</p>
          <button class="ed-btn ed-btn--primary" type="button" data-backup="download">백업 파일 내려받기</button>
        </section>
        <section>
          <h3>불러오기</h3>
          <p>백업 파일의 내용으로 화면을 바꿔요. '게시하기'를 누르기 전까지는 사이트에 반영되지 않아요.</p>
          <button class="ed-btn" type="button" data-backup="upload">백업 파일 불러오기</button>
        </section>
      </div>
    </div>

    <div class="sheet" id="adAuth" aria-hidden="true">
      <div class="sheet__backdrop" data-sheet-close></div>
      <div class="sheet__panel auth" role="dialog" aria-modal="true" aria-labelledby="adAuthTitle">
        <div class="sheet__head">
          <h2 id="adAuthTitle">관리자 로그인</h2>
          <button class="icon-btn" type="button" data-sheet-close aria-label="닫기">${X_ICON}</button>
        </div>
        <div class="auth__body" id="adAuthBody"></div>
      </div>
    </div>

    <datalist id="edRarityList">${RARITIES.map((r) => `<option value="${r}">`).join('')}</datalist>
    <datalist id="edTagList">${TRAIT_TAGS.map((r) => `<option value="${r}">`).join('')}</datalist>
    <input type="file" id="edFile" hidden>
  `);

  const box = $('#mInfo');
  const drawer = $('#edDrawer');
  const drawerBody = $('#edDrawerBody');
  const backupSheet = $('#adBackup');
  const authSheet = $('#adAuth');
  const fileInput = $('#edFile');
  const loginBtn = $('#adminLogin');

  function openSheet(el) {
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
  }
  function closeSheet(el) {
    if (!el.classList.contains('is-open')) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
  }
  [backupSheet, authSheet].forEach((el) => {
    el.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(el); });
  });

  function showNotice(html, actions) {
    const old = $('#edNotice');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="edit-notice" id="edNotice" role="alertdialog">
        ${html}
        <div class="edit-notice__actions">${actions.map(([label, kind], i) => `<button class="ed-btn${kind ? ' ed-btn--' + kind : ''}" type="button" data-n="${i}">${esc(label)}</button>`).join('')}</div>
      </div>`);
    const n = $('#edNotice');
    requestAnimationFrame(() => n.classList.add('is-show'));
    n.addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      actions[Number(b.dataset.n)][2]();
      n.classList.remove('is-show');
      setTimeout(() => n.remove(), 500);
    });
  }

  /* =====================================================================
   *  상태 표시
   * ===================================================================== */
  function updateStatus() {
    const st = $('#editStatus');
    const dirty = T.isDirty();
    const never = state.source !== 'remote';
    st.classList.toggle('is-dirty', dirty || never);
    $('.txt', st).textContent = dirty
      ? '게시 안 된 변경 있음'
      : never ? '아직 한 번도 게시 안 함' : '게시된 내용과 같음';
    $('#editFabBadge').hidden = !dirty;
  }

  /* =====================================================================
   *  Firebase · 로그인
   * ===================================================================== */
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { delete scripts[src]; reject(Object.assign(new Error('sdk'), { code: 'sdk-load' })); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  async function loadFirebase() {
    if (fb) return fb;
    await loadScript(SDK + 'firebase-app-compat.js');
    await Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
    const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(FB);
    fb = { auth: app.auth(), db: app.firestore() };
    return fb;
  }

  // Firebase 는 이메일 형식으로 계정을 만들어서, 아이디 뒤에 이 주소를 붙여 씁니다.
  // 메일은 보내지 않으며, example.com 은 누구도 받을 수 없는 예약 주소예요.
  const ID_DOMAIN = 'thespike.example.com';
  const idToEmail = (id) => (id.includes('@') ? id : `${id}@${ID_DOMAIN}`).trim().toLowerCase();
  const emailToId = (email) => {
    const e = String(email || '');
    return e.toLowerCase().endsWith('@' + ID_DOMAIN) ? e.slice(0, -(ID_DOMAIN.length + 1)) : e;
  };

  function errorMessage(err) {
    const code = (err && err.code) || '';
    if (['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return '아이디 또는 비밀번호가 맞지 않아요.';
    if (code === 'auth/missing-password') return '비밀번호를 입력해 주세요.';
    if (code === 'auth/too-many-requests') return '로그인 시도가 너무 많아 잠시 막혔어요. 몇 분 뒤에 다시 시도해 주세요.';
    if (code === 'auth/user-disabled') return '사용이 중지된 계정이에요. Firebase 콘솔 → Authentication → 사용자에서 확인해 주세요.';
    if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') return "아이디 · 비밀번호 로그인이 꺼져 있어요. Firebase 콘솔 → Authentication → 로그인 방법에서 '이메일/비밀번호'를 사용 설정해 주세요.";
    if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid' || /api-key-not-valid/.test(code)) return 'js/firebase-config.js 의 apiKey 값이 올바르지 않아요. Firebase 콘솔에서 다시 복사해 주세요.';
    if (code === 'auth/network-request-failed' || code === 'sdk-load') return '인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
    if (code === 'auth/operation-not-supported-in-this-environment') return "이 화면에서는 로그인할 수 없어요. tools 폴더의 '미리보기.bat'으로 열거나, 인터넷에 올린 주소에서 로그인해 주세요.";
    if (code === 'not-found' || code === 'failed-precondition') return 'Firestore 데이터베이스가 아직 없어요. Firebase 콘솔 → Firestore Database → 데이터베이스 만들기를 먼저 해 주세요.';
    if (code === 'unavailable') return 'Firestore 에 연결할 수 없어요. 인터넷 연결과 Firestore 데이터베이스가 만들어져 있는지 확인해 주세요.';
    if (code === 'permission-denied') return '권한이 없어요. Firestore 규칙에 관리자 UID 가 맞게 들어가 있는지 확인해 주세요.';
    if (code === 'too-large') return '내용이 너무 커서 한 번에 저장할 수 없어요 (최대 약 1MB). 아주 긴 글을 줄여 주세요.';
    return `문제가 생겼어요. (${code || (err && err.message) || '알 수 없는 오류'})`;
  }

  function rulesFor(uid, id) {
    return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 관리자 계정 (아이디: ${id})
    // UID 는 Firebase 콘솔 → Authentication → 사용자 목록의 '사용자 UID' 와 같아요.
    function isAdmin() {
      return request.auth != null
        && request.auth.uid in ['${uid}'];
    }
    // 사이트 내용: 누구나 읽기, 관리자만 쓰기
    match /site/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    // 올린 이미지: 누구나 읽기, 관리자만 쓰기
    match /images/{imageId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    // 관리자 확인용
    match /admin/{docId} {
      allow read, write: if isAdmin();
    }
  }
}`;
  }

  let authBusy = false;
  let lastId = '';
  function showAuth(view, detail) {
    const body = $('#adAuthBody');
    let html = '';
    if (view === 'login') {
      html = `
        <p class="auth__lead">공략집 관리자만 들어갈 수 있어요.</p>
        <form class="auth__form" id="adLoginForm" novalidate>
          <label class="f"><span class="f__label">아이디 또는 이메일</span>
            <input id="adId" name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="80" value="${esc(lastId)}"></label>
          <label class="f"><span class="f__label">비밀번호</span>
            <input id="adPw" name="password" type="password" autocomplete="current-password" maxlength="200"></label>
          <p class="auth__error" id="adErr" role="alert" hidden></p>
          <button class="btn btn--primary auth__submit" type="submit">로그인</button>
        </form>`;
    } else if (view === 'setup') {
      html = `
        <p class="auth__lead">관리자 로그인을 쓰려면 먼저 <b>Firebase</b>를 연결해야 해요.</p>
        <ol class="auth__steps">
          <li>Firebase 프로젝트 만들기</li>
          <li>아이디 · 비밀번호 로그인 켜고 관리자 계정 만들기</li>
          <li>Firestore 데이터베이스 만들기</li>
          <li><code>js/firebase-config.js</code>에 설정값 붙여넣기</li>
        </ol>
        <p class="auth__note">자세한 방법은 프로젝트 폴더의 <b>README.md</b> → 'Firebase 연결하기'를 따라 해 주세요.</p>`;
    } else if (view === 'denied') {
      html = `
        <p class="auth__lead"><b>${esc(detail.id)}</b> 계정은 아직 관리자로 등록되어 있지 않아요.</p>
        <button class="btn btn--ghost auth__submit" type="button" data-auth="again">다시 로그인</button>
        <details class="auth__owner">
          <summary>사이트 주인이신가요? 이 계정을 관리자로 등록하기</summary>
          <ol class="auth__steps">
            <li><a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Firebase 콘솔</a> → 내 프로젝트 → <b>Firestore Database</b> → <b>규칙</b> 탭</li>
            <li>있던 내용을 모두 지우고 아래 규칙을 붙여넣은 뒤 <b>게시</b></li>
            <li>1분쯤 기다린 뒤 다시 로그인</li>
          </ol>
          <pre class="rules"><code>${esc(rulesFor(detail.uid, detail.id))}</code></pre>
          <button class="ed-btn" type="button" data-auth="copy">규칙 복사</button>
        </details>`;
    } else {
      html = `
        <p class="auth__lead">${esc(detail)}</p>
        <button class="btn btn--ghost auth__submit" type="button" data-auth="again">다시 시도</button>`;
    }
    body.innerHTML = html;
    body.dataset.uid = view === 'denied' ? detail.uid : '';
    body.dataset.id = view === 'denied' ? detail.id : '';
    openSheet(authSheet);
    if (view === 'login') {
      loadFirebase().catch(() => {}); // 로그인 버튼을 누르기 전에 미리 불러두기
      setTimeout(() => { const f = lastId ? $('#adPw') : $('#adId'); if (f) f.focus(); }, 120);
    }
  }

  function openLogin() {
    if (adminUser) { setEditing(true); return; }
    if (!configured) return showAuth('setup');
    showAuth('login');
  }

  async function submitLogin(form) {
    if (authBusy) return;
    const id = $('#adId', form).value.trim();
    const pw = $('#adPw', form).value;
    const errEl = $('#adErr', form);
    const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = false; };
    if (!id || !pw) return showErr('아이디와 비밀번호를 입력해 주세요.');
    lastId = id;
    authBusy = true;
    errEl.hidden = true;
    const btn = $('.auth__submit', form);
    btn.disabled = true;
    btn.textContent = '로그인 중…';
    try {
      const { auth } = await loadFirebase();
      const cred = await auth.signInWithEmailAndPassword(idToEmail(id), pw);
      await verifyAdmin(cred.user, false);
    } catch (err) {
      if (form.isConnected) {
        showErr(errorMessage(err));
        $('#adPw', form).value = '';
        $('#adPw', form).focus();
      } else {
        showAuth('error', errorMessage(err));
      }
    } finally {
      authBusy = false;
      if (form.isConnected) { btn.disabled = false; btn.textContent = '로그인'; }
    }
  }

  async function verifyAdmin(user, quiet) {
    try {
      await fb.db.doc('admin/check').get();
    } catch (err) {
      if (err && err.code === 'permission-denied') {
        const detail = { id: emailToId(user.email), uid: user.uid };
        await fb.auth.signOut().catch(() => {});
        T.store.remove(ADMIN_FLAG);
        if (!quiet) showAuth('denied', detail);
        return false;
      }
      throw err;
    }
    enterAdmin(user, quiet);
    return true;
  }

  function enterAdmin(user, quiet) {
    adminUser = user;
    T.store.set(ADMIN_FLAG, '1');
    document.body.classList.add('is-admin');
    loginBtn.textContent = '관리자 모드';
    closeSheet(authSheet);
    setEditing(T.store.get(EDITING_KEY, true) !== '0', true);
    updateStatus();
    checkDraft();
    if (!quiet) {
      T.toast(`${user.displayName || emailToId(user.email)} 님, 관리자 모드예요. 고친 내용은 '게시하기'를 눌러야 사이트에 반영돼요.`, 'ok', 5000);
    }
  }

  async function logout() {
    if (T.isDirty() && !window.confirm('게시하지 않은 변경 사항이 있어요.\n이 브라우저에 임시 저장해 두고 로그아웃할까요?')) return;
    saveDraftNow();
    closeDrawer();
    setEditing(false, true);
    T.store.remove(EDITING_KEY, true); // 다음에 로그인하면 편집 화면부터
    document.body.classList.remove('is-admin');
    loginBtn.textContent = '관리자';
    adminUser = null;
    T.store.remove(ADMIN_FLAG);
    if (fb) await fb.auth.signOut().catch(() => {});
    if (T.isDirty()) T.revertToPublished(); // 화면은 게시된 내용으로
    T.toast('로그아웃했어요.');
  }

  /* =====================================================================
   *  편집 화면 켜기 / 끄기
   * ===================================================================== */
  function setEditing(on, quiet) {
    if (on && !adminUser) return;
    if (!on) closeDrawer();
    T.setEditing(on);
    T.store.set(EDITING_KEY, on ? '1' : '0', true);
    updateNote();
    if (!on && !quiet && adminUser) T.toast('방문자 화면으로 보는 중이에요. 오른쪽 아래 버튼으로 다시 편집할 수 있어요.');
  }

  /* =====================================================================
   *  임시 저장 · 게시 · 되돌리기 · 백업
   * ===================================================================== */
  let draftTimer = 0;
  T.on('change', () => {
    updateStatus();
    if (adminUser) { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 400); }
  });

  function saveDraftNow() {
    if (!adminUser) return;
    if (T.isDirty()) {
      T.store.set(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), base: state.publishedVersion, snapshot: T.snapshot() }));
    } else {
      T.store.remove(DRAFT_KEY);
    }
  }

  const fmtTime = (ms) => {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  function checkDraft() {
    const raw = T.store.get(DRAFT_KEY);
    if (!raw) return;
    let d;
    try { d = JSON.parse(raw); } catch (e) { T.store.remove(DRAFT_KEY); return; }
    if (!d || !d.snapshot || d.snapshot === state.published) { T.store.remove(DRAFT_KEY); return; }
    if (d.snapshot === T.snapshot()) return;
    const stale = d.base !== state.publishedVersion;
    showNotice(`
      <b>편집하던 임시 저장본이 있어요</b>
      <p>${esc(fmtTime(d.savedAt))}에 저장된, 아직 게시하지 않은 내용이에요.${stale ? ' 그 뒤에 새로 게시된 내용이 있어서, 이어서 편집하면 그 내용을 덮어쓸 수 있어요.' : ''}</p>`, [
      ['이어서 편집', 'primary', () => {
        T.applySnapshot(JSON.parse(d.snapshot));
        T.refreshEverything();
        refreshDrawer();
        T.persist();
        T.toast('임시 저장본을 불러왔어요.', 'ok');
      }],
      ['버리기', '', () => { T.store.remove(DRAFT_KEY); T.toast('임시 저장본을 지웠어요.'); }]
    ]);
  }

  let publishing = false;
  async function publish() {
    if (!adminUser || !fb || publishing) return;
    // 입력 중이던 칸을 먼저 마무리 (조합 중인 한글 글자까지 저장)
    if (document.activeElement && drawerBody.contains(document.activeElement)) document.activeElement.blur();
    if (!T.isDirty() && state.source === 'remote') return T.toast('게시할 변경 사항이 없어요.');
    publishing = true;
    const btn = $('[data-act="publish"]');
    btn.disabled = true;
    btn.textContent = '게시하는 중…';
    try {
      const ref = fb.db.doc('site/data');
      const snap = await ref.get();
      const remoteVersion = snap.exists ? Number(snap.data().version) || 0 : 0;
      if (remoteVersion && remoteVersion !== state.publishedVersion &&
          !window.confirm('다른 기기나 창에서 더 최근에 게시한 내용이 있어요.\n지금 화면의 내용으로 덮어쓸까요?')) return;
      const json = T.snapshot();
      if (json.length > 1000000) throw Object.assign(new Error('too-large'), { code: 'too-large' });
      const version = Date.now();
      await ref.set({ json, version });
      T.markPublished(version);
      T.store.remove(DRAFT_KEY);
      T.toast('게시했어요! 이제 방문자에게도 바로 보여요.', 'ok', 4200);
    } catch (err) {
      T.toast(errorMessage(err) || '게시하지 못했어요.', 'warn', 6500);
    } finally {
      publishing = false;
      btn.disabled = false;
      btn.textContent = '게시하기';
    }
  }

  function revert() {
    if (!T.isDirty()) return T.toast('이미 게시된 내용과 같아요.');
    if (!window.confirm('게시하지 않은 변경 사항을 모두 버리고\n마지막으로 게시된 내용으로 되돌릴까요?')) return;
    T.revertToPublished();
    T.store.remove(DRAFT_KEY);
    refreshDrawer();
    T.toast('게시된 내용으로 되돌렸어요.');
  }

  function downloadBackup() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const data = Object.assign({ app: 'thespike-cross-guide', format: 1, exportedAt: now.toISOString() }, JSON.parse(T.snapshot()));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `공략집-백업-${stamp}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    T.toast('백업 파일을 내려받았어요.', 'ok');
  }

  async function importBackup() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    let d;
    try { d = JSON.parse(await file.text()); } catch (e) { d = null; }
    if (!d || (!d.content && !d.characters)) return T.toast('올바른 백업 파일이 아니에요.', 'warn');
    if (!window.confirm('백업 파일의 내용으로 화면을 바꿀까요?\n(게시하기 전까지 사이트에는 반영되지 않아요)')) return;
    const now = JSON.parse(T.snapshot());
    T.applySnapshot({ content: d.content || now.content, characters: d.characters || now.characters });
    T.refreshEverything();
    refreshDrawer();
    T.persist();
    closeSheet(backupSheet);
    T.toast('백업을 불러왔어요. 확인한 뒤 게시하세요.', 'ok', 4200);
  }

  /* =====================================================================
   *  이미지 올리기 (크기를 맞춰 압축한 뒤 Firestore 에 저장)
   * ===================================================================== */
  let pickResolve = null;
  function pickFile(accept) {
    return new Promise((resolve) => {
      pickResolve = resolve;
      fileInput.accept = accept;
      fileInput.value = '';
      fileInput.click();
    });
  }
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (pickResolve) { pickResolve(f || null); pickResolve = null; }
  });

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 파일을 읽을 수 없어요.')); };
      img.src = url;
    });
  }

  // 한 번에 크게 줄이면 거칠어져서 절반씩 단계적으로 줄입니다.
  function drawScaled(source, w, h) {
    let cur = source;
    let cw = source.naturalWidth || source.width;
    let ch = source.naturalHeight || source.height;
    while (cw / 2 > w && ch / 2 > h) {
      const c = document.createElement('canvas');
      c.width = Math.round(cw / 2);
      c.height = Math.round(ch / 2);
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, c.width, c.height);
      cur = c;
      cw = c.width;
      ch = c.height;
    }
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, w, h);
    return out;
  }

  function encodeCanvas(canvas, limit) {
    let q = 0.92;
    let url = canvas.toDataURL('image/webp', q);
    const webp = url.startsWith('data:image/webp');
    if (!webp) url = canvas.toDataURL('image/png');
    while (url.length > limit && q > 0.45) {
      q -= 0.08;
      url = canvas.toDataURL(webp ? 'image/webp' : 'image/jpeg', q);
    }
    return url.length <= limit ? url : null;
  }

  async function processImage(file, preset) {
    const { img, url } = await loadImageFile(file);
    try {
      const w0 = img.naturalWidth || 1024;
      const h0 = img.naturalHeight || 1024;
      const out = {};
      for (const [name, maxSide, limit] of [['full', preset.full, FULL_LIMIT], ['thumb', preset.thumb, THUMB_LIMIT]]) {
        let side = maxSide;
        let data = null;
        while (!data && side >= 64) {
          const s = Math.min(1, side / Math.max(w0, h0));
          const canvas = drawScaled(img, Math.max(1, Math.round(w0 * s)), Math.max(1, Math.round(h0 * s)));
          data = encodeCanvas(canvas, limit);
          if (!data) side = Math.round(side * 0.8);
        }
        if (!data) throw new Error('이미지를 줄여도 너무 커요.');
        out[name] = data;
      }
      return { full: out.full, thumb: out.thumb, width: w0, height: h0 };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function uploadImage(file, presetName) {
    if (!adminUser || !fb) throw new Error('관리자 로그인이 필요해요.');
    if (!/^image\//.test(file.type)) throw new Error('이미지 파일만 올릴 수 있어요.');
    const preset = PRESETS[presetName] || PRESETS.character;
    const res = await processImage(file, preset);
    const doc = await fb.db.collection('images').add({
      full: res.full,
      thumb: res.thumb,
      w: res.width,
      h: res.height,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    const ref = 'fs:' + doc.id;
    T.previewMap[ref] = res.full;
    const small = Math.max(res.width, res.height) < preset.full * 0.6 && (presetName === 'character' || presetName === 'skin');
    if (small) T.toast(`올렸어요. 다만 원본(${res.width}×${res.height})이 작아서 살짝 흐릿할 수 있어요.`, 'warn', 5200);
    else T.toast('이미지를 올렸어요. 게시하면 방문자에게도 보여요.', 'ok');
    return ref;
  }

  async function uploadWithButton(btn, presetName, apply) {
    const file = await pickFile('image/png,image/jpeg,image/webp,image/gif,image/avif');
    if (!file) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '올리는 중…';
    try {
      apply(await uploadImage(file, presetName));
    } catch (err) {
      T.toast(err && err.code ? errorMessage(err) : (err && err.message) || '이미지를 올리지 못했어요.', 'warn', 5200);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* =====================================================================
   *  내용 편집 서랍 (게임 소개 · 모드 · 재화 · 사이트 설정)
   * ===================================================================== */
  const SECTION_FIELDS = [
    { key: 'nav', label: '메뉴 이름', type: 'text', hint: '맨 위 메뉴에 보이는 이름' },
    { key: 'eyebrow', label: '작은 제목', type: 'text', placeholder: '예: ABOUT' },
    { key: 'title', label: '제목', type: 'text' },
    { key: 'desc', label: '설명', type: 'textarea', rows: 2 }
  ];
  const ICON_FIELDS = [
    { key: 'icon', label: '아이콘 (이모지)', type: 'text', placeholder: '예: 🏆' },
    { key: 'image', label: '아이콘 이미지 (선택 — 넣으면 이모지 대신 표시)', type: 'image', preset: 'icon' }
  ];

  // 캐릭터 고르기 목록 (등급순) · 목록 카드 제목에 캐릭터 이름 표시
  const charLabel = (c) => `${c.grade ? `[${c.grade}] ` : ''}${c.name || '이름 없음'}`;
  function charOptions() {
    const rank = (g) => { const i = T.GRADES.indexOf(g); return i < 0 ? T.GRADES.length : i; };
    const sorted = [...state.data.characters].sort((a, b) => rank(a.grade) - rank(b.grade));
    return [['', '캐릭터 선택'], ...sorted.map((c) => [c.id, `${charLabel(c)} · ${c.position || '포지션 미정'}`])];
  }
  // 복각 알림: 고른 캐릭터의 스킨 목록 (path 는 이 칸의 위치, 예: rerunNotices.0.skin)
  function skinOptions(path) {
    const item = getAt(state.content, path.replace(/\.[^.]+$/, '')) || {};
    const c = T.getChar(item.charId);
    const names = c ? c.skins.map((s) => s.name).filter(Boolean) : [];
    if (item.skin && !names.includes(item.skin)) names.push(item.skin);
    return [['', c ? '캐릭터 복각 (스킨 아님)' : '먼저 캐릭터를 골라 주세요'], ...names.map((n) => [n, `${n} 스킨`])];
  }
  const TITLE_MAPS = {
    char: (id) => {
      const c = T.getChar(id);
      return c ? charLabel(c) : (id ? '(삭제된 캐릭터)' : '캐릭터를 골라 주세요');
    }
  };

  const DRAWERS = {
    site: {
      title: '메인 화면 · 사이트 설정',
      groups: [
        { title: '글자 로고', path: 'site', fields: [
          { key: 'logoTop', label: '작은 글자', type: 'text', placeholder: '예: THE' },
          { key: 'logoMain', label: '큰 글자', type: 'text', placeholder: '예: ZIP' },
          { key: 'logoSub', label: '아랫줄', type: 'text', placeholder: '예: 더 스파이크 크로스 모음집', hint: '메인 화면 · 상단 메뉴 · 환영 화면 · 맨 아래 로고에 함께 쓰여요. 아래에 로고 이미지를 넣으면 이미지가 대신 보여요.' }
        ] },
        { title: '환영 화면 · 메인', path: 'site', fields: [
          { key: 'logo', label: '로고 이미지', type: 'image', preset: 'logo', hint: '비워두면 위의 글자 로고가 나와요. 배경이 투명한 PNG를 추천해요.' },
          { key: 'welcome', label: '환영 문구', type: 'text' },
          { key: 'welcomeSub', label: '환영 보조 문구', type: 'text' },
          { key: 'tagline', label: '메인 소개 문구', type: 'textarea', rows: 3 },
          { key: 'title', label: '브라우저 탭 제목', type: 'text' }
        ] },
        { title: '표시 설정', path: 'site', fields: [
          { key: 'introEveryVisit', label: '들어올 때마다 환영 화면 보여주기', type: 'bool' },
          { key: 'pixelArt', label: '도트(픽셀) 그림 모드 — 확대해도 픽셀이 뭉개지지 않게', type: 'bool' },
          { key: 'cardImageFit', label: '캐릭터 카드 이미지 맞춤', type: 'select', options: [['cover', '카드를 꽉 채우기'], ['contain', '이미지 전체 보이기 (투명 PNG 추천)']] }
        ] },
        { title: '맨 아래 문구', path: 'footer', fields: [
          { key: 'note', label: '안내 문구', type: 'textarea', rows: 3 }
        ] }
      ]
    },
    about: {
      title: '게임 소개',
      groups: [
        { title: '섹션 제목', path: 'sections.about', fields: SECTION_FIELDS },
        { title: '소개 글', path: 'about', fields: [
          { key: 'lead', label: '굵게 보이는 첫 문장', type: 'textarea', rows: 2 },
          { key: 'paragraphs', label: '문단', type: 'list', of: { type: 'textarea', rows: 4 }, addLabel: '+ 문단 추가' }
        ] },
        { title: '게임 정보 표', path: 'about', fields: [
          { key: 'info', type: 'list', of: { type: 'object', inline: true, fields: [{ key: 'label', label: '항목 (예: 장르)' }, { key: 'value', label: '내용' }] }, addLabel: '+ 항목 추가' }
        ] },
        { title: '게임 특징 카드', path: 'about', fields: [
          { key: 'features', type: 'list', titleKey: 'title', addLabel: '+ 특징 카드 추가', of: { type: 'object', fields: [
            ...ICON_FIELDS,
            { key: 'title', label: '제목', type: 'text' },
            { key: 'desc', label: '설명', type: 'textarea', rows: 2 }
          ] } }
        ] },
        { title: '스크린샷', path: 'about', fields: [
          { key: 'screenshots', type: 'list', titleKey: 'caption', addLabel: '+ 스크린샷 추가', of: { type: 'object', fields: [
            { key: 'image', label: '이미지 (가로 16:9 추천)', type: 'image', preset: 'screenshot' },
            { key: 'caption', label: '설명', type: 'text' }
          ] } }
        ] }
      ]
    },
    characters: {
      title: '캐릭터 섹션',
      note: '캐릭터 정보(등급 · 별명 · 신규 강조 · 스탯 등)는 캐릭터 카드를 눌러서 편집해요. 목록은 항상 등급순(S+ → A-)으로 보여요.',
      groups: [
        { title: '섹션 제목', path: 'sections.characters', fields: SECTION_FIELDS }
      ]
    },
    modes: {
      title: '게임 모드',
      groups: [
        { title: '섹션 제목', path: 'sections.modes', fields: SECTION_FIELDS },
        { title: '모드 목록', path: '', fields: [
          { key: 'modes', type: 'list', titleKey: 'name', addLabel: '+ 게임 모드 추가', of: { type: 'object', fields: [
            { key: 'name', label: '모드 이름', type: 'text' },
            { key: 'image', label: '대표 이미지 (카드 왼쪽에 크게 보여요)', type: 'image', preset: 'mode', hint: '세로 이미지(게임의 모드 선택 화면 등)를 원본 그대로 올려 주세요. 화질이 줄지 않게 저장돼요.' },
            { key: 'icon', label: '아이콘 (이모지 — 대표 이미지가 없을 때만 보여요)', type: 'text', placeholder: '예: 🏆' },
            { key: 'tags', label: '태그 (쉼표로 구분)', type: 'tags', placeholder: '예: PvP, 경쟁, 시즌제' },
            { key: 'summary', label: '요약', type: 'textarea', rows: 2 },
            { key: 'details', label: "'자세히 보기' 내용", type: 'list', titleKey: 'title', addLabel: '+ 소제목 추가', of: { type: 'object', fields: [
              { key: 'title', label: '소제목 (예: 진행 방식 · 보상 · 팁)', type: 'text' },
              { key: 'items', label: '내용 (한 줄에 하나씩)', type: 'lines', rows: 3 }
            ] } }
          ] } }
        ] }
      ]
    },
    history: {
      title: 'S+ 출시 · 복각 기록',
      note: "적은 글자 그대로 보여요. (예: 2024.06 블랙썬더 스킨 출시 및 첫번째 복각) 2025.03.01 처럼 일까지 적으면 '마지막 등장 며칠 전'과 D-day 도 계산돼요. 카드 순서는 ↑ ↓ 로 바꿀 수 있어요.",
      lead: '<button class="ed-btn ed-btn--primary" type="button" data-history-fill>S+ 캐릭터 모두 불러오기</button>',
      groups: [
        { title: '섹션 제목', path: 'sections.history', fields: SECTION_FIELDS },
        { title: '캐릭터별 기록', path: '', fields: [
          { key: 'history', type: 'list', titleKey: 'charId', titleMap: 'char', addLabel: '+ 캐릭터 추가', of: { type: 'object', fields: [
            { key: 'charId', label: '캐릭터', type: 'select', options: () => charOptions() },
            { key: 'first', label: '첫 출시일', type: 'text', placeholder: '예: 2025.03.01' },
            { key: 'reruns', label: '복각 날짜 (한 줄에 하나씩, 오래된 순서로)', type: 'lines', rows: 3, placeholder: '예:\n2025.06.10\n2025.10.01' },
            { key: 'note', label: '메모 (선택)', type: 'text', placeholder: '예: 할로윈 이벤트와 함께 복각' }
          ] } }
        ] }
      ]
    },
    reruns: {
      title: '복각 알림 (메인 화면)',
      note: "캐릭터나 스킨 복각이 잡히면 여기에 추가하세요. 메인 화면 맨 위에 RERUN 으로 떠요. 시작일 전에는 'D-3 복각 예정', 기간 중에는 '복각 중'으로 보이고, 종료일이 지나면 자동으로 사라져요. 날짜는 2026.10.30 처럼 일까지 적어 주세요.",
      groups: [
        { title: '복각 목록', path: '', fields: [
          { key: 'rerunNotices', type: 'list', titleKey: 'charId', titleMap: 'char', addLabel: '+ 복각 추가', of: { type: 'object', fields: [
            { key: 'charId', label: '캐릭터', type: 'select', options: () => charOptions(), resets: 'skin' },
            { key: 'skin', label: '스킨 (스킨 복각일 때만 고르세요)', type: 'select', options: (path) => skinOptions(path) },
            { key: 'start', label: '복각 시작일', type: 'text', placeholder: '예: 2026.10.30' },
            { key: 'end', label: '복각 종료일 (이 날이 지나면 자동으로 사라져요)', type: 'text', placeholder: '예: 2026.11.12' }
          ] } }
        ] }
      ]
    },
    updates: {
      title: '업데이트 · 트레일러',
      note: "유튜브 주소(영상 링크)를 붙여넣으면 썸네일이 자동으로 나오고, 사이트 안에서 바로 재생돼요. '+ 업데이트 추가'를 누르면 목록 맨 위(최신)에 생겨요. 맨 위 항목이 크게 보여요.",
      groups: [
        { title: '섹션 제목', path: 'sections.updates', fields: SECTION_FIELDS },
        { title: '업데이트 목록', path: '', fields: [
          { key: 'updates', type: 'list', titleKey: 'title', prepend: true, addLabel: '+ 업데이트 추가 (맨 위에)', of: { type: 'object', fields: [
            { key: 'title', label: '제목', type: 'text', placeholder: '예: 시즌 2 업데이트 트레일러' },
            { key: 'date', label: '날짜', type: 'text', placeholder: '예: 2026.10.20' },
            { key: 'video', label: '영상 주소 (유튜브)', type: 'text', placeholder: 'https://www.youtube.com/watch?v=...' },
            { key: 'desc', label: '설명', type: 'textarea', rows: 3 },
            { key: 'image', label: '썸네일 (선택 — 비워두면 유튜브 썸네일)', type: 'image', preset: 'screenshot' },
            { key: 'featured', label: '메인 화면 맨 위에 UPDATE 버튼으로 소개', type: 'bool' }
          ] } }
        ] }
      ]
    },
    links: {
      title: '공식 채널',
      note: '주소만 넣으면 유튜브 · 인스타그램 · 네이버 카페 · 디스코드 · X 아이콘이 자동으로 붙어요. 그 밖의 주소는 홈페이지 아이콘으로 보여요. 맨 아래에도 같은 링크가 아이콘으로 나와요.',
      groups: [
        { title: '섹션 제목', path: 'sections.links', fields: SECTION_FIELDS },
        { title: '링크 목록', path: '', fields: [
          { key: 'links', type: 'list', titleKey: 'name', addLabel: '+ 링크 추가', of: { type: 'object', fields: [
            { key: 'name', label: '이름', type: 'text', placeholder: '예: 공식 유튜브' },
            { key: 'url', label: '주소', type: 'text', placeholder: 'https://' },
            { key: 'desc', label: '한 줄 설명 (선택)', type: 'text', placeholder: '예: 공식 영상 채널' }
          ] } }
        ] }
      ]
    },
    currency: {
      title: '재화',
      groups: [
        { title: '섹션 제목', path: 'sections.currency', fields: SECTION_FIELDS },
        { title: '재화 목록', path: '', fields: [
          { key: 'currencies', type: 'list', titleKey: 'name', addLabel: '+ 재화 추가', of: { type: 'object', fields: [
            { key: 'name', label: '재화 이름', type: 'text' },
            ...ICON_FIELDS,
            { key: 'type', label: '종류', type: 'text', placeholder: '예: 기본 재화 · 프리미엄 재화' },
            { key: 'desc', label: '설명', type: 'textarea', rows: 2 },
            { key: 'sources', label: '획득 방법 표', type: 'list', addLabel: '+ 획득처 추가', of: { type: 'object', inline: true, fields: [{ key: 'where', label: '획득처' }, { key: 'amount', label: '획득량' }, { key: 'note', label: '비고' }] } },
            { key: 'uses', label: '사용처 (쉼표로 구분)', type: 'tags', placeholder: '예: 캐릭터 해금, 스킨 구매' },
            { key: 'tips', label: '팁 (한 줄에 하나씩)', type: 'lines', rows: 2 }
          ] } }
        ] }
      ]
    }
  };

  const getAt = (root, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), root);
  function setAt(root, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((o, k) => o[k], root);
    parent[last] = value;
  }
  const joinPath = (base, key) => (base ? `${base}.${key}` : key);

  function blank(f) {
    if (f.type === 'object') {
      const o = {};
      f.fields.forEach((sf) => { o[sf.key] = blank(sf); });
      return o;
    }
    if (f.type === 'list' || f.type === 'tags' || f.type === 'lines') return [];
    if (f.type === 'bool') return false;
    return '';
  }
  const hasContent = (v) => {
    if (typeof v === 'string') return !!v.trim();
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.values(v).some(hasContent);
    return v === true;
  };

  let drawerKey = null;
  let openKeys = new Set();
  const listDefs = new Map();
  let uid = 0;

  function fieldHTML(f, path) {
    const v = getAt(state.content, path);
    const id = 'edf' + ++uid;
    const p = esc(path);
    const label = f.label ? `<label class="f__label" for="${id}">${esc(f.label)}</label>` : '';
    const hint = f.hint ? `<small class="f__hint">${esc(f.hint)}</small>` : '';
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    switch (f.type) {
      case 'text':
        return `<div class="f">${label}<input id="${id}" data-path="${p}" data-type="text" value="${esc(v)}"${ph}>${hint}</div>`;
      case 'textarea':
        return `<div class="f">${label}<textarea id="${id}" data-path="${p}" data-type="text" rows="${f.rows || 3}"${ph}>${esc(v)}</textarea>${hint}</div>`;
      case 'lines':
        return `<div class="f">${label}<textarea id="${id}" data-path="${p}" data-type="lines" rows="${f.rows || 3}"${ph}>${esc((v || []).join('\n'))}</textarea>${hint}</div>`;
      case 'tags':
        return `<div class="f">${label}<input id="${id}" data-path="${p}" data-type="tags" value="${esc((v || []).join(', '))}"${ph}>${hint}</div>`;
      case 'bool':
        return `<label class="switch"><input type="checkbox" data-path="${p}" data-type="bool"${v ? ' checked' : ''}><span class="switch__ui" aria-hidden="true"></span><span class="switch__label">${esc(f.label)}</span></label>`;
      case 'select':
        // options 는 고정 목록이거나, 그때그때 만드는 함수(예: 캐릭터 목록 · 그 캐릭터의 스킨 목록)
        // resets: 이 값을 바꾸면 비워지는 옆 칸 (예: 캐릭터를 바꾸면 스킨 선택을 비움)
        return `<div class="f">${label}<select id="${id}" data-path="${p}" data-type="text"${f.resets ? ` data-resets="${esc(f.resets)}"` : ''}>${(typeof f.options === 'function' ? f.options(path) : f.options).map(([val, l]) => `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</div>`;
      case 'image':
        return imageFieldHTML(f, path, v || '', id);
      case 'list':
        return listHTML(f, path, Array.isArray(v) ? v : []);
      default:
        return '';
    }
  }

  function imageFieldHTML(f, path, v, id) {
    const p = esc(path);
    const shape = f.preset === 'screenshot' ? ' is-wide' : (f.preset === 'icon' || f.preset === 'logo') ? ' is-square' : '';
    return `<div class="f">${f.label ? `<span class="f__label">${esc(f.label)}</span>` : ''}
      <div class="ed-img">
        <div class="ed-img__preview${shape}"><img alt="" data-preview="${p}"></div>
        <div class="ed-img__body">
          <div class="ed-img__btns">
            <button class="ed-btn" type="button" data-upload="${p}" data-preset="${esc(f.preset || 'character')}">이미지 올리기</button>
            <button class="ed-btn ed-btn--ghost" type="button" data-clear="${p}"${v ? '' : ' hidden'}>지우기</button>
          </div>
          <input id="${id}" class="mono" data-path="${p}" data-type="text" value="${esc(v)}" placeholder="또는 사이트 폴더 경로 (예: images/icons/gold.png)" aria-label="${esc(f.label || '이미지')} 경로">
        </div>
      </div>${f.hint ? `<small class="f__hint">${esc(f.hint)}</small>` : ''}</div>`;
  }

  function listCtrl(path, i, n) {
    const d = `data-lpath="${esc(path)}" data-i="${i}"`;
    return `<span class="ed-item__ctrl">
      <button type="button" data-lmove="-1" ${d}${i === 0 ? ' disabled' : ''} aria-label="위로">↑</button>
      <button type="button" data-lmove="1" ${d}${i === n - 1 ? ' disabled' : ''} aria-label="아래로">↓</button>
      <button type="button" class="rm" data-lremove ${d} aria-label="삭제">✕</button>
    </span>`;
  }

  function listHTML(f, path, arr) {
    listDefs.set(path, f);
    const items = arr.map((item, i) => {
      const ip = `${path}.${i}`;
      const ctrl = listCtrl(path, i, arr.length);
      if (f.of.type === 'object' && f.of.inline) {
        return `<div class="ed-item"><div class="ed-item__row">${f.of.fields.map((sf) =>
          `<input data-path="${esc(ip + '.' + sf.key)}" data-type="text" value="${esc(item[sf.key])}" placeholder="${esc(sf.label)}" aria-label="${esc(sf.label)}">`).join('')}${ctrl}</div></div>`;
      }
      if (f.of.type === 'object') {
        const titleSrc = f.titleKey ? `${ip}.${f.titleKey}` : '';
        const raw = (f.titleKey && item[f.titleKey]) || '';
        const title = f.titleMap ? TITLE_MAPS[f.titleMap](raw) : raw;
        return `<details class="ed-card" data-key="${esc(ip)}"${openKeys.has(ip) ? ' open' : ''}>
          <summary><span class="ed-card__num">${i + 1}</span><span class="ed-card__title" data-title-src="${esc(titleSrc)}"${f.titleMap ? ` data-title-map="${f.titleMap}"` : ''}>${esc(title || '(이름 없음)')}</span>${ctrl}</summary>
          <div class="ed-card__body">${f.of.fields.map((sf) => fieldHTML(sf, `${ip}.${sf.key}`)).join('')}</div>
        </details>`;
      }
      const control = f.of.type === 'textarea'
        ? `<textarea data-path="${esc(ip)}" data-type="text" rows="${f.of.rows || 3}" aria-label="${i + 1}번째">${esc(item)}</textarea>`
        : `<input data-path="${esc(ip)}" data-type="text" value="${esc(item)}" aria-label="${i + 1}번째">`;
      return `<div class="ed-item"><div class="ed-item__row ed-item__row--top">${control}${ctrl}</div></div>`;
    }).join('');
    return `<div class="f f--list">
      ${f.label ? `<span class="f__label">${esc(f.label)}</span>` : ''}
      <div class="ed-list">${items || '<p class="ed__empty">아직 없어요.</p>'}</div>
      <button class="ed-btn ed-btn--add" type="button" data-ladd="${esc(path)}">${esc(f.addLabel || '+ 추가')}</button>
    </div>`;
  }

  function renderDrawer(keepScroll) {
    const def = DRAWERS[drawerKey];
    if (!def) return;
    const top = drawerBody.scrollTop;
    listDefs.clear();
    $('#edDrawerTitle').textContent = def.title;
    drawerBody.innerHTML =
      (def.note ? `<p class="ed__note">${esc(def.note)}</p>` : '') +
      (def.lead || '') +
      def.groups.map((g) => `
        <section class="ed-group">
          <h3>${esc(g.title)}</h3>
          ${g.fields.map((f) => fieldHTML(f, joinPath(g.path, f.key))).join('')}
        </section>`).join('') +
      (def.extra || '') +
      '<p class="ed__note">바꾼 내용은 왼쪽 화면에 바로 보이고, 이 브라우저에 임시 저장돼요. 다 고쳤으면 아래 <b>게시하기</b>를 눌러 주세요.</p>';
    $$('img[data-preview]', drawerBody).forEach((img) => updatePreview(img.dataset.preview));
    if (keepScroll) drawerBody.scrollTop = top;
  }

  const captureOpen = () => new Set($$('details.ed-card[open]', drawerBody).map((d) => d.dataset.key));
  function remapOpen(keys, listPath, fn) {
    const out = new Set();
    const prefix = listPath + '.';
    keys.forEach((k) => {
      if (!k.startsWith(prefix)) { out.add(k); return; }
      const rest = k.slice(prefix.length);
      const dot = rest.indexOf('.');
      const idx = Number(dot < 0 ? rest : rest.slice(0, dot));
      const n = fn(idx);
      if (n >= 0) out.add(prefix + n + (dot < 0 ? '' : rest.slice(dot)));
    });
    return out;
  }

  function openDrawer(key) {
    if (!adminUser || !DRAWERS[key]) return;
    if (!state.editing) setEditing(true, true);
    if (state.openId !== null) T.closeCharacter();
    drawerKey = key;
    openKeys = new Set();
    renderDrawer(false);
    drawerBody.scrollTop = 0;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    setTimeout(() => { const f = $('input, textarea, select', drawerBody); if (f) f.focus({ preventScroll: true }); }, 380);
  }
  function closeDrawer() {
    if (!drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerKey = null;
  }
  function refreshDrawer() {
    if (!drawerKey) return;
    openKeys = captureOpen();
    renderDrawer(true);
  }

  function updatePreview(path) {
    const v = getAt(state.content, path) || '';
    $$(`img[data-preview="${cssEsc(path)}"]`, drawerBody).forEach((img) => {
      T.setImg(img, v, T.BLANK, 'thumb');
      img.parentNode.classList.toggle('is-empty', !v);
    });
    $$(`[data-clear="${cssEsc(path)}"]`, drawerBody).forEach((b) => { b.hidden = !v; });
  }

  let contentTimer = 0;
  const scheduleContentRender = () => {
    clearTimeout(contentTimer);
    contentTimer = setTimeout(() => T.renderContent(), 140);
  };
  function afterListChange() {
    renderDrawer(true);
    T.renderContent();
    T.persist();
  }

  drawer.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close]')) closeDrawer(); });

  // 한글 입력: 마지막 글자가 조합 중인 채로 칸을 벗어나도 빠지지 않게 change · compositionend 에서도 한 번 더 저장
  ['input', 'change', 'compositionend'].forEach((type) => drawerBody.addEventListener(type, onFieldInput));
  function onFieldInput(e) {
    const t = e.target;
    const path = t.dataset.path;
    if (!path) return;
    let v;
    if (t.dataset.type === 'bool') v = t.checked;
    else if (t.dataset.type === 'tags') v = t.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (t.dataset.type === 'lines') v = t.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else v = t.value;
    setAt(state.content, path, v);
    $$(`[data-title-src="${cssEsc(path)}"]`, drawerBody).forEach((el) => {
      const shown = el.dataset.titleMap ? TITLE_MAPS[el.dataset.titleMap](v) : v;
      el.textContent = shown || '(이름 없음)';
    });
    if ($(`img[data-preview="${cssEsc(path)}"]`, drawerBody)) updatePreview(path);
    if (t.dataset.resets && e.type === 'change') {
      setAt(state.content, path.replace(/[^.]+$/, t.dataset.resets), '');
      refreshDrawer(); // 바뀐 캐릭터의 스킨 목록으로 다시 그리기
    }
    scheduleContentRender();
    T.persist();
  }

  drawerBody.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.closest('summary')) e.preventDefault(); // 버튼을 눌러도 카드가 접히지 않게

    // 출시 · 복각: 아직 목록에 없는 S+ 캐릭터를 한 번에 추가
    if (b.hasAttribute('data-history-fill')) {
      const has = new Set(state.content.history.map((h) => h.charId));
      const add = state.data.characters.filter((c) => c.grade === 'S+' && !has.has(c.id));
      if (!add.length) return T.toast('S+ 캐릭터가 이미 모두 목록에 있어요.');
      add.forEach((c) => state.content.history.push({ charId: c.id, first: '', reruns: [], note: '' }));
      openKeys = captureOpen();
      afterListChange();
      T.toast(`S+ 캐릭터 ${add.length}명을 추가했어요. 날짜를 채워 주세요.`, 'ok');
      return;
    }


    const lpath = b.dataset.ladd || b.dataset.lpath;
    if (lpath) {
      const arr = getAt(state.content, lpath);
      const f = listDefs.get(lpath);
      if (!Array.isArray(arr) || !f) return;
      if (b.dataset.ladd) {
        // prepend: 새 항목을 맨 위에 (예: 최신 업데이트)
        let ni;
        if (f.prepend) {
          arr.unshift(blank(f.of));
          ni = 0;
          openKeys = remapOpen(captureOpen(), lpath, (k) => k + 1);
        } else {
          arr.push(blank(f.of));
          ni = arr.length - 1;
          openKeys = captureOpen();
        }
        openKeys.add(`${lpath}.${ni}`);
        afterListChange();
        const target = $(`[data-key="${cssEsc(lpath + '.' + ni)}"]`, drawerBody) ||
          $$(`[data-lpath="${cssEsc(lpath)}"][data-i="${ni}"]`, drawerBody)[0];
        const holder = target && (target.closest('.ed-card, .ed-item') || target);
        if (holder) {
          holder.classList.add('is-new');
          holder.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          const inp = $('input, textarea', holder);
          if (inp) inp.focus({ preventScroll: true });
        }
        return;
      }
      const i = Number(b.dataset.i);
      if (b.dataset.lmove) {
        const j = i + Number(b.dataset.lmove);
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        openKeys = remapOpen(captureOpen(), lpath, (k) => (k === i ? j : k === j ? i : k));
        afterListChange();
        return;
      }
      if (b.hasAttribute('data-lremove')) {
        if (hasContent(arr[i]) && !window.confirm('이 항목을 삭제할까요?')) return;
        arr.splice(i, 1);
        openKeys = remapOpen(captureOpen(), lpath, (k) => (k === i ? -1 : k > i ? k - 1 : k));
        afterListChange();
      }
      return;
    }

    if (b.dataset.upload) {
      const path = b.dataset.upload;
      uploadWithButton(b, b.dataset.preset, (ref) => {
        setAt(state.content, path, ref);
        const inp = $(`input[data-path="${cssEsc(path)}"]`, drawerBody);
        if (inp) inp.value = ref;
        updatePreview(path);
        T.renderContent();
        T.persist();
      });
      return;
    }
    if (b.dataset.clear) {
      const path = b.dataset.clear;
      setAt(state.content, path, '');
      const inp = $(`input[data-path="${cssEsc(path)}"]`, drawerBody);
      if (inp) inp.value = '';
      updatePreview(path);
      T.renderContent();
      T.persist();
    }
  });

  /* =====================================================================
   *  캐릭터 편집 (상세 창 오른쪽)
   * ===================================================================== */
  // 테마 색상 고르기 (정해진 색 중에서 선택)
  function swatchesHTML(current) {
    const cur = String(current || '').toLowerCase();
    return T.CHAR_COLORS.map(([hex, label]) => `
      <button type="button" class="swatch${hex === cur ? ' is-on' : ''}" data-swatch="${hex}" style="--sw:${hex}" aria-pressed="${hex === cur}" title="${esc(label)}">
        <span class="sr-only">${esc(label)}</span>
      </button>`).join('');
  }
  // 범위 슬라이더(최소 ~ 최대) 채움 표시 + 손잡이가 겹칠 때 움직일 수 있는 쪽을 위로
  function syncStatRow(row, def, s) {
    if (!row) return;
    row.style.setProperty('--a', s.min / def.max);
    row.style.setProperty('--b', s.max / def.max);
    $('.dual', row).classList.toggle('is-min-top', s.min > def.max / 2);
  }
  function updateTotals(c) {
    const sum = T.statSum(c);
    const live = $('[data-live="sum"]', box);
    if (live) live.textContent = sum;
    const totalInp = $('[data-f="total"]', box);
    if (totalInp) totalInp.placeholder = `자동 (${sum})`;
  }

  function renderForm(target, c) {
    const defs = state.data.statDefs;
    target.innerHTML = `
      <div class="ed">
        <div class="ed__head">
          <span class="ed__badge">✎ 편집 중</span>
          <h2 id="mName" data-live="name"></h2>
          <p class="ed__hint">바꾼 내용은 바로 화면에 반영되고 이 브라우저에 임시 저장돼요. 다 고쳤으면 아래 <b>게시하기</b>를 눌러 주세요.</p>
        </div>

        <section class="ed__sec">
          <h3>기본 정보</h3>
          <div class="ed__grid2">
            <label class="f"><span>이름</span><input data-f="name" maxlength="40"></label>
            <label class="f"><span>별명 · 이명</span><input data-f="alias" maxlength="40" placeholder="예: 코트의 폭격기"></label>
            <label class="f"><span>포지션</span>
              <select data-f="position">
                <option value="">미정</option>
                ${T.POSITIONS.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
              </select></label>
            <label class="f"><span>등급 <small class="f__hint">목록은 S+ → A- 순서</small></span>
              <select data-f="grade">
                <option value="">미정</option>
                ${T.GRADES.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}
              </select></label>
          </div>
          <label class="switch ed-new">
            <input type="checkbox" data-f="isNew">
            <span class="switch__ui" aria-hidden="true"></span>
            <span class="switch__label"><b>신규 캐릭터로 강조</b> — 카드에 NEW 표시 · 메인 화면 맨 위에 소개</span>
          </label>
          <div class="f"><span>테마 색상</span>
            <div class="swatches" role="group" aria-label="테마 색상">${swatchesHTML(c.color)}</div>
          </div>
          <div class="f"><span>대표 이미지 <small class="f__hint">세로 3:4 · 900×1200px 이상 추천</small></span>
            <div class="f__row">
              <input class="mono" data-f="image" placeholder="이미지를 올리거나 경로 입력 (images/...)" aria-label="대표 이미지">
              <button class="ed-btn" type="button" data-pick="image">이미지 올리기</button>
            </div>
          </div>
          <label class="f"><span>소개 글</span><textarea data-f="description" rows="3"></textarea></label>
        </section>

        <section class="ed__sec">
          <div class="ed__sechead"><h3>스탯 <small class="f__hint">최소 ~ 최대</small></h3><span class="ed__total">최대값 합계<b data-live="sum"></b></span></div>
          ${defs.length ? defs.map((d) => `
            <div class="ed-stat2" style="--sc:${d.color}" data-stat-row="${esc(d.key)}">
              <div class="ed-stat2__head">
                ${T.statIcon(d.icon)}
                <span class="ed-stat2__name">${esc(d.name)}</span>
                <span class="ed-stat2__nums">
                  <input class="num" type="number" min="0" max="${d.max}" step="1" inputmode="numeric" data-stat="${esc(d.key)}" data-end="min" aria-label="${esc(d.name)} 최소">
                  <span aria-hidden="true">~</span>
                  <input class="num" type="number" min="0" max="${d.max}" step="1" inputmode="numeric" data-stat="${esc(d.key)}" data-end="max" aria-label="${esc(d.name)} 최대">
                </span>
              </div>
              <div class="dual">
                <span class="dual__fill" aria-hidden="true"></span>
                <input type="range" min="0" max="${d.max}" step="1" data-stat="${esc(d.key)}" data-end="min" aria-label="${esc(d.name)} 최소 슬라이더">
                <input type="range" min="0" max="${d.max}" step="1" data-stat="${esc(d.key)}" data-end="max" aria-label="${esc(d.name)} 최대 슬라이더">
              </div>
            </div>`).join('') : '<p class="ed__empty">스탯 항목이 없어요. 아래 도구 막대의 \'스탯 · 포지션\'에서 추가하세요.</p>'}
          <div class="ed-total">
            <label for="edTotal">총합 스테이터스 <small class="f__hint">비워두면 최대값 합계로 자동 표시</small></label>
            <input class="num" id="edTotal" type="number" min="0" step="1" inputmode="numeric" data-f="total">
          </div>
        </section>

        <section class="ed__sec">
          <div class="ed__sechead"><h3>프로필</h3><button class="ed-btn" type="button" data-add="profile">+ 항목</button></div>
          <div class="ed-list" data-list="profile"></div>
        </section>

        <section class="ed__sec">
          <div class="ed__sechead"><h3>특성</h3><button class="ed-btn" type="button" data-add="traits">+ 특성</button></div>
          <div class="ed-list" data-list="traits"></div>
        </section>

        <section class="ed__sec">
          <div class="ed__sechead"><h3>스킨</h3><button class="ed-btn" type="button" data-add="skins">+ 스킨</button></div>
          <div class="ed-list" data-list="skins"></div>
        </section>

        <section class="ed__sec ed__danger">
          <div>
            <button class="ed-btn" type="button" data-char="up">◀ 순서 앞으로</button>
            <button class="ed-btn" type="button" data-char="down">순서 뒤로 ▶</button>
            <button class="ed-btn" type="button" data-char="dup">복제</button>
          </div>
          <button class="ed-btn ed-btn--danger" type="button" data-char="del">캐릭터 삭제</button>
        </section>
      </div>`;

    $$('[data-f]', target).forEach((inp) => {
      const k = inp.dataset.f;
      if (inp.type === 'checkbox') inp.checked = !!c[k];
      else inp.value = c[k] ?? '';
    });
    $$('[data-stat]', target).forEach((inp) => {
      const s = c.stats[inp.dataset.stat] || { min: 0, max: 0 };
      inp.value = s[inp.dataset.end];
    });
    defs.forEach((d) => syncStatRow($(`[data-stat-row="${cssEsc(d.key)}"]`, target), d, c.stats[d.key] || { min: 0, max: 0 }));
    $('[data-live="name"]', target).textContent = c.name || '이름 없음';
    updateTotals(c);
    ['profile', 'traits', 'skins'].forEach((k) => renderList(c, k));
    updateNote();
  }

  const LIST_EMPTY = {
    profile: '프로필 항목이 없어요. (예: 키, 나이, 소속, 플레이 스타일)',
    traits: '특성이 없어요.',
    skins: '스킨이 없어요.'
  };
  const NEW_ITEM = {
    profile: () => ({ label: '', value: '' }),
    traits: () => ({ icon: '', name: '', tag: '', desc: '' }),
    skins: () => ({ name: '', rarity: '', image: '', howToGet: '', isNew: false })
  };

  function ctrlHTML(kind, i, n) {
    const d = `data-kind="${kind}" data-i="${i}"`;
    return `<div class="ed-item__ctrl">
      <button type="button" data-move="-1" ${d} ${i === 0 ? 'disabled' : ''} aria-label="위로">↑</button>
      <button type="button" data-move="1" ${d} ${i === n - 1 ? 'disabled' : ''} aria-label="아래로">↓</button>
      <button type="button" class="rm" data-remove ${d} aria-label="삭제">✕</button>
    </div>`;
  }

  function itemHTML(kind, i, n) {
    const a = (k) => `data-kind="${kind}" data-i="${i}" data-k="${k}"`;
    if (kind === 'profile') {
      return `<div class="ed-item"><div class="ed-item__row">
        <input ${a('label')} class="w-label" placeholder="항목 (예: 키)">
        <input ${a('value')} placeholder="내용 (예: 180cm)">
        ${ctrlHTML(kind, i, n)}
      </div></div>`;
    }
    if (kind === 'traits') {
      return `<div class="ed-item">
        <div class="ed-item__row">
          <input ${a('icon')} class="w-icon" placeholder="아이콘" title="이모지 한 글자 (예: 🔥)" aria-label="아이콘 (이모지)">
          <input ${a('name')} placeholder="특성 이름">
          <input ${a('tag')} class="w-tag" list="edTagList" placeholder="태그 (예: 패시브)">
          ${ctrlHTML(kind, i, n)}
        </div>
        <textarea ${a('desc')} rows="2" placeholder="특성 설명"></textarea>
      </div>`;
    }
    return `<div class="ed-item ed-item--skin">
      <button type="button" class="thumb" data-preview-skin="${i}" aria-label="이 스킨 미리 보기"><img alt=""></button>
      <div class="fields">
        <div class="ed-item__row">
          <input ${a('name')} placeholder="스킨 이름">
          <input ${a('rarity')} class="w-tag" list="edRarityList" placeholder="등급">
          ${ctrlHTML(kind, i, n)}
        </div>
        <div class="f__row">
          <input class="mono" ${a('image')} placeholder="이미지를 올리거나 경로 입력" aria-label="스킨 이미지">
          <button class="ed-btn" type="button" data-pick="skin" data-i="${i}">이미지 올리기</button>
        </div>
        <input ${a('howToGet')} placeholder="획득 방법 (예: 시즌 1 패스 50레벨)">
        <label class="switch">
          <input type="checkbox" ${a('isNew')}>
          <span class="switch__ui" aria-hidden="true"></span>
          <span class="switch__label">신규 스킨 — NEW 표시 · 메인 화면 맨 위에 소개</span>
        </label>
      </div>
    </div>`;
  }

  function renderList(c, kind) {
    const wrap = $(`[data-list="${kind}"]`, box);
    if (!wrap) return;
    const arr = c[kind];
    if (!arr.length) {
      wrap.innerHTML = `<p class="ed__empty">${LIST_EMPTY[kind]}</p>`;
      return;
    }
    wrap.innerHTML = arr.map((_, i) => itemHTML(kind, i, arr.length)).join('');
    $$('[data-k]', wrap).forEach((inp) => {
      const v = arr[Number(inp.dataset.i)][inp.dataset.k];
      if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v ?? '';
    });
    if (kind === 'skins') refreshSkinThumbs(c);
  }

  function refreshSkinThumbs(c) {
    $$('[data-list="skins"] .thumb img', box).forEach((img, i) => {
      const s = c.skins[i];
      if (s) T.setImg(img, s.image, T.placeholder(s.name || c.name, c.color, 1), 'thumb');
    });
  }

  // 이미지 경로를 타이핑하는 동안 매 글자마다 다시 그리지 않도록 잠시 기다립니다.
  let visualTimer = 0;
  function refreshVisual(withStage) {
    clearTimeout(visualTimer);
    visualTimer = setTimeout(() => {
      const c = T.current();
      if (!c) return;
      T.renderSkinStrip();
      refreshSkinThumbs(c);
      if (withStage) T.refreshStage(true);
    }, 280);
  }

  box.addEventListener('input', (e) => {
    if (!state.editing) return;
    const c = T.current();
    if (!c) return;
    const t = e.target;

    if (t.dataset.f) {
      const k = t.dataset.f;
      const v = t.value;
      if (k === 'total') {
        const n = parseInt(v, 10);
        c.total = v.trim() === '' || !Number.isFinite(n) ? null : Math.max(0, n);
      } else if (k === 'isNew') {
        c.isNew = t.checked;
      } else {
        c[k] = v;
      }
      if (k === 'name') { $('[data-live="name"]', box).textContent = v || '이름 없음'; refreshVisual(true); }
      if (k === 'image') refreshVisual(state.skinIndex === -1);
      // 등급 · 포지션 · 신규 표시는 목록 순서와 메인 화면 안내에 영향을 줘요
      if (k === 'grade' || k === 'position' || k === 'isNew' || k === 'name' || k === 'alias') {
        T.renderCharacters();
        T.updateModalCount();
      } else {
        T.refreshCard(c.id);
      }
      T.persist();
      return;
    }

    if (t.dataset.stat) {
      const def = state.data.statDefs.find((d) => d.key === t.dataset.stat);
      if (!def) return;
      let v = parseInt(t.value, 10);
      if (!Number.isFinite(v)) return; // 숫자를 지우는 중
      v = T.clamp(v, 0, def.max);
      const s = c.stats[def.key] || (c.stats[def.key] = { min: 0, max: 0 });
      const end = t.dataset.end;
      s[end] = v;
      // 슬라이더는 손잡이끼리 밀어내고, 숫자 칸은 다 입력한 뒤(change) 맞춥니다
      if (t.type === 'range') {
        if (end === 'min' && s.max < v) s.max = v;
        if (end === 'max' && s.min > v) s.min = v;
      }
      syncStatInputs(def, s, t);
      updateTotals(c);
      T.refreshCard(c.id);
      T.persist();
      return;
    }

    if (t.dataset.k) {
      const kind = t.dataset.kind;
      const i = Number(t.dataset.i);
      const item = c[kind] && c[kind][i];
      if (!item) return;
      item[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
      if (kind === 'skins') {
        const k = t.dataset.k;
        if (k === 'image' || k === 'name' || k === 'isNew') refreshVisual(state.skinIndex === i);
        if (state.skinIndex === i && (k === 'rarity' || k === 'howToGet' || k === 'name' || k === 'isNew')) T.refreshStage(true);
        // 스킨 이름 · 신규 표시는 메인 화면 안내(신규 스킨 · 복각)에도 보여요
        if (k === 'name' || k === 'isNew') T.renderHeroRows();
      }
      T.persist();
    }
  });

  function syncStatInputs(def, s, except) {
    $$(`[data-stat="${cssEsc(def.key)}"]`, box).forEach((o) => {
      if (o !== except) o.value = s[o.dataset.end];
    });
    syncStatRow($(`[data-stat-row="${cssEsc(def.key)}"]`, box), def, s);
  }

  // 숫자 칸 입력을 마치면: 비어 있으면 원래 값으로, 최소가 최대보다 크면 맞춰 줍니다
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (!state.editing || !t.dataset.stat || t.type !== 'number') return;
    const c = T.current();
    const def = state.data.statDefs.find((d) => d.key === t.dataset.stat);
    if (!c || !def) return;
    const s = c.stats[def.key];
    if (s.min > s.max) {
      if (t.dataset.end === 'min') s.max = s.min; else s.min = s.max;
      updateTotals(c);
      T.refreshCard(c.id);
      T.persist();
    }
    syncStatInputs(def, s, null);
  });

  box.addEventListener('click', (e) => {
    if (!state.editing) return;
    const c = T.current();
    const b = e.target.closest('button');
    if (!c || !b) return;

    if (b.dataset.add) {
      const kind = b.dataset.add;
      c[kind].push(NEW_ITEM[kind]());
      renderList(c, kind);
      afterStructural(c, kind);
      const items = $$(`[data-list="${kind}"] .ed-item`, box);
      const last = items[items.length - 1];
      if (last) {
        last.classList.add('is-new');
        const inp = $(kind === 'traits' ? '[data-k="name"]' : 'input', last);
        if (inp) inp.focus();
        last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      if (kind === 'skins') T.selectSkin(c.skins.length - 1);
      return;
    }

    if (b.dataset.move) {
      const kind = b.dataset.kind;
      const arr = c[kind];
      const i = Number(b.dataset.i);
      const j = i + Number(b.dataset.move);
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      if (kind === 'skins') {
        if (state.skinIndex === i) state.skinIndex = j;
        else if (state.skinIndex === j) state.skinIndex = i;
      }
      renderList(c, kind);
      afterStructural(c, kind);
      const moved = $(`[data-list="${kind}"] [data-move="${Number(b.dataset.move)}"][data-i="${j}"]`, box);
      if (moved && !moved.disabled) moved.focus();
      return;
    }

    if (b.hasAttribute('data-remove')) {
      const kind = b.dataset.kind;
      const arr = c[kind];
      const i = Number(b.dataset.i);
      if (hasContent(arr[i]) && !window.confirm('이 항목을 삭제할까요?')) return;
      arr.splice(i, 1);
      if (kind === 'skins') {
        if (state.skinIndex === i) state.skinIndex = -1;
        else if (state.skinIndex > i) state.skinIndex -= 1;
      }
      renderList(c, kind);
      afterStructural(c, kind);
      return;
    }

    if (b.dataset.pick) {
      const input = b.parentNode.querySelector('input');
      const isSkin = b.dataset.pick === 'skin';
      const idx = Number(b.dataset.i);
      uploadWithButton(b, isSkin ? 'skin' : 'character', (ref) => {
        input.value = ref;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        T.selectSkin(isSkin ? idx : -1);
        T.refreshStage(true);
      });
      return;
    }
    if (b.dataset.swatch) {
      c.color = b.dataset.swatch;
      $$('.swatch', box).forEach((s) => {
        const isOn = s === b;
        s.classList.toggle('is-on', isOn);
        s.setAttribute('aria-pressed', String(isOn));
      });
      $('.modal__panel').style.setProperty('--c', T.safeColor(c.color));
      refreshVisual(true);
      T.renderCharacters();
      T.persist();
      return;
    }
    if (b.dataset.previewSkin != null) return T.selectSkin(Number(b.dataset.previewSkin));
    if (b.dataset.char) return charAction(b.dataset.char, c);
  });

  function afterStructural(c, kind) {
    if (kind === 'skins') {
      T.renderSkinStrip();
      T.refreshStage(true);
      T.updateHeroCounts();
    }
    T.refreshCard(c.id);
    T.persist();
  }

  function uniqueId(base) {
    let n = 2;
    let id = `${base}-${n}`;
    while (T.getChar(id)) id = `${base}-${++n}`;
    return id;
  }

  function charAction(act, c) {
    const chars = state.data.characters;
    const i = chars.indexOf(c);
    if (act === 'up' || act === 'down') {
      const j = i + (act === 'up' ? -1 : 1);
      if (j < 0 || j >= chars.length) return T.toast(act === 'up' ? '이미 맨 앞이에요.' : '이미 맨 뒤예요.');
      [chars[i], chars[j]] = [chars[j], chars[i]];
      T.persist();
      T.renderCharacters();
      T.updateModalCount();
      T.toast(`순서를 ${j + 1}번째로 옮겼어요.${state.sort !== 'default' ? " (정렬이 '기본 순서'일 때 보여요)" : ''}`);
      return;
    }
    if (act === 'dup') {
      const copy = T.clone(c);
      copy.id = uniqueId(c.id);
      copy.name = `${c.name} (복사본)`;
      chars.splice(i + 1, 0, copy);
      T.persist();
      T.renderCharacters();
      T.updateHeroCounts();
      T.openCharacter(copy.id, 1);
      T.toast('캐릭터를 복제했어요.', 'ok');
      return;
    }
    if (act === 'del') {
      if (!window.confirm(`'${c.name || '이름 없음'}' 캐릭터를 삭제할까요?\n(게시하기 전이라면 '되돌리기'로 되살릴 수 있어요)`)) return;
      chars.splice(i, 1);
      T.persist();
      T.closeCharacter();
      T.renderChips();
      T.renderCharacters();
      T.updateHeroCounts();
      T.toast('캐릭터를 삭제했어요.');
    }
  }

  function addCharacter() {
    if (!adminUser) return;
    if (!state.editing) setEditing(true, true);
    closeDrawer();
    const d = state.data;
    const c = {
      id: 'char-' + Date.now().toString(36),
      name: '새 캐릭터', alias: '', grade: '', isNew: false,
      position: state.filter !== 'all' ? state.filter : '',
      color: T.CHAR_COLORS[0][0], image: '', description: '',
      profile: [], stats: {}, total: null, traits: [], skins: []
    };
    d.statDefs.forEach((s) => { c.stats[s.key] = { min: 100, max: 150 }; });
    d.characters.push(c);
    state.query = '';
    $('#charSearch').value = '';
    T.persist();
    T.renderChips();
    T.renderCharacters();
    T.updateHeroCounts();
    T.openCharacter(c.id);
    setTimeout(() => {
      const inp = $('[data-f="name"]', box);
      if (inp) { inp.focus(); inp.select(); }
    }, 380);
  }

  /* ---------- 이미지 해상도 안내 (편집 중에만) ---------- */
  let lastStage = null;
  T.on('stageimage', (detail) => { lastStage = detail; updateNote(); });

  function updateNote() {
    const note = $('#mImgNote');
    if (!note) return;
    if (!state.editing || !lastStage || state.openId === null) { note.hidden = true; return; }
    const { img, path, ok } = lastStage;
    note.hidden = false;
    note.className = 'stage__note';
    if (!path) {
      note.textContent = '아직 이미지가 없어요. 오른쪽에서 이미지를 올려 주세요. (권장: 세로 3:4, 900×1200px 이상)';
      return;
    }
    if (!ok) {
      note.classList.add('is-warn');
      note.textContent = `이미지를 찾을 수 없어요: ${path} — 경로나 파일 이름(대소문자 · 확장자)을 확인하세요.`;
      return;
    }
    const stage = $('#mStage');
    const dpr = window.devicePixelRatio || 1;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) { note.hidden = true; return; }
    // 꽉 채우기(cover)면 더 크게 확대되니 그 기준으로 계산
    const fit = getComputedStyle(img).objectFit === 'cover' ? Math.max : Math.min;
    const scale = fit(stage.clientWidth / nw, stage.clientHeight / nh) * dpr;
    if (scale > 1.05) {
      note.classList.add('is-warn');
      note.textContent = `원본 ${nw}×${nh}px — 화면보다 작아 살짝 흐릿할 수 있어요. ${Math.ceil(stage.clientWidth * dpr)}×${Math.ceil(stage.clientHeight * dpr)}px 이상을 권장해요.`;
    } else {
      note.classList.add('is-ok');
      note.textContent = `원본 ${nw}×${nh}px — 선명하게 표시돼요.`;
    }
  }

  /* =====================================================================
   *  연결
   * ===================================================================== */
  let addCard = null;
  T.on('gridrender', (grid) => {
    if (!state.editing) { if (addCard) addCard.remove(); return; }
    if (!addCard) {
      addCard = document.createElement('button');
      addCard.type = 'button';
      addCard.className = 'ccard ccard--add';
      addCard.innerHTML = '<div class="ccard__inner"><div><span class="plus" aria-hidden="true">+</span><b>새 캐릭터 추가</b></div></div>';
      addCard.addEventListener('click', addCharacter);
    }
    grid.appendChild(addCard);
  });

  T.on('editsection', (key) => openDrawer(key));

  loginBtn.addEventListener('click', openLogin);
  $('#editFab').addEventListener('click', () => setEditing(true));

  authSheet.addEventListener('submit', (e) => {
    if (e.target.id !== 'adLoginForm') return;
    e.preventDefault();
    submitLogin(e.target);
  });

  authSheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-auth]');
    if (!b) return;
    if (b.dataset.auth === 'again') showAuth('login');
    if (b.dataset.auth === 'copy') {
      const body = $('#adAuthBody');
      const text = rulesFor(body.dataset.uid || '', body.dataset.id || '');
      const done = () => T.toast('규칙을 복사했어요. Firebase 콘솔에 붙여넣으세요.', 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => T.toast('복사하지 못했어요. 직접 선택해서 복사해 주세요.', 'warn'));
    }
  });

  backupSheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-backup]');
    if (!b) return;
    if (b.dataset.backup === 'download') downloadBackup();
    else importBackup();
  });

  $('#editDock').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !adminUser) return;
    const act = b.dataset.act;
    if (act === 'publish') publish();
    else if (act === 'site') openDrawer('site');
    else if (act === 'add') addCharacter();
    else if (act === 'revert') revert();
    else if (act === 'backup') openSheet(backupSheet);
    else if (act === 'preview') setEditing(false);
    else if (act === 'logout') logout();
  });

  window.addEventListener('beforeunload', saveDraftNow);

  T.editor = {
    renderForm,
    handleEscape() {
      for (const el of [authSheet, backupSheet]) {
        if (el.classList.contains('is-open')) { closeSheet(el); return true; }
      }
      if (drawer.classList.contains('is-open')) { closeDrawer(); return true; }
      return false;
    }
  };

  updateStatus();

  // 전에 로그인했던 관리자라면 자동으로 다시 확인
  if (configured && T.store.get(ADMIN_FLAG) === '1') {
    T.ready.then(loadFirebase).then(({ auth }) => {
      const unsub = auth.onAuthStateChanged((user) => {
        unsub();
        if (!user) { T.store.remove(ADMIN_FLAG); return; }
        verifyAdmin(user, true).catch((err) => console.warn('[관리자] 로그인 상태를 확인하지 못했어요.', err));
      });
    }).catch((err) => console.warn('[관리자] Firebase 를 불러오지 못했어요.', err));
  }

  // 주소 끝에 ?admin 을 붙이면 로그인 창을 바로 엽니다
  if (new URLSearchParams(location.search).has('admin')) T.ready.then(openLogin);
})();
