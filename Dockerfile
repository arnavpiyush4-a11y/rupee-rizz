FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin tesseract-ocr-ori ca-certificates && rm -rf /var/lib/apt/lists/*
RUN tesseract --version && tesseract --list-langs | grep -Fx eng && tesseract --list-langs | grep -Fx hin && tesseract --list-langs | grep -Fx ori
WORKDIR /app
FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN bash scripts/ocr/best-english.sh models/ocr/best
# Public Supabase settings and private keys are validated at runtime, never baked in.
ENV RR_BUILD_DIST_DIR=.next NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Test-only target: never shipped, accepts private images by read-only mount.
FROM build AS verification
RUN npm ci --prefix scripts/ocr/verification
CMD ["node", "scripts/deploy/test-container.mjs"]

FROM base AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/models/ocr ./models/ocr
COPY --chown=node:node scripts/deploy/public-config.mjs scripts/deploy/start-container.mjs scripts/deploy/verify-ocr.mjs ./scripts/deploy/
COPY --chown=node:node lib/supabase/public-config.js ./lib/supabase/public-config.js
RUN node scripts/deploy/verify-ocr.mjs
USER node
EXPOSE 3000
CMD ["node","scripts/deploy/start-container.mjs"]
