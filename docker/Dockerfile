ARG NODE_IMAGE=node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
ARG GO_IMAGE=golang:1.26-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039

FROM ${GO_IMAGE} AS goose_builder
RUN go install github.com/pressly/goose/v3/cmd/goose@v3.27.1

FROM ${NODE_IMAGE} AS pruner

WORKDIR /triggerdotdev

COPY --chown=node:node . .
RUN npx -q turbo@2.10.0 prune --scope=webapp --docker
RUN find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends openssl dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /triggerdotdev
COPY --chown=node:node .gitignore .gitignore
COPY --from=pruner --chown=node:node /triggerdotdev/out/json/ .
COPY --from=pruner --chown=node:node /triggerdotdev/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner --chown=node:node /triggerdotdev/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --chown=node:node patches ./patches

FROM base AS dev-deps
WORKDIR /triggerdotdev
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
ENV NODE_ENV=development
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --no-frozen-lockfile
COPY --from=pruner --chown=node:node /triggerdotdev/internal-packages/database/prisma/schema.prisma /triggerdotdev/internal-packages/database/prisma/schema.prisma
RUN pnpx prisma@6.14.0 generate --schema /triggerdotdev/internal-packages/database/prisma/schema.prisma

FROM base AS production-deps
WORKDIR /triggerdotdev
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --prod --no-frozen-lockfile

FROM base AS builder
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends openssl dumb-init ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /triggerdotdev
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

ARG SENTRY_RELEASE
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_RELEASE=${SENTRY_RELEASE} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT}

COPY --from=goose_builder /go/bin/goose /usr/local/bin/goose
RUN chmod +x /usr/local/bin/goose
COPY --chown=node:node internal-packages/clickhouse/schema /triggerdotdev/internal-packages/clickhouse/schema

COPY --from=pruner --chown=node:node /triggerdotdev/out/full/ .
COPY --from=dev-deps --chown=node:node /triggerdotdev/ .
COPY --chown=node:node turbo.json turbo.json
COPY --chown=node:node docker/scripts ./scripts
RUN chmod +x \
    ./scripts/entrypoint.sh \
    ./scripts/wait-for-it.sh \
    ./scripts/flowcordia-release-migrate.sh \
    ./scripts/flowcordia-release-verify.mjs \
    ./scripts/flowcordia-release-contract.mjs \
    ./scripts/flowcordia-migration-evidence.mjs \
    ./scripts/flowcordia-operations-health.mjs \
    ./scripts/flowcordia-doctor.mjs
COPY --chown=node:node .configs/tsconfig.base.json .configs/tsconfig.base.json
COPY --chown=node:node scripts/updateVersion.ts scripts/updateVersion.ts
COPY --chown=node:node scripts/bundleSdkDocs.ts scripts/bundleSdkDocs.ts
RUN pnpm run generate
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token) \
    pnpm run build --filter=webapp...

FROM ${NODE_IMAGE} AS runner
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends openssl netcat-openbsd ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /triggerdotdev
ENV NODE_ENV=production

COPY --from=base /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=pruner --chown=node:node /triggerdotdev/out/full/ .
COPY --from=production-deps --chown=node:node /triggerdotdev .
COPY --from=dev-deps --chown=node:node /triggerdotdev/internal-packages/database/generated ./internal-packages/database/generated
COPY --from=builder --chown=node:node /triggerdotdev/apps/webapp/build/server.js ./apps/webapp/build/server.js
COPY --from=builder --chown=node:node /triggerdotdev/apps/webapp/build ./apps/webapp/build
COPY --from=builder --chown=node:node /triggerdotdev/apps/webapp/public ./apps/webapp/public
COPY --from=builder --chown=node:node /triggerdotdev/scripts ./scripts

COPY --from=builder /usr/local/bin/goose /usr/local/bin/goose
COPY --from=builder --chown=node:node /triggerdotdev/internal-packages/clickhouse/schema /triggerdotdev/internal-packages/clickhouse/schema

# Package Prisma's runtime schema and native engine into the immutable image so
# published web, operations, migration, and diagnostics roles never need to
# mutate the root filesystem.
RUN mkdir -p /triggerdotdev/apps/webapp/prisma \
    && cp /triggerdotdev/internal-packages/database/prisma/schema.prisma /triggerdotdev/apps/webapp/prisma/schema.prisma \
    && cp /triggerdotdev/node_modules/@prisma/engines/*.node /triggerdotdev/apps/webapp/prisma/ \
    && chown -R node:node /triggerdotdev/apps/webapp/prisma

ARG BUILD_APP_VERSION
ARG BUILD_GIT_SHA
ARG BUILD_GIT_REF_NAME
ARG BUILD_TIMESTAMP_SECONDS
ARG BUILD_TIMESTAMP_RFC3339
ARG BUILD_UPSTREAM_GIT_SHA
ARG BUILD_SOURCE_REPOSITORY_URL
ENV BUILD_APP_VERSION=${BUILD_APP_VERSION} \
    BUILD_GIT_SHA=${BUILD_GIT_SHA} \
    BUILD_GIT_REF_NAME=${BUILD_GIT_REF_NAME} \
    BUILD_TIMESTAMP_SECONDS=${BUILD_TIMESTAMP_SECONDS}

LABEL org.opencontainers.image.title="Flowcordia" \
      org.opencontainers.image.description="Git-native visual workflows with durable Trigger.dev execution" \
      org.opencontainers.image.vendor="Flowcordia" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="${BUILD_SOURCE_REPOSITORY_URL}" \
      org.opencontainers.image.revision="${BUILD_GIT_SHA}" \
      org.opencontainers.image.version="${BUILD_APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_TIMESTAMP_RFC3339}" \
      dev.flowcordia.release.schema="0.1" \
      dev.flowcordia.upstream.revision="${BUILD_UPSTREAM_GIT_SHA}"

EXPOSE 3000

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

USER node
RUN corepack prepare pnpm@10.33.2 --activate

CMD ["./scripts/entrypoint.sh"]
