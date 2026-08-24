ARG NODE_IMAGE=node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
ARG GO_IMAGE=golang:1.26-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039

FROM ${GO_IMAGE} AS goose_builder
RUN go install github.com/pressly/goose/v3/cmd/goose@v3.27.1

FROM ${NODE_IMAGE} AS pruner

WORKDIR /triggerdotdev

COPY --chown=node:node . .
RUN npx -q turbo@2.10.0 prune --scope=webapp --scope=@flowcordia/studio-activepieces --docker
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

FROM dev-deps AS development
WORKDIR /triggerdotdev
ENV NODE_ENV=development
COPY --from=pruner --chown=node:node /triggerdotdev/out/full/ .
COPY --chown=node:node studio-v2/activepieces-web ./studio-v2/activepieces-web
COPY --chown=node:node studio-v2/activepieces-core-nodes/tsconfig.base.json ./studio-v2/activepieces-core-nodes/tsconfig.base.json
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/ee/embed-sdk/src ./studio-v2/activepieces-core-nodes/packages/ee/embed-sdk/src
COPY --chown=node:node studio-v2/activepieces-catalog ./studio-v2/activepieces-catalog
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/core ./studio-v2/activepieces-core-nodes/packages/core
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/common ./studio-v2/activepieces-core-nodes/packages/pieces/common
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/core ./studio-v2/activepieces-core-nodes/packages/pieces/core
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/community ./studio-v2/activepieces-core-nodes/packages/pieces/community
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/framework ./studio-v2/activepieces-core-nodes/packages/pieces/framework
COPY --chown=node:node .configs/tsconfig.base.json .configs/tsconfig.base.json
COPY --chown=node:node turbo.json turbo.json
COPY --chown=node:node scripts/updateVersion.ts scripts/updateVersion.ts
COPY --chown=node:node scripts/bundleSdkDocs.ts scripts/bundleSdkDocs.ts
RUN pnpm run generate
RUN pnpm run build --filter=webapp^... --concurrency=2
EXPOSE 3030
CMD ["pnpm", "--filter", "webapp", "dev"]

FROM base AS build_base
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
COPY --chown=node:node studio-v2/activepieces-web ./studio-v2/activepieces-web
COPY --chown=node:node studio-v2/activepieces-core-nodes/tsconfig.base.json ./studio-v2/activepieces-core-nodes/tsconfig.base.json
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/ee/embed-sdk/src ./studio-v2/activepieces-core-nodes/packages/ee/embed-sdk/src
COPY --chown=node:node studio-v2/activepieces-catalog ./studio-v2/activepieces-catalog
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/core ./studio-v2/activepieces-core-nodes/packages/core
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/common ./studio-v2/activepieces-core-nodes/packages/pieces/common
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/core ./studio-v2/activepieces-core-nodes/packages/pieces/core
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/community ./studio-v2/activepieces-core-nodes/packages/pieces/community
COPY --chown=node:node studio-v2/activepieces-core-nodes/packages/pieces/framework ./studio-v2/activepieces-core-nodes/packages/pieces/framework
COPY --chown=node:node turbo.json turbo.json
COPY --chown=node:node docker/scripts ./scripts
RUN sed -i 's/\r$//' ./scripts/*.sh ./apps/webapp/upload-sourcemaps.sh \
    && chmod +x \
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

FROM build_base AS builder
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token) \
    NODE_OPTIONS=--max-old-space-size=4096 \
    pnpm run build --filter=webapp... --concurrency=2 \
    && test -f apps/webapp/public/flowcordia-studio-activepieces/index.html

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
COPY --from=builder --chown=node:node /triggerdotdev/.configs/tsconfig.base.json ./.configs/tsconfig.base.json
# The built web server imports these workspace packages at runtime; production
# dependency installation alone does not contain their compiled dist trees.
COPY --from=builder --chown=node:node /triggerdotdev/packages/flowcordia-control-plane/dist ./packages/flowcordia-control-plane/dist
COPY --from=builder --chown=node:node /triggerdotdev/packages/flowcordia-foundation/dist ./packages/flowcordia-foundation/dist
COPY --from=builder --chown=node:node /triggerdotdev/packages/flowcordia-github-proposals/dist ./packages/flowcordia-github-proposals/dist
COPY --from=builder --chown=node:node /triggerdotdev/packages/flowcordia-github-workflows/dist ./packages/flowcordia-github-workflows/dist
COPY --from=builder --chown=node:node /triggerdotdev/packages/flowcordia-runtime/dist ./packages/flowcordia-runtime/dist
COPY --from=builder --chown=node:node /triggerdotdev/packages/flowcordia-workflow/dist ./packages/flowcordia-workflow/dist
# Studio resolves metadata locally and assembles selected pieces into Trigger
# deployment contexts at runtime. The final image therefore carries the pinned
# CE catalog and source, while only selected transitive packages enter a worker.
COPY --from=pruner --chown=node:node /triggerdotdev/studio-v2/activepieces-catalog ./studio-v2/activepieces-catalog
COPY --from=pruner --chown=node:node /triggerdotdev/studio-v2/activepieces-core-nodes/packages/core ./studio-v2/activepieces-core-nodes/packages/core
COPY --from=pruner --chown=node:node /triggerdotdev/studio-v2/activepieces-core-nodes/packages/pieces/common ./studio-v2/activepieces-core-nodes/packages/pieces/common
COPY --from=pruner --chown=node:node /triggerdotdev/studio-v2/activepieces-core-nodes/packages/pieces/core ./studio-v2/activepieces-core-nodes/packages/pieces/core
COPY --from=pruner --chown=node:node /triggerdotdev/studio-v2/activepieces-core-nodes/packages/pieces/community ./studio-v2/activepieces-core-nodes/packages/pieces/community
COPY --from=pruner --chown=node:node /triggerdotdev/studio-v2/activepieces-core-nodes/packages/pieces/framework ./studio-v2/activepieces-core-nodes/packages/pieces/framework
COPY --from=pruner --chown=node:node /triggerdotdev/studio-v2/activepieces-core-nodes/LICENSE ./studio-v2/activepieces-core-nodes/LICENSE
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
