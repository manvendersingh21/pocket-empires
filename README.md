# Pocket Empires — Daily 3-Minute Isometric RTS for Reddit (Devvit Web)

A nostalgic, bite-sized **3-minute Daily Real-Time Strategy** game inspired by classic *Age of Empires II* late-night sessions with friends — built natively for **Reddit's Game of the Day Hackathon** on **Devvit Web**.

## Highlights

- **Authentic Isometric AoE Nostalgia:** High-DPI 2D isometric battlefield with 6 biomes (*Sherwood Ford, Black Forest, Golden Basin, Highland Pass, Autumn Steppe, Mirage Oasis*), 3-state Fog of War, interactive diamond minimap, Sacred Relics, Rally Flags, Town Bell defense, Castle Age II Trebuchets, parabolic arrow volleys, and glowing **`WOLOLO!`** Monk conversions.
- **6 Civilizations & Counter-Triangle Combat:** *Britons, Franks, Byzantines, Vikings, Teutons, Mongols* across 3 tactical difficulties (*Standard 1×*, *Veteran 1.2×*, *Imperial 1.35×*) — balance Villagers, Men-at-Arms (2× siege damage vs buildings), Pikemen (3× vs Knights), Longbowmen, Heavy Knights, Watchtowers, and Monks.
- **Everyday Habit Loop & 3-League Redis Leaderboard:**
  - **Today's Siege (`YYYY-MM-DD`)**: Deterministic 180°-symmetric daily battlefield with **3 Daily Royal Bounties** (`+200 pts` each), Rival Challenge gap callout, **7-Day Crown Streak Calendar**, and Royal Pacesetter benchmarks.
  - **Imperial Hall of Fame (`empire:hall_of_fame`)**: Persistent all-time leaderboard ranked by Total Crowns, Best Streak, and Wins, paired with **7 Commander Career Ranks** (*Yeoman* -> *Imperial Strategos*).
  - **Raid Citadels (Clash-Style Player Bases)**: Build, fortify with Stone Portcullis Walls & Farms, publish your citadel, and raid other Redditors' forts for Raid Trophies.
- **Deep Reddit Integration:**
  - Interactive Post Feed Splash (`src/client/splash.tsx`) with personalized heraldic call-to-arms & live `#1` Sovereign pulse
  - Automatic Subreddit User Flair (`👑 Siege Victor` / `🧙 Wololo Lord`)
  - **1-Tap Post War Chronicle to Reddit Comments** + classic AoE Taunts (`30 Wololo!`, `11 Laugh`, `14 Start!`, `1 Yes, my liege!`) + Battle Momentum timeline graph
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
