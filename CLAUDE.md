# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `yarn dev` - Start dev server (http://localhost:3000)
- `yarn build` - Production build (static export to `build/` directory)
- `yarn lint` - ESLint (extends next/core-web-vitals)
- `yarn test` - Run all tests with Jest
- `yarn test:watch` - Run tests in watch mode
- `yarn test -- --testPathPattern=dice` - Run tests matching a path pattern

## Architecture

Eradice is a dice roller web app built with Next.js 14 (Pages Router) and TypeScript. It uses static export (`output: 'export'`) and deploys to Netlify.

### Dice Engine (`dice/`)

The core dice logic is separated from React components:

- **`types.ts`** - Core types: `Die`, `Roll`, `ParsedRollNotation`, `DieState`
- **`parser.ts`** - Parses dice notation strings like `"3d+2"` into `{diceCount, modifier}` and creates initial dice arrays
- **`rolls.ts`** - `createRoll()` pre-calculates all final values upfront (including exploding dice chains) so results exist before animation begins
- **`calculations.ts`** - `calculateRollResult()` and `generateCopyText()` for totaling dice and formatting output
- **`randomGenerator.ts`** - Uses `random-js` with `browserCrypto` for cryptographically secure die faces; `Math.random()` for animation durations only

**Exploding dice mechanic**: The last die in a roll is the exploding die. Rolling a 6 on it spawns additional dice (chaining if more 6s are rolled). Rolling a 1 on it cancels the highest non-exploding die. This logic lives entirely in `createRoll()`.

### Component Hierarchy

`pages/index.tsx` → `Roller` → `DiceTray` + `Ledger` → `Die`

- **`Roller`** - Top-level state owner. Manages the rolls array, text input parsing, and form submission. Creates rolls via `createRoll()` and passes them down.
- **`DiceTray`** - Manages animation timing for a single roll. Starts the initial dice simultaneously, then sequences exploding dice one-by-one. Rolls older than 1 minute skip animation entirely. Shows math breakdown and copy button when complete.
- **`Die`** - Purely visual. Receives `state` ('rolling'|'stopped') and `finalNumber` as props. Runs a `requestAnimationFrame` loop showing random faces during 'rolling', snaps to `finalNumber` on 'stopped'.
- **`Ledger`** - Renders the roll history as a list of `DiceTray` components.

### State & Persistence

Roll history is persisted to `localStorage` (despite the hook being named `useSessionStorage`) via `hooks/useSessionStorage.ts`. Only completed rolls (all dice have `finalNumber`) are saved. The `loadRolls` function handles backward compatibility for rolls missing `diceCount` or `date` fields.

### Key Design Decisions

- **Pre-calculated results**: `createRoll()` determines all final values immediately. Animation is purely cosmetic — `DiceTray` uses timeouts based on each die's `stopAfter` duration to reveal results sequentially.
- **CSS Modules**: All component styling uses colocated `.module.css` files.
- **Property-based testing**: Parser tests use `fast-check` for property-based testing rather than example-based tests.
