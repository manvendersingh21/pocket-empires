import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POCKET_EMPIRES_POST_TITLE, handlePostCreate } from '../src/server/postCreate.ts';

test('post-create submits a Pocket Empires custom post to the current subreddit', async () => {
  const calls: unknown[] = [];
  const fakeReddit = {
    submitCustomPost: async (opts: unknown) => {
      calls.push(opts);
      return { id: 't3_test' };
    },
  };
  const reply = await handlePostCreate(fakeReddit, 'pocket_empires_dev');
  assert.deepEqual(calls, [
    {
      subredditName: 'pocket_empires_dev',
      title: POCKET_EMPIRES_POST_TITLE,
      entry: 'default',
    },
  ]);
  assert.equal(POCKET_EMPIRES_POST_TITLE, 'Pocket Empires — Daily 3-Minute RTS Siege');
  assert.match(reply.showToast, /Pocket Empires post created/);
});
