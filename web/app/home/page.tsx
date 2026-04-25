"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatShortDateCT } from "@/lib/time";

const API_BASE = "/api";

// --- Types matching the various endpoints we hit ---

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

interface AwardWinner {
  player_id: string;
  name: string;
  value: number;
  value_label: string;
  games_played: number;
}

interface AwardEntry {
  winner: AwardWinner | null;
  runner_up: AwardWinner | null;
}

interface SeasonAwards {
  season: number;
  games_in_season: number;
  total_games_in_season: number;
  min_games_required: number;
  mvp: AwardWinner | null;
  scoring_leader: AwardEntry;
  defensive_pots: AwardEntry;
  clutch_pots: AwardEntry;
}

interface SingleGameRecord {
  stat: "points" | "assists" | "steals" | "blocks" | "fantasy_points";
  player_id: string;
  player_name: string;
  value: number;
  game_id: string;
  start_time: string;
}

interface MilestoneAlert {
  player_id: string;
  player_name: string;
  stat: "points" | "assists" | "steals" | "blocks" | "games";
  current: number;
  next_milestone: number;
  remaining: number;
}

interface RecordsData {
  records: SingleGameRecord[];
  milestones: MilestoneAlert[];
}

// --- Display helpers ---

const STAT_LABEL: Record<string, string> = {
  points: "PTS",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  fantasy_points: "FP",
  games: "GP",
};

const STAT_LONG: Record<string, string> = {
  points: "Career Points",
  assists: "Career Assists",
  steals: "Career Steals",
  blocks: "Career Blocks",
  games: "Career Games",
};

// --- Components ---

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

function SeasonPulse({
  meta,
  awards,
  topByFpg,
}: {
  meta: SeasonMeta;
  awards: SeasonAwards | null;
  topByFpg: PlayerRow[];
}) {
  const completed = awards
    ? awards.games_in_season >= awards.total_games_in_season
    : false;
  const remaining = awards
    ? Math.max(0, awards.total_games_in_season - awards.games_in_season)
    : 0;
  const pct = awards
    ? Math.round((awards.games_in_season / awards.total_games_in_season) * 100)
    : 0;

  // MVP race: top two by FPG with a real qualifying GP count.
  // (Awards page uses ≥30 GP, but for the home strip we just show the leaderboard frontrunners.)
  const [first, second] = topByFpg;
  const gap = first && second ? Math.round((first.fpg - second.fpg) * 100) / 100 : 0;

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div className="text-sm font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          Season {meta.currentSeason}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {awards ? (
            completed
              ? `Completed · ${awards.total_games_in_season} games`
              : `${awards.games_in_season} / ${awards.total_games_in_season} games · ${remaining} to go`
          ) : (
            `${meta.totalGames} games`
          )}
        </div>
      </div>

      {/* Progress bar */}
      {awards && (
        <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* MVP race line */}
      {first && second ? (
        <div className="flex items-baseline gap-2 text-xs flex-wrap">
          <span className="text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display">
            FPG Race:
          </span>
          <Link
            href={`/player?id=${first.id}`}
            className="font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
          >
            {first.name}
          </Link>
          <span className="tabular-nums text-gray-700 dark:text-gray-200">{first.fpg.toFixed(2)}</span>
          <span className="text-gray-400 dark:text-gray-600">→</span>
          <Link
            href={`/player?id=${second.id}`}
            className="font-display text-gray-700 dark:text-gray-200 hover:text-blue-400 transition-colors"
          >
            {second.name}
          </Link>
          <span className="tabular-nums text-gray-500 dark:text-gray-400">
            {second.fpg.toFixed(2)}
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-1">(gap: {gap.toFixed(2)})</span>
        </div>
      ) : (
        <div className="text-xs text-gray-500">Not enough data for an FPG race yet.</div>
      )}
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

function AwardRaceItem({ label, entry, minGames }: { label: string; entry: AwardEntry; minGames: number }) {
  const w = entry.winner;
  const r = entry.runner_up;
  return (
    <div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display mb-1.5">
        {label}
      </div>
      {w ? (
        <>
          <Link
            href={`/player?id=${w.player_id}`}
            className="block text-sm font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors truncate"
          >
            {w.name}
            <span className="ml-1.5 text-[11px] font-normal text-gray-500 tabular-nums">
              {w.value_label}
            </span>
          </Link>
          {r && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
              <Link
                href={`/player?id=${r.player_id}`}
                className="hover:text-blue-400 transition-colors"
              >
                {r.name}
              </Link>
              <span className="tabular-nums ml-1.5">{r.value_label}</span>
            </div>
          )}
        </>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-600">
          No qualifier yet (min {minGames} GP)
        </span>
      )}
    </div>
  );
}

