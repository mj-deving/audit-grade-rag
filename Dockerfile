FROM node:22-bookworm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
ENV PORT=3000
ENV AUDIT_LEDGER_PATH=/var/lib/audit-grade-rag/audit.sqlite
ENV CORPUS_DIR=examples/eu-ai-act
VOLUME ["/var/lib/audit-grade-rag"]
EXPOSE 3000
CMD ["pnpm", "start"]
