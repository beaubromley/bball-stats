"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatShortDateCT } from "@/lib/time";
import { formatSeasonGame, gameNumberInSeason } from "@/lib/seasons";
import HotBadge from "@/app/components/HotBadge";
import { useMe } from "@/app/components/MeContext";

const API_BASE = "/api";

// =======================================================================
// Types matching the various endpoints we hit
// =======================================================================

interface GameMvp {
  player_id: string;
  player_name: string;
  points: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
}

interface GameRow {
  id: string;
  start_time: string;
  status: string;
  winning_team: string | null;
  team_a_players: string[];
  team_b_players: string[];
  team_a_score: number;
  team_b_score: number;
  game_number: number;
  mvp: GameMvp | null;
}

interface PlayerRow {
  id: string;
  name: string;
  games_played: number;
  effective_games: number;
  wins: number;
  win_pct: number;
  total_points: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  ppg: number;
  apg: number;
  spg: number;
  bpg: number;
  fpg: number;
  mvp_count: number;
}

interface TodayData {
  games_today: number;
  players: PlayerRow[];
}

interface SeasonMeta {
  totalGames: number;
  totalSeasons: number;
  currentSeason: number;
  gamesPerSeason: number;
}

interface SingleGameRecord {
  category: "single_game";
  stat: "points" | "assists" | "steals" | "blocks" | "fantasy_points";
  player_id: string;
  player_name: string;
  value: number;
  game_id: string;
  start_time: string;
  game_number: number;
  season: number;
}

interface SeasonRecord {
  category: "season";
  stat: "points" | "assists" | "steals" | "blocks" | "fantasy_points" | "wins";
  player_id: string;
  player_name: string;
  value: number;
  season: number;
  games_played: number;
}

interface GameRecord {
  category: "game";
  stat: "margin" | "comeback";
  game_id: string;
  start_time: string;
  value: number;
  team_a_score: number;
  team_b_score: number;
  winning_team: "A" | "B";
  team_a_players: string[];
  team_b_players: string[];
  game_number: number;
  season: number;
}

interface StreakRecord {
  category: "streak";
  stat: "win_streak" | "loss_streak";
  player_id: string;
  player_name: string;
  value: number;
  start_time: string;
  end_time: string;
  start_game_id: string;
  end_game_id: string;
  start_game_number: number;
  end_game_number: number;
  start_season: number;
  end_season: number;
}

interface MilestoneAlert {
  player_id: string;
  player_name: string;
  stat: "points" | "assists" | "steals" | "blocks" | "games";
  current: number;
  next_milestone: number;
  remaining: number;
  kind: "approaching" | "achieved";
  achieved_at?: string;
}

interface RecordsBundle {
  single_game: SingleGameRecord[];
  season: SeasonRecord[];
  game: GameRecord[];
  streak: StreakRecord[];
  milestones: MilestoneAlert[];
}

// =======================================================================
// Display helpers
// =======================================================================

const STAT_SHORT: Record<string, string> = {
  points: "PTS",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  fantasy_points: "FP",
  wins: "WINS",
  margin: "MARGIN",
  comeback: "COMEBACK",
  win_streak: "WIN STREAK",
  loss_streak: "LOSS STREAK",
  games: "GP",
};

const STAT_LONG: Record<string, string> = {
  points: "Career Points",
  assists: "Career Assists",
  steals: "Career Steals",
  blocks: "Career Blocks",
  games: "Career Games",
};

// Group an array of records by `stat` while preserving the order they arrived.
function groupByStat<T extends { stat: string }>(items: T[]): { stat: string; rows: T[] }[] {
  const out: { stat: string; rows: T[] }[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.stat === item.stat) last.rows.push(item);
    else out.push({ stat: item.stat, rows: [item] });
  }
  return out;
}

// =======================================================================
// Components
// =======================================================================

function LiveBanner({ game }: { game: GameRow }) {
  return (
    <Link
      href={`/game?id=${game.id}`}
      className="block rounded-lg border-2 border-red-500/60 bg-red-500/10 dark:bg-red-500/15 px-4 py-3 hover:border-red-500 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
        </span>
        <span className="text-xs font-bold font-display uppercase tracking-wider text-red-500">
          Live Now
        </span>
        <span className="text-sm font-display tabular-nums text-gray-900 dark:text-white">
          Team A {game.team_a_score} – {game.team_b_score} Team B
        </span>
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">Tap to watch →</span>
      </div>
    </Link>
  );
}

