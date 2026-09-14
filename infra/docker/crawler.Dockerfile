# 크롤러/인제스트 작업용 이미지 (필요 시 Playwright 브라우저 포함 변형은 별도 태그)
FROM node:22.23.2-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global corepack@0.34.7 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY workers ./workers
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @sen/shared build && pnpm --filter @sen/config build \
 && pnpm --filter @sen/db build && pnpm --filter "@sen/crawler" build \
 && pnpm --filter "@sen/ingest" build

FROM node:22.23.2-bookworm-slim AS run
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo ./
RUN for package in shared config db rules retrieval; do sed -i 's#"main": "./src/index.ts"#"main": "./dist/index.js"#' "packages/$package/package.json"; done
# /data는 호스트 볼륨 마운트 지점. bind mount면 호스트에서 uid 1000 쓰기 권한 필요.
RUN mkdir -p /data && chown node:node /data && chown -R node:node /repo
USER node
# 기본 엔진은 http. JS 렌더링이 필요해지는 경우에만 playwright 설치:
# RUN npx playwright install --with-deps chromium
CMD ["node", "workers/crawler/dist/cli.js", "incremental"]
