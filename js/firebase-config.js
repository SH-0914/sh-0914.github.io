/* =====================================================================
 *  Firebase 연결 설정 — 관리자 로그인(아이디 · 비밀번호)과 내용 저장에 사용
 *  ※ 관리자 비밀번호는 여기에 넣지 마세요. 계정은 Firebase 콘솔에서 만듭니다.
 * ---------------------------------------------------------------------
 *  Firebase 콘솔 → 프로젝트 설정(톱니바퀴) → 일반 → 내 앱(웹 </>)
 *  → 'SDK 설정 및 구성' 의 firebaseConfig 값을 아래에 그대로 옮겨 적으세요.
 *  (자세한 순서는 README.md 의 'Firebase 연결하기')
 *
 *  · 이 값들은 웹사이트에 공개되어도 괜찮은 값이에요.
 *    누가 내용을 고칠 수 있는지는 Firestore '규칙'이 서버에서 지켜줍니다.
 *  · 비워두면 관리자 기능 없이 js/content.js, js/characters.js 내용만 보여요.
 * ===================================================================== */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDumUD5jcjJrmpzuGlkeggw5dF9zfKdQao",
  authDomain: "thespike-guide.firebaseapp.com",
  projectId: "thespike-guide",
  storageBucket: "thespike-guide.firebasestorage.app",
  messagingSenderId: "742600771095",
  appId: "1:742600771095:web:b06f5a552cdde401aa7e52"
};
