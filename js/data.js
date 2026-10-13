// 신랑/신부는 고정 데이터, 하객은 data/guests.json(GitHub Actions가 Discussions에서 생성)에서 읽는다.
// spriteUrl이 null이면 look 값(없으면 id 기반 랜덤)으로 임시 캐릭터를 코드로 그린다.

const COUPLE = [
  {
    id: 'groom',
    name: '신랑',
    title: '신랑', // 머리 위 칭호
    titleStyle: 'gold', // 금빛 특별 칭호 (Character.setGoldTitle)
    shortMsg: '와줘서 고마워!',
    longMsg: '바쁘신 와중에 저희 결혼식에 와주셔서 진심으로 감사드립니다.\n행복하게 잘 살겠습니다!',
    spriteUrl: 'img/npc/groom/front.webp',
    walkUrl: 'img/npc/groom/walk.webp',
    look: { type: 'groom', hair: 0x2b1d0e }, // 이미지 로드 전/실패 시 임시 캐릭터
  },
  {
    id: 'bride',
    name: '신부',
    title: '신부', // 머리 위 칭호
    titleStyle: 'gold',
    shortMsg: '행복하게 살게요',
    longMsg: '함께해 주셔서 감사합니다.\n오늘 남겨주신 따뜻한 말들 오래오래 간직할게요 :)',
    spriteUrl: 'img/npc/bride/front.webp',
    walkUrl: 'img/npc/bride/walk.webp',
    look: { type: 'bride', hair: 0x6b3e1f },
  },
];

// 로딩·로비 제목 "신랑 & 신부" = 이름 (데이터 저장소 map-data.js npcs.groom/bride.name이 있으면 그것)
{
  const names = COUPLE.map((c) => CONFIG.npcs[c.id]?.name || c.name).join(' & ');
  document.querySelectorAll('.loading-title').forEach((el) => (el.textContent = names));
  document.title = `${names} 결혼식 - 방명록`;
}

// 개발자 모드(?dev)에서는 신랑/신부도 조종할 수 있으므로 나머지 동작 이미지도 불러온다
if (new URLSearchParams(location.search).has('dev')) {
  for (const c of COUPLE) {
    for (const m of ['jump', 'ladder', 'rope', 'prone']) c[`${m}Url`] = `img/npc/${c.id}/${m}.webp`;
  }
}

// guests.json을 못 읽을 때(로컬에서 파일로 열었을 때 등) 쓰는 더미 데이터
// = 개발 중 등록했던 테스트 캐릭터들 (이미지 없음 → 기본 캐릭터)
const DUMMY_GUESTS = [
  {
    id: 'dummy-1',
    name: '테스트2',
    shortMsg: '테스트입니다 ~',
    longMsg: '테스트입니다 ~',
    side: 'bride',
    relation: 'family',
    personality: 'foodie',
    title: '포토존 지박령',
    stats: { str: 5, dex: 5, int: 7, luk: 8 },
    createdAt: '2026-09-26T14:53:36Z',
  },
  {
    id: 'dummy-2',
    name: '테스트1',
    shortMsg: '테스트!',
    longMsg: '테스트야',
    side: 'both',
    relation: 'other',
    personality: 'foodie',
    title: '먹방유튜버',
    stats: { str: 6, dex: 6, int: 8, luk: 5 },
    createdAt: '2026-09-26T19:37:36Z',
  },
  {
    id: 'dummy-3',
    name: '테스트3',
    shortMsg: '테스트4',
    longMsg: 'ㅌㅌ',
    side: 'bride',
    relation: 'family',
    personality: 'dancer',
    title: '댄스마스터',
    stats: { str: 6, dex: 7, int: 7, luk: 5 },
    createdAt: '2026-09-26T20:00:40Z',
  },
  {
    id: 'dummy-4',
    name: '테스트4',
    shortMsg: '하하하하',
    longMsg: '하하하하하',
    side: 'bride',
    relation: 'friend',
    personality: 'chatty',
    title: '수다마스터',
    stats: { str: 6, dex: 8, int: 7, luk: 4 },
    createdAt: '2026-09-26T20:25:01Z',
  },
  {
    id: 'dummy-5',
    name: '테스트5',
    shortMsg: '테스트',
    longMsg: '테스트',
    side: 'groom',
    relation: 'friend',
    personality: 'foodie',
    title: '테스트마스터',
    stats: { str: 5, dex: 7, int: 7, luk: 6 },
    createdAt: '2026-09-27T04:23:40Z',
  },
  {
    id: 'dummy-6',
    name: '테스트6',
    shortMsg: 'ㅁㅁ',
    longMsg: 'ㅁㅁㅁ',
    side: 'groom',
    relation: 'work',
    personality: 'photo',
    title: '신랑의 15년지기',
    stats: { str: 7, dex: 9, int: 5, luk: 4 },
    createdAt: '2026-09-27T05:24:24Z',
  },
  {
    id: 'dummy-7',
    name: '테스트7',
    shortMsg: '테스트 777',
    longMsg: '테스트 77777777',
    side: 'both',
    relation: 'family',
    personality: 'explorer',
    title: '뷔페 탐험가',
    stats: { str: 5, dex: 8, int: 6, luk: 6 },
    createdAt: '2026-09-27T08:43:30Z',
  },
];

const GUESTS_URL = 'data/guests.json';

/** 방명록 목록을 불러온다. 실패하면 null. */
async function fetchGuests() {
  try {
    const res = await fetch(`${GUESTS_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json.guests) ? json.guests : [];
  } catch (err) {
    console.warn('guests.json 로드 실패:', err);
    return null;
  }
}
