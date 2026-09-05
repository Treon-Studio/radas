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
    npm_config_userconfig=/tmp/github-packages.npmrc && \
    npm config set @treon-studio:registry https://npm.pkg.github.com --userconfig "$npm_config_userconfig" && \
    npm config set //npm.pkg.github.com/:_authToken "$token" --userconfig "$npm_config_userconfig" && \
    NPM_CONFIG_USERCONFIG="$npm_config_userconfig" bun install --frozen-lockfile || \
    NPM_CONFIG_USERCONFIG="$npm_config_userconfig" bun install

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
