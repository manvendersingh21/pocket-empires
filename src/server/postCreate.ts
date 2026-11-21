type RedditLike = {
  submitCustomPost: (opts: {
    subredditName: string;
    title: string;
    entry: string;
  }) => Promise<unknown>;
};

export const POCKET_EMPIRES_POST_TITLE = 'Pocket Empires — Daily 3-Minute RTS Siege';

/** Creates the Pocket Empires custom post. Returns the menu-action UI response. */
export async function handlePostCreate(
  reddit: RedditLike,
  subredditName: string,
): Promise<{ showToast: string }> {
  await reddit.submitCustomPost({
    subredditName,
    title: POCKET_EMPIRES_POST_TITLE,
    entry: 'default',
  });
  return { showToast: 'Pocket Empires post created — open it from the feed!' };
}
