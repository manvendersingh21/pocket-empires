#!/usr/bin/env node
/**
 * Pocket Empires — Headless Chromium Runtime & Feature-Map Verifier
 *
 * Implements Layer 3 of the High-Trust Agent Engineering Playbook:
 *  - Loads & validates `FEATURE_MAP.json` (all 19 user-facing selectors + source file links)
 *  - Serves `dist/client` on an ephemeral local HTTP port (`127.0.0.1:0`)
 *  - Launches `/usr/bin/chromium` via `playwright-core`
 *  - Verifies Splash (`560x420` & `360x380`) with strict zero scroll overflow (`scrollHeight <= clientHeight + 1`)
 *  - Verifies Desktop (`1280x800`) and Mobile (`390x844`) end-to-end flows:
 *      War Room + Practice Archive -> Skirmish Forge craft -> Play Daily -> Onboarding + Speed Toggle ->
 *      Build mode ghost -> Scout Advisor -> Taunt popover -> Desktop Victory ChronicleModal (`Control+Shift+V`)
 *  - Saves optional PNG screenshot artifacts when `--screenshots <dir>` is passed
 *  - Asserts `0` console errors and `0` uncaught page errors across every viewport
 *  - Prints a structured PASS table
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../node_modules/playwright-core/index.mjs';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      specifier.endsWith('.js') &&
      context.parentURL?.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsCandidate = path.resolve(parentDir, specifier.slice(0, -3) + '.ts');
      if (existsSync(tsCandidate)) {
        return nextResolve(new URL(`file://${tsCandidate}`).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  getDailyWarRoom,
  getLeaderboardHub,
  getPlayerBase,
  listPlayerBases,
  recordMatchCompletion,
  recordRaidResult,
  savePlayerBase,
  submitWarChronicleComment,
  todayUtcDateKey,
} = await import('../src/server/empire.ts');
const { handleClientMessage } = await import('../src/server/ping.ts');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DIST_CLIENT_DIR = path.join(REPO_ROOT, 'dist', 'client');
const FEATURE_MAP_PATH = path.join(REPO_ROOT, 'FEATURE_MAP.json');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

const REQUIRED_FEATURES = [
  'splash_play_cta',
  'war_room_play_daily',
  'home_my_base_btn',
  'home_raid_players_btn',
  'home_leaderboard_btn',
  'home_settings_btn',
  'war_room_difficulty_bar',
  'war_room_bounties',
  'war_room_week_strip',
  'settings_close_btn',
  'war_room_ranks_tab',
  'leaderboard_league_tabs',
  'skirmish_forge_tab',
  'forge_prompt_input',
  'forge_craft_btn',
  'war_room_archive_play',
  'hud_publish_base_btn',
  'hud_empire_name_input',
  'hud_demolish_btn',
  'hud_raid_destruction_pill',
  'hud_age_up_btn',
  'hud_train_trebuchet',
  'hud_resource_ledger',
  'hud_scout_advisor_btn',
  'hud_taunt_btn',
  'hud_speed_toggle',
  'hud_onboarding_steps',
  'hud_keep_btn',
  'hud_selection_inspector',
  'squad_idle_villager',
  'squad_all_army',
  'squad_siege_keep',
  'dock_mode_train',
  'dock_mode_build',
  'minimap_canvas',
  'chronicle_modal',
  'chronicle_rival_banner',
  'chronicle_momentum_chart',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Parses optional `--screenshots <dir>` or `--screenshots=<dir>` CLI flag.
 * @param {string[]} argv
 * @returns {string | null}
 */
function parseScreenshotsDir(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--screenshots') {
      const next = argv[i + 1];
      assertCondition(
        typeof next === 'string' && next.trim().length > 0 && !next.startsWith('--'),
        'Expected directory path after "--screenshots".',
      );
      return path.resolve(next.trim());
    }
    if (arg.startsWith('--screenshots=')) {
      const val = arg.slice('--screenshots='.length).trim();
      assertCondition(val.length > 0, 'Expected non-empty directory path in "--screenshots=<dir>".');
      return path.resolve(val);
    }
  }
  return null;
}

/**
 * Loads `FEATURE_MAP.json` and validates every required key, metadata field, and file reference.
 */
function loadAndValidateFeatureMap() {
  assertCondition(
    existsSync(FEATURE_MAP_PATH),
    `Missing FEATURE_MAP.json at ${FEATURE_MAP_PATH}.`,
  );
  const raw = JSON.parse(readFileSync(FEATURE_MAP_PATH, 'utf8'));
  assertCondition(raw && typeof raw === 'object', 'FEATURE_MAP.json root must be an object.');

  for (const key of REQUIRED_FEATURES) {
    const entry = raw[key];
    assertCondition(entry && typeof entry === 'object', `FEATURE_MAP.json missing "${key}".`);
    for (const field of ['route', 'component', 'file', 'selectorRoleOrText', 'description']) {
      assertCondition(
        typeof entry[field] === 'string' && entry[field].trim().length > 0,
        `FEATURE_MAP.json["${key}"].${field} must be a non-empty string.`,
      );
    }
    const sourceAbs = path.join(REPO_ROOT, entry.file);
    assertCondition(
      existsSync(sourceAbs),
      `FEATURE_MAP.json["${key}"].file points to missing file "${entry.file}".`,
    );
  }

  return raw;
}

