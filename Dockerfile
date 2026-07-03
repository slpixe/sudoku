FROM node:24-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
RUN pnpm install --frozen-lockfile

ADD . /app/

RUN pnpm build

FROM nginx:1.25.3-alpine-slim
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