function LatestGameHero({ game }: { game: GameRow }) {
  const aWon = game.winning_team === "A";
  const bWon = game.winning_team === "B";
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 hover:border-gray-400 dark:hover:border-gray-600 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold font-display uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Latest Game
          </div>
          <div className="text-[13px] text-gray-400 dark:text-gray-600 mt-0.5">
            {formatSeasonGame(game.game_number)} · {formatShortDateCT(game.start_time)}
          </div>
        </div>
        <Link
          href={`/game?id=${game.id}`}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Box score →
        </Link>
      </div>

      <Link href={`/game?id=${game.id}`} className="block">
        <div className="flex items-center justify-center gap-6 sm:gap-12">
          <div className={`text-center ${aWon ? "" : "opacity-60"}`}>
            <div className="text-xs text-gray-500 mb-1">Team A</div>
            <div
              className={`text-5xl font-bold font-display tabular-nums ${
                aWon ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-500"
              }`}
            >
              {game.team_a_score}
            </div>
            <div className="text-xs text-gray-500 mt-1.5 max-w-[160px] sm:max-w-[220px]">
              {game.team_a_players.join(", ")}
            </div>
          </div>

          <div className="text-gray-400 dark:text-gray-600 text-sm font-display">vs</div>

          <div className={`text-center ${bWon ? "" : "opacity-60"}`}>
            <div className="text-xs text-gray-500 mb-1">Team B</div>
            <div
              className={`text-5xl font-bold font-display tabular-nums ${
                bWon ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-500"
              }`}
            >
              {game.team_b_score}
            </div>
            <div className="text-xs text-gray-500 mt-1.5 max-w-[160px] sm:max-w-[220px]">
              {game.team_b_players.join(", ")}
            </div>
          </div>
        </div>
      </Link>

      {game.mvp && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 flex items-baseline gap-3 flex-wrap">
          <span className="text-[12px] font-bold font-display uppercase tracking-wider text-yellow-600 dark:text-yellow-500">
            MVP
          </span>
          <Link
            href={`/player?id=${game.mvp.player_id}`}
            className="text-sm font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
          >
            {game.mvp.player_name}
          </Link>
          <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.points}</span> PTS
            <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
            <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.assists}</span> AST
            <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
            <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.steals}</span> STL
            <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
            <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.blocks}</span> BLK
            <span className="mx-1.5 text-gray-400 dark:text-gray-600">·</span>
            <span className="font-bold text-gray-700 dark:text-gray-200">{game.mvp.fantasy_points}</span> FP
          </span>
        </div>
      )}
    </div>
  );
}

