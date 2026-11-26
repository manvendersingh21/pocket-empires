# Pocket Empires — Staff Engineering & Game Psychology Ledger

## 1. What We Are Building

**Pocket Empires** is a daily 3-minute, classic *Age of Empires II*-inspired isometric real-time strategy game built natively for **Reddit Devvit Web**:
- **Zero-Friction Feed Entry (`src/client/splash.tsx`):** Personalized heraldic card with a custom isometric river-ford SVG diorama, Today's Siege `#`, Map Name, Royal Decree, live Subreddit `#1` Sovereign callout, and 1-tap launch into full-screen Expanded Mode.
- **Tactical 20 Hz Deterministic RTS (`src/engine/sim.ts`):** Gather Wood, Berry Food, Pond Fish, Wheat Farms, Sheep, Boars, and Gold; build Homesteads, Stone Portcullis Walls, Barracks, Archery Ranges, Stables, Monasteries, and Watchtowers; tame Wild Horses; claim contested **Sacred Relics** for steady passive Gold; advance to **Castle Age II** to unlock **Counterweight Trebuchets**; ring the **Town Bell**; set per-building **Rally Points**; and convert enemy knights with **`WOLOLO!`** Monks.
- **3-League Persistent Redis Leaderboard (`src/server/empire.ts`, `src/engine/leaderboardModel.ts`):**
  1. **Today's Siege (`empire:daily:{date}:board`):** Daily score + time tie-break top 15 with Royal Pacesetters (`Gold Sovereign`, `Silver Warden`, `Bronze Yeoman`) when a fresh subreddit post has fewer than 4 human winners.
  2. **Imperial Hall of Fame (`empire:hall_of_fame`):** Persistent all-time rankings by Total Crowns, Best Streak, Best Score, and Daily Wins (protected against same-day crown farming).
  3. **Raid Citadels (`empire:bases:index`):** Clash-style asynchronous player forts ranked by Raid Trophies and Defense Wins.
- **Long-Horizon Progression (`src/engine/dailyBounties.ts`, `src/engine/career.ts`):** 3 daily rotating Royal Bounties (`+200 pts` each), a 7-day Crown Calendar Strip (clickable to replay past days), and 7 Imperial Commander Ranks (`Yeoman` -> `Imperial Strategos`).

---

## 2. Behavioral Game Psychology Architecture (Why People Play Everyday)

| Psychological Driver | Mechanism Implemented in Pocket Empires | Exact Code Location |
|---|---|---|
| **Variable Daily Novelty & Curiosity** | Every `YYYY-MM-DD` generates a distinct deterministic 180°-symmetric battlefield (`6` biomes, `6` civs, `5` Royal Decrees, `4` chokepoints, `4` AI leaders) plus `3` daily Royal Bounties (`Economy`, `Tactical`, `Mastery`) and `3` selectable difficulties (`Standard 1×`, `Veteran 1.2×`, `Imperial 1.35×`). | `src/engine/dailyGenerator.ts`, `src/engine/dailyBounties.ts` |
| **Goal-Gradient & Near-Miss Rivalry** | Live **Rival Challenge** banner computes the exact point gap (or tie-break second gap) separating the player from `#1` or the next commander immediately above them, and highlights uncompleted Daily Bounties on the Victory Chronicle. | `src/engine/leaderboardModel.ts`, `src/ui/ChronicleModal.tsx` |
| **Loss Aversion & Calendar Investment** | Consecutive UTC daily win streak (`🔥`), Subreddit User Flair (`👑 Siege Victor` / `🧙 Wololo Lord`), and a visual **7-Day Crown Calendar Strip** make skipping a day feel tangible while rewarding imperfect wins (1–3 Crowns). | `src/server/empire.ts`, `src/engine/career.ts`, `src/ui/WarRoomScreen.tsx` |
| **Long-Horizon Mastery** | Persistent **Commander Career XP** (`Yeoman` through `Imperial Strategos`) and all-time **Imperial Hall of Fame** (`totalCrowns`, `bestStreak`, `wins`) ensure every match progresses permanent standing even on replays or defeats. | `src/engine/career.ts`, `src/server/empire.ts` |
| **Social Proof & Asynchronous Rivalry** | Feed Splash highlights Today's `#1` Commander and total players; **Ghost Breach** marks the fastest commander's river crossing on the map; **1-Tap Chronicle Comment** posts spoiler-free results + `PE-...` Challenge Codes to Reddit threads; players raid each other's saved Citadels. | `src/client/splash.tsx`, `src/client/App.tsx`, `src/server/empire.ts` |
| **Tactile Micro-Dopamine & Agency** | Crisp 60fps Canvas combat hit-flashes, sparks, building collapse embers, Sacred Relic light shafts, Rally pennants, AoE II Battle Momentum power graph, procedural Web Audio horns/bells/Wololo chants, and `1× / 1.5× / 2×` speed control. | `src/rendering/IsoCanvas.tsx`, `src/ui/sound.ts`, `src/ui/EmpireHud.tsx` |

