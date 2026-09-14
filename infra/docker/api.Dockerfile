# API 이미지: pnpm 모노레포 빌드 후 프로덕션 의존성만 포함
FROM node:22.23.2-alpine AS build
WORKDIR /repo
RUN npm install --global corepack@0.34.7 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @sen/shared build && pnpm --filter @sen/config build \
 && pnpm --filter @sen/db build && pnpm --filter @sen/rules build \
 && pnpm --filter @sen/retrieval build && pnpm --filter "@sen/api" build

FROM node:22.23.2-alpine AS run
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo ./
COPY --chown=node:node wiki/generated ./wiki/generated
RUN for package in shared config db rules retrieval; do sed -i 's#"main": "./src/index.ts"#"main": "./dist/index.js"#' "packages/$package/package.json"; done
# /data는 호스트 볼륨 마운트 지점. named volume이면 이미지의 소유권을 따르고,
# bind mount(NAS)면 호스트에서 `chown -R 1000:1000 $SEN_CONTRACT_DATA_ROOT` 필요.
RUN mkdir -p /data && chown node:node /data && chown -R node:node /repo
USER node
EXPOSE 8787
CMD ["node", "apps/api/dist/server.js"]
