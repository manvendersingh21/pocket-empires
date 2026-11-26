# Pocket Empires — Daily 3-Minute RTS Siege (Game Specification)

## 1. Vision & Core Hook
**Pocket Empires** brings the unmistakable camaraderie and nostalgia of classic **Age of Empires II** late-night sessions with friends into a **bite-sized 3-minute Daily Game** built natively for **Reddit (Devvit Web)**.

- **Daily Siege (`YYYY-MM-DD`):** Every day, every Redditor steps onto the exact same procedurally generated, 180°-symmetric `16×16` isometric battlefield with a rotating **Civilization Matchup** (Britons, Franks, Byzantines, Vikings, Teutons, Mongols), **Biome**, **Royal Decree**, and **3 Daily Royal Bounties** across **Standard (1×)**, **Veteran (1.2×)**, or **Imperial (1.35×)** difficulty.
- **Core Loop (2–4 minutes):**
  1. Harvest **Wood (`🌲`)**, **Food (`🍖`)**, and **Gold (`🪙`)** around your Town Center, herd Sheep/Boars, and claim contested **Sacred Relics** for steady passive Gold.
  2. Erect a **Homestead Camp**, **Farm**, **Stone Wall**, **Barracks**, **Archery Range**, **Stable**, **Monastery**, or **Watchtower**, and set custom **Rally Points** or ring the **Town Bell** under pressure.
  3. Advance to **Castle Age II**, train **Counterweight Trebuchets**, counter the Rival Warlord's army (Pikemen 3× vs Knights, Knights crush Archers, Monks chant **`WOLOLO!`** to convert enemy units!), and **raze the Enemy Town Center** before Par Time for `👑👑👑`.

## 2. Reddit-Native Ecosystem & Everyday Habit Architecture
- **Interactive Post Splash (`src/client/splash.tsx`):** Personalized `My Liege u/{username}` heraldic feed card displaying Today's Siege `#`, Map Name, Civilization Matchup, live `#1` Sovereign pulse, and one-tap launch into full-screen Expanded Mode.
- **3-League Redis Leaderboard & Career Progression (`src/server/empire.ts`, `src/engine/career.ts`):** Tracks **Today's Siege**, all-time **Imperial Hall of Fame** (cumulative Crowns & best streaks), **Raid Citadels** (Clash-style player bases), consecutive daily win streaks (`🔥`), 7-day Crown Calendar strip, and 7 Commander Career Ranks (`Yeoman` -> `Imperial Strategos`).
- **Automatic Subreddit User Flair:** Unlocks dynamic flair (`👑 Siege Victor · 🔥 Xd` or `🧙 Wololo Lord · 🔥 Xd`) via `reddit.setUserFlair`.
- **1-Tap Post War Chronicle to Comments:** Posts your spoiler-free battle chronicle (and shareable `PE-...` custom skirmish codes!) directly to the Reddit post thread via `reddit.submitComment` (with automatic clipboard fallback).
- **Classic AoE Taunt Wheel:** `[30] Wololo!`, `[11] Laugh`, `[14] Start the game already!`, `[1] Yes, my liege!` — pulling off a conversion right after taunting `30` unlocks the **Cheeky Wololo** stamp!

## 3. Royal War-Council Tactician & Skirmish Forge (`src/ai/hybridAdvisor.ts`)
Designed with zero generic filler and zero external network calls (100% Devvit Web CSP compliant):
1. **Deterministic Royal War-Council Tactician:** Instant counter-unit battlefield whispers (*Pikemen vs Knights, Knights vs Archers, Housed alerts, Siege timing*) and commemorative post-battle **War Epigraphs**.
2. **Natural-Language Skirmish Forge & `PE-...` Share Codes:** Compiles plain-English battle prompts (*"Black forest monk rush with extra gold"*) into A*-verified walkable `SkirmishSpec` battlefields and compact `PE-...` Reddit Challenge Codes, with optional local browser `window.LanguageModel` enrichment when available.
