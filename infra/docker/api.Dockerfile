# API 이미지: pnpm 모노레포 빌드 후 프로덕션 의존성만 포함
FROM node:22.11-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @sen/shared build && pnpm --filter @sen/config build \
 && pnpm --filter @sen/db build && pnpm --filter @sen/rules build \
 && pnpm --filter @sen/retrieval build && pnpm --filter "@sen/api" build

FROM node:22.11-alpine AS run
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable
COPY --from=build /repo ./
EXPOSE 8787
CMD ["node", "apps/api/dist/server.js"]