function SeasonPulse({ meta }: { meta: SeasonMeta }) {
  // Compute games-in-season directly from meta — avoids an extra fetch.
  const seasonStartGameIdx = (meta.currentSeason - 1) * meta.gamesPerSeason;
  const gamesInSeason = Math.max(0, meta.totalGames - seasonStartGameIdx);
  const totalSeasonGames = meta.gamesPerSeason;
  const remaining = Math.max(0, totalSeasonGames - gamesInSeason);
  const completed = gamesInSeason >= totalSeasonGames;
  const pct = Math.min(100, Math.round((gamesInSeason / totalSeasonGames) * 100));

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          Season {meta.currentSeason}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {completed
            ? `Completed · ${totalSeasonGames} games`
            : `${gamesInSeason} / ${totalSeasonGames} games · ${remaining} to go`}
        </div>
      </div>

      <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type LeaderKey = "ppg" | "fpg" | "def" | "win_pct";

function MiniLeaderCard({
  title,
  unit,
  rows,
  valueKey,
  hotByPlayer,
  meId,
  meExtraRow,
}: {
  title: string;
  unit: string;
  rows: PlayerRow[];
  valueKey: LeaderKey;
  hotByPlayer: Record<string, { last5_fpg: number; career_fpg: number; ratio: number }>;
  meId: string | null;
  /** If "me" isn't already in `rows`, this is appended at the bottom
   *  with their actual rank ("#11"). Null when me is already in top-5
   *  or no me is picked. */
  meExtraRow: { player: PlayerRow; rank: number } | null;
}) {
  // Recompute at 2dp from raw totals + effective_games — the leaderboard
  // API rounds ppg/fpg/etc. to 1dp, so reading p.ppg directly would only
  // give 1dp of precision regardless of how many digits we display.
  function valueOf(p: PlayerRow): number {
    const eg = p.effective_games || 1;
    if (valueKey === "ppg") return p.total_points / eg;
    if (valueKey === "fpg") return p.fantasy_points / eg;
    if (valueKey === "win_pct") return p.win_pct;
    return (p.steals + p.blocks) / eg;
  }
  function format(p: PlayerRow): string {
    if (valueKey === "win_pct") return `${p.win_pct.toFixed(2)}%`;
    return valueOf(p).toFixed(2);
  }
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-xs font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          {title}
        </h3>
        <span className="text-[12px] text-gray-500 uppercase tracking-wider font-display">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No data yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-baseline gap-2 text-sm ${
                meId && p.id === meId
                  ? "bg-blue-200/80 dark:bg-blue-600/40 ring-1 ring-inset ring-blue-500 dark:ring-blue-400 -mx-2 px-2 py-1 rounded"
                  : ""
              }`}
            >
              <span className="tabular-nums w-4 font-display font-bold text-xs text-gray-500 dark:text-gray-400">
                {i + 1}
              </span>
              <Link
                href={`/player?id=${p.id}`}
                className="flex-1 truncate font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
              >
                {p.name}
                <HotBadge info={hotByPlayer[p.id]} size="xs" />
              </Link>
              <span className="tabular-nums font-bold font-display text-gray-900 dark:text-white">
                {format(p)}
              </span>
            </li>
          ))}
          {meExtraRow && (
            <li className="flex items-baseline gap-2 text-sm bg-blue-200/80 dark:bg-blue-600/40 ring-1 ring-inset ring-blue-500 dark:ring-blue-400 -mx-2 px-2 py-1 rounded mt-2">
              <span className="tabular-nums w-6 font-display font-bold text-xs text-blue-500 dark:text-blue-400">
                #{meExtraRow.rank}
              </span>
              <Link
                href={`/player?id=${meExtraRow.player.id}`}
                className="flex-1 truncate font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
              >
                {meExtraRow.player.name}
                <HotBadge info={hotByPlayer[meExtraRow.player.id]} size="xs" />
              </Link>
              <span className="tabular-nums font-bold font-display text-gray-900 dark:text-white">
                {format(meExtraRow.player)}
              </span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function TodayBlock({ today }: { today: TodayData }) {
  if (today.games_today === 0) return null;
  const players = today.players;
  const topScorer = [...players].sort((a, b) => b.total_points - a.total_points)[0];
  const topAssist = [...players].sort((a, b) => b.assists - a.assists)[0];
  const fpLeader = [...players].sort((a, b) => b.fantasy_points - a.fantasy_points)[0];
  const stl = [...players].sort((a, b) => b.steals - a.steals)[0];

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          Today
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {today.games_today} game{today.games_today === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TodayStat label="Top Scorer" person={topScorer} value={topScorer ? `${topScorer.total_points} PTS` : null} />
        <TodayStat label="Most Assists" person={topAssist && topAssist.assists > 0 ? topAssist : null} value={topAssist && topAssist.assists > 0 ? `${topAssist.assists} AST` : null} />
        <TodayStat label="Top Defender" person={stl && stl.steals + stl.blocks > 0 ? stl : null} value={stl && stl.steals + stl.blocks > 0 ? `${stl.steals + stl.blocks} S+B` : null} />
        <TodayStat label="Fantasy MVP" person={fpLeader} value={fpLeader ? `${fpLeader.fantasy_points} FP` : null} accent />
      </div>
    </div>
  );
}

function TodayStat({
  label,
  person,
  value,
  accent = false,
}: {
  label: string;
  person: PlayerRow | null;
  value: string | null;
  accent?: boolean;
}) {
  const borderCls = accent
    ? "border-yellow-300 dark:border-yellow-700/50 bg-yellow-50/50 dark:bg-yellow-900/10"
    : "border-gray-200 dark:border-gray-800";
  const labelCls = accent
    ? "text-yellow-600 dark:text-yellow-500"
    : "text-gray-500 dark:text-gray-400";
  const nameCls = accent
    ? "text-yellow-700 dark:text-yellow-400"
    : "text-gray-900 dark:text-white";
  if (!person || !value) {
    return (
      <div className={`border ${borderCls} rounded-md px-3 py-2`}>
        <div className={`text-[12px] font-bold font-display uppercase tracking-wider ${labelCls} mb-0.5`}>
          {label}
        </div>
        <div className="text-xs text-gray-500 italic">—</div>
      </div>
    );
  }
  return (
    <div className={`border ${borderCls} rounded-md px-3 py-2`}>
      <div className={`text-[12px] font-bold font-display uppercase tracking-wider ${labelCls} mb-0.5`}>
        {label}
      </div>
      <Link
        href={`/player?id=${person.id}`}
        className={`block text-sm font-bold font-display truncate ${nameCls} hover:text-blue-400 transition-colors`}
      >
        {person.name}
      </Link>
      <div className="text-[13px] text-gray-500 dark:text-gray-400 tabular-nums">{value}</div>
    </div>
  );
}

// --- Records section: shared row layout + helpers ---

function RecordHeaderRow({
  label,
  value,
  children,
}: {
  label: string;
  value: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-baseline gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-[13px] font-bold font-display uppercase tracking-wider w-20 shrink-0 text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <span className="tabular-nums font-bold font-display text-2xl text-gray-900 dark:text-white w-12 shrink-0 leading-none">
        {value}
      </span>
      <div className="flex-1 min-w-0 flex items-baseline gap-x-1 gap-y-1 flex-wrap">{children}</div>
    </li>
  );
}

/** Small linked S#G# pill, e.g. "S1G70" → /game?id=... */
function GameRef({
  gameId,
  season,
  gameNumber,
  endGameNumber,
  endSeason,
}: {
  gameId: string;
  season: number;
  gameNumber: number;
  endGameNumber?: number;
  endSeason?: number;
}) {
  // The caller passes continuous game_number values (1..N across all seasons).
  // We display per-season numbers (G1..G82, resetting each season) so the
  // labels stay readable as the league grows.
  const startG = gameNumberInSeason(gameNumber);
  const endG = endGameNumber !== undefined ? gameNumberInSeason(endGameNumber) : undefined;

  let label: string;
  if (endG !== undefined && endGameNumber !== gameNumber) {
    if (endSeason !== undefined && endSeason !== season) {
      label = `S${season} G${startG} – S${endSeason} G${endG}`;
    } else {
      label = `S${season} G${startG}–${endG}`;
    }
  } else {
    label = `S${season} G${startG}`;
  }
  return (
    <Link
      href={`/game?id=${gameId}`}
      className="text-[13px] font-display tabular-nums text-gray-500 dark:text-gray-400 hover:text-blue-400 transition-colors"
    >
      {label}
    </Link>
  );
}

/** Renders "A, B, C" with commas as faded separators between rendered items. */
function CommaList<T>({
  items,
  render,
  keyOf,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  keyOf: (item: T, i: number) => string | number;
}) {
  return (
    <>
      {items.map((item, i) => (
        <span key={keyOf(item, i)} className="inline-flex items-baseline gap-1">
          {i > 0 && <span className="text-gray-400 dark:text-gray-600">,</span>}
          {render(item)}
        </span>
      ))}
    </>
  );
}

function SingleGameSection({
  records,
  me,
  meBests,
}: {
  records: SingleGameRecord[];
  me: { id: string; name: string } | null;
  meBests: Record<string, { value: number; game_id: string; game_number: number; season: number; start_time: string } | undefined> | undefined;
}) {
  const groups = groupByStat(records);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-3 mb-3 border-b border-gray-200 dark:border-gray-800">
        Single-Game Records
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">No games played yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-900">
          {groups.map((g) => {
            // Group ties by player so a player who holds the record across
            // multiple games is shown once with all their qualifying games.
            type PlayerGroup = {
              player_id: string;
              player_name: string;
              games: SingleGameRecord[];
            };
            const byPlayer = new Map<string, PlayerGroup>();
            for (const r of g.rows) {
              const cur = byPlayer.get(r.player_id);
              if (cur) {
                cur.games.push(r);
              } else {
                byPlayer.set(r.player_id, {
                  player_id: r.player_id,
                  player_name: r.player_name,
                  games: [r],
                });
              }
            }
            const playerGroups = Array.from(byPlayer.values());
            const meHolds = me ? playerGroups.some((pg) => pg.player_id === me.id) : false;
            const mine = me && meBests ? meBests[g.stat] : undefined;
            return (
              <RecordHeaderRow key={g.stat} label={STAT_SHORT[g.stat]} value={g.rows[0].value}>
                <CommaList
                  items={playerGroups}
                  keyOf={(p) => p.player_id}
                  render={(p) => (
                    <span className="inline-flex items-baseline gap-2 flex-wrap">
                      <Link
                        href={`/player?id=${p.player_id}`}
                        className="text-base font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                      >
                        {p.player_name}
                      </Link>
                      {p.games.length > 1 && (
                        <span className="text-xs font-display text-gray-500 dark:text-gray-400 tabular-nums">
                          ×{p.games.length}
                        </span>
                      )}
                      <span className="inline-flex items-baseline gap-1 flex-wrap">
                        {p.games.map((r, i) => (
                          <span key={r.game_id} className="inline-flex items-baseline gap-1">
                            {i > 0 && <span className="text-gray-300 dark:text-gray-700">·</span>}
                            <GameRef
                              gameId={r.game_id}
                              season={r.season}
                              gameNumber={r.game_number}
                            />
                          </span>
                        ))}
                      </span>
                    </span>
                  )}
                />
                {!meHolds && me && mine && mine.value > 0 && (
                  <div className="mt-1 text-xs text-blue-500 dark:text-blue-400 flex items-baseline gap-2 flex-wrap">
                    <span className="font-display uppercase tracking-wider text-[12px]">
                      Your best
                    </span>
                    <span className="font-bold tabular-nums">{mine.value}</span>
                    <GameRef
                      gameId={mine.game_id}
                      season={mine.season}
                      gameNumber={mine.game_number}
                    />
                  </div>
                )}
              </RecordHeaderRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SeasonSection({
  records,
  me,
  meBests,
}: {
  records: SeasonRecord[];
  me: { id: string; name: string } | null;
  meBests: Record<string, { value: number; season: number } | undefined> | undefined;
}) {
  const groups = groupByStat(records);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-3 mb-3 border-b border-gray-200 dark:border-gray-800">
        Season Records (Totals)
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">No completed games yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-900">
          {groups.map((g) => {
            const meHolds = me ? g.rows.some((r) => r.player_id === me.id) : false;
            const mine = me && meBests ? meBests[g.stat] : undefined;
            return (
              <RecordHeaderRow key={g.stat} label={STAT_SHORT[g.stat]} value={g.rows[0].value}>
                <CommaList
                  items={g.rows}
                  keyOf={(r) => `${r.player_id}-${r.season}`}
                  render={(r) => (
                    <>
                      <Link
                        href={`/player?id=${r.player_id}`}
                        className="text-base font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                      >
                        {r.player_name}
                      </Link>
                      <span className="text-[13px] font-display tabular-nums text-gray-500 dark:text-gray-400">
                        S{r.season} · {r.games_played} GP
                      </span>
                    </>
                  )}
                />
                {!meHolds && me && mine && mine.value > 0 && (
                  <div className="mt-1 text-xs text-blue-500 dark:text-blue-400 flex items-baseline gap-2 flex-wrap">
                    <span className="font-display uppercase tracking-wider text-[12px]">
                      Your best
                    </span>
                    <span className="font-bold tabular-nums">{mine.value}</span>
                    <span className="font-display uppercase tracking-wider text-[12px] text-gray-500 dark:text-gray-400">
                      · S{mine.season}
                    </span>
                  </div>
                )}
              </RecordHeaderRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GameLevelSection({ records }: { records: GameRecord[] }) {
  const groups = groupByStat(records);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-3 mb-3 border-b border-gray-200 dark:border-gray-800">
        Game Records
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">No completed games yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-900">
          {groups.map((g) => (
            <RecordHeaderRow key={g.stat} label={STAT_SHORT[g.stat]} value={g.rows[0].value}>
              <CommaList
                items={g.rows}
                keyOf={(r) => r.game_id}
                render={(r) => {
                  const winnerScore = Math.max(r.team_a_score, r.team_b_score);
                  const loserScore = Math.min(r.team_a_score, r.team_b_score);
                  return (
                    <>
                      <Link
                        href={`/game?id=${r.game_id}`}
                        className="text-base font-bold font-display tabular-nums text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                      >
                        {winnerScore}–{loserScore}
                      </Link>
                      <GameRef
                        gameId={r.game_id}
                        season={r.season}
                        gameNumber={r.game_number}
                      />
                    </>
                  );
                }}
              />
            </RecordHeaderRow>
          ))}
        </ul>
      )}
    </div>
  );
}

function StreakSection({
  records,
  me,
  meStreaks,
}: {
  records: StreakRecord[];
  me: { id: string; name: string } | null;
  meStreaks: { win: number; loss: number } | undefined;
}) {
  const groups = groupByStat(records);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-3 mb-3 border-b border-gray-200 dark:border-gray-800">
        Streak Records
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">Not enough games yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-900">
          {groups.map((g) => {
            const meHolds = me ? g.rows.some((r) => r.player_id === me.id) : false;
            const mineValue = me && meStreaks
              ? (g.stat === "win_streak" ? meStreaks.win : meStreaks.loss)
              : 0;
            return (
              <RecordHeaderRow key={g.stat} label={STAT_SHORT[g.stat]} value={g.rows[0].value}>
                <CommaList
                  items={g.rows}
                  keyOf={(r) => `${r.player_id}-${r.start_time}`}
                  render={(r) => (
                    <>
                      <Link
                        href={`/player?id=${r.player_id}`}
                        className="text-base font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                      >
                        {r.player_name}
                      </Link>
                      {/* Range label, linked to the final game of the streak. */}
                      <GameRef
                        gameId={r.end_game_id}
                        season={r.start_season}
                        gameNumber={r.start_game_number}
                        endGameNumber={r.end_game_number}
                        endSeason={r.end_season}
                      />
                    </>
                  )}
                />
                {!meHolds && me && mineValue > 0 && (
                  <div className="mt-1 text-xs text-blue-500 dark:text-blue-400 flex items-baseline gap-2">
                    <span className="font-display uppercase tracking-wider text-[12px]">
                      {g.stat === "loss_streak" ? "Your longest" : "Your best"}
                    </span>
                    <span className="font-bold tabular-nums">{mineValue}</span>
                  </div>
                )}
              </RecordHeaderRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function relativeDays(iso: string): string {
  // Compare *calendar days* in Central Time, not elapsed-ms. A game at 9pm
  // last night should read "yesterday" the entire next day, not "today" until
  // 9pm because <24h elapsed.
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const thenDay = fmt(then);
  const todayDay = fmt(new Date());
  if (thenDay === todayDay) return "today";
  // Calendar-day diff (parse YYYY-MM-DD as date-only)
  const t = new Date(thenDay + "T00:00:00Z").getTime();
  const n = new Date(todayDay + "T00:00:00Z").getTime();
  const days = Math.round((n - t) / (24 * 60 * 60 * 1000));
  if (days === 1) return "yesterday";
  if (days < 0) return ""; // future timestamp — shouldn't happen
  return `${days}d ago`;
}

function MilestoneWatchSection({ alerts }: { alerts: MilestoneAlert[] }) {
  // Already sorted upstream: achieved (newest first) then approaching (closest first).
  const achieved = alerts.filter((a) => a.kind === "achieved");
  const approaching = alerts.filter((a) => a.kind === "approaching");

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-3 mb-3 border-b border-gray-200 dark:border-gray-800">
        Milestone Watch
      </h3>
      {alerts.length === 0 ? (
        <p className="text-sm text-gray-500">No milestones approaching or recently achieved.</p>
      ) : (
        <div className="space-y-4">
          {achieved.length > 0 && (
            <div>
              <div className="text-xs font-display uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                Just Achieved
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-900">
                {achieved.slice(0, 8).map((m, i) => (
                  <li
                    key={`a-${m.player_id}-${m.stat}-${m.next_milestone}-${i}`}
                    className="flex items-baseline gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/player?id=${m.player_id}`}
                      className="text-base font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                    >
                      {m.player_name}
                    </Link>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-display">
                      hit
                    </span>
                    <span className="tabular-nums font-bold font-display text-lg text-emerald-600 dark:text-emerald-400 leading-none">
                      {m.next_milestone.toLocaleString()}
                    </span>
                    <span className="text-sm font-bold font-display uppercase tracking-wider text-gray-700 dark:text-gray-200">
                      {STAT_LONG[m.stat]}
                    </span>
                    {m.achieved_at && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-display tabular-nums">
                        · {relativeDays(m.achieved_at)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {approaching.length > 0 && (
            <div>
              {achieved.length > 0 && (
                <div className="text-xs font-display uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                  Approaching
                </div>
              )}
              <ul className="divide-y divide-gray-100 dark:divide-gray-900">
                {approaching.slice(0, 12).map((m, i) => (
                  <li
                    key={`p-${m.player_id}-${m.stat}-${m.next_milestone}-${i}`}
                    className="flex items-baseline gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/player?id=${m.player_id}`}
                      className="text-base font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                    >
                      {m.player_name}
                    </Link>
                    <span className="tabular-nums font-bold font-display text-lg text-gray-900 dark:text-white leading-none">
                      {m.remaining}
                    </span>
                    <span className="text-sm font-bold font-display uppercase tracking-wider text-gray-700 dark:text-gray-200">
                      {STAT_LONG[m.stat]}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display">
                      away from
                    </span>
                    <span className="tabular-nums font-bold font-display text-lg text-gray-700 dark:text-gray-200 leading-none">
                      {m.next_milestone.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-display tabular-nums">
                      ({m.current.toLocaleString()})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =======================================================================
// Page shell
// =======================================================================

export default function HomePage() {
  const { me } = useMe();
  const [meta, setMeta] = useState<SeasonMeta | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [seasonPlayers, setSeasonPlayers] = useState<PlayerRow[]>([]);
  const [today, setToday] = useState<TodayData | null>(null);
  const [records, setRecords] = useState<RecordsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  // MVP voting banner: which season has voting currently open, if any
  const [mvpVotingOpenSeason, setMvpVotingOpenSeason] = useState<number | null>(null);
  const [hotByPlayer, setHotByPlayer] = useState<Record<string, { last5_fpg: number; career_fpg: number; ratio: number }>>({});

  // Picked player's personal bests. Computed client-side from the
  // per-game stats endpoint so the Records section can show "your best"
  // when you don't already hold the record outright.
  interface MeBests {
    singleGame: Record<string, { value: number; game_id: string; game_number: number; season: number; start_time: string } | undefined>;
    /** Per-stat best season total, keyed by stat name (matches SeasonRecord.stat). */
    season: Record<string, { value: number; season: number } | undefined>;
    streak: { win: number; loss: number };
  }
  const [meBests, setMeBests] = useState<MeBests | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const m: SeasonMeta = await fetch(`${API_BASE}/stats/seasons`).then((r) => r.json());
        if (cancelled) return;
        setMeta(m);

        const todayStr = new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Chicago",
        });

        const [g, p, r, t, votes, prevVotes] = await Promise.all([
          fetch(`${API_BASE}/games`).then((r) => r.json() as Promise<GameRow[]>),
          fetch(`${API_BASE}/players?season=${m.currentSeason}`).then((r) => r.json()),
          fetch(`${API_BASE}/records`).then((r) => r.json() as Promise<RecordsBundle>),
          fetch(`${API_BASE}/stats/today?date=${todayStr}`)
            .then((r) => r.json() as Promise<TodayData>)
            .catch(() => null),
          // Check MVP voting for the current season AND the previous one.
          // The current season is usually still in progress (state=not_yet_open),
          // but the just-completed prior season is where voting actually opens.
          // Use the slim /votes/status endpoint — no leaderboard pipeline.
          fetch(`${API_BASE}/seasons/${m.currentSeason}/votes/status`)
            .then((r) => r.json() as Promise<{ state?: string }>)
            .catch(() => null),
          m.currentSeason > 1
            ? fetch(`${API_BASE}/seasons/${m.currentSeason - 1}/votes/status`)
                .then((r) => r.json() as Promise<{ state?: string }>)
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setGames(Array.isArray(g) ? g : []);
        // /api/players?season=N returns { data, season } — unwrap.
        const players: PlayerRow[] = Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];
        setSeasonPlayers(players);
        setRecords(r);
        setToday(t);
        // Pick the highest-numbered season whose voting is currently open.
        // (If both are open somehow, prefer the more recent one.)
        const openSeason =
          votes && votes.state === "open"
            ? m.currentSeason
            : prevVotes && prevVotes.state === "open"
              ? m.currentSeason - 1
              : null;
        setMvpVotingOpenSeason(openSeason);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    // Hot streaks — fire-and-forget; safe to fail silently.
    fetch(`${API_BASE}/hot-streaks`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: { player_id: string; last5_fpg: number; career_fpg: number; ratio: number }[]) => {
        if (cancelled || !Array.isArray(arr)) return;
        const m: Record<string, { last5_fpg: number; career_fpg: number; ratio: number }> = {};
        for (const r of arr) m[r.player_id] = { last5_fpg: r.last5_fpg, career_fpg: r.career_fpg, ratio: r.ratio };
        setHotByPlayer(m);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Personal bests for the picked player. Recomputed on selection change.
  useEffect(() => {
    if (!me) {
      setMeBests(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/players/${me.id}/games`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: {
        id: string;
        start_time: string;
        result: string;
        points_scored: number;
        assists: number;
        steals: number;
        blocks: number;
        fantasy_points: number;
        game_number: number;
      }[]) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) {
          setMeBests({ singleGame: {}, season: {}, streak: { win: 0, loss: 0 } });
          return;
        }
        // For each stat, find the player's best single-game value. Ties
        // pick the most recent occurrence so "your best · S2 G14" shows
        // their freshest peak.
        const sorted = [...rows].sort((a, b) =>
          b.start_time.localeCompare(a.start_time),
        );
        const bestOf = (key: keyof typeof sorted[0]) => {
          let best: typeof sorted[0] | null = null;
          for (const r of sorted) {
            const v = Number(r[key]);
            if (!best || v > Number(best[key])) best = r;
          }
          return best;
        };
        const seasonOf = (gameNumber: number) =>
          gameNumber > 0 ? Math.ceil(gameNumber / 82) : 0;
        const gameInSeason = (gameNumber: number) =>
          gameNumber > 0 ? ((gameNumber - 1) % 82) + 1 : 0;
        const toEntry = (key: keyof typeof sorted[0]) => {
          const b = bestOf(key);
          if (!b) return undefined;
          return {
            value: Number(b[key]),
            game_id: b.id,
            game_number: gameInSeason(Number(b.game_number)),
            season: seasonOf(Number(b.game_number)),
            start_time: b.start_time,
          };
        };

        const singleGame = {
          points: toEntry("points_scored"),
          assists: toEntry("assists"),
          steals: toEntry("steals"),
          blocks: toEntry("blocks"),
          fantasy_points: toEntry("fantasy_points"),
        } as MeBests["singleGame"];

        // Walk chronologically for longest W/L streaks.
        const chrono = [...rows].sort((a, b) =>
          a.start_time.localeCompare(b.start_time),
        );
        let curW = 0, curL = 0, longestWin = 0, longestLoss = 0;
        for (const g of chrono) {
          if (g.result === "W") {
            curW += 1; curL = 0;
            if (curW > longestWin) longestWin = curW;
          } else {
            curL += 1; curW = 0;
            if (curL > longestLoss) longestLoss = curL;
          }
        }

        // Per-season totals from the same chronological array. Group by
        // season (1-based, 82-game seasons), then pick the player's best
        // season for each stat the SeasonRecord category tracks.
        const totalsBySeason = new Map<number, {
          points: number; assists: number; steals: number; blocks: number;
          fantasy_points: number; wins: number;
        }>();
        for (const g of chrono) {
          const s = seasonOf(Number(g.game_number));
          if (s <= 0) continue;
          const t = totalsBySeason.get(s) ?? {
            points: 0, assists: 0, steals: 0, blocks: 0, fantasy_points: 0, wins: 0,
          };
          t.points += Number(g.points_scored) || 0;
          t.assists += Number(g.assists) || 0;
          t.steals += Number(g.steals) || 0;
          t.blocks += Number(g.blocks) || 0;
          t.fantasy_points += Number(g.fantasy_points) || 0;
          if (g.result === "W") t.wins += 1;
          totalsBySeason.set(s, t);
        }
        const bestSeasonOf = (key: string) => {
          let best: { value: number; season: number } | undefined;
          for (const [s, t] of totalsBySeason) {
            const v = (t as Record<string, number>)[key];
            if (!best || v > best.value) best = { value: v, season: s };
          }
          return best && best.value > 0 ? best : undefined;
        };
        const season: MeBests["season"] = {
          points: bestSeasonOf("points"),
          assists: bestSeasonOf("assists"),
          steals: bestSeasonOf("steals"),
          blocks: bestSeasonOf("blocks"),
          fantasy_points: bestSeasonOf("fantasy_points"),
          wins: bestSeasonOf("wins"),
        };

        setMeBests({ singleGame, season, streak: { win: longestWin, loss: longestLoss } });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [me]);

  if (loading || !meta) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  const liveGame = games.find((g) => g.status === "active") || null;
  const latestFinished = games.find((g) => g.status === "finished") || null;

  // Top-5 leaders for current season. Min-GP threshold matches the
  // end-of-season awards rate: 30 of 82 games = 0.3658. Scaled to where
  // the current season is so the bar is consistent through the year.
  const seasonStartGameIdx = (meta.currentSeason - 1) * meta.gamesPerSeason;
  const completedSeasonGames = Math.max(0, meta.totalGames - seasonStartGameIdx);
  const MIN_GP_RATIO = 30 / 82;
  const minGP = Math.max(1, Math.ceil(completedSeasonGames * MIN_GP_RATIO));
  const eligible = seasonPlayers.filter((p) => p.games_played >= minGP);
  // Sort on the raw quotient (full precision) so the displayed 2-dp order
  // is stable — using the 1-dp-rounded leaderboard ppg/fpg can produce
  // ties that the visible values resolve differently.
  const ppg2 = (p: PlayerRow) => p.total_points / (p.effective_games || 1);
  const fpg2 = (p: PlayerRow) => p.fantasy_points / (p.effective_games || 1);
  const def2 = (p: PlayerRow) => (p.steals + p.blocks) / (p.effective_games || 1);
  // Top-5 comes from the eligible (min-GP) pool — we don't want a
  // 1-game wonder leading the board. But "me's" rank in the appended
  // row should be their real standing in the FULL season list, not just
  // among qualifiers. So we compute two sorted lists per stat: one
  // gated, one full.
  function topAndMe(
    eligibleSorted: PlayerRow[],
    fullSorted: PlayerRow[],
  ): { top5: PlayerRow[]; meExtra: { player: PlayerRow; rank: number } | null } {
    const top5 = eligibleSorted.slice(0, 5);
    if (!me) return { top5, meExtra: null };
    const inTop5 = top5.some((p) => p.id === me.id);
    if (inTop5) return { top5, meExtra: null };
    const meIdx = fullSorted.findIndex((p) => p.id === me.id);
    if (meIdx < 0) return { top5, meExtra: null };
    return { top5, meExtra: { player: fullSorted[meIdx], rank: meIdx + 1 } };
  }
  const ppgSorted = [...eligible].sort((a, b) => ppg2(b) - ppg2(a));
  const fpgSorted = [...eligible].sort((a, b) => fpg2(b) - fpg2(a));
  const defSorted = [...eligible].sort((a, b) => def2(b) - def2(a));
  const winSorted = [...eligible].sort((a, b) => b.win_pct - a.win_pct);
  const ppgFull = [...seasonPlayers].sort((a, b) => ppg2(b) - ppg2(a));
  const fpgFull = [...seasonPlayers].sort((a, b) => fpg2(b) - fpg2(a));
  const defFull = [...seasonPlayers].sort((a, b) => def2(b) - def2(a));
  const winFull = [...seasonPlayers].sort((a, b) => b.win_pct - a.win_pct);
  const { top5: topPpg, meExtra: ppgMeExtra } = topAndMe(ppgSorted, ppgFull);
  const { top5: topFpg, meExtra: fpgMeExtra } = topAndMe(fpgSorted, fpgFull);
  const { top5: topDef, meExtra: defMeExtra } = topAndMe(defSorted, defFull);
  const { top5: topWin, meExtra: winMeExtra } = topAndMe(winSorted, winFull);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold font-display uppercase tracking-wide">Home</h1>
        <Link
          href="/stats"
          className="text-sm font-display text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
        >
          Full stats &amp; charts →
        </Link>
      </div>

      {mvpVotingOpenSeason !== null && (
        <Link
          href="/awards"
          className="block rounded-lg border border-blue-400/60 dark:border-blue-500/60 bg-blue-50 dark:bg-blue-900/30 px-4 py-3 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-display uppercase tracking-wider text-blue-600 dark:text-blue-300">
                MVP Voting Open
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">
                Cast your ballot for Season {mvpVotingOpenSeason} MVP.
              </div>
            </div>
            <div className="text-sm font-display uppercase tracking-wider text-blue-600 dark:text-blue-300">
              Vote now →
            </div>
          </div>
        </Link>
      )}

      {/* Hot-streak banner when "you" are on one. Sits above the rest so
          it's the first thing they see when popping in. */}
      {me && hotByPlayer[me.id] && (
        <Link
          href={`/player?id=${me.id}`}
          className="block rounded-lg border border-orange-400/60 dark:border-orange-500/40 bg-orange-50 dark:bg-orange-900/20 px-4 py-3 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
        >
          <div className="text-xs font-display uppercase tracking-wider text-orange-600 dark:text-orange-300">
            🔥 You're on a hot streak
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">
            Last 5 averaging <span className="font-bold tabular-nums">{hotByPlayer[me.id].last5_fpg.toFixed(2)}</span> FPG
            vs <span className="font-bold tabular-nums">{hotByPlayer[me.id].career_fpg.toFixed(2)}</span> career
            ({Math.round((hotByPlayer[me.id].ratio - 1) * 100)}% above average).
          </div>
        </Link>
      )}

      {/* Your line today */}
      {me && today && today.games_today > 0 && (() => {
        const mine = today.players.find((p) => p.id === me.id);
        if (!mine) return null;
        const fp = mine.fantasy_points;
        const fpg = mine.fpg || 0;
        const delta = fp - fpg;
        const sign = delta >= 0 ? "+" : "";
        return (
          <Link
            href={`/player?id=${me.id}`}
            className="block rounded-lg border border-blue-400/60 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            <div className="text-xs font-display uppercase tracking-wider text-blue-600 dark:text-blue-300">
              Your line today
            </div>
            <div className="mt-1 flex items-baseline gap-3 flex-wrap text-sm">
              <span className="font-bold text-gray-900 dark:text-white">
                {mine.total_points} PTS · {mine.assists} AST · {mine.steals} STL · {mine.blocks} BLK
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                <span className="font-bold tabular-nums">{fp}</span> FP
                <span className={`ml-1 tabular-nums ${delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-gray-500"}`}>
                  ({sign}{delta.toFixed(1)} vs {fpg.toFixed(1)} FPG)
                </span>
              </span>
            </div>
          </Link>
        );
      })()}

      {liveGame && <LiveBanner game={liveGame} />}
      {latestFinished && <LatestGameHero game={latestFinished} />}

      {today && today.games_today > 0 && <TodayBlock today={today} />}

      <SeasonPulse meta={meta} />

      <div className="flex items-baseline justify-between gap-3 pt-2 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-xl font-bold font-display uppercase tracking-wide">
            Season {meta.currentSeason} Leaders
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            min {minGP} GP ({Math.round(MIN_GP_RATIO * 100)}% of {completedSeasonGames})
          </span>
        </div>
        <Link
          href="/stats"
          className="text-xs font-display uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-blue-400 transition-colors"
        >
          View full leaderboard →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniLeaderCard title="Scoring (PPG)" unit="PPG" rows={topPpg} valueKey="ppg" hotByPlayer={hotByPlayer} meId={me?.id ?? null} meExtraRow={ppgMeExtra} />
        <MiniLeaderCard title="Fantasy (FPG)" unit="FPG" rows={topFpg} valueKey="fpg" hotByPlayer={hotByPlayer} meId={me?.id ?? null} meExtraRow={fpgMeExtra} />
        <MiniLeaderCard title="Defense (S+B)" unit="SPG+BPG" rows={topDef} valueKey="def" hotByPlayer={hotByPlayer} meId={me?.id ?? null} meExtraRow={defMeExtra} />
        <MiniLeaderCard title="Winning" unit="WIN%" rows={topWin} valueKey="win_pct" hotByPlayer={hotByPlayer} meId={me?.id ?? null} meExtraRow={winMeExtra} />
      </div>

      {/* My Records summary — records where the picked player holds #1
          in any category. Quick "what do I hold?" view above the full
          Records grid. */}
      {records && me && (() => {
        type Held = { label: string; value: string };
        const held: Held[] = [];
        // Single-game records: take the top row per stat group.
        const sgGroups = new Map<string, SingleGameRecord[]>();
        for (const r of records.single_game) {
          if (!sgGroups.has(r.stat)) sgGroups.set(r.stat, []);
          sgGroups.get(r.stat)!.push(r);
        }
        for (const [stat, rows] of sgGroups) {
          if (rows.length === 0) continue;
          const top = rows[0];
          if (top.player_id === me.id) {
            held.push({ label: `Single-game ${STAT_SHORT[stat] ?? stat}`, value: String(top.value) });
          }
        }
        // Season records:
        const seGroups = new Map<string, SeasonRecord[]>();
        for (const r of records.season) {
          if (!seGroups.has(r.stat)) seGroups.set(r.stat, []);
          seGroups.get(r.stat)!.push(r);
        }
        for (const [stat, rows] of seGroups) {
          if (rows.length === 0) continue;
          const top = rows[0];
          if (top.player_id === me.id) {
            held.push({ label: `Season ${STAT_SHORT[stat] ?? stat}`, value: String(top.value) });
          }
        }
        // Streaks:
        const stGroups = new Map<string, StreakRecord[]>();
        for (const r of records.streak) {
          if (!stGroups.has(r.stat)) stGroups.set(r.stat, []);
          stGroups.get(r.stat)!.push(r);
        }
        for (const [stat, rows] of stGroups) {
          if (rows.length === 0) continue;
          const top = rows[0];
          if (top.player_id === me.id) {
            held.push({ label: `Longest ${STAT_SHORT[stat] ?? stat}`, value: String(top.value) });
          }
        }
        if (held.length === 0) return null;
        return (
          <div className="rounded-lg border border-blue-400/60 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
            <div className="text-xs font-display uppercase tracking-wider text-blue-600 dark:text-blue-300 mb-2">
              Records you hold
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {held.map((h) => (
                <span key={h.label} className="text-gray-700 dark:text-gray-200">
                  {h.label}: <span className="font-bold tabular-nums">{h.value}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {records && (
        <>
          <h2 className="text-xl font-bold font-display uppercase tracking-wide pt-2">Records</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SingleGameSection records={records.single_game} me={me} meBests={meBests?.singleGame} />
            <SeasonSection records={records.season} me={me} meBests={meBests?.season} />
            <GameLevelSection records={records.game} />
            <StreakSection records={records.streak} me={me} meStreaks={meBests?.streak} />
          </div>
          <MilestoneWatchSection alerts={records.milestones} />
        </>
      )}

      <div className="pt-4 text-center">
        <Link
          href="/stats"
          className="inline-block text-sm font-display uppercase tracking-wider px-4 py-2 rounded-md border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-400 transition-colors"
        >
          Full stats &amp; charts →
        </Link>
      </div>
    </div>
  );
}
