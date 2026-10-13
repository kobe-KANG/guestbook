// 기본 NPC = 이벤트(게임) NPC만. 이미지는 scripts/gen-npc.mjs로 만든 img/npc/<id>/front.webp (코드 저장소)
// 반려동물 등 결혼식마다 다른 NPC는 데이터 저장소 js/map-data.js npcs[id].def + img/npc/<id>/ (아래 customNpc)
// - floor: 처음 서 있을 발판 (없어졌으면 랜덤), x: 처음 위치(없으면 랜덤)
// - NPC는 점프·사다리·로프를 쓰지 않고 자기 발판(이어진 발판 포함) 위만 돌아다닌다. 조종 불가
// - popup: shortMsg = 말풍선·팝업 한줄 멘트(20자 이하), longMsg = 팝업 소개 글(미정 — 정해지면 여기서 수정)
// - effect: petals(꽃가루 뿌리기) | bubbles(서 있으면 비눗방울, 걸으면 파티 블로어 음표)
// - event: 누르면 캐릭터창 대신 이벤트 화면 (rps = 가위바위보 머신, chase = 도둑 잡기, cake = 웨딩 케이크 쌓기)
// - states: 걷기(walk)·특수 동작(sleep, scratch 등) 비율과 지속 시간(<동작>Time, ms). 나머지 확률은 서기(idle)

const NPCS = [
  {
    // 이벤트 NPC: 누르면 가위바위보 게임 (js/rps.js, api/rps.js). 시작점 옆 배 갑판에 고정
    id: 'rps-machine',
    name: '가위바위보 머신',
    floor: 'f2',
    x: 285,
    fixed: true,
    height: 110,
    motions: [],
    event: 'rps',
    popup: { shortMsg: '연승 도전! ☕', longMsg: '' },
  },
  {
    // 이벤트 NPC: 누르면 도둑 잡기 (js/chase.js, api/chase.js). 가위바위보 머신 옆 선착장에 고정
    id: 'chase-police',
    name: '도둑 잡기 경찰관',
    floor: 'f4',
    x: 420,
    fixed: true,
    height: 100,
    motions: [],
    event: 'chase',
    popup: { shortMsg: '도둑 잡기 도전! 🚨', longMsg: '' },
  },
  {
    // 이벤트 NPC: 누르면 웨딩 케이크 쌓기 (js/cake.js, api/cake.js). 자리는 개발자 모드에서 끌어서 옮김
    id: 'cake-chef',
    name: '케이크 쌓기 파티시에',
    floor: 'f6',
    x: 560,
    fixed: true,
    height: 110,
    motions: [],
    event: 'cake',
    popup: { shortMsg: '케이크 쌓기 도전! 🎂', longMsg: '' },
  },
];

// 데이터 저장소의 NPC: js/map-data.js npcs[id].def = { desc, height, motions, speed?, states?, motionFrames?, motionHeight?, effect? }
// (이미지는 img/npc/<id>/, 개발자 모드 "NPC 추가"로 만들거나 직접 넣음)
NPCS.push(...Object.entries(CONFIG.npcs).filter(([, s]) => s.def).map(([id, s]) => customNpc(id, s)));

/** def가 있는 NPC 설정 → NPCS 항목 (처음 발판 없음 → 배치 방식대로, 기본이면 랜덤) */
function customNpc(id, s) {
  const { desc, ...def } = s.def;
  return { id, name: s.name, custom: true, speed: [18, 32], popup: {}, ...def };
}
