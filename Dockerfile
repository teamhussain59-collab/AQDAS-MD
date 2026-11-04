FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl git \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# postinstall (scripts/patch-baileys.mjs) ko scripts/ chahiye — isi liye pehle copy
COPY scripts ./scripts
RUN npm install --omit=dev
COPY . .
ENV WEB=true NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
