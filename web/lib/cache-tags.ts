// Centralized cache tag names so reads and writes stay in lockstep.
//
// Strategy: hold cached data forever; bust on writes via revalidateTag.
// `unstable_cache` entries can keep their answers as long as the underlying
// inputs haven't changed. Each helper here points read- and write-sites to
// the same tag string.

/** Catch-all tag for stats functions that depend on game_events / rosters / games. */
export const TAG_STATS = "stats";

/** The /api/games list, the active-game lookup, and anything that lists games. */
export const TAG_GAMES_LIST = "games-list";

/** Per-season voting state. Keep separate so a vote in season N doesn't
 *  invalidate season N-1's cached state. */
export function votingTag(season: number): string {
  return `voting-${season}`;
}

/** Convenience: every stats-bearing surface that should be busted by a
 *  game-event change. Grouped here so call sites stay short. */
export const STATS_TAGS_ALL = [TAG_STATS, TAG_GAMES_LIST] as const;

// Helper for write routes: bust both stats and games-list tags in one call.
// Voting cache is per-season, so callers that touch voting also need to
// call revalidateTag(votingTag(season)) themselves.
import { revalidateTag } from "next/cache";

export function bustStatsCache(): void {
  // Next 16 requires a cache-life profile arg; "default" invalidates immediately.
  revalidateTag(TAG_STATS, "default");
  revalidateTag(TAG_GAMES_LIST, "default");
  // Voting state can shift when a season's last game completes, so bust the
  // shared "voting" namespace too. Cheap — only ~2 cache entries.
  revalidateTag("voting", "default");
}
