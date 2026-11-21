import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureMomentumPost, ensurePocketEmpiresPost } from '../src/server/installPost.ts';

function fakes(existing: string | null) {
  const posts: unknown[] = [];
  const store = new Map<string, string>();
  if (existing) store.set('pocket-empires:post-created:sub1', existing);
  return {
    posts,
    reddit: {
      submitCustomPost: async (opts: unknown) => {
        posts.push(opts);
        return { id: 't3_x' };
      },
    },
    redis: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => {
        store.set(k, v);
      },
    },
  };
}

test('creates Pocket Empires post once, then skips', async () => {
  const { posts, reddit, redis } = fakes(null);
  assert.equal(await ensurePocketEmpiresPost(reddit, redis, 'sub1'), true);
  assert.equal(await ensurePocketEmpiresPost(reddit, redis, 'sub1'), false);
  assert.deepEqual(posts, [
    {
      subredditName: 'sub1',
      title: 'Pocket Empires — Daily 3-Minute RTS Siege',
      entry: 'default',
    },
  ]);
});

test('skips when flag already set (and backwards-compatible alias works)', async () => {
  const { posts, reddit, redis } = fakes('1');
  assert.equal(await ensureMomentumPost(reddit, redis, 'sub1'), false);
  assert.equal(posts.length, 0);
});
