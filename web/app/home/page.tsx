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
  ppg: number;
  apg: number;
  spg: number;
  bpg: number;
  fpg: number;
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

function MiniLeaderCard({
  title,
  unit,
  rows,
  valueKey,
}: {
  title: string;
  unit: string;
  rows: PlayerRow[];
  valueKey: "ppg" | "fpg" | "def";
}) {
  function valueOf(p: PlayerRow): number {
    if (valueKey === "ppg") return p.ppg;
    if (valueKey === "fpg") return p.fpg;
    return Math.round((p.spg + p.bpg) * 100) / 100;
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
                {valueOf(p).toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      )}
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
          {groups.map((g) => (
            <RecordHeaderRow key={g.stat} label={STAT_SHORT[g.stat]} value={g.rows[0].value}>
              <CommaList
                items={g.rows}
                keyOf={(r) => `${r.player_id}-${r.game_id}`}
                render={(r) => (
                  <>
                    <Link
                      href={`/player?id=${r.player_id}`}
                      className="text-base font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                    >
                      {r.player_name}
                    </Link>
                    <GameRef
                      gameId={r.game_id}
                      season={r.season}
                      gameNumber={r.game_number}
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

type MilestoneTier = "bronze" | "silver" | "gold";

function tierFor(milestone: number): MilestoneTier {
  if (milestone >= 1000) return "gold";
  if (milestone >= 250) return "silver";
  return "bronze";
}

const TIER_STYLES: Record<
  MilestoneTier,
  {
    label: string;
    container: string;
    badge: string;
    milestone: string;
    remaining: string;
  }
> = {
  bronze: {
    label: "Bronze",
    container: "border-l-2 border-l-amber-700/40",
    badge:
      "bg-amber-700/10 text-amber-700 dark:text-amber-600 border border-amber-700/30",
    milestone: "text-amber-700 dark:text-amber-600",
    remaining: "text-gray-700 dark:text-gray-300",
  },
  silver: {
    label: "Silver",
    container: "border-l-2 border-l-slate-400/60",
    badge:
      "bg-slate-400/10 text-slate-500 dark:text-slate-300 border border-slate-400/40",
    milestone: "text-slate-600 dark:text-slate-300",
    remaining: "text-gray-800 dark:text-gray-100",
  },
  gold: {
    label: "Gold",
    container:
      "border-l-2 border-l-yellow-500 bg-yellow-500/[0.04] dark:bg-yellow-500/[0.06] -mx-2 px-2 rounded-r",
    badge:
      "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/40 font-bold",
    milestone: "text-yellow-600 dark:text-yellow-400 drop-shadow-[0_0_4px_rgba(234,179,8,0.25)]",
    remaining: "text-gray-900 dark:text-white",
  },
};

function MilestoneWatchSection({ alerts }: { alerts: MilestoneAlert[] }) {
  // Show gold tier first (most prestigious), then silver, then bronze.
  // Within a tier, keep the closeness ordering already applied upstream.
  const tierOrder: Record<MilestoneTier, number> = { gold: 0, silver: 1, bronze: 2 };
  const sorted = [...alerts].sort((a, b) => {
    const ta = tierOrder[tierFor(a.next_milestone)];
    const tb = tierOrder[tierFor(b.next_milestone)];
    if (ta !== tb) return ta - tb;
    return a.remaining - b.remaining;
  });

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <div className="flex items-baseline justify-between pb-3 mb-3 border-b border-gray-200 dark:border-gray-800 flex-wrap gap-3">
        <h3 className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          Milestone Watch
        </h3>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-display">
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-600">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-700/60 dark:bg-amber-600/60" />
            Bronze
          </span>
          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
            Silver
          </span>
          <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
            Gold
          </span>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">Nobody is approaching a milestone right now.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-900">
          {sorted.slice(0, 12).map((m, i) => {
            const tier = tierFor(m.next_milestone);
            const styles = TIER_STYLES[tier];
            return (
              <li
                key={`${m.player_id}-${m.stat}-${m.next_milestone}-${i}`}
                className={`flex items-baseline gap-3 py-3 first:pt-0 last:pb-0 ${styles.container}`}
              >
                <span
                  className={`tabular-nums font-bold font-display text-2xl w-10 shrink-0 leading-none ${styles.remaining}`}
                >
                  {m.remaining}
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display shrink-0">
                  from
                </span>
                <span
                  className={`tabular-nums font-bold font-display text-lg shrink-0 leading-none ${styles.milestone}`}
                >
                  {m.next_milestone.toLocaleString()}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider font-display shrink-0 px-1.5 py-0.5 rounded ${styles.badge}`}
                >
                  {styles.label}
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
            );
          })}
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
  const [records, setRecords] = useState<RecordsBundle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const m: SeasonMeta = await fetch(`${API_BASE}/stats/seasons`).then((r) => r.json());
        if (cancelled) return;
        setMeta(m);

        const [g, p, r] = await Promise.all([
          fetch(`${API_BASE}/games`).then((r) => r.json() as Promise<GameRow[]>),
          fetch(`${API_BASE}/players?season=${m.currentSeason}`).then((r) => r.json()),
          fetch(`${API_BASE}/records`).then((r) => r.json() as Promise<RecordsBundle>),
        ]);
        if (cancelled) return;
        setGames(Array.isArray(g) ? g : []);
        // /api/players?season=N returns { data, season } — unwrap.
        const players: PlayerRow[] = Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];
        setSeasonPlayers(players);
        setRecords(r);
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

  // Top-3 leaders for current season — minimal GP filter so we don't crown a
  // 1-game wonder.
  const eligible = seasonPlayers.filter((p) => p.games_played >= 5);
  const topPpg = [...eligible].sort((a, b) => b.ppg - a.ppg).slice(0, 3);
  const topFpg = [...eligible].sort((a, b) => b.fpg - a.fpg).slice(0, 3);
  const topDef = [...eligible]
    .sort((a, b) => b.spg + b.bpg - (a.spg + a.bpg))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold font-display uppercase tracking-wide">Home</h1>

      {liveGame && <LiveBanner game={liveGame} />}
      {latestFinished && <LatestGameHero game={latestFinished} />}

      <SeasonPulse meta={meta} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniLeaderCard title="Scoring (PPG)" unit="PPG" rows={topPpg} valueKey="ppg" />
        <MiniLeaderCard title="Fantasy (FPG)" unit="FPG" rows={topFpg} valueKey="fpg" />
        <MiniLeaderCard title="Defense (S+B)" unit="SPG+BPG" rows={topDef} valueKey="def" />
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
    </div>
  );
}
