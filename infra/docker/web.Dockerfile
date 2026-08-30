# 웹 이미지: Next.js standalone 출력 사용
FROM node:22.23.2-alpine AS build
WORKDIR /repo
RUN npm install --global corepack@0.34.7 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile=false
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN pnpm --filter web build

FROM node:22.23.2-alpine AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
