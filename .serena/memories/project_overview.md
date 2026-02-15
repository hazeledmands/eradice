# Eradice - Project Overview

Dice roller web app for tabletop RPGs.

## Tech Stack
- Next.js 14 (Pages Router), TypeScript, static export
- CSS Modules for styling
- Jest + React Testing Library for tests
- Supabase for multiplayer rooms (Realtime + Postgres)
- Deploys to Netlify

## Key Commands
- `yarn dev` - Dev server (localhost:3000)
- `yarn build` - Production build
- `yarn lint` - ESLint
- `yarn test` - Jest tests
- `yarn test -- --testPathPattern=<pattern>` - Run specific tests

## Architecture
- `dice/` - Core dice engine (parser, rolls, calculations, types)
- `components/` - React components (Roller, DiceTray, Die, Ledger, RoomBar, VisibilityToggle)
- `hooks/` - useRoom (Supabase rooms), useSessionStorage, useNickname
- `lib/` - supabase client, slug generator, nickname utils
- `pages/` - Next.js pages (index.tsx is main entry)

## Key Patterns
- Pre-calculated results: createRoll() determines all values immediately; animation is purely cosmetic
- Roll visibility: shared/secret/hidden with reveal mechanism via Supabase Realtime
- RoomRoll extends Roll with nickname, isLocal, shouldAnimate, visibility, isRevealed
