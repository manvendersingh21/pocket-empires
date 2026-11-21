# Pocket Empires — Daily 3-Minute Isometric RTS for Reddit (Devvit Web)

A nostalgic, bite-sized **3-minute Daily Real-Time Strategy** game inspired by classic *Age of Empires II* late-night sessions with friends — built natively for **Reddit's Game of the Day Hackathon** on **Devvit Web**.

## Highlights

- **Authentic Isometric AoE Nostalgia:** High-DPI 2D isometric battlefield with 6 biomes (*Sherwood Ford, Black Forest, Golden Basin, Highland Pass, Autumn Steppe, Mirage Oasis*), 3-state Fog of War, interactive diamond minimap, carrying animations, parabolic arrow volleys, and glowing **`WOLOLO!`** Monk conversions.
- **6 Civilizations & Counter-Triangle Combat:** *Britons, Franks, Byzantines, Vikings, Teutons, Mongols* — balance Villagers, Men-at-Arms (2× siege damage vs buildings), Pikemen (3× vs Knights), Longbowmen, Heavy Knights, Watchtowers, and Monks.
- **Calibrated Daily Content (`YYYY-MM-DD`):** Deterministic 180°-symmetric daily battlefields with rotating **Royal Decrees** (*Gold Fever, Age of Wololo, Royal Timber, Call to Arms, Tailwind Volley*), verified fair and solvable by `npm run verify:levels`.
- **Deep Reddit Integration:**
  - Interactive Post Feed Splash (`src/client/splash.tsx`) with personalized heraldic call-to-arms
  - Live Redis Daily Leaderboard + Consecutive Daily Streaks (`🔥`)
  - Subreddit War Room community stats (total battles, fastest Ghost Breach banner, units Wololo'd today)
  - Automatic Subreddit User Flair (`👑 Siege Victor` / `🧙 Wololo Lord`)
  - **1-Tap Post War Chronicle to Reddit Comments** + classic AoE Taunts (`30 Wololo!`, `11 Laugh`, `14 Start!`, `1 Yes, my liege!`)
- **Royal War-Council Tactician & Skirmish Forge:** Real-time **Royal Scout Whispers**, post-battle **War Epigraphs**, and a **Natural-Language Skirmish Forge** (type any battle idea or paste a `PE-...` challenge code from Reddit comments!) powered by the deterministic Royal War-Council Tactician & A*-verified Skirmish Compiler (with optional local browser `window.LanguageModel` support — 100% CSP-compliant inside Devvit Web).
- **Zero-Asset Procedural RTS Audio:** Pure Web Audio synthesizer for `"Shhh-hah!"` villager spawns, wood chops, gold clinks, war horns, taunts, and the iconic `"WO-LO-LO!"` chant.

## Quickstart

```bash
npm install
npm run build          # Builds Vite client (dist/client) + Devvit server (dist/server/index.cjs)
npm test               # Runs unit tests (engine, pathfinding, Wololo, Redis streaks, flair, comments)
npm run verify:levels  # Verifies 30 consecutive Daily Sieges + full simulated victory
npx devvit playtest    # Live playtest on your Reddit test subreddit
```

## Project Structure

| Module | Path |
|---|---|
| Domain types, 6 Civs, 6 Biomes, Units & Buildings | `src/types/rts.ts` |
| Deterministic RTS simulation, AI Warlord, A* & Daily Generator | `src/engine/` |
| High-DPI Isometric AoE Renderer, Minimap & Touch/Mouse Controls | `src/rendering/` |
| Royal War-Council Tactician & Natural-Language Skirmish Forge | `src/ai/` |
| Stone-and-Oak War Room, HUD, Chronicle Modal & Procedural Audio | `src/ui/` |
| Devvit Web Client & Interactive Post Feed Splash | `src/client/` |
| Devvit Server: Redis Leaderboards, Streaks, Flair & Comment API | `src/server/` |
