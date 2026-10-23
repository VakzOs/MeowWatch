# MeowWatch

Client de streaming compatible avec les addons Stremio : web, PC, Apple TV, iPhone et Android.
Connexion Discord, réservée au propriétaire et aux personnes qu'il invite.

- `app/` : l'appli Expo (web aujourd'hui ; Apple TV, iPhone, Android et PC ensuite).
- `server/` : petit serveur Node sans dépendance (appli web + API + connexion Discord, SQLite dans `data/`).
- `maquettes/` : direction artistique (C3 web/PC/tablette, C4 Apple TV/téléphone).

## Mise en ligne sur le VPS (comme Meow Streams et Portfolio)

1. Application Discord : https://discord.com/developers/applications → New Application « MeowWatch ».
   Onglet OAuth2 : copier le Client ID et le Client Secret, ajouter la redirection
   `https://meowwatch.vkzdev.com/api/auth/discord/callback`.
2. Sur le VPS :
   ```bash
   git clone https://github.com/VakzOs/MeowWatch.git ~/MeowWatch && cd ~/MeowWatch
   cp .env.example .env && chmod 600 .env && nano .env   # Client ID, secret, ton identifiant Discord
   mkdir -p data && sudo chown 1000:1000 data
   docker compose up -d --build
   ```
3. Tunnel Cloudflare VPS_Oracle : `meowwatch.vkzdev.com` → **HTTP** `172.17.0.1:3500`
   (pas HTTPS, pas localhost : cloudflared tourne en conteneur).

Mise à jour : `cd ~/MeowWatch && git pull && docker compose up -d --build`.

Fiches en français (facultatif) : créer un compte sur https://www.themoviedb.org, demander une clé dans Paramètres > API, la mettre dans `TMDB_API_KEY` du `.env`, puis `docker compose up -d`.

## Développement

```bash
cd app && npm install && npx expo export --platform web   # construit app/dist
cd .. && cp .env.example .env                              # PUBLIC_URL=http://localhost:3500, redirection Discord correspondante
node --env-file=.env server/server.mjs                     # http://localhost:3500
```

Tests : `npm test` dans `app/` (protocole des addons), `node --test server/*.test.mjs` (connexion et invitations).
