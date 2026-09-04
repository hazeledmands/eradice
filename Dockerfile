# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS build
WORKDIR /app

# Corepack selects the Yarn version pinned by package.json's `packageManager`.
# Without it the bundled Yarn 1 is used, which cannot read this lockfile and —
# more importantly — ignores .yarnrc.yml entirely, silently disabling the
# `enableScripts: false` supply-chain hardening. Same reasoning as ci.yml.
RUN corepack enable

# Manifests first so the install layer caches independently of source changes.
# .yarnrc.yml is not optional here: it carries nodeLinker and enableScripts.
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# this cannot be a runtime environment variable — passing it to the container
# would do nothing. Empty by default, which simply leaves browser telemetry
# off (instrumentation.ts no-ops without a key).
#
# The key ships to every browser that loads the app. That is what a Honeycomb
# browser ingest key is for — it grants nothing but "send telemetry" — but it
# is public by construction, so do not reuse a key that has any other
# permission.
ARG NEXT_PUBLIC_HONEYCOMB_API_KEY=""
ENV NEXT_PUBLIC_HONEYCOMB_API_KEY=$NEXT_PUBLIC_HONEYCOMB_API_KEY

RUN yarn build

FROM node:24-alpine AS runtime
WORKDIR /app

ARG BUILD_SHA=unknown

# HOSTNAME rather than HOST: the standalone server reads process.env.HOSTNAME
# (server.js), and defaulting to 0.0.0.0 is what makes it reachable from
# outside the container's loopback.
ENV NODE_ENV=production \
    BUILD_SHA=$BUILD_SHA \
    HOSTNAME=0.0.0.0 \
    PORT=3000

LABEL org.opencontainers.image.source="https://github.com/hazeledmands/eradice" \
      org.opencontainers.image.description="Dice roller for the Era tabletop RPG" \
      org.opencontainers.image.licenses="UNLICENSED"

# `output: 'standalone'` emits a server plus only the modules file tracing
# found. Two consequences worth knowing before editing these lines:
#
#   * jose is NOT in the traced modules and does not need to be — next.config's
#     transpilePackages bundles it into the server chunks. Nothing at runtime
#     resolves it as a package.
#   * pg IS traced, and that is what lets scripts/migrate.js resolve it from
#     /app/node_modules without a second install.
COPY --from=build --chown=1000:1000 /app/.next/standalone ./

# Next deliberately leaves these out of the standalone directory. Without them
# the server runs and answers, but every page is unstyled HTML with no client
# bundle — a failure that looks like an application bug rather than a missing
# COPY.
COPY --from=build --chown=1000:1000 /app/.next/static ./.next/static
COPY --from=build --chown=1000:1000 /app/public ./public

# The migration runner resolves its SQL as ../migrations relative to its own
# file, so this pair has to keep exactly this shape on disk.
COPY --from=build --chown=1000:1000 /app/migrations ./migrations
COPY --from=build --chown=1000:1000 /app/scripts/migrate.js ./scripts/migrate.js

# Numeric, not `USER node`. kubelet cannot resolve a name to a UID without
# pulling the image apart, so under runAsNonRoot a named user makes it refuse
# to start the container at all: "image has non-numeric user (node), cannot
# verify user is non-root". node:alpine's `node` account is uid/gid 1000.
USER 1000:1000

EXPOSE 3000

# Nothing is written outside /tmp at runtime, so this image runs under a
# read-only root filesystem. next/image is unused, which is what removes the
# usual .next/cache write.
CMD ["node", "server.js"]
