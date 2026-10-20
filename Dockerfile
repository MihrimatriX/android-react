FROM oven/bun:1.4-alpine
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production
COPY src src
RUN mkdir data && chown bun:bun data
USER bun
ENV NODE_ENV=production
EXPOSE 4321
CMD ["bun", "src/server.ts"]
