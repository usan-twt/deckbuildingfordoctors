export let playerPool = {};
export let playerDeck = [];
export let selectedPack = null;

const STARTER = [
  '투약', '투약', '대증처치', '수액투여', '응급처치',
  '활력징후확인', '청진', '약재준비', '간호사호출', '환자면담',
  '응급시술', '소작술', '집중', '지혈압박', '상처확인',
];

const PACK_CARDS = {
  '계':       ['귀띔', '수소문', '연줄', '언니들', '부조'],
  '전쟁놀이': ['떼쓰기', '모르는노래', '따라하기', '심부름', '떠들썩'],
  '인술':     ['숨크게', '약첩', '환기하세요', '밤샘', '외곽의인술'],
};
export const PACK_NAMES = Object.keys(PACK_CARDS);

export function initPool() {
  playerPool = {};
  for (const id of STARTER) playerPool[id] = (playerPool[id] || 0) + 1;
  if (selectedPack)
    for (const id of PACK_CARDS[selectedPack]) playerPool[id] = (playerPool[id] || 0) + 1;
}

export function setPack(name) {
  selectedPack = (name === selectedPack) ? null : name;
  initPool();
}

export function getDefaultDeck() {
  const deck = [];
  for (const [id, n] of Object.entries(playerPool))
    for (let i = 0; i < n; i++) deck.push(id);
  return deck;
}

export function setDeck(arr) {
  playerDeck = arr;
}
