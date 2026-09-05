# syntax=docker/dockerfile:1.7
# Frontend — Vite/React SPA served via nginx
# Build context: repo root  (docker build -f Dockerfile .)

# ---------- build stage ----------
FROM oven/bun:1 AS builder
WORKDIR /app

# Install deps first for better layer caching
COPY package.json bun.lock* ./
RUN --mount=type=secret,id=GH_PACKAGES_TOKEN \
    token="$(cat /run/secrets/GH_PACKAGES_TOKEN)" && \
    printf '%s\n' \
      '@treon-studio:registry=https://npm.pkg.github.com' \
      "//npm.pkg.github.com/:_authToken=$token" > /root/.npmrc && \
    bun install --frozen-lockfile

# Copy source and build
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN bun run build

# ---------- runtime stage ----------
FROM nginx:alpine

# envsubst for entrypoint
RUN apk add --no-cache gettext

COPY nginx-docker.conf /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-frontend.sh
RUN chmod +x /docker-entrypoint-frontend.sh

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint-frontend.sh"]
CMD ["nginx", "-g", "daemon off;"]