function MvpRaceItem({ winner, minGames }: { winner: AwardWinner | null; minGames: number }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display mb-1.5">
        MVP
      </div>
      {winner ? (
        <Link
          href={`/player?id=${winner.player_id}`}
          className="block text-sm font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors truncate"
        >
          {winner.name}
          <span className="ml-1.5 text-[11px] font-normal text-gray-500">voted</span>
        </Link>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-600">
          Not voted yet (min {minGames} GP)
        </span>
      )}
    </div>
  );
}

function AwardsRace({ awards }: { awards: SeasonAwards }) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-xs font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          Season {awards.season} Award Race
        </h3>
        <Link
          href="/awards"
          className="text-[11px] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Full awards →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MvpRaceItem winner={awards.mvp} minGames={awards.min_games_required} />
        <AwardRaceItem
          label="Scoring Leader"
          entry={awards.scoring_leader}
          minGames={awards.min_games_required}
        />
        <AwardRaceItem
          label="Def. POTS"
          entry={awards.defensive_pots}
          minGames={awards.min_games_required}
        />
        <AwardRaceItem
          label="Clutch POTS"
          entry={awards.clutch_pots}
          minGames={awards.min_games_required}
        />
      </div>
    </div>
  );
}

function RecordsAndMilestones({ data }: { data: RecordsData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Single-game records */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
        <h3 className="text-xs font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
          All-Time Single-Game Records
        </h3>
        {data.records.length === 0 ? (
          <p className="text-xs text-gray-500">No games played yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-900">
            {data.records.map((r) => (
              <li key={r.stat} className="flex items-baseline gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-[10px] font-bold font-display uppercase tracking-wider text-gray-500 dark:text-gray-400 w-8 shrink-0">
                  {STAT_LABEL[r.stat]}
                </span>
                <span className="tabular-nums font-bold font-display text-lg text-gray-900 dark:text-white w-10 shrink-0">
                  {r.value}
                </span>
                <Link
                  href={`/player?id=${r.player_id}`}
                  className="flex-1 truncate text-sm font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                >
                  {r.player_name}
                </Link>
                <Link
                  href={`/game?id=${r.game_id}`}
                  className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shrink-0 tabular-nums"
                >
                  {formatShortDateCT(r.start_time)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Milestone watch */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
        <h3 className="text-xs font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
          Milestone Watch
        </h3>
        {data.milestones.length === 0 ? (
          <p className="text-xs text-gray-500">
            Nobody is approaching a milestone right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.milestones.slice(0, 10).map((m, i) => (
              <li
                key={`${m.player_id}-${m.stat}-${m.next_milestone}-${i}`}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="tabular-nums w-12 font-display font-bold text-amber-600 dark:text-amber-500 shrink-0">
                  {m.remaining}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display shrink-0">
                  from {m.next_milestone}
                </span>
                <Link
                  href={`/player?id=${m.player_id}`}
                  className="flex-1 truncate font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
                >
                  {m.player_name}
                </Link>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display shrink-0">
                  {STAT_LONG[m.stat]} ({m.current})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Page shell ---

export default function HomePage() {
  const [meta, setMeta] = useState<SeasonMeta | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [seasonPlayers, setSeasonPlayers] = useState<PlayerRow[]>([]);
  const [awards, setAwards] = useState<SeasonAwards | null>(null);
  const [records, setRecords] = useState<RecordsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const m: SeasonMeta = await fetch(`${API_BASE}/stats/seasons`).then((r) => r.json());
        if (cancelled) return;
        setMeta(m);

        const [g, p, a, r] = await Promise.all([
          fetch(`${API_BASE}/games`).then((r) => r.json() as Promise<GameRow[]>),
          fetch(`${API_BASE}/players?season=${m.currentSeason}`).then(
            (r) => r.json() as Promise<PlayerRow[]>,
          ),
          fetch(`${API_BASE}/seasons/${m.currentSeason}/awards`).then(
            (r) => r.json() as Promise<SeasonAwards>,
          ),
          fetch(`${API_BASE}/records`).then((r) => r.json() as Promise<RecordsData>),
        ]);
        if (cancelled) return;
        setGames(Array.isArray(g) ? g : []);
        setSeasonPlayers(Array.isArray(p) ? p : []);
        setAwards(a);
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
  // 1-game wonder. 5 GP keeps it inclusive but not noisy.
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

      <SeasonPulse meta={meta} awards={awards} topByFpg={topFpg} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniLeaderCard title="Scoring (PPG)" unit="PPG" rows={topPpg} valueKey="ppg" />
        <MiniLeaderCard title="Fantasy (FPG)" unit="FPG" rows={topFpg} valueKey="fpg" />
        <MiniLeaderCard title="Defense (S+B)" unit="SPG+BPG" rows={topDef} valueKey="def" />
      </div>

      {awards && <AwardsRace awards={awards} />}

      {records && <RecordsAndMilestones data={records} />}
    </div>
  );
}
