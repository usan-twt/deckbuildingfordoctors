export let playerPool = {};
export let playerDeck = [];

export function initPool() {
  playerPool = {};
  for (const id of [
    '투약', '투약', '대증처치', '수액투여', '응급처치',
    '활력징후확인', '청진', '약재준비', '간호사호출', '환자면담',
    '응급시술', '소작술', '집중', '지혈압박', '상처확인',
  ]) playerPool[id] = (playerPool[id] || 0) + 1;
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
