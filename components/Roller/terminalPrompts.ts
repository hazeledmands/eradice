const TERMINAL_PROMPTS: string[] = [
  // Substrate-aware
  'The nanites are restless. Feed them a shape',
  'Substrate density: volatile. Roll if you dare',
  'What do you want to pull from the swarm?',
  'The Substrate is listening. Make it count',
  'Your nanites. Your call',

  // Station-weary
  'Another spacer, another roll',
  'This terminal has seen better centuries',
  'Roll when ready. I\'m not going anywhere',
  'System uptime: [OVERFLOW]. Go ahead',
  'Zera rises. Might as well roll',
  'Still here. Still rolling',

  // Challenging / direct
  'What are you throwing?',
  'Show me what you\'ve got',
  'Roll or stare. Your choice',
  'Feeling lucky, or just desperate?',
  'Got a plan, or just rolling blind?',
  'The Rip is widening. Make it quick',
  'How are you spending your mass?',

  // Cryptic / atmospheric
  'Reality is thin here. Roll carefully',
  'Local physics: nominal. For now',
  'The swarm remembers your last throw',
  'Lowdii proximity: within tolerance',
  'Something in the Substrate shifted. Roll?',
  'Calibration holds. Probably',
];

export function selectPrompt(previous: string | null): string {
  if (TERMINAL_PROMPTS.length <= 1) return TERMINAL_PROMPTS[0];

  let next: string;
  do {
    next = TERMINAL_PROMPTS[Math.floor(Math.random() * TERMINAL_PROMPTS.length)];
  } while (next === previous);

  return next;
}
