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

interface SeasonAwards {
  season: number;
  games_in_season: number;
  total_games_in_season: number;
  min_games_required: number;
  mvp: AwardWinner | null;
  scoring_leader: AwardWinner | null;
  defensive_pots: AwardWinner | null;
  clutch_pots: AwardWinner | null;
  all_ymca_1st: AwardWinner[];
  all_ymca_2nd: AwardWinner[];
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

function AwardCard({
  title,
  emoji,
  subtitle,
  winner,
  minGames,
  children,
}: {
  title: string;
  emoji: string;
  subtitle?: string;
  winner: AwardWinner | null;
  minGames: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{emoji}</span>
        <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h2>
      </div>
      {subtitle && <p className="text-[11px] text-gray-400 mb-2">{subtitle}</p>}
      {winner ? (
        <div>
          <Link href={`/player?id=${winner.player_id}`} className="block hover:text-blue-400 transition-colors">
            <div className="text-2xl font-bold font-display">{winner.name}</div>
          </Link>
          <div className="text-sm text-gray-500 mt-1 tabular-nums">{winner.value_label}</div>
          <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{winner.games_played} games played</div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No eligible player yet (min {minGames} games required).
        </p>
      )}
      {children}
    </div>
  );
}

function TeamCard({ title, emoji, players, minGames }: { title: string; emoji: string; players: AwardWinner[]; minGames: number }) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{emoji}</span>
        <h2 className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h2>
      </div>
      {players.length === 0 ? (
        <p className="text-sm text-gray-500">Not enough qualified players yet (min {minGames} games).</p>
      ) : (
        <ol className="space-y-2">
          {players.map((p, i) => (
            <li key={p.player_id} className="flex items-baseline gap-3">
              <span className="text-xs text-gray-400 tabular-nums w-4">{i + 1}.</span>
              <Link href={`/player?id=${p.player_id}`} className="flex-1 font-semibold hover:text-blue-400 transition-colors">
                {p.name}
              </Link>
              <span className="text-sm text-gray-500 tabular-nums">{p.value_label}</span>
            </li>
          ))}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <AwardCard
            title="MVP"
            emoji="🏆"
            subtitle="Voted separately"
            winner={awards.mvp}
            minGames={awards.min_games_required}
          >
            {isAdmin && (
              <AdminMvpPicker
                season={season}
                currentMvpId={awards.mvp?.player_id ?? null}
                onSet={loadAwards}
              />
            )}
          </AwardCard>

          <AwardCard
            title="Scoring Leader"
            emoji="🎯"
            subtitle="Highest PPG (normalized to game-to-11)"
            winner={awards.scoring_leader}
            minGames={awards.min_games_required}
          />

          <AwardCard
            title="Defensive Player of the Season"
            emoji="🛡️"
            subtitle="Most steals + blocks per game"
            winner={awards.defensive_pots}
            minGames={awards.min_games_required}
          />

          <AwardCard
            title="Clutch Player of the Season"
            emoji="⚡"
            subtitle="Most game-winners in games decided by ≤ 3"
            winner={awards.clutch_pots}
            minGames={awards.min_games_required}
          />
        </div>
      )}

      {awards && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TeamCard
            title="All-YMCA First Team"
            emoji="⭐"
            players={awards.all_ymca_1st}
            minGames={awards.min_games_required}
          />
          <TeamCard
            title="All-YMCA Second Team"
            emoji="⭐"
            players={awards.all_ymca_2nd}
            minGames={awards.min_games_required}
          />
        </div>
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
