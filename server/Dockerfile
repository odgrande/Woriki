# Amen City: game + multiplayer server in one small container (Fly.io, Railway, Koyeb, any Docker host).
# Build from the repo root:   docker build -f server/Dockerfile -t amen-city .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 TRUST_PROXY=1
# The server only needs ws + obscenity at runtime (ES modules, hence "type": "module").
RUN echo '{"private":true,"type":"module"}' > package.json \
 && npm install --no-audit --no-fund --omit=dev ws@8.21.3 obscenity@0.4.6
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
