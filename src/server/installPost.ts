type RedditLike = {
  submitCustomPost: (opts: {
    subredditName: string;
    title: string;
    entry: string;
  }) => Promise<unknown>;
};

type RedisLike = {
  get: (key: string) => Promise<string | null | undefined>;
  set: (key: string, value: string) => Promise<unknown>;
};

const POCKET_EMPIRES_POST_TITLE = 'Pocket Empires — Daily 3-Minute RTS Siege';

/**
 * Creates the Pocket Empires post once per subreddit (guarded by a Redis flag),
 * so install/upgrade triggers don't spam the feed on every playtest update.
 * Returns true if a post was created.
 */
export async function ensurePocketEmpiresPost(
  reddit: RedditLike,
  redis: RedisLike,
  subredditName: string,
): Promise<boolean> {
  const key = `pocket-empires:post-created:${subredditName}`;
  if (await redis.get(key)) return false;
  await reddit.submitCustomPost({
    subredditName,
    title: POCKET_EMPIRES_POST_TITLE,
    entry: 'default',
  });
  await redis.set(key, '1');
  return true;
}

/** Backwards-compatible alias for existing callers. */
export const ensureMomentumPost = ensurePocketEmpiresPost;
