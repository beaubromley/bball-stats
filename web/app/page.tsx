"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatShortDateCT } from "@/lib/time";

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
          <div className="text-[11px] text-gray-400 dark:text-gray-600 mt-0.5">
            Game {game.game_number} · {formatShortDateCT(game.start_time)}
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
          <span className="text-[10px] font-bold font-display uppercase tracking-wider text-yellow-600 dark:text-yellow-500">
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
}: {
  title: string;
  unit: string;
  rows: PlayerRow[];
  valueKey: LeaderKey;
}) {
  function valueOf(p: PlayerRow): number {
    if (valueKey === "ppg") return p.ppg;
    if (valueKey === "fpg") return p.fpg;
    if (valueKey === "win_pct") return p.win_pct;
    return Math.round((p.spg + p.bpg) * 100) / 100;
  }
  function format(p: PlayerRow): string {
    if (valueKey === "win_pct") return `${Math.round(p.win_pct)}%`;
    return valueOf(p).toFixed(2);
  }
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-xs font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          {title}
        </h3>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-display">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No data yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((p, i) => (
            <li key={p.id} className="flex items-baseline gap-2 text-sm">
              <span className="tabular-nums w-4 font-display font-bold text-xs text-gray-500 dark:text-gray-400">
                {i + 1}
              </span>
              <Link
                href={`/player?id=${p.id}`}
                className="flex-1 truncate font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
              >
                {p.name}
              </Link>
              <span className="tabular-nums font-bold font-display text-gray-900 dark:text-white">
                {format(p)}
              </span>
            </li>
          ))}
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
        <div className={`text-[10px] font-bold font-display uppercase tracking-wider ${labelCls} mb-0.5`}>
          {label}
        </div>
        <div className="text-xs text-gray-500 italic">—</div>
      </div>
    );
  }
  return (
    <div className={`border ${borderCls} rounded-md px-3 py-2`}>
      <div className={`text-[10px] font-bold font-display uppercase tracking-wider ${labelCls} mb-0.5`}>
        {label}
      </div>
      <Link
        href={`/player?id=${person.id}`}
        className={`block text-sm font-bold font-display truncate ${nameCls} hover:text-blue-400 transition-colors`}
      >
        {person.name}
      </Link>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">{value}</div>
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
      <span className="text-[11px] font-bold font-display uppercase tracking-wider w-20 shrink-0 text-gray-500 dark:text-gray-400">
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
  let label: string;
  if (endGameNumber !== undefined && endGameNumber !== gameNumber) {
    if (endSeason !== undefined && endSeason !== season) {
      label = `S${season}G${gameNumber}–S${endSeason}G${endGameNumber}`;
    } else {
      label = `S${season} G${gameNumber}–${endGameNumber}`;
    }
  } else {
    label = `S${season}G${gameNumber}`;
  }
  return (
    <Link
      href={`/game?id=${gameId}`}
      className="text-[11px] font-display tabular-nums text-gray-500 dark:text-gray-400 hover:text-blue-400 transition-colors"
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

function SingleGameSection({ records }: { records: SingleGameRecord[] }) {
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
              </RecordHeaderRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SeasonSection({ records }: { records: SeasonRecord[] }) {
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
          {groups.map((g) => (
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
                    <span className="text-[11px] font-display tabular-nums text-gray-500 dark:text-gray-400">
                      S{r.season} · {r.games_played} GP
                    </span>
                  </>
                )}
              />
            </RecordHeaderRow>
          ))}
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

function StreakSection({ records }: { records: StreakRecord[] }) {
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
          {groups.map((g) => (
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
            </RecordHeaderRow>
          ))}
        </ul>
      )}
    </div>
  );
}

