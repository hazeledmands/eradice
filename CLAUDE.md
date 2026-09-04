# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `yarn dev` - Start dev server (http://localhost:3000)
- `yarn build` - Production build (`standalone` server bundle in `.next/`)
- `yarn lint` - ESLint (extends next/core-web-vitals)
- `yarn test` - Run all tests with Jest
- `yarn test:watch` - Run tests in watch mode
- `yarn test -- --testPathPattern=dice` - Run tests matching a path pattern
- `node scripts/migrate.js` - Apply pending SQL migrations from `migrations/`

Repository tests need a real PostgreSQL and skip unless `TEST_DATABASE_URL` is set, so the default `yarn test` stays hermetic. Run them with:
`TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/eradice yarn test`

## Architecture

Eradice is a dice roller web app built with Next.js 15 (Pages Router) and TypeScript. It builds as a Node server (`output: 'standalone'`), serves its own API under `pages/api/`, and stores room state in PostgreSQL. It ships as a container image and runs on a private Kubernetes cluster behind Cloudflare Access.

**Server layering**: route handlers in `pages/api/` parse input with `lib/validation.ts`, resolve identity through `lib/api.ts` (which wraps `lib/identity.ts`), and reach the database only through `lib/repository.ts`. Add SQL to the repository rather than to a route.

**Live updates**: mutations fire PostgreSQL triggers that `NOTIFY` on the `eradice_events` channel. `lib/events.ts` holds one `LISTEN` connection per process and fans events out to the SSE streams in `pages/api/rooms/[roomId]/stream.ts`. There is no in-process room state, so any replica can serve any stream.

**Identity**: Cloudflare Access is the only production identity boundary, verified in-process by `lib/access.ts` — never trust a proxy header. With no Access configuration and `NODE_ENV !== 'production'`, a development identity is supplied; in production the same absence makes readiness fail rather than admitting anyone.

**Exploding dice mechanic**: The last die in a roll is the exploding die. Rolling a 6 on it spawns additional dice (chaining if more 6s are rolled). Rolling a 1 on it cancels the highest non-exploding die. This logic lives entirely in `createRoll()`.

### Conventions

- **CSS Modules**: All component styling uses colocated `.module.css` files.
- **Property-based testing**: Parser tests use `fast-check` for property-based testing rather than example-based tests.
- **Migrations are forward-only**: deploys run them while the previous revision may still be serving, so every migration must stay compatible with the release before it. Use expand/contract across two releases for anything destructive.

## Development Guidelines

### Before Starting Work

- **Tests must be green.** Verify all tests pass before beginning any work. If tests are failing, fix them before proceeding.
- **No warnings allowed.** Check that test and build output is free of warnings. If any warnings exist, address them before continuing.

### Development Approach

- **Use TDD.** Write tests before writing implementation code.
- **Update documentation along with code.**
- **Before every commit**, review the README.md file to make sure that it accurately reflects the current state of the project.
