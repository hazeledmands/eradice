const epithets = [
  'Iridescent', 'Nebula', 'Wayfarer', 'Substrate', 'Lowdii',
  'Virbound', 'Driftborn', 'Torchline', 'Starseam', 'Voidglass',
  'Tethys', 'Triton', 'Zera', 'Annihilation', 'Prototypian',
  'Cloudsent', 'Oliramic', 'Diemic', 'Qbit', 'Spindle',
];

const callsigns = [
  'Pilot', 'Navigator', 'Corsair', 'Archivist', 'Runner',
  'Broker', 'Dreamer', 'Warden', 'Signal', 'Cipher',
  'Nomad', 'Jockey', 'Smuggler', 'Rider', 'Mechanist',
  'Diver', 'Vector', 'Ghost', 'Harbormaster', 'Oracle',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateNickname(): string {
  return `${pick(epithets)} ${pick(callsigns)}`;
}
