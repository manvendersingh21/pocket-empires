#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist/client');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      specifier.endsWith('.js') &&
      context.parentURL?.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsCandidate = path.resolve(parentDir, specifier.slice(0, -3) + '.ts');
      if (fs.existsSync(tsCandidate)) {
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
} = await import('../src/server/empire.ts');
const { handleClientMessage } = await import('../src/server/ping.ts');

const store = new Map();
const redis = {
  async get(key) {
    return store.get(key) ?? null;
  },
  async set(key, value) {
    store.set(key, value);
  },
};
const comments = [];
const reddit = {
  async setUserFlair() {
    return;
  },
  async submitComment({ id, text }) {
    comments.push({ id, text, createdAt: new Date().toISOString() });
    return { id: `t1_preview_${comments.length}` };
  },
};

// Seed realistic community commanders for today's preview War Room
const today = new Date().toISOString().slice(0, 10);
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
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
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/ping') {
    const body = await readJsonBody(req);
    const reply = handleClientMessage(body);
    sendJson(res, reply ? 200 : 400, reply ?? { error: 'invalid ping' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/empire/daily') {
    const dateKey = url.searchParams.get('date') || today;
    const data = await getDailyWarRoom(redis, dateKey, 'You');
    sendJson(res, 200, data);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/empire/leaderboard') {
    const dateKey = url.searchParams.get('date') || today;
    const data = await getLeaderboardHub(redis, dateKey, 'You');
    sendJson(res, 200, data);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/empire/complete') {
    const body = await readJsonBody(req);
    const result = await recordMatchCompletion(redis, reddit, {
      subredditName: 'GameOnReddit',
      username: 'You',
      dateKey: typeof body.dateKey === 'string' ? body.dateKey : today,
      victory: Boolean(body.victory),
      score: Number(body.score ?? 0),
      timeSec: Number(body.timeSec ?? 1),
      crowns: Number(body.crowns ?? 0),
      strategy: typeof body.strategy === 'string' ? body.strategy : 'Combined Arms Siege',
      wololos: Number(body.wololos ?? 0),
    });
    sendJson(res, result ? 200 : 400, result ?? { saved: false });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/empire/comment') {
    const body = await readJsonBody(req);
    const result = await submitWarChronicleComment(redis, reddit, {
      postId: 't3_preview_daily_siege',
      username: 'You',
      dateKey: typeof body.dateKey === 'string' ? body.dateKey : today,
      text: typeof body.text === 'string' ? body.text : '',
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/empire/bases') {
    const excludeOwner = url.searchParams.get('excludeOwner')?.trim() || undefined;
    const owner = url.searchParams.get('owner')?.trim() || 'Commander';
    const [bases, myBase] = await Promise.all([
      listPlayerBases(redis, excludeOwner),
      getPlayerBase(redis, owner),
    ]);
    sendJson(res, 200, { bases, myBase });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/empire/bases') {
    const raw = await readJsonBody(req);
    const p =
      raw && raw.base && typeof raw.base === 'object' && !Array.isArray(raw.base)
        ? raw.base
        : raw;
    const owner =
      typeof p.owner === 'string' && p.owner.trim().length > 0 ? p.owner.trim() : 'Commander';
    const base = await savePlayerBase(redis, {
      owner,
      empireName: typeof p.empireName === 'string' ? p.empireName : undefined,
      civ: p.civ,
      biome: p.biome,
      buildings: Array.isArray(p.buildings) ? p.buildings : [],
      garrison: Array.isArray(p.garrison) ? p.garrison : [],
    });
    const bases = await listPlayerBases(redis);
    if (!base) {
      sendJson(res, 400, {
        saved: false,
        base: null,
        bases,
        error: 'Invalid base blueprint: must include a valid civ, biome, and Town Center',
      });
      return;
    }
    sendJson(res, 200, { saved: true, base, bases });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/empire/raid') {
    const p = await readJsonBody(req);
    const attacker =
      typeof p.attacker === 'string' && p.attacker.trim().length > 0
        ? p.attacker.trim()
        : 'Commander';
    const defender =
      typeof p.defender === 'string'
        ? p.defender
        : typeof p.defenderOwner === 'string'
          ? p.defenderOwner
          : typeof p.targetOwner === 'string'
            ? p.targetOwner
            : typeof p.owner === 'string'
              ? p.owner
              : '';
    if (!defender.trim()) {
      sendJson(res, 400, { recorded: false, error: 'Missing defender username' });
      return;
    }
    const result = await recordRaidResult(redis, {
      attacker,
      defender,
      victory: Boolean(p.victory),
    });
    const [bases, myBase] = await Promise.all([
      listPlayerBases(redis),
      getPlayerBase(redis, attacker),
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

  const relPath =
    url.pathname === '/'
      ? '/game.html'
      : url.pathname === '/splash'
        ? '/splash.html'
        : url.pathname;
  const fullPath = path.resolve(DIST, '.' + relPath);
  if (!fullPath.startsWith(DIST) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(fullPath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(fullPath));
});

server.listen(PORT, HOST, () => {
  console.log(`Pocket Empires preview server running at:`);
  console.log(`  Game:   http://localhost:${PORT}/`);
  console.log(`  Splash: http://localhost:${PORT}/splash`);
});
