const adjectives = [
  'Swift', 'Bronze', 'Silent', 'Crimson', 'Iron',
  'Amber', 'Shadow', 'Golden', 'Frost', 'Storm',
  'Brave', 'Crystal', 'Ember', 'Jade', 'Silver',
  'Mystic', 'Cobalt', 'Scarlet', 'Onyx', 'Violet',
];

const nouns = [
  'Dragon', 'Falcon', 'Wolf', 'Raven', 'Phoenix',
  'Viper', 'Hawk', 'Bear', 'Lynx', 'Fox',
  'Tiger', 'Otter', 'Owl', 'Crane', 'Stag',
  'Serpent', 'Panther', 'Eagle', 'Badger', 'Sphinx',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateNickname(): string {
  return `${pick(adjectives)} ${pick(nouns)}`;
}
