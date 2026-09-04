# Eradice - Dice Roller

A dice roller for the **Era** tabletop RPG setting, built with Next.js and React. Roll dice with custom modifiers and watch them animate in real-time, alone or in a shared room with the rest of the table.

## Features

- 🎲 Roll multiple dice at once (e.g., "3d+2")
- ✨ Animated dice rolling with smooth transitions
- 🔥 Exploding dice mechanics
- 📊 Roll history ledger
- 👥 Shared rooms with live rolls, presence and comments
- 🎨 Modern UI with glassmorphism effects
- 📱 Responsive design for mobile and desktop

## Tech Stack

- **Next.js 14** (Pages Router) - React framework, built as a `standalone` server
- **React 18** - UI library
- **CSS Modules** - Scoped styling
- **random-js** - Cryptographically secure random number generation
- **PostgreSQL** (`pg`) - Rooms, rolls, comments and presence
- **Cloudflare Access** (`jose`) - The only production identity boundary

## Architecture

Eradice serves its own API rather than talking to a backend-as-a-service from
the browser. Room state lives in PostgreSQL and reaches other players like
this:

```
browser ──POST /api/rooms/:id/rolls──> server ──> PostgreSQL
                                                      │ NOTIFY (trigger)
browser <──SSE /api/rooms/:id/stream── server <───────┘ LISTEN
```

- **Persistence** — `lib/repository.ts` holds every statement. The server is
  the only database client, so authorization lives in the route handlers and
  WHERE clauses rather than in row-level security.
- **Live updates** — database triggers announce each mutation on a single
  `eradice_events` channel; `lib/events.ts` holds one `LISTEN` connection per
  process and fans events out to the Server-Sent Events streams. Any replica
  can serve any stream.
- **Presence** — stored in `room_presence` with a heartbeat, so it does not
  depend on which replica a viewer's stream lands on.
- **Identity** — every request carries a `Cf-Access-Jwt-Assertion` that the
  server verifies itself (signature, issuer, audience, expiry, token type).
  It trusts no proxy header. Locally, with no Access configuration present, it
  supplies a development identity instead; in production, missing configuration
  makes readiness fail rather than admitting anyone.

## Getting Started

### Prerequisites

- Node.js 22 or later
- Yarn
- PostgreSQL 16 (Docker is fine — see below)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/hazeledmands/eradice.git
cd eradice
```

2. Install dependencies:
```bash
yarn install
```

3. Copy `.env.local.example` to `.env.local`.

### Development

Start a database, apply the migrations, then run the dev server:

```bash
docker run -d --rm --name eradice-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=eradice \
  -p 55432:5432 postgres:16-alpine

node scripts/migrate.js     # reads DATABASE_URL or the PG* variables
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

With no `CLOUDFLARE_ACCESS_*` variables set, the server signs you in as a
development identity. To test rooms with more than one player, open a second
browser profile and run a second instance with `DEV_AUTH_SUB` set to a
different value.

### Database migrations

Migrations are plain SQL in `migrations/`, applied in numeric order and
recorded in a `schema_migrations` ledger:

```bash
node scripts/migrate.js
```

The runner is safe to re-run — it exits successfully when the schema is
current — and holds a PostgreSQL advisory lock so concurrent runs serialize.
Migrations are **forward-only**, and because deploys run them while the
previous revision may still be serving, each one must stay compatible with the
release before it.

### Build

Build the application for production:

```bash
yarn build
```

This creates an optimized production build in `.next`, including the
`.next/standalone` server bundle the container image runs.

### Start Production Server

Start the production server locally:

```bash
yarn start
```

Runs the production build locally on [http://localhost:3000](http://localhost:3000).

### Lint

Run ESLint to check for code issues:

```bash
yarn lint
```

### Test

```bash
yarn test
```

Repository tests run against a real PostgreSQL and are skipped unless a
database is pointed at them, so the default run stays hermetic:

```bash
TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/eradice yarn test
```

## Usage

Enter dice notation in the input field:
- `3d` - Roll 3 dice
- `3d+2` - Roll 3 dice and add 2 to the result
- `3d6` - Roll 3 dice (die type is accepted but ignored — all dice are d6)
- `3d6+2` - Roll 3 dice and add 2 to the result
- The last die is an exploding die that can trigger additional rolls

## Project Structure

```
eradice/
├── components/              # React components
│   ├── Die/                # Die component
│   ├── DiceTray/           # Animated dice tray
│   ├── Ledger/             # Roll history
│   ├── CommentThread/      # Comments on a roll
│   └── Roller/             # Top-level roller UI
├── pages/                  # Next.js pages
│   ├── _app.tsx           # App wrapper with global styles
│   ├── index.tsx          # Home page
│   └── api/               # Server API
│       ├── health/        # live + ready probes
│       └── rooms/         # rooms, rolls, comments, presence, SSE stream
├── lib/                    # Server and shared logic
│   ├── access.ts          # Cloudflare Access JWT verification
│   ├── identity.ts        # Access vs. development identity
│   ├── api.ts             # Route plumbing: methods, errors, rate limits
│   ├── db.ts              # PostgreSQL pool
│   ├── repository.ts      # Every SQL statement
│   ├── events.ts          # LISTEN/NOTIFY fan-out for SSE
│   ├── validation.ts      # Request parsing and limits
│   └── serialize.ts       # Rows to client shapes
├── migrations/             # Forward-only SQL migrations
├── scripts/migrate.js      # Migration runner
├── dice/                   # Dice mechanics and types
├── hooks/                  # Custom React hooks
├── styles/                 # Global CSS
├── public/                 # Static assets
└── next.config.js          # Next.js configuration
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [React Documentation](https://react.dev) - learn about React

## Deployment

Eradice is published as a container image and runs on a private Kubernetes
cluster behind Cloudflare Access. It is not a static site and cannot be
deployed to a static host.

The image runs `node server.js` on port 3000 and expects:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` *or* `PGHOST`/`PGUSER`/`PGDATABASE` | yes | PostgreSQL connection |
| `PGPORT`, `PGPASSWORD` | no | Completes the discrete form |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | yes | Access issuer, e.g. `https://example.cloudflareaccess.com` |
| `CLOUDFLARE_ACCESS_AUDIENCE` | yes | The Access application's `aud` tag |
| `OTEL_*` | no | Tracing; off unless an OTLP endpoint is set |

- Migration command: `node scripts/migrate.js`, run before each new revision
- Liveness: `/api/health/live` (process only — never touches the database)
- Readiness: `/api/health/ready` (identity configuration + PostgreSQL)

Both probes are unauthenticated so the kubelet can reach them on the internal
Service; the public hostname should still be entirely covered by Access.

Deploy it only behind a trusted proxy that terminates TLS and sets the
Cloudflare Access assertion. Direct requests without a valid assertion fail
closed with a 401.
