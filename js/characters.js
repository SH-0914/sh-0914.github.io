/* =====================================================================
 *  기본 캐릭터 데이터 — 스탯 · 특성 · 스킨
 * ---------------------------------------------------------------------
 *  ★ 사이트의 '관리자' 로그인 → 캐릭터 카드를 눌러 수정하고 '게시하기'를 누르세요.
 *    게시한 내용이 이 파일보다 우선합니다.
 *    이 파일은 처음 게시하기 전에 보이는 기본값(예비 내용)이에요.
 *
 *  [고정된 목록 — js/app.js 에서 정해져 있어요]
 *   스탯   : 공격력(attack) · 수비력(defense) · 스피드(speed) · 점프력(jump)
 *   포지션 : 스파이커 · 세터 · 미들블로커
 *   등급   : S+ · S · S- · A+ · A · A-  (목록은 항상 이 순서로 정렬)
 *
 *  [캐릭터 항목]
 *     id          영문 고유값 (다른 캐릭터와 겹치면 안 됨)
 *     name        이름
 *     alias       별명 · 이명
 *     grade       등급 (S+ ~ A-, 비워두면 맨 뒤)
 *     isNew       true 면 신규 캐릭터로 강조 (카드 NEW 표시 · 메인 화면 소개)
 *     position    포지션
 *     color       테마 색상
 *     image       대표 이미지
 *     description 소개 글
 *     profile     프로필 표 [{ label, value }]
 *     stats       스탯 범위 { 스탯key: { "min": 최소, "max": 최대 } }
 *     total       총합 스테이터스 (null 이면 최대값 합계로 자동 표시)
 *     traits      특성 [{ icon, name, tag, desc }]
 *     skins       스킨 [{ name, rarity, image, howToGet }]
 *
 *  이미지 권장: 세로 3:4 비율, 900×1200px 이상, PNG 또는 WebP
 * ===================================================================== */

window.CHARACTER_DATA = {
  "characters": [
    {
      "id": "sample-spiker",
      "name": "샘플 스파이커",
      "alias": "코트의 폭격기",
      "grade": "S+",
      "isNew": false,
      "position": "스파이커",
      "color": "#ff5b22",
      "image": "",
      "description": "예시 캐릭터입니다. 높은 타점에서 내리꽂는 강력한 스파이크가 특기인 공격형 캐릭터 — 실제 캐릭터 정보로 바꿔 주세요.",
      "profile": [
        { "label": "키", "value": "188cm" },
        { "label": "플레이 스타일", "value": "강공형 공격수" }
      ],
      "stats": {
        "attack":  { "min": 100, "max": 195 },
        "defense": { "min": 100, "max": 160 },
        "speed":   { "min": 105, "max": 160 },
        "jump":    { "min": 110, "max": 180 }
      },
      "total": 595,
      "traits": [
        { "icon": "🔥", "name": "강타", "tag": "패시브", "desc": "예시) 스파이크가 성공하면 다음 공격의 위력이 올라갑니다." },
        { "icon": "⚡", "name": "높은 타점", "tag": "액티브", "desc": "예시) 점프 시 체공 시간이 늘어나 더 높은 곳에서 공격합니다." }
      ],
      "skins": [
        { "name": "홈 유니폼", "rarity": "일반", "image": "", "howToGet": "기본 지급" },
        { "name": "시즌 1 한정", "rarity": "전설", "image": "", "howToGet": "예시) 시즌 1 패스 보상" }
      ]
    },
    {
      "id": "sample-setter",
      "name": "샘플 세터",
      "alias": "필드의 사령탑",
      "grade": "S",
      "isNew": true,
      "position": "세터",
      "color": "#32d4ff",
      "image": "",
      "description": "예시 캐릭터입니다. 정확한 토스로 공격을 지휘하는 팀의 사령탑 — 실제 캐릭터 정보로 바꿔 주세요.",
      "profile": [
        { "label": "키", "value": "176cm" },
        { "label": "플레이 스타일", "value": "빠른 템포 운영" }
      ],
      "stats": {
        "attack":  { "min": 90,  "max": 150 },
        "defense": { "min": 105, "max": 165 },
        "speed":   { "min": 120, "max": 185 },
        "jump":    { "min": 95,  "max": 150 }
      },
      "total": null,
      "traits": [
        { "icon": "🎯", "name": "정밀 토스", "tag": "패시브", "desc": "예시) 토스 정확도가 올라 같은 팀 공격수의 스파이크 성공률이 높아집니다." },
        { "icon": "🌀", "name": "속공 지휘", "tag": "액티브", "desc": "예시) 빠른 템포의 토스로 상대 블로킹 타이밍을 흔듭니다." }
      ],
      "skins": [
        { "name": "원정 유니폼", "rarity": "레어", "image": "", "howToGet": "예시) 상점에서 골드로 구매" }
      ]
    },
    {
      "id": "sample-blocker",
      "name": "샘플 미들블로커",
      "alias": "네트 위의 철벽",
      "grade": "A+",
      "isNew": false,
      "position": "미들블로커",
      "color": "#b06bff",
      "image": "",
      "description": "예시 캐릭터입니다. 네트 앞을 지키는 높은 벽, 상대 공격을 막아내는 수비의 핵심 — 실제 캐릭터 정보로 바꿔 주세요.",
      "profile": [
        { "label": "키", "value": "195cm" },
        { "label": "플레이 스타일", "value": "네트 장악" }
      ],
      "stats": {
        "attack":  { "min": 110, "max": 175 },
        "defense": { "min": 120, "max": 190 },
        "speed":   { "min": 85,  "max": 140 },
        "jump":    { "min": 115, "max": 185 }
      },
      "total": null,
      "traits": [
        { "icon": "🧱", "name": "철벽", "tag": "패시브", "desc": "예시) 블로킹 판정 범위가 넓어집니다." }
      ],
      "skins": [
        { "name": "트레이닝복", "rarity": "일반", "image": "", "howToGet": "예시) 출석 보상" },
        { "name": "네온 나이트", "rarity": "에픽", "image": "", "howToGet": "예시) 이벤트 상점" }
      ]
    }
  ]
};
