const words = [
  'brave', 'swift', 'iron', 'frost', 'ember',
  'storm', 'shadow', 'crystal', 'amber', 'jade',
  'dragon', 'falcon', 'wolf', 'raven', 'phoenix',
  'viper', 'hawk', 'tiger', 'owl', 'stag',
];

export function generateSlug(): string {
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 100);
  return `${a}-${b}-${n}`;
}
