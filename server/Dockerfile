ARG NODE_VERSION=24-bookworm-slim
ARG PNPM_VERSION=11.9.0

FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/sudoku-core/package.json packages/sudoku-core/package.json
COPY packages/multiplayer-protocol/package.json packages/multiplayer-protocol/package.json
COPY server/package.json server/package.json

FROM manifests AS build
RUN pnpm install --frozen-lockfile
COPY packages/sudoku-core/src packages/sudoku-core/src
COPY packages/sudoku-core/tsconfig.json packages/sudoku-core/tsconfig.json
COPY packages/multiplayer-protocol/src packages/multiplayer-protocol/src
COPY packages/multiplayer-protocol/tsconfig.json packages/multiplayer-protocol/tsconfig.json
COPY server/src server/src
COPY server/tsconfig.json server/tsconfig.json
COPY server/tsconfig.build.json server/tsconfig.build.json
RUN pnpm --filter @sudoku/core build \
  && pnpm --filter @sudoku/multiplayer-protocol build \
  && pnpm --filter @sudoku/multiplayer-server build

FROM manifests AS production-dependencies
RUN pnpm install --frozen-lockfile --prod --filter @sudoku/multiplayer-server...

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=production-dependencies /app/server/node_modules ./server/node_modules
COPY --chown=node:node --from=production-dependencies /app/packages/multiplayer-protocol/node_modules ./packages/multiplayer-protocol/node_modules
COPY --chown=node:node packages/sudoku-core/package.json packages/sudoku-core/package.json
COPY --chown=node:node --from=build /app/packages/sudoku-core/dist ./packages/sudoku-core/dist
COPY --chown=node:node packages/multiplayer-protocol/package.json packages/multiplayer-protocol/package.json
COPY --chown=node:node --from=build /app/packages/multiplayer-protocol/dist ./packages/multiplayer-protocol/dist
COPY --chown=node:node server/package.json server/package.json
COPY --chown=node:node --from=build /app/server/dist ./server/dist
COPY --chown=node:node server/migrations ./server/migrations
COPY --chown=node:node sudokus/easy.txt sudokus/easy.txt
COPY --chown=node:node sudokus/medium.txt sudokus/medium.txt
COPY --chown=node:node sudokus/hard.txt sudokus/hard.txt
COPY --chown=node:node sudokus/fiendish.txt sudokus/fiendish.txt
COPY --chown=node:node sudokus/diabolical.txt sudokus/diabolical.txt

USER node
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
