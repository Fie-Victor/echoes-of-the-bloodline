# Échos de la Lignée — MVP navigateur (Phase 1)

Jeu d'action-aventure 3D minimaliste (Three.js) avec PNJ piloté par LLM (Gemini) via WebSocket.

## Tester en local (recommandé pour le micro)

Prérequis : Node.js 20+ et Chrome/Edge (le micro exige `localhost` ou HTTPS).

```bash
npm install
# macOS / Linux
export GOOGLE_API_KEY=...   GRADIUM_API_KEY=...
# Windows PowerShell :  $env:GOOGLE_API_KEY="..."; $env:GRADIUM_API_KEY="..."
npm run dev
```

Ouvrir http://localhost:5173 : page d'accueil (frise des époques). Cliquer « Commencer le voyage », écouter Astra, faire défiler les époques (molette, flèches, ou dire « gauche » / « droite ») puis entrer dans Troie (clic ou « entrer dans cette époque »).
La scène de Troie est aussi accessible directement sur http://localhost:5173/troy.html : cliquer « Commencer », autoriser le micro, s'approcher d'Achille et appuyer sur E puis parler.
Sans clé : IA mockée (`MOCK_AI=1`) et voix du navigateur (`MOCK_VOICE=1`).
Production : `npm run build && npm start` (http://localhost:8787).

Les assets (`client/public/assets`, ~60 Mo) sont fournis dans l'archive / le dépôt. Pour les régénérer depuis les sources CC0/MIT :

```bash
python3 scripts/fetch-assets.py
git clone --depth 1 https://github.com/microsoft/Microsoft-Rocketbox.git ../rocketbox
node scripts/convert-humans.mjs && python3 scripts/convert-human-textures.py
```
(les textures grecques peintes par Gemini ne sont pas régénérées par ces scripts.)

## Contrôles

ZQSD/WASD/flèches bouger · Shift courir · Espace esquiver · Clic gauche attaquer · Souris (ou glisser) caméra · E parler à Achille · T parler à Astra · Échap fermer le dialogue.

## Architecture

- `client/index.html` + `client/src/home/` — page d'accueil : narration Astra (Gradium TTS + sous-titres), cartes d'époques sur une frise temporelle, commandes vocales continues (Gradium STT, socket `/ws/home`). Les époques sont déclarées dans `client/src/home/eras.ts` (`url: null` = faille instable).
- `client/troy.html` — scène 3D de Troie.
- `client/` — Three.js : scène de Troie, joueur TPS, PNJ Achille (state machine idle/angry/suspicious/friendly), drone Astra, overlay hologramme (iframe sandbox).
- `server/` — Node/TS, Express + `ws` sur `/ws`.
  - `brain.ts` — appel Gemini (JSON schema = contrat §5.2), fallback mock si pas de clé / erreur / timeout.
  - `npcs.ts` — mémoire par PNJ : `trust_level`, `patience`, `knowledge_revealed`, historique.
  - `holograms.ts` — mock "Devin" : renvoie un mini-jeu HTML (verrou temporel) quand `trigger_devin_ui = "generate_puzzle_lock"`. Le mini-jeu appelle `window.gameAPI.onPuzzleSolved()`.
- `shared/protocol.ts` — types des messages WebSocket.

Si le PNJ met plus de 2 s à répondre, le client affiche localement « Hmm… laisse-moi réfléchir… ».
La voix utilise pour l'instant `speechSynthesis` du navigateur (placeholder avant Gradium).

## Prochaines étapes

- Gradium STT/TTS en streaming WebSocket + barge-in (VAD).
- Audio spatialisé (PositionalAudio) sur Achille / Astra.
- Raycast joueur → contexte pour Astra.