/**
 * Starts a clean static HTTP server serving `dist/client` on `127.0.0.1:0`.
 * @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>}
 */
async function startStaticClientServer() {
  for (const htmlFile of ['splash.html', 'game.html']) {
    const target = path.join(DIST_CLIENT_DIR, htmlFile);
    assertCondition(
      existsSync(target),
      `Missing built asset ${target}. Run "npm run build:client" before "node scripts/verify-runtime.mjs".`,
    );
  }

  const store = new Map();
  const redis = {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
  const reddit = {
    async setUserFlair() {
      return;
    },
    async submitComment() {
      return { id: 't1_verify_comment' };
    },
  };
  const today = todayUtcDateKey();
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'GameOnReddit',
    username: 'TheViper_AoE',
    dateKey: today,
    victory: true,
    score: 3640,
    timeSec: 114,
    crowns: 3,
    strategy: 'Heavy Cavalry Charge',
    wololos: 1,
  });
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'GameOnReddit',
    username: 'LordDaut',
    dateKey: today,
    victory: true,
    score: 3320,
    timeSec: 132,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 3,
  });
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'GameOnReddit',
    username: 'SpiritOfTheLaw',
    dateKey: today,
    victory: true,
    score: 2980,
    timeSec: 158,
    crowns: 2,
    strategy: 'Yeoman Longbow Volley',
    wololos: 0,
  });

  const sendJson = (res, status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };

  const readJsonBody = (req) =>
    new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'));
        } catch {
          resolve({});
        }
      });
    });

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (reqUrl.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && reqUrl.pathname === '/api/ping') {
        const body = await readJsonBody(req);
        const reply = handleClientMessage(body);
        sendJson(res, reply ? 200 : 400, reply ?? { error: 'invalid ping' });
        return;
      }

      if (req.method === 'GET' && reqUrl.pathname === '/api/empire/daily') {
        const dateKey = reqUrl.searchParams.get('date') || today;
        const data = await getDailyWarRoom(redis, dateKey, 'Commander');
        sendJson(res, 200, data);
        return;
      }

      if (req.method === 'GET' && reqUrl.pathname === '/api/empire/leaderboard') {
        const dateKey = reqUrl.searchParams.get('date') || today;
        const data = await getLeaderboardHub(redis, dateKey, 'Commander');
        sendJson(res, 200, data);
        return;
      }

      if (req.method === 'POST' && reqUrl.pathname === '/api/empire/complete') {
        const body = await readJsonBody(req);
        const result = await recordMatchCompletion(redis, reddit, {
          subredditName: 'GameOnReddit',
          username: 'Commander',
          dateKey: typeof body.dateKey === 'string' ? body.dateKey : today,
          victory: Boolean(body.victory),
          score: Number(body.score ?? 0),
          timeSec: Number(body.timeSec ?? 1),
          crowns: Number(body.crowns ?? 0),
          strategy: typeof body.strategy === 'string' ? body.strategy : 'Combined Arms Siege',
          wololos: Number(body.wololos ?? 0),
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && reqUrl.pathname === '/api/empire/comment') {
        const body = await readJsonBody(req);
        const result = await submitWarChronicleComment(redis, reddit, {
          postId: 't3_verify_daily_siege',
          username: 'Commander',
          dateKey: typeof body.dateKey === 'string' ? body.dateKey : today,
          text: typeof body.text === 'string' ? body.text : '',
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && reqUrl.pathname === '/api/empire/bases') {
        const excludeOwner = reqUrl.searchParams.get('excludeOwner')?.trim() || undefined;
        const [bases, myBase] = await Promise.all([
          listPlayerBases(redis, excludeOwner),
          getPlayerBase(redis, 'Commander'),
        ]);
        sendJson(res, 200, { bases, myBase });
        return;
      }

      if (req.method === 'POST' && reqUrl.pathname === '/api/empire/bases') {
        const raw = await readJsonBody(req);
        const p =
          raw && raw.base && typeof raw.base === 'object' && !Array.isArray(raw.base)
            ? raw.base
            : raw;
        const base = await savePlayerBase(redis, {
          owner: 'Commander',
          empireName: typeof p.empireName === 'string' ? p.empireName : undefined,
          civ: p.civ,
          biome: p.biome,
          buildings: Array.isArray(p.buildings) ? p.buildings : [],
          garrison: Array.isArray(p.garrison) ? p.garrison : [],
        });
        const bases = await listPlayerBases(redis);
        sendJson(res, base ? 200 : 400, { saved: Boolean(base), base, bases });
        return;
      }

      if (req.method === 'POST' && reqUrl.pathname === '/api/empire/raid') {
        const p = await readJsonBody(req);
        const defender = typeof p.defender === 'string' ? p.defender : 'TheViper_AoE';
        const result = await recordRaidResult(redis, {
          attacker: 'Commander',
          defender,
          victory: Boolean(p.victory),
        });
        const [bases, myBase] = await Promise.all([
          listPlayerBases(redis),
          getPlayerBase(redis, 'Commander'),
        ]);
        sendJson(res, 200, {
          recorded: true,
          trophiesDelta: result.trophiesDelta,
          defenderBase: result.defenderBase,
          bases,
          myBase,
        });
        return;
      }

      const relPath = decodeURIComponent(reqUrl.pathname === '/' ? '/game.html' : reqUrl.pathname);
      const safeTarget = path.resolve(DIST_CLIENT_DIR, `.${relPath}`);
      if (!safeTarget.startsWith(DIST_CLIENT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      if (!existsSync(safeTarget) || !statSync(safeTarget).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not found: ${relPath}`);
        return;
      }

      const ext = path.extname(safeTarget).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(safeTarget));
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}

/**
 * Attaches console.error and uncaught pageerror listeners to a Playwright Page.
 * @param {import('playwright-core').Page} page
 */
function attachErrorCollectors(page) {
  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err?.stack || err?.message || String(err));
  });

  return { consoleErrors, pageErrors };
}

/**
 * Waits two animation frames inside the browser so Canvas RAF loops settle cleanly.
 * @param {import('playwright-core').Page} page
 */
async function waitAnimationFrames(page, count = 2) {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
  }, count);
}

/**
 * Verifies `/splash.html` at a given viewport (`560x420` or `360x380`), asserting
 * `scrollHeight <= clientHeight + 1`, visible CTA within viewport bounds, and 0 errors.
 */
async function verifySplashViewport(browser, baseUrl, featureMap, viewport, label, screenshotsDir) {
  const startedAt = performance.now();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width <= 380 ? 2 : 1,
  });
  const page = await context.newPage();
  const { consoleErrors, pageErrors } = attachErrorCollectors(page);

  try {
    await page.goto(`${baseUrl}/splash.html`, { waitUntil: 'domcontentloaded' });
    const playCta = page.locator(featureMap.splash_play_cta.selectorRoleOrText);
    await playCta.waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('.pe-pulse-live').waitFor({ state: 'visible', timeout: 5000 });
    await waitAnimationFrames(page, 2);

    if (screenshotsDir) {
      await page.screenshot({
        path: path.join(screenshotsDir, `splash-${viewport.width}x${viewport.height}.png`),
      });
    }

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const splash = document.querySelector('.pe-splash');
      const diorama = document.querySelector('.pe-diorama-slot svg');
      const bodyText = document.body.innerText || '';
      return {
        docScrollHeight: doc.scrollHeight,
        docClientHeight: doc.clientHeight,
        docScrollWidth: doc.scrollWidth,
        docClientWidth: doc.clientWidth,
        splashScrollHeight: splash ? splash.scrollHeight : -1,
        splashClientHeight: splash ? splash.clientHeight : -1,
        hasDioramaSvg: Boolean(diorama),
        hasTitle: bodyText.includes('POCKET EMPIRES'),
        hasLeaderPulse: bodyText.includes('TheViper_AoE'),
      };
    });

    assertCondition(metrics.hasTitle, `${label}: Splash title "POCKET EMPIRES" missing.`);
    assertCondition(metrics.hasLeaderPulse, `${label}: Splash live #1 leader pulse missing.`);
    assertCondition(metrics.hasDioramaSvg, `${label}: Isometric diorama SVG missing.`);
    assertCondition(
      metrics.docScrollHeight <= metrics.docClientHeight + 1,
      `${label}: Document vertical scroll overflow (${metrics.docScrollHeight} > ${metrics.docClientHeight} + 1).`,
    );
    assertCondition(
      metrics.docScrollWidth <= metrics.docClientWidth + 1,
      `${label}: Document horizontal scroll overflow (${metrics.docScrollWidth} > ${metrics.docClientWidth} + 1).`,
    );
    assertCondition(
      metrics.splashScrollHeight > 0 &&
        metrics.splashScrollHeight <= metrics.splashClientHeight + 1,
      `${label}: .pe-splash vertical scroll overflow (${metrics.splashScrollHeight} > ${metrics.splashClientHeight} + 1).`,
    );

    const ctaBox = await playCta.boundingBox();
    assertCondition(ctaBox !== null, `${label}: splash_play_cta has null boundingBox.`);
    assertCondition(
      ctaBox.x >= 0 &&
        ctaBox.y >= 0 &&
        ctaBox.x + ctaBox.width <= viewport.width + 1 &&
        ctaBox.y + ctaBox.height <= viewport.height + 1,
      `${label}: splash_play_cta clipped outside ${viewport.width}x${viewport.height} (${JSON.stringify(ctaBox)}).`,
    );

    assertCondition(
      consoleErrors.length === 0,
      `${label}: Expected 0 console errors, got: ${consoleErrors.join(' | ')}`,
    );
    assertCondition(
      pageErrors.length === 0,
      `${label}: Expected 0 page errors, got: ${pageErrors.join(' | ')}`,
    );

    return {
      suite: label,
      viewport: `${viewport.width}x${viewport.height}`,
      detail: `scroll ${metrics.docScrollHeight}/${metrics.docClientHeight}px · CTA in-bounds`,
      errors: `${consoleErrors.length} / ${pageErrors.length}`,
      ms: Math.round(performance.now() - startedAt),
      status: 'PASS',
    };
  } finally {
    await context.close();
  }
}

/**
 * Exercises the full War Room + Practice Archive -> Skirmish Forge craft -> Play Daily ->
 * Onboarding + Speed Toggle -> Build mode ghost -> Scout Advisor -> Taunt popover ->
 * Desktop End-State Victory ChronicleModal (`Control+Shift+V`) journey.
 */
async function verifyGameFlow(browser, baseUrl, featureMap, opts) {
  const { label, viewport, isMobile, screenshotsDir } = opts;
  const shotPrefix = isMobile ? 'mobile' : 'desktop';
  const startedAt = performance.now();
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 2 : 1,
  });
  const page = await context.newPage();
  const { consoleErrors, pageErrors } = attachErrorCollectors(page);

  const loc = (featureKey) => page.locator(featureMap[featureKey].selectorRoleOrText);

  try {
    await page.goto(`${baseUrl}/game.html`, { waitUntil: 'domcontentloaded' });

    // 1. Translucent Home War Room + Habit Card + 3-League Leaderboard Button over Live Isometric Village
    await loc('war_room_play_daily').waitFor({ state: 'visible', timeout: 8000 });
    await loc('home_my_base_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('home_raid_players_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('home_leaderboard_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('home_settings_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('war_room_difficulty_bar').waitFor({ state: 'visible', timeout: 5000 });
    await loc('war_room_bounties').waitFor({ state: 'visible', timeout: 5000 });
    await loc('war_room_week_strip').waitFor({ state: 'visible', timeout: 5000 });

    const warRoomMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const c = document.querySelector('main canvas');
      return {
        hasCanvas: Boolean(c && c.width > 0 && c.height > 0),
        docScrollHeight: doc.scrollHeight,
        docClientHeight: doc.clientHeight,
        docScrollWidth: doc.scrollWidth,
        docClientWidth: doc.clientWidth,
      };
    });
    assertCondition(
      warRoomMetrics.hasCanvas,
      `${label}: Expected live isometric village canvas rendered behind translucent Home overlay.`,
    );
    assertCondition(
      warRoomMetrics.docScrollHeight <= warRoomMetrics.docClientHeight + 1 &&
        warRoomMetrics.docScrollWidth <= warRoomMetrics.docClientWidth + 1,
      `${label}: War Room overflowed viewport (${JSON.stringify(warRoomMetrics)}).`,
    );

    await waitAnimationFrames(page, 4);
    if (screenshotsDir) {
      await page.screenshot({
        path: path.join(screenshotsDir, `${shotPrefix}-war-room.png`),
      });
    }

    // 1b. Open 3-League Leaderboard Hub directly from War Room & cycle Today's Siege -> Hall of Fame -> Raid Citadels
    await loc('home_leaderboard_btn').click();
    await loc('leaderboard_league_tabs').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="league-tab-hall"]').click();
    await page.locator('[data-testid="league-tab-raids"]').click();
    await page.locator('[data-testid="league-tab-daily"]').click();
    if (screenshotsDir && !isMobile) {
      await waitAnimationFrames(page, 2);
      await page.screenshot({
        path: path.join(screenshotsDir, 'desktop-leaderboard.png'),
      });
    }
    await loc('settings_close_btn').click();

    // 2. Raid Players Sheet & Live Raid Destruction Pill
    await loc('home_raid_players_btn').click();
    const raidSheet = page.locator('[data-testid="raid-target-sheet"]');
    await raidSheet.waitFor({ state: 'visible', timeout: 5000 });
    const firstRaidBtn = page.locator('[data-testid="raid-attack-0"]');
    await firstRaidBtn.waitFor({ state: 'visible', timeout: 5000 });
    if (screenshotsDir && !isMobile) {
      await waitAnimationFrames(page, 2);
      await page.screenshot({
        path: path.join(screenshotsDir, 'desktop-raid-players.png'),
      });
    }
    await firstRaidBtn.click();
    const raidDestructionPill = loc('hud_raid_destruction_pill');
    await raidDestructionPill.waitFor({ state: 'visible', timeout: 5000 });
    const raidPillText = (await raidDestructionPill.innerText()).trim();
    assertCondition(
      raidPillText.includes('% Destroyed'),
      `${label}: Expected live Raid Destruction pill text, got "${raidPillText}".`,
    );
    await page.locator('[data-testid="hud-settings-btn"]').click();
    await page.locator('role=button[name="Exit to Main Menu"s]').click();
    await loc('war_room_play_daily').waitFor({ state: 'visible', timeout: 5000 });

    // 3. Settings Drawer -> War Room Ranks & Archive -> Skirmish Forge
    await loc('home_settings_btn').click();
    await loc('war_room_ranks_tab').waitFor({ state: 'visible', timeout: 5000 });
    await loc('war_room_ranks_tab').click();
    await loc('war_room_archive_play').waitFor({ state: 'visible', timeout: 5000 });

    await loc('skirmish_forge_tab').click();
    const promptInput = loc('forge_prompt_input');
    await promptInput.waitFor({ state: 'visible', timeout: 5000 });
    await promptInput.fill(
      isMobile
        ? 'Mirage Oasis Mongols Cavalry Blitz vs Teutons'
        : 'Black Forest Byzantines Wololo Cult vs Franks',
    );
    await loc('forge_craft_btn').click();

    const shareCodePill = page.locator('button[title="Copy Share Code"]');
    await shareCodePill.waitFor({ state: 'visible', timeout: 5000 });
    const shareCodeText = (await shareCodePill.innerText()).trim();
    assertCondition(
      /^PE-[0-5]{4}[0-3]{2}-[0-9A-F]{6}$/.test(shareCodeText),
      `${label}: Invalid crafted Share Code "${shareCodeText}".`,
    );
    await page.locator('role=button[name="Launch Custom Siege"s]').waitFor({
      state: 'visible',
      timeout: 5000,
    });
    await loc('settings_close_btn').click();

    // 4. My Base Builder (Citadel Naming, Demolish 75% Refund, Castle Age II, Trebuchet, Farms, Stone Walls, Publish Base)
    await loc('home_my_base_btn').click();
    await loc('hud_publish_base_btn').waitFor({ state: 'visible', timeout: 5000 });
    const empireNameInput = loc('hud_empire_name_input');
    await empireNameInput.waitFor({ state: 'visible', timeout: 5000 });
    await empireNameInput.fill('Sunlit Pond Keep');

    const demolishBtn = loc('hud_demolish_btn');
    await demolishBtn.waitFor({ state: 'visible', timeout: 5000 });
    await demolishBtn.click();
    assertCondition(
      (await demolishBtn.getAttribute('aria-pressed')) === 'true',
      `${label}: Expected hud_demolish_btn aria-pressed="true" after toggle.`,
    );
    await demolishBtn.click();
    assertCondition(
      (await demolishBtn.getAttribute('aria-pressed')) === 'false',
      `${label}: Expected hud_demolish_btn aria-pressed="false" after second toggle.`,
    );

    await loc('hud_age_up_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('hud_age_up_btn').click();
    const ageBadgeText = (await loc('hud_age_up_btn').innerText()).trim();
    assertCondition(
      ageBadgeText.includes('Castle Age II'),
      `${label}: Expected Castle Age advancement badge "Castle Age II", got "${ageBadgeText}".`,
    );

    await loc('dock_mode_train').click();
    await loc('hud_train_trebuchet').waitFor({ state: 'visible', timeout: 5000 });
    await loc('dock_mode_build').click();

    await page.locator('[data-testid="hud-build-farm"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="hud-build-stone_wall"]').waitFor({
      state: 'visible',
      timeout: 5000,
    });
    await loc('hud_publish_base_btn').click();
    await waitAnimationFrames(page, 3);
    if (screenshotsDir && !isMobile) {
      await page.screenshot({
        path: path.join(screenshotsDir, 'desktop-my-base.png'),
      });
    }
    await page.locator('[data-testid="hud-base-done-btn"]').click();
    await loc('war_room_play_daily').waitFor({ state: 'visible', timeout: 5000 });

    // 5. Tap to Play Daily Siege
    await loc('war_room_play_daily').click();

    // 3. Play Daily — HUD, Onboarding Steps, Speed Toggle, Isometric Canvas & Diamond Minimap
    await loc('hud_resource_ledger').waitFor({ state: 'visible', timeout: 8000 });
    await loc('hud_age_up_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('hud_train_trebuchet').waitFor({ state: 'visible', timeout: 5000 });
    await loc('minimap_canvas').waitFor({ state: 'visible', timeout: 5000 });
    await loc('hud_scout_advisor_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('hud_taunt_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('hud_onboarding_steps').waitFor({ state: 'visible', timeout: 5000 });
    await loc('hud_speed_toggle').waitFor({ state: 'visible', timeout: 5000 });
    await loc('squad_idle_villager').waitFor({ state: 'visible', timeout: 5000 });
    await loc('squad_all_army').waitFor({ state: 'visible', timeout: 5000 });
    await loc('squad_siege_keep').waitFor({ state: 'visible', timeout: 5000 });
    await loc('dock_mode_train').waitFor({ state: 'visible', timeout: 5000 });
    await loc('dock_mode_build').waitFor({ state: 'visible', timeout: 5000 });

    // Verify onboarding steps render non-empty guidance and speed toggle transitions 1× -> 1.5×
    const onboardingText = (await loc('hud_onboarding_steps').innerText()).trim();
    assertCondition(
      onboardingText.length > 0,
      `${label}: Expected non-empty hud_onboarding_steps strip.`,
    );

    const speedBefore = (await loc('hud_speed_toggle').innerText()).trim();
    assertCondition(
      speedBefore.includes('1×') && !speedBefore.includes('1.5×'),
      `${label}: Expected initial hud_speed_toggle label "1×", got "${speedBefore}".`,
    );
    await loc('hud_speed_toggle').click();
    const speedMid = (await loc('hud_speed_toggle').innerText()).trim();
    assertCondition(
      speedMid.includes('1.5×'),
      `${label}: Expected hud_speed_toggle label "1.5×" after first click, got "${speedMid}".`,
    );
    await loc('hud_speed_toggle').click();
    const speedFast = (await loc('hud_speed_toggle').innerText()).trim();
    assertCondition(
      speedFast.includes('2×'),
      `${label}: Expected hud_speed_toggle label "2×" after second click, got "${speedFast}".`,
    );
    await loc('hud_speed_toggle').click();
    const speedWrap = (await loc('hud_speed_toggle').innerText()).trim();
    assertCondition(
      speedWrap.includes('1×') && !speedWrap.includes('1.5×'),
      `${label}: Expected hud_speed_toggle label "1×" after wrap, got "${speedWrap}".`,
    );
    await loc('hud_speed_toggle').click();

    await waitAnimationFrames(page, 3);

    const ledgerOverflow = await page.evaluate(() => {
      const strip = document.querySelector('.pe-top-ledger > div');
      const wood = document.querySelector('.pe-res-pill[title="Wood"]');
      const woodRect = wood ? wood.getBoundingClientRect() : null;
      return {
        scrollWidth: strip ? strip.scrollWidth : 0,
        clientWidth: strip ? strip.clientWidth : 0,
        woodLeft: woodRect ? Math.round(woodRect.left) : -999,
      };
    });
    assertCondition(
      ledgerOverflow.scrollWidth <= ledgerOverflow.clientWidth + 1 && ledgerOverflow.woodLeft >= 0,
      `${label}: Top resource ledger overflowed or clipped Wood pill (${JSON.stringify(ledgerOverflow)}).`,
    );

    if (screenshotsDir) {
      await page.screenshot({
        path: path.join(screenshotsDir, `${shotPrefix}-gameplay-hud.png`),
      });
    }

    const canvasCheck = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('main canvas'));
      const mainCanvas = canvases[0];
      const miniCanvas = canvases[1];
      return {
        count: canvases.length,
        mainW: mainCanvas ? mainCanvas.width : 0,
        mainH: mainCanvas ? mainCanvas.height : 0,
        miniW: miniCanvas ? miniCanvas.width : 0,
        miniH: miniCanvas ? miniCanvas.height : 0,
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
      };
    });

    assertCondition(
      canvasCheck.count >= 2 && canvasCheck.mainW > 0 && canvasCheck.miniW > 0,
      `${label}: Expected rendered main + minimap canvases, got ${JSON.stringify(canvasCheck)}.`,
    );
    assertCondition(
      canvasCheck.docScrollWidth <= canvasCheck.docClientWidth + 1,
      `${label}: Horizontal HUD overflow (${canvasCheck.docScrollWidth} > ${canvasCheck.docClientWidth} + 1).`,
    );

    // Verify slim Royal Advisor pill, Castle Age pill, and Scout button do not collide with top-right minimap in 2D
    const whisperBox = await page.locator('[data-testid="hud-whisper-pill"]').boundingBox();
    const ageUpBox = await loc('hud_age_up_btn').boundingBox();
    const scoutBtnBox = await loc('hud_scout_advisor_btn').boundingBox();
    const miniBox = await loc('minimap_canvas').boundingBox();
    assertCondition(
      whisperBox !== null && ageUpBox !== null && scoutBtnBox !== null && miniBox !== null,
      `${label}: Missing boundingBox for Whisper pill, Age-Up pill, Scout button, or Minimap canvas.`,
    );
    const overlaps2d = (a, b) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
    assertCondition(
      !overlaps2d(whisperBox, miniBox) &&
        !overlaps2d(ageUpBox, miniBox) &&
        !overlaps2d(scoutBtnBox, miniBox),
      `${label}: HUD element overlaps Minimap in 2D.`,
    );

    // Exercise Keep button + Contextual Selection Inspector (Rally & Town Bell) + Squad pills
    await loc('hud_keep_btn').waitFor({ state: 'visible', timeout: 5000 });
    await loc('hud_keep_btn').click();
    await loc('hud_selection_inspector').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="hud-rally-btn"]').waitFor({ state: 'visible', timeout: 5000 });
    const bellBtn = page.locator('[data-testid="hud-town-bell-btn"]');
    await bellBtn.waitFor({ state: 'visible', timeout: 5000 });
    await bellBtn.click();
    assertCondition(
      (await bellBtn.innerText()).includes('All Clear'),
      `${label}: Expected Town Bell button to toggle to "All Clear".`,
    );
    await bellBtn.click();
    await loc('squad_idle_villager').click();
    await loc('squad_all_army').click();
    await loc('squad_siege_keep').click();

    // 4. Build Mode Ghost Preview
    await loc('dock_mode_build').click();
    assertCondition(
      (await loc('dock_mode_build').getAttribute('aria-pressed')) === 'true',
      `${label}: dock_mode_build did not set aria-pressed="true".`,
    );

    const campCard = page.locator('button[title^="Homestead Camp"]');
    await campCard.waitFor({ state: 'visible', timeout: 5000 });
    await campCard.click();

    // Verify placement ghost state ("Tap Tile…", Cancel button, crosshair cursor, RAF render)
    await page.locator('role=button[name="Cancel"s]').waitFor({ state: 'visible', timeout: 5000 });
    const campCardText = await campCard.innerText();
    assertCondition(
      campCardText.includes('Tap Tile'),
      `${label}: Expected Homestead card to show "Tap Tile…" during ghost placement, got "${campCardText}".`,
    );

    await page.mouse.move(Math.round(viewport.width * 0.5), Math.round(viewport.height * 0.46));
    await waitAnimationFrames(page, 3);

    const ghostCursor = await page.evaluate(() => {
      const mainCanvas = document.querySelector('main canvas');
      return mainCanvas?.parentElement ? getComputedStyle(mainCanvas.parentElement).cursor : '';
    });
    assertCondition(
      ghostCursor === 'crosshair',
      `${label}: Expected crosshair cursor while Build ghost is active, got "${ghostCursor}".`,
    );

    await page.locator('role=button[name="Cancel"s]').click();
    await loc('dock_mode_train').click();
    assertCondition(
      (await loc('dock_mode_train').getAttribute('aria-pressed')) === 'true',
      `${label}: dock_mode_train did not restore aria-pressed="true".`,
    );

    // 5. Royal War-Council Scout Advisor
    await loc('hud_scout_advisor_btn').click();
    await waitAnimationFrames(page, 2);
    const whisperStats = await page.evaluate(() => {
      const pill = document.querySelector('[data-testid="hud-whisper-pill"]');
      const pillText = pill?.querySelector('span')?.textContent?.trim() ?? '';
      return {
        text: pillText,
        hasRawEmoji: /\p{Extended_Pictographic}/u.test(pillText),
      };
    });
    assertCondition(
      whisperStats.text.length >= 12 && whisperStats.text.length <= 125,
      `${label}: Unexpected Scout Advisor whisper "${whisperStats.text}".`,
    );
    assertCondition(
      !whisperStats.hasRawEmoji,
      `${label}: Scout Advisor whisper leaked raw emoji glyph: "${whisperStats.text}".`,
    );

    // 6. Taunt Popover
    await loc('hud_taunt_btn').click();
    assertCondition(
      (await loc('hud_taunt_btn').getAttribute('aria-expanded')) === 'true',
      `${label}: hud_taunt_btn did not open taunt popover.`,
    );
    const wololoTauntBtn = page.locator('role=button[name=/^30\\s+Wololo!$/]');
    await wololoTauntBtn.waitFor({ state: 'visible', timeout: 5000 });
    await wololoTauntBtn.click();
    assertCondition(
      (await loc('hud_taunt_btn').getAttribute('aria-expanded')) === 'false',
      `${label}: Taunt popover did not close after selecting Taunt 30.`,
    );

    await waitAnimationFrames(page, 2);

    // 7. End-State Victory ChronicleModal on Desktop (1280x800) via Control+Shift+V
    if (!isMobile) {
      await page.keyboard.press('Control+Shift+KeyV');
      const chronicleModal = loc('chronicle_modal');
      await chronicleModal.waitFor({ state: 'visible', timeout: 5000 });

      const chroniclePostBtn = page.locator('[data-testid="chronicle-post-btn"]');
      await chroniclePostBtn.waitFor({ state: 'visible', timeout: 5000 });
      const postBtnText = (await chroniclePostBtn.innerText()).trim();
      assertCondition(
        postBtnText.includes('Post War Chronicle to Comments'),
        `${label}: Expected Chronicle CTA "Post War Chronicle to Comments", got "${postBtnText}".`,
      );

      const modalText = await chronicleModal.innerText();
      assertCondition(
        modalText.includes('VICTORY'),
        `${label}: Expected Victory headline inside ChronicleModal.`,
      );
      assertCondition(
        !/\p{Extended_Pictographic}/u.test(modalText),
        `${label}: ChronicleModal leaked raw emoji glyph.`,
      );
      await loc('chronicle_rival_banner').waitFor({ state: 'visible', timeout: 5000 });
      await loc('chronicle_momentum_chart').waitFor({ state: 'visible', timeout: 5000 });

      await page.waitForTimeout(550);
      await waitAnimationFrames(page, 2);
      if (screenshotsDir) {
        await page.screenshot({
          path: path.join(screenshotsDir, 'desktop-chronicle-victory.png'),
        });
      }
    }

    assertCondition(
      consoleErrors.length === 0,
      `${label}: Expected 0 console errors, got: ${consoleErrors.join(' | ')}`,
    );
    assertCondition(
      pageErrors.length === 0,
      `${label}: Expected 0 page errors, got: ${pageErrors.join(' | ')}`,
    );

    const flowSummary = !isMobile
      ? `Archive · Forge ${shareCodeText} · 1.5× · Chronicle Victory`
      : `Archive · Forge ${shareCodeText} · 1.5× · Ghost · Taunt 30`;

    return {
      suite: label,
      viewport: `${viewport.width}x${viewport.height}`,
      detail: flowSummary,
      errors: `${consoleErrors.length} / ${pageErrors.length}`,
      ms: Math.round(performance.now() - startedAt),
      status: 'PASS',
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const screenshotsDir = parseScreenshotsDir(process.argv.slice(2));
  if (screenshotsDir) {
    mkdirSync(screenshotsDir, { recursive: true });
  }

  const featureMap = loadAndValidateFeatureMap();
  assertCondition(
    existsSync(CHROMIUM_PATH),
    `Chromium binary not found at ${CHROMIUM_PATH}. Set CHROMIUM_PATH if installed elsewhere.`,
  );

  const server = await startStaticClientServer();
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /** @type {Array<{ suite: string, viewport: string, detail: string, errors: string, ms: number, status: string }>} */
  const rows = [];

  try {
    rows.push({
      suite: 'FEATURE_MAP Schema & Files',
      viewport: 'static',
      detail: `${REQUIRED_FEATURES.length}/${REQUIRED_FEATURES.length} features mapped & verified`,
      errors: '0 / 0',
      ms: 1,
      status: 'PASS',
    });

    rows.push(
      await verifySplashViewport(
        browser,
        server.baseUrl,
        featureMap,
        { width: 560, height: 420 },
        'Splash Feed Card (Standard)',
        screenshotsDir,
      ),
    );

    rows.push(
      await verifySplashViewport(
        browser,
        server.baseUrl,
        featureMap,
        { width: 360, height: 380 },
        'Splash Feed Card (Compact)',
        screenshotsDir,
      ),
    );

    rows.push(
      await verifyGameFlow(browser, server.baseUrl, featureMap, {
        label: 'Desktop Full Siege Flow',
        viewport: { width: 1280, height: 800 },
        isMobile: false,
        screenshotsDir,
      }),
    );

    rows.push(
      await verifyGameFlow(browser, server.baseUrl, featureMap, {
        label: 'Mobile Full Siege Flow',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        screenshotsDir,
      }),
    );
  } finally {
    await browser.close();
    await server.close();
  }

  console.log('==================================================================================================================');
  console.log(' POCKET EMPIRES — PLAYWRIGHT HEADLESS CHROMIUM RUNTIME VERIFICATION REPORT');
  console.log('==================================================================================================================');
  console.log(
    'Suite                       | Viewport  | Verified Invariants & Flows                             | Err (C/P) | Time   | Status',
  );
  console.log(
    '----------------------------+-----------+---------------------------------------------------------+-----------+--------+-------',
  );
  for (const r of rows) {
    console.log(
      `${r.suite.padEnd(27)} | ${r.viewport.padEnd(9)} | ${r.detail.padEnd(55)} | ${r.errors.padEnd(9)} | ${`${r.ms}ms`.padStart(6)} | ${r.status}`,
    );
  }
  console.log('==================================================================================================================');
  if (screenshotsDir) {
    console.log(`Saved runtime verification screenshots to ${screenshotsDir}`);
  }
  console.log(
    `verify-runtime PASS — ${rows.length}/${rows.length} suites passed with 0 console errors & 0 page errors!`,
  );
}

main().catch((err) => {
  console.error('\n[VERIFY_RUNTIME_FAILED]', err instanceof Error ? err.message : err);
  process.exit(1);
});
