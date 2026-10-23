# MeowWatch

Client de streaming compatible avec les addons Stremio : web, PC, Apple TV, iPhone et Android.

- `maquettes/` : maquettes de la direction artistique (ouvrir `maquettes/index.html`).
  Retenues : C3 pour le web, le PC et la tablette, C4 pour l'Apple TV et le téléphone.

## Lancer l'appli web (phase 1)

```powershell
cd app
npm install
npx expo start --web
```

Puis ouvrir http://localhost:8081. Ajouter ses addons (Torrentio, AIOStreams… configurés avec le debrid) dans la page Addons.

- `app/` : l'appli Expo (web aujourd'hui ; Apple TV, iPhone, Android et PC ensuite).
- `npm test` dans `app/` : tests du protocole des addons. `npm run typecheck` : types.
