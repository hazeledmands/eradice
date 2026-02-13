# THEME.md

Design language and thematic guidelines for Eradice, a dice roller for the **Era** tabletop RPG setting.

## The Setting in a Sentence

Eight hundred years after a cataclysm shattered a galactic utopia, civilization scrapes itself back together in the ruins — jury-rigging the sublime wreckage of a golden age it can barely remember.

## Core Aesthetic: Accreted Ruin

The defining image of Era is **New Tethys** — a once-elegant spindle-shaped station now buried under centuries of ad-hoc structures, like a bicycle wheel encrusted with coral after decades on the ocean floor. The original form is still there, still beautiful, but you have to squint to see it through the layers.

This is the aesthetic principle for the app: **something refined buried under something lived-in**. Not sleek and pristine. Not grimdark and hopeless. Somewhere in between — a terminal that's been repaired too many times, a display that flickers but still works, technology that's held together by stubbornness and solder.

### What This Means in Practice

- **Layered, not clean.** Backgrounds should feel like they have depth and sediment — subtle noise, overlapping gradients, faint grid lines like old schematics bleeding through. The current scanline overlay and background grid are good examples of this.
- **Glow through grime.** UI elements should feel like they're emitting light through a slightly dirty surface. Neon glows are right, but they should feel like they're fighting against entropy — not the crisp neon of a brand-new sign, but the warm bleed of one that's been running for centuries.
- **Functional, not decorative.** The interface should feel like a tool someone on New Tethys actually uses. Labels are terse. Controls are utilitarian. The beauty comes from the materials, not ornamentation.

## Color Palette

The palette is drawn from the Triton system — the view from a porthole on New Tethys.

### Primary Colors

| Role | Color | Source |
|------|-------|--------|
| **Substrate Cyan** | `#00ffff` | The Vir's substrate glow — nanite dust humming on every surface. Primary accent, used for borders, text, interactive elements. |
| **Nebula Iridescent** | `#ff00ff` → `#cc44ff` | The faint iridescent glow of the Annihilation nebula on the horizon. Used for exploding dice, special states, and moments of volatility. |
| **Terminal Green** | `#00ffaa` | Readout text, input prompts, confirmation states. The color of a system that's working. |

### Background Colors

| Role | Color | Source |
|------|-------|--------|
| **Deep Void** | `#0a0a0f` | The black between stars. Primary background. |
| **Station Hull** | `#001122` → `#003344` | The dark blue-green of New Tethys's interior panels, lit by the reflected light of Zera. Used for card/component backgrounds. |
| **Algae Dark** | `rgba(0, 30, 20, 0.8)` | The faint green-black of the station's persistent mold. Subtle background variation. |

### Accent / State Colors

| Role | Color | Source |
|------|-------|--------|
| **Gold Ring** | `#ffcc44` / `#e8b830` | Zera's golden rings. Used sparingly for highlights, warnings, or important callouts. |
| **Cancelled Grey** | `#666` | Dead systems. Failed components. Cancelled dice. |
| **Alert Red** | `#ff4444` | Hull breach. System failure. Error states. |

### The Nebula Gradient

The Annihilation nebula is the dominant feature of the sky from New Tethys — a faint, shifting iridescence spanning 200 light-years. When a full gradient is called for (loading states, special backgrounds, dramatic moments), draw from:

```
Deep void → blue-green → cyan → violet → magenta → faint gold at the edges
#0a0a0f → #003344 → #00ffff → #cc44ff → #ff00ff → #ffcc44
```

This should always feel faint and distant — never saturated enough to overwhelm. It's a thing on the horizon, not in your face.

## Typography

| Font | Role | Feeling |
|------|------|---------|
| **Orbitron** | Dice faces, headings, numbers | Prototypian-era precision. The original typeface of the station's displays, still legible after 700 years. |
| **Rajdhani** | UI labels, body text, buttons | Functional, angular, slightly compressed. The workhorse font of a station where screen space is at a premium. |
| **Share Tech Mono** | Input fields, roll notation, data | Terminal output. The font of a command line that's been running since before anyone alive was born. |

All text should use `uppercase` and `letter-spacing` sparingly — for labels and headings, not body text. The station's signage is terse and capitalized; its logs are not.

## Motion & Animation

Animation in the app should evoke two things:

1. **Mechanical persistence** — the slow pulse of a system that never stops running. Shimmer effects, breathing glows, scanlines. These should be unhurried. 3-second cycles, not 0.5-second ones.
2. **Volatile energy** — the burst of an exploding die, the flash of a roll resolving. These are fast and bright, echoing the unpredictable physics near the nebula.

The contrast between these two modes is important. The resting state is a slow hum. The active state is a sharp spike.

### Dice-Specific Animation

- **Rolling dice** cycle through random faces — this is the die tumbling through Lowdii, where physics is unreliable, before snapping back to real-space with a final value.
- **Exploding dice** glow magenta/violet — the nebula's iridescence bleeding through. Something uncanny is happening. The normal rules don't apply.
- **Cancelled dice** grey out and shrink — a system going dark. Power cut. Signal lost.

## Texture & Atmosphere

- **Scanlines** — faint horizontal lines over everything, like an old display. Already implemented. Keep them subtle.
- **Grid bleed-through** — the faint cyan grid in the background suggests old schematics or station blueprints underneath the current interface. The station has been rebuilt so many times that old layouts show through like palimpsest.
- **Noise / grain** — if adding texture to backgrounds, prefer very fine noise that suggests particulate matter (nanite substrate dust, algae spores in the air) over clean gradients.
- **Vignetting** — darken edges slightly to create the feeling of looking at a screen recessed into a station wall.

## Tone & Voice

When the app communicates with the user (labels, placeholders, empty states, errors), the voice should be:

- **Terse and functional** — this is a tool on a station where bandwidth is precious and the life support might cut out.
- **Slightly worn** — not corporate-clean. A system that's been patched by dozens of different hands over the centuries.
- **Never bleak** — New Tethys is rough, but it's alive. People come here to find work. There's grit, but there's also hope.

### Examples

- Roll input placeholder: `3d+2` (not "Enter your dice notation here!")
- Empty roll history: nothing, or a minimal prompt. Don't fill silence with chatter.
- Error state: direct and brief. "Connection lost" not "Oops! Something went wrong."

## What This Is Not

- **Not clean sci-fi.** No Apple-store minimalism, no smooth white surfaces, no gentle sans-serifs.
- **Not grimdark.** Not rusted metal and blood. Not hopeless. The station is rough but people live here and care about it.
- **Not retro-futurism.** Not 1970s NASA or Alien-movie green phosphor terminals. The technology is far more advanced than that — it just happens to be old and patched.
- **Not fantasy.** Even though the setting has magic (nanite-based technomancy), the app itself is a piece of station technology. It should feel like tech, not parchment and runes.

## The Emotional Register

When someone opens Eradice, they should feel like they've just sat down at a terminal in a crowded bar on New Tethys. The display hums to life. The station creaks around them. Through the porthole, the golden rings of Zera catch the blue light of Triton, and far beyond, the nebula shimmers faintly — beautiful and terrible, a reminder of everything that was lost and everything still being built.

They type their roll. The dice tumble. The numbers resolve.

The game continues.