function MilestoneWatchSection({ alerts }: { alerts: MilestoneAlert[] }) {
  // Sort by closeness — already done upstream, but keep stable.
  const sorted = [...alerts].sort((a, b) => a.remaining - b.remaining);

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-3 mb-3 border-b border-gray-200 dark:border-gray-800">
        Milestone Watch
      </h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">Nobody is approaching a milestone right now.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-900">
          {sorted.slice(0, 12).map((m, i) => (
            <li
              key={`${m.player_id}-${m.stat}-${m.next_milestone}-${i}`}
              className="flex items-baseline gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="tabular-nums font-bold font-display text-2xl text-gray-900 dark:text-white w-10 shrink-0 leading-none">
                {m.remaining}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display shrink-0">
                from
              </span>
              <span className="tabular-nums font-bold font-display text-lg text-gray-700 dark:text-gray-200 shrink-0 leading-none">
                {m.next_milestone.toLocaleString()}
              </span>
              <Link
                href={`/player?id=${m.player_id}`}
                className="flex-1 truncate text-base font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
              >
                {m.player_name}
              </Link>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display shrink-0 tabular-nums">
                {STAT_LONG[m.stat]} ({m.current.toLocaleString()})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =======================================================================
// Page shell
// =======================================================================

export default function HomePage() {
  const [meta, setMeta] = useState<SeasonMeta | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [seasonPlayers, setSeasonPlayers] = useState<PlayerRow[]>([]);
  const [today, setToday] = useState<TodayData | null>(null);
  const [records, setRecords] = useState<RecordsBundle | null>(null);
  const [loading, setLoading] = useState(true);

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

        const [g, p, r, t] = await Promise.all([
          fetch(`${API_BASE}/games`).then((r) => r.json() as Promise<GameRow[]>),
          fetch(`${API_BASE}/players?season=${m.currentSeason}`).then((r) => r.json()),
          fetch(`${API_BASE}/records`).then((r) => r.json() as Promise<RecordsBundle>),
          fetch(`${API_BASE}/stats/today?date=${todayStr}`)
            .then((r) => r.json() as Promise<TodayData>)
            .catch(() => null),
        ]);
        if (cancelled) return;
        setGames(Array.isArray(g) ? g : []);
        // /api/players?season=N returns { data, season } — unwrap.
        const players: PlayerRow[] = Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];
        setSeasonPlayers(players);
        setRecords(r);
        setToday(t);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !meta) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  const liveGame = games.find((g) => g.status === "active") || null;
  const latestFinished = games.find((g) => g.status === "finished") || null;

  // Top-3 leaders for current season — require at least 20% of completed
  // season games played so we don't crown a 1-game wonder.
  const seasonStartGameIdx = (meta.currentSeason - 1) * meta.gamesPerSeason;
  const completedSeasonGames = Math.max(0, meta.totalGames - seasonStartGameIdx);
  const minGP = Math.max(1, Math.ceil(completedSeasonGames * 0.2));
  const eligible = seasonPlayers.filter((p) => p.games_played >= minGP);
  const topPpg = [...eligible].sort((a, b) => b.ppg - a.ppg).slice(0, 3);
  const topFpg = [...eligible].sort((a, b) => b.fpg - a.fpg).slice(0, 3);
  const topDef = [...eligible]
    .sort((a, b) => b.spg + b.bpg - (a.spg + a.bpg))
    .slice(0, 3);
  const topWin = [...eligible].sort((a, b) => b.win_pct - a.win_pct).slice(0, 3);

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
            min {minGP} GP (20% of {completedSeasonGames})
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
        <MiniLeaderCard title="Scoring (PPG)" unit="PPG" rows={topPpg} valueKey="ppg" />
        <MiniLeaderCard title="Fantasy (FPG)" unit="FPG" rows={topFpg} valueKey="fpg" />
        <MiniLeaderCard title="Defense (S+B)" unit="SPG+BPG" rows={topDef} valueKey="def" />
        <MiniLeaderCard title="Winning" unit="WIN%" rows={topWin} valueKey="win_pct" />
      </div>

      {records && (
        <>
          <h2 className="text-xl font-bold font-display uppercase tracking-wide pt-2">Records</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SingleGameSection records={records.single_game} />
            <SeasonSection records={records.season} />
            <GameLevelSection records={records.game} />
            <StreakSection records={records.streak} />
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
