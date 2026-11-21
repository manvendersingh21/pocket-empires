/** Client -> Devvit backend handshake message. */
export type ClientMessage = {
  type: 'READY';
  app: 'momentum' | 'pocket-empires';
  version: 1;
};

/** Devvit backend -> Client handshake acknowledgement. */
export type ServerMessage = {
  type: 'ACK';
  app: 'momentum' | 'pocket-empires';
  version: 1;
  received: 'READY';
};

/** Single commander row on the Daily War Room leaderboard. */
export interface DailyLeaderboardEntry {
  username: string;
  score: number;
  timeSec: number;
  crowns: number;
  strategy: string;
  wololos: number;
}

/** Subreddit-wide War Room telemetry for a Daily Siege (`YYYY-MM-DD`). */
export interface CommunityWarStatsDto {
  totalPlays: number;
  totalWins: number;
  totalWololos: number;
  topStrategy: string;
  fastestCommander: { username: string; timeSec: number } | null;
}

/** Player-specific standing and streak for a Daily Siege. */
export interface PlayerWarRoomStatsDto {
  streak: number;
  bestScore: number | null;
  rank: number | null;
}

/** Response from `GET /api/empire/daily?date=YYYY-MM-DD`. */
export interface DailyWarRoomResponse {
  dateKey: string;
  leaderboard: DailyLeaderboardEntry[];
  community: CommunityWarStatsDto;
  player: PlayerWarRoomStatsDto;
}

/** Request payload for `POST /api/empire/complete`. */
export interface CompleteMatchRequest {
  dateKey: string;
  victory: boolean;
  score: number;
  timeSec: number;
  crowns: number;
  strategy: string;
  wololos: number;
}

/** Response from `POST /api/empire/complete`. */
export interface CompleteMatchResponse extends DailyWarRoomResponse {
  saved: true;
  streak: number;
  bestScore: number | null;
  rank: number | null;
  flairAwarded: string | null;
}

/** Request payload for `POST /api/empire/comment`. */
export interface SubmitChronicleCommentRequest {
  dateKey: string;
  text: string;
  postId?: string;
}

/** Response from `POST /api/empire/comment`. */
export interface SubmitChronicleCommentResponse {
  posted: boolean;
  message?: string;
}
