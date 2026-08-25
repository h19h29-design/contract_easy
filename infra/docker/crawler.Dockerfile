# 크롤러/인제스트 작업용 이미지 (필요 시 Playwright 브라우저 포함 변형은 별도 태그)
FROM node:22.11-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY workers ./workers
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @sen/shared build && pnpm --filter @sen/config build \
 && pnpm --filter @sen/db build && pnpm --filter "@sen/crawler" build \
 && pnpm --filter "@sen/ingest" build

FROM node:22.11-bookworm-slim AS run
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable
COPY --from=build /repo ./
# 기본 엔진은 http. JS 렌더링이 필요해지는 경우에만 playwright 설치:
# RUN npx playwright install --with-deps chromium
CMD ["node", "workers/crawler/dist/cli.js", "incremental"]
