# Construit l'appli web (Expo) puis la sert avec le petit serveur Node (API + connexion Discord).
FROM node:24-alpine AS web
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
# Date du build, affichée dans Réglages > À propos (vérifier qu'un redéploiement a été pris)
RUN EXPO_PUBLIC_BUILD=$(date -u +%Y-%m-%dT%H:%M:%SZ) npx expo export --platform web

FROM node:24-alpine
ENV NODE_ENV=production PORT=3500 WEB_DIR=/srv/app/dist DB_PATH=/data/meowwatch.db
WORKDIR /srv
COPY server/server.mjs server/
COPY --from=web /src/app/dist app/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3500
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.mjs"]
