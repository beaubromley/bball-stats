"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

const API_BASE = "/api";

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
  game_mvp_leader: AwardEntry;
  all_ymca_1st: AwardWinner[];
  all_ymca_2nd: AwardWinner[];
  all_defensive: AwardWinner[];
}

interface SeasonMeta {
  totalGames: number;
  totalSeasons: number;
  currentSeason: number;
  gamesPerSeason: number;
}

interface LeaderboardPlayer {
  id: string;
  name: string;
  games_played: number;
}

// --- Award icons ---
// Each card gets a unique decorative icon anchored in the top-right gap.
// Rendered subtle (low contrast) so the hero stat stays the focal point.

const ICON_CLASS =
  "absolute top-[72px] right-5 text-gray-200 dark:text-gray-800 pointer-events-none";

function CrownIcon() {
  // MVP — regal crown
  return (
    <svg className={ICON_CLASS} width="92" height="92" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  );
}

function FlameIcon() {
  // Scoring Leader — flame
  return (
    <svg className={ICON_CLASS} width="92" height="92" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function ShieldIcon() {
  // Defensive POTS — shield with check
  return (
    <svg className={ICON_CLASS} width="92" height="92" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function BoltIcon() {
  // Clutch POTS — lightning bolt
  return (
    <svg className={ICON_CLASS} width="92" height="92" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}

function splitStat(label: string): { value: string; unit: string; numeric: boolean } {
  const match = label.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return { value: label, unit: "", numeric: false };
  return { value: match[1], unit: match[2], numeric: true };
}

function RunnerUpRow({ winner }: { winner: AwardWinner }) {
  const stat = splitStat(winner.value_label);
  return (
    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-800">
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display mb-1.5">
        Runner-up
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/player?id=${winner.player_id}`}
          className="text-sm font-bold font-display text-gray-700 dark:text-gray-200 hover:text-blue-400 transition-colors truncate"
        >
          {winner.name}
          <span className="ml-2 text-[11px] font-normal text-gray-500 tabular-nums">
            · {winner.games_played} GP
          </span>
        </Link>
        <span className="tabular-nums text-sm font-bold text-gray-700 dark:text-gray-200 shrink-0">
          <span className="font-display">{stat.value}</span>
          {stat.unit && (
            <span className="text-[10px] text-gray-500 ml-1 uppercase tracking-wider">{stat.unit}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function AwardCard({
  title,
  subtitle,
  entry,
  minGames,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  entry: AwardEntry;
  minGames: number;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const winner = entry.winner;
  const stat = winner ? splitStat(winner.value_label) : null;
  return (
    <div className="relative overflow-hidden border border-gray-200 dark:border-gray-800 rounded-lg p-5 flex flex-col">
      {icon}
      <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
        {title}
      </h2>
      {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-2 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-1" />}

      {winner && stat ? (
        <div className="flex-1">
          {/* Hero stat — big bold number with high contrast */}
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-6xl font-bold font-display tabular-nums text-gray-900 dark:text-white leading-none">
              {stat.value}
            </span>
            {stat.unit && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-display uppercase tracking-wider">
                {stat.unit}
              </span>
            )}
          </div>
          {/* Winner name with GP inline */}
          <Link
            href={`/player?id=${winner.player_id}`}
            className="text-xl font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
          >
            {winner.name}
            <span className="ml-2 text-[11px] font-normal text-gray-500 tabular-nums">
              · {winner.games_played} GP
            </span>
          </Link>
          {entry.runner_up && <RunnerUpRow winner={entry.runner_up} />}
        </div>
      ) : (
        <p className="text-sm text-gray-500 flex-1">
          No eligible player yet (min {minGames} games required).
        </p>
      )}
      {children}
    </div>
  );
}

function MvpCard({
  winner,
  minGames,
  icon,
  children,
}: {
  winner: AwardWinner | null;
  minGames: number;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const stat = winner ? splitStat(winner.value_label) : null;
  return (
    <div className="relative overflow-hidden border border-gray-200 dark:border-gray-800 rounded-lg p-5 flex flex-col">
      {icon}
      <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
        MVP
      </h2>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-2 mb-4">Voted separately</p>

      {winner && stat ? (
        <div className="flex-1">
          <Link
            href={`/player?id=${winner.player_id}`}
            className="block text-4xl font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors leading-tight mb-2"
          >
            {winner.name}
          </Link>
          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-display">{stat.value}</div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 flex-1">
          No MVP set yet (min {minGames} games recommended).
        </p>
      )}
      {children}
    </div>
  );
}

function TeamCard({ title, players, minGames }: { title: string; players: AwardWinner[]; minGames: number }) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-4 border-b border-gray-200 dark:border-gray-800">
        {title}
      </h2>
      {players.length === 0 ? (
        <p className="text-sm text-gray-500">Not enough qualified players yet (min {minGames} games).</p>
      ) : (
        <ol className="divide-y divide-gray-100 dark:divide-gray-900">
          {players.map((p, i) => {
            const stat = splitStat(p.value_label);
            return (
              <li key={p.player_id} className="flex items-baseline gap-3 py-3 first:pt-0 last:pb-0">
                <span className="tabular-nums w-5 font-display font-bold text-sm text-gray-900 dark:text-white">
                  {i + 1}
                </span>
                <Link
                  href={`/player?id=${p.player_id}`}
                  className="flex-1 hover:text-blue-400 transition-colors font-bold font-display text-sm text-gray-900 dark:text-white"
                >
                  {p.name}
                  <span className="ml-2 text-[11px] font-normal text-gray-500 tabular-nums">
                    · {p.games_played} GP
                  </span>
                </Link>
                <span className="tabular-nums font-bold text-sm text-gray-900 dark:text-white">
                  <span className="font-display">{stat.value}</span>
                  {stat.unit && <span className="text-[11px] font-normal text-gray-500 ml-1 uppercase tracking-wider">{stat.unit}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function AdminMvpPicker({
  season,
  currentMvpId,
  onSet,
}: {
  season: number;
  currentMvpId: string | null;
  onSet: () => void;
}) {
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [selected, setSelected] = useState<string>(currentMvpId || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(currentMvpId || "");
  }, [currentMvpId]);

  useEffect(() => {
    fetch(`${API_BASE}/players?season=${season}`)
      .then((r) => r.json())
      .then((data) => {
        const list: LeaderboardPlayer[] = Array.isArray(data) ? data : data.data || [];
        // Sort alphabetically for the picker
        list.sort((a, b) => a.name.localeCompare(b.name));
        setPlayers(list);
      })
      .catch(() => setPlayers([]));
  }, [season]);

  async function save(newId: string) {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/seasons/${season}/awards/mvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: newId || null }),
      });
      onSet();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-800">
      <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-2">
        Admin: Set MVP
      </label>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            save(e.target.value);
          }}
          disabled={saving}
          className="flex-1 text-sm px-2 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">— none —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.games_played} GP)</option>
          ))}
        </select>
      </div>
      {saving && <div className="text-[11px] text-gray-500 mt-1">Saving…</div>}
    </div>
  );
}

function AwardsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [meta, setMeta] = useState<SeasonMeta | null>(null);
  const [awards, setAwards] = useState<SeasonAwards | null>(null);
  const [loading, setLoading] = useState(true);

  const urlSeason = searchParams.get("season");
  const season = useMemo(() => {
    const n = urlSeason ? parseInt(urlSeason, 10) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : null;
  }, [urlSeason]);

  // Load meta first, default to current season if no URL param
  useEffect(() => {
    fetch(`${API_BASE}/stats/seasons`)
      .then((r) => r.json())
      .then((m: SeasonMeta) => {
        setMeta(m);
        if (season === null) {
          router.replace(`/awards?season=${m.currentSeason}`);
        }
      })
      .catch(() => {});
  }, [season, router]);

  const loadAwards = useMemo(() => {
    return () => {
      if (season === null) return;
      setLoading(true);
      fetch(`${API_BASE}/seasons/${season}/awards`)
        .then((r) => r.json())
        .then(setAwards)
        .finally(() => setLoading(false));
    };
  }, [season]);

  useEffect(() => {
    loadAwards();
  }, [loadAwards]);

  if (season === null || !meta) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  const isInProgress = season === meta.currentSeason && awards
    ? awards.games_in_season < awards.total_games_in_season
    : false;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-3xl font-bold font-display uppercase tracking-wide">Awards</h1>
        <select
          value={season}
          onChange={(e) => router.push(`/awards?season=${e.target.value}`)}
          className="text-sm px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
        >
          {Array.from({ length: meta.totalSeasons }, (_, i) => i + 1).map((s) => (
            <option key={s} value={s}>Season {s}{s === meta.currentSeason ? " (current)" : ""}</option>
          ))}
        </select>
      </div>

      {awards && (
        <p className="text-xs text-gray-500 mb-6">
          {isInProgress ? "Provisional — " : ""}
          {awards.games_in_season} / {awards.total_games_in_season} games completed · min {awards.min_games_required} GP to qualify
        </p>
      )}

      {loading || !awards ? (
        <div className="text-gray-500 text-center py-16">Loading awards...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <MvpCard winner={awards.mvp} minGames={awards.min_games_required} icon={<CrownIcon />}>
              {isAdmin && (
                <AdminMvpPicker
                  season={season}
                  currentMvpId={awards.mvp?.player_id ?? null}
                  onSet={loadAwards}
                />
              )}
            </MvpCard>

            <AwardCard
              title="Scoring Leader"
              subtitle="Highest PPG (normalized to game-to-11)"
              entry={awards.scoring_leader}
              minGames={awards.min_games_required}
              icon={<FlameIcon />}
            />

            <AwardCard
              title="Defensive Player of the Season"
              subtitle="Most steals + blocks per game"
              entry={awards.defensive_pots}
              minGames={awards.min_games_required}
              icon={<ShieldIcon />}
            />

            <AwardCard
              title="Clutch Player of the Season"
              subtitle="Most game-winners in games decided by ≤ 3"
              entry={awards.clutch_pots}
              minGames={awards.min_games_required}
              icon={<BoltIcon />}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <TeamCard
              title="All-YMCA First Team"
              players={awards.all_ymca_1st}
              minGames={awards.min_games_required}
            />
            <TeamCard
              title="All-YMCA Second Team"
              players={awards.all_ymca_2nd}
              minGames={awards.min_games_required}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TeamCard
              title="YMCA All-Defensive Team"
              players={awards.all_defensive}
              minGames={awards.min_games_required}
            />
            <AwardCard
              title="Game MVP Leader"
              subtitle="Most individual game MVP awards"
              entry={awards.game_mvp_leader}
              minGames={awards.min_games_required}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function AwardsPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 text-center py-16">Loading...</div>}>
      <AwardsInner />
    </Suspense>
  );
}
