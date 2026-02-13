const roomWords = [
  'iridescent', 'lowdii', 'vir', 'tethys', 'triton',
  'zera', 'wayfarer', 'spindle', 'substrate', 'nebula',
  'qbit', 'cloud', 'oliram', 'diem', 'vastness',
  'starlane', 'rift', 'torres', 'vector', 'drifter',
];

function pickWord(): string {
  return roomWords[Math.floor(Math.random() * roomWords.length)];
}

export function generateSlug(): string {
  const a = pickWord();
  const b = pickWord();
  const n = Math.floor(Math.random() * 100);
  return `${a}-${b}-${n}`;
}
