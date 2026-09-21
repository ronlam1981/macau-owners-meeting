FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY meeting-core.js multi.html multi.css multi.js ./
COPY server ./server
RUN mkdir -p /data && chown -R node:node /data
ENV HOST=0.0.0.0 PORT=8787 MEETING_DB=/data/meetings.sqlite
USER node
EXPOSE 8787
CMD ["node", "server/server.cjs"]
