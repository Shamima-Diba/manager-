FROM node:22.23.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps/worker apps/worker
COPY apps/public-site apps/public-site
COPY packages packages
RUN mkdir -p /app/site-output /site && chown -R node:node /app /site
USER node
CMD ["node","--import","tsx","apps/worker/src/main.ts"]
