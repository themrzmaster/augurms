FROM node:20-bookworm-slim AS base

# System libs needed at build time to compile `canvas` and `gl` native addons.
# `gl` (headless-gl) needs mesa/X11 headers; `canvas` needs cairo/pango/libjpeg/etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python-is-python3 make g++ pkg-config \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      libxi-dev libgl1-mesa-dev libglu1-mesa-dev \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Build ---
FROM base AS builder
WORKDIR /app
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Production ---
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runtime libs for the compiled native modules (no headers needed here).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 \
      librsvg2-2 libpixman-1-0 \
      libxi6 libgl1 libglu1-mesa libxext6 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/launcher-manifest.json ./launcher-manifest.json

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
