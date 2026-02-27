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

  // Impatient system
  'Input your intent. Try to make it a good one.',
  'Waiting for a neural signal... any day now.',
  "Syncing... don't tell me you're lagging.",
  "What's the plan? Hopefully something better than the last one.",
  "I'm ready. Are you, or are we just staring at the screen?",
  'System active. Give me something worth calculating.',

  // Corporate handler
  'Input your next billable action.',
  'Efficiency is mandatory. What is your move?',
  'Awaiting shareholder-approved input.',
  'Optimizing for maximum profit. Go.',
  "Don't waste the company's nanites. What are you doing?",
  'State your objective. High-risk maneuvers require clearance.',

  // Gritty scavenger
  'Got a death wish? Type it in.',
  'How are you planning to survive this?',
  "Scanning for threats... show me what you're made of.",
  'Is that your final answer? The Substrate is watching.',

  // Substrate mystic
  'What do you wish to manifest from the void?',
  'Reality is thin here. What are you pulling through?',
  'The nanites are hungry. Feed them a roll.',
  'Are you sure your mind can handle this sequence?',
  'What does the Apex tell you to do?',

  // Aggressively helpful
  'Your move, hotshot.',
  'Show me the numbers.',
  'Roll or die. Your choice.',
  'Execute. Now.',
  "What's the play?",
];

export function selectPrompt(previous: string | null): string {
  if (TERMINAL_PROMPTS.length <= 1) return TERMINAL_PROMPTS[0];

  let next: string;
  do {
    next = TERMINAL_PROMPTS[Math.floor(Math.random() * TERMINAL_PROMPTS.length)];
  } while (next === previous);

  return next;
}