---

## 3. What Failed & Deterministic Checks Converted (Golden Rule Ledger)

| # | Incident / Failure Observed | Root Cause | Deterministic Check / Refactor Added |
|---|---|---|---|
| **1** | Session `ec2dc4d7` interrupted leaving `IsoCanvas.tsx` with 4 TypeScript errors (`Relic` import missing and unnarrowed union branch), yet root `npx tsc --noEmit` exited `0`. | Root `tsconfig.json` only included `src/shared`, `src/types`, `src/engine`, and `src/ai`, omitting `src/client`, `src/ui`, and `src/rendering`. | Added `"typecheck": "tsc --noEmit && tsc -p src/client/tsconfig.json --noEmit"` to `package.json` and wired it directly into both `npm test` and `npm run build`. |
| **2** | `App.tsx` gated backend `/api/empire/*` calls on `window.location.port === '3000'`, silencing live leaderboard & base APIs on preview tunnels (`5174`) and ephemeral verification ports. | Fragile local-host port check used as a proxy for API availability instead of checking response MIME type. | Replaced port hardcoding with a port-agnostic `fetchApiJson` helper (`Content-Type: application/json` check) while keeping `journeys.*` Devvit telemetry isolated to production hosts, and mounted real `src/server/empire.ts` routes inside `scripts/verify-runtime.mjs`. |
| **3** | Watchtower attack range ring looked squashed vertically relative to actual tile distance on the isometric diamond grid. | `drawPlacementPreview` projected tile radius directly as `(TILE_W/2, TILE_H/2)` instead of scaling by `Math.SQRT2` for 45°-rotated isometric tiles. | Standardized isometric range ellipses (`radius * Math.SQRT2 * (TILE_W / 2)`) across placement previews and selection overlays in `src/rendering/IsoCanvas.tsx`. |
| **4** | Passive Sacred Relic gold income could break the accounting invariant `resources.player.gold - startGold === stats.goldGathered`. | Passive gold generators can silently diverge from `MatchStats` if `stats.goldGathered` is forgotten. | Enforced dual credit of both `state.resources[team].gold` and `state.stats.goldGathered` (for `'player'`) inside `stepRelics`, verified by unit & property tests. |
| **5** | Risk of Reddit Devvit deployment drift (`devvit.json` entrypoints, permissions, or menu/trigger endpoints falling out of sync with `src/server/index.ts` or missing Vite builds). | No static gate verified `devvit.json` against `src/server/index.ts` and `package.json`. | Added **Rule 8 (`DEVVIT_PRODUCTION_CONTRACT`)** to `scripts/check-invariants.mjs` checking `devvit.json`, trigger/menu endpoints in `src/server/index.ts`, and `package.json` `typecheck`. |

---

## 4. Real-Life Reddit Devvit Production Deployment Runbook

Run from the repository root (`/home/daytona/momentum-step1` or `/home/daytona/pocket-empires`):

```bash
# 1. Verify all 8 architectural invariants, full TypeScript, unit/property tests & 30-day level solver
npm test
npm run verify:levels

# 2. Build production WebView client (dist/client) & Devvit server bundle (dist/server/index.cjs)
npm run build

# 3. Run Playwright headless Chromium E2E suite (Splash + Desktop 1280x800 + Mobile 390x844 + Real Redis API)
npm run verify:runtime

# 4. Authenticate with Reddit Devvit CLI (first time) and playtest or upload to Reddit
npx devvit login
npx devvit playtest   # Live playtest on your Reddit test subreddit
npx devvit upload     # Publish production build to Reddit
```
