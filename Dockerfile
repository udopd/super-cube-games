# Platform API image: deliberately excludes the PostgreSQL driver and database credentials.
FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.dependencies.pg;fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\\n')" \
 && npm install --omit=dev --no-audit --no-fund \
 && mkdir -p /app/storage && chown -R node:node /app/storage
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
