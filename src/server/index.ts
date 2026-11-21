import { telemetryRouter } from '@devvit/analytics/server/reddit';
import { context, createServer, getServerPort, reddit, redis } from '@devvit/web/server';
import {
  EmpireValidationError,
  getDailyWarRoom,
  isValidDateKey,
  recordMatchCompletion,
  submitWarChronicleComment,
  todayUtcDateKey,
} from './empire.js';
import { ensurePocketEmpiresPost } from './installPost.js';
import { handleClientMessage } from './ping.js';
import { handlePostCreate } from './postCreate.js';

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res: any, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer | string) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      bytes += Buffer.byteLength(str, 'utf8');
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        return;
      }
      raw += str;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function readJsonBody(req: any): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false }> {
  try {
    const raw = await readRawBody(req);
    if (!raw || raw.trim().length === 0) {
      return { ok: true, value: {} };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

const server = createServer(async (req: any, res: any) => {
  // Devvit Journeys telemetry (client posts to /api/telemetry/journey/*).
  if (req.url?.startsWith('/api/telemetry')) {
    telemetryRouter(req, res, () => sendJson(res, 404, { error: 'telemetry route not found' }));
    return;
  }

  // Client READY -> ACK handshake.
  if (req.method === 'POST' && req.url?.startsWith('/api/ping')) {
    const parsed = await readJsonBody(req);
    const reply = parsed.ok ? handleClientMessage(parsed.value) : null;
    if (reply) {
      console.log('[pocket-empires:server] READY received, sending ACK');
      sendJson(res, 200, reply);
    } else {
      sendJson(res, 400, { error: 'expected { type: "READY" }' });
    }
    return;
  }

  // Moderator menu action: create a Pocket Empires post.
  if (req.method === 'POST' && req.url?.startsWith('/internal/menu/post-create')) {
    try {
      const reply = await handlePostCreate(reddit, context.subredditName);
      sendJson(res, 200, reply);
    } catch (err) {
      console.error('[pocket-empires:server] post-create failed', err);
      sendJson(res, 500, { showToast: 'Failed to create Pocket Empires post' });
    }
    return;
  }

  // Install / upgrade trigger: ensure initial Pocket Empires post exists once per subreddit.
  if (req.method === 'POST' && req.url?.startsWith('/internal/triggers/post-create')) {
    try {
      const created = await ensurePocketEmpiresPost(reddit, redis, context.subredditName);
      console.log(`[pocket-empires:server] install/upgrade trigger, post created: ${created}`);
      sendJson(res, 200, { status: 'ok', created });
    } catch (err) {
      console.error('[pocket-empires:server] trigger post-create failed', err);
      sendJson(res, 500, { status: 'error' });
    }
    return;
  }

  // GET /api/empire/daily?date=YYYY-MM-DD
  if (req.method === 'GET' && req.url?.startsWith('/api/empire/daily')) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const rawDate = url.searchParams.get('date');
      const dateKey =
        rawDate === null || rawDate.trim().length === 0 ? todayUtcDateKey() : rawDate.trim();
      if (!isValidDateKey(dateKey)) {
        sendJson(res, 400, { error: 'Invalid date parameter; expected YYYY-MM-DD' });
        return;
      }
      const snapshot = await getDailyWarRoom(redis, dateKey, context.username ?? undefined);
      sendJson(res, 200, snapshot);
    } catch (err) {
      console.error('[pocket-empires:server] GET /api/empire/daily failed', err);
      sendJson(res, 500, { error: 'Failed to load Daily War Room' });
    }
    return;
  }

  // POST /api/empire/complete
  if (req.method === 'POST' && req.url?.startsWith('/api/empire/complete')) {
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    try {
      const p = body.value;
      const result = await recordMatchCompletion(redis, reddit, {
        subredditName: context.subredditName,
        username: context.username ?? 'anonymous',
        dateKey: typeof p.dateKey === 'string' ? p.dateKey.trim() : '',
        victory: typeof p.victory === 'boolean' ? p.victory : Boolean(p.victory),
        score: typeof p.score === 'number' ? p.score : Number.NaN,
        timeSec: typeof p.timeSec === 'number' ? p.timeSec : Number.NaN,
        crowns: typeof p.crowns === 'number' ? p.crowns : 0,
        strategy: typeof p.strategy === 'string' ? p.strategy : 'Balanced Siege',
        wololos: typeof p.wololos === 'number' ? p.wololos : 0,
      });
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof EmpireValidationError) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      console.error('[pocket-empires:server] POST /api/empire/complete failed', err);
      sendJson(res, 500, { error: 'Failed to record match completion' });
    }
    return;
  }

  // POST /api/empire/comment
  if (req.method === 'POST' && req.url?.startsWith('/api/empire/comment')) {
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, 400, { posted: false, message: 'Invalid JSON body' });
      return;
    }
    try {
      const p = body.value;
      const postId =
        context.postId ?? (typeof p.postId === 'string' ? p.postId.trim() : '');
      const dateKey =
        typeof p.dateKey === 'string' && p.dateKey.trim().length > 0
          ? p.dateKey.trim()
          : todayUtcDateKey();
      const text = typeof p.text === 'string' ? p.text : '';
      const username = context.username ?? 'anonymous';
      const result = await submitWarChronicleComment(redis, reddit, {
        postId,
        username,
        dateKey,
        text,
      });
      sendJson(res, 200, result);
    } catch (err) {
      console.error('[pocket-empires:server] POST /api/empire/comment failed', err);
      sendJson(res, 500, { posted: false, message: 'Failed to submit War Chronicle comment' });
    }
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(getServerPort());
console.log('[pocket-empires:server] listening');
