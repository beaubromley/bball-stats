"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  all_ymca_3rd: AwardWinner[];
  all_defensive: AwardWinner[];
}

// Voting state mirrors web/lib/votes.ts.
interface VoteCandidate {
  player_id: string;
  name: string;
}
interface BallotSummary {
  player_id: string;
  name: string;
  has_voted: boolean;
}
interface VoteTallyRow {
  player_id: string;
  name: string;
  total_points: number;
  first_votes: number;
  second_votes: number;
  third_votes: number;
  fppg: number;
  ppg: number;
}
interface BallotRow {
  voter_player_id: string;
  voter_name: string;
  pick_1: { player_id: string; name: string };
  pick_2: { player_id: string; name: string };
  pick_3: { player_id: string; name: string };
  created_at: string;
}
type VotingState =
  | {
      state: "open";
      candidates: VoteCandidate[];
      voters: BallotSummary[];
      voted_count: number;
      total_eligible: number;
    }
  | {
      state: "closed";
      closed_at: string;
      candidates: VoteCandidate[];
      voters: BallotSummary[];
      results: VoteTallyRow[];
      winner_player_id: string | null;
      ballots: BallotRow[];
    }
  | {
      state: "not_yet_open";
      games_in_season: number;
      total_games_in_season: number;
    };

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
  children,
}: {
  title: string;
  subtitle?: string;
  entry: AwardEntry;
  minGames: number;
  children?: React.ReactNode;
}) {
  const winner = entry.winner;
  const stat = winner ? splitStat(winner.value_label) : null;
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 flex flex-col">
      <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
        {title}
      </h2>
      {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-2 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-1" />}

      {winner && stat ? (
        <div className="flex-1">
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
  children,
}: {
  winner: AwardWinner | null;
  minGames: number;
  children?: React.ReactNode;
}) {
  const stat = winner ? splitStat(winner.value_label) : null;
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 flex flex-col">
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

function TeamCard({ title, players, minGames }: { title: string; players: AwardWinner[] | undefined; minGames: number }) {
  const list = players ?? [];
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-4 border-b border-gray-200 dark:border-gray-800">
        {title}
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">Not enough qualified players yet (min {minGames} games).</p>
      ) : (
        <ol className="divide-y divide-gray-100 dark:divide-gray-900">
          {list.map((p, i) => {
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

// --- Collapsed-state summary ---

function SummaryItem({ label, winner }: { label: string; winner: AwardWinner | null }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-display mb-1">
        {label}
      </div>
      {winner ? (
        <Link
          href={`/player?id=${winner.player_id}`}
          className="text-lg font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors block truncate"
        >
          {winner.name}
        </Link>
      ) : (
        <span className="text-lg text-gray-400 dark:text-gray-600">—</span>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-gray-500 dark:text-gray-400 transition-transform shrink-0 ${
        expanded ? "rotate-90" : ""
      }`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// --- MVP Voting Panel ---

const VOTED_LS_PREFIX = "bball:mvp-voted:";

function MvpVotingPanel({
  season,
  isAdmin,
  onVotingChange,
}: {
  season: number;
  isAdmin: boolean;
  onVotingChange: () => void;
}) {
  const [state, setState] = useState<VotingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voterId, setVoterId] = useState<string>("");
  const [pick1, setPick1] = useState<string>("");
  const [pick2, setPick2] = useState<string>("");
  const [pick3, setPick3] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [localVotedId, setLocalVotedId] = useState<string | null>(null);

  async function reload() {
    try {
      const r = await fetch(`${API_BASE}/seasons/${season}/votes`);
      const data: VotingState = await r.json();
      setState(data);
    } catch {
      setState(null);
    }
  }

  useEffect(() => {
    reload();
    if (typeof window !== "undefined") {
      setLocalVotedId(localStorage.getItem(VOTED_LS_PREFIX + season));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  async function submitBallot() {
    if (!voterId || !pick1 || !pick2 || !pick3) {
      setError("Fill in your name and all three picks");
      return;
    }
    if (new Set([pick1, pick2, pick3]).size !== 3) {
      setError("You can't pick the same player twice");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/seasons/${season}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter_player_id: voterId,
          pick_1: pick1,
          pick_2: pick2,
          pick_3: pick3,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body?.error || `Error ${r.status}`);
      } else {
        if (typeof window !== "undefined") {
          localStorage.setItem(VOTED_LS_PREFIX + season, voterId);
          setLocalVotedId(voterId);
        }
        setVoterId("");
        setPick1("");
        setPick2("");
        setPick3("");
        await reload();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function closeVoting() {
    if (!confirm("Close MVP voting? This will set the season MVP automatically.")) return;
    setClosing(true);
    try {
      await fetch(`${API_BASE}/seasons/${season}/votes/close`, { method: "POST" });
      await reload();
      onVotingChange();
    } finally {
      setClosing(false);
    }
  }

  async function reopenVoting() {
    if (!confirm("Reopen voting? The MVP will stay set until you change it manually.")) return;
    setClosing(true);
    try {
      await fetch(`${API_BASE}/seasons/${season}/votes/reopen`, { method: "POST" });
      await reload();
      onVotingChange();
    } finally {
      setClosing(false);
    }
  }

  if (!state) {
    return (
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
        <div className="text-sm text-gray-500">Loading MVP voting…</div>
      </div>
    );
  }

  if (state.state === "not_yet_open") {
    return (
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
        <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
          MVP Voting
        </h2>
        <p className="text-sm text-gray-500">
          MVP voting opens once the season finishes ({state.games_in_season} / {state.total_games_in_season} games played).
        </p>
        {isAdmin && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={async () => {
                if (!confirm("Force voting open now? Useful for testing — voters with ≥5 GP can vote immediately.")) return;
                setClosing(true);
                try {
                  await fetch(`${API_BASE}/seasons/${season}/votes/open`, { method: "POST" });
                  await reload();
                } finally {
                  setClosing(false);
                }
              }}
              disabled={closing}
              className="text-xs font-bold font-display uppercase tracking-wider px-3 py-1.5 rounded border border-amber-500/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
            >
              {closing ? "Opening…" : "Force open voting (admin / testing)"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (state.state === "open") {
    const alreadyVoted = state.voters.find(
      (v) => v.player_id === (voterId || localVotedId || ""),
    )?.has_voted;
    const votedNames = state.voters.filter((v) => v.has_voted).map((v) => v.name);
    return (
      <div className="border-2 border-blue-500/40 dark:border-blue-400/40 bg-blue-50/40 dark:bg-blue-900/10 rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
            Vote for Season {season} MVP
          </h2>
          <span className="text-xs font-bold font-display uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
            Voting open
          </span>
        </div>

        {alreadyVoted ? (
          <div className="text-sm text-emerald-700 dark:text-emerald-300 font-bold mb-3">
            ✓ You voted. Thanks!
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">
                Your name
              </label>
              <select
                value={voterId}
                onChange={(e) => setVoterId(e.target.value)}
                className="w-full text-sm px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white"
              >
                <option value="">— select your name —</option>
                {state.voters.map((v) => (
                  <option key={v.player_id} value={v.player_id} disabled={v.has_voted}>
                    {v.name}{v.has_voted ? " (voted)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {[
              { label: "1st place (3 pts)", value: pick1, set: setPick1 },
              { label: "2nd place (2 pts)", value: pick2, set: setPick2 },
              { label: "3rd place (1 pt)", value: pick3, set: setPick3 },
            ].map((row) => (
              <div key={row.label}>
                <label className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">
                  {row.label}
                </label>
                <select
                  value={row.value}
                  onChange={(e) => row.set(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white"
                >
                  <option value="">— select —</option>
                  {state.candidates.map((c) => (
                    <option key={c.player_id} value={c.player_id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ))}
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <button
              onClick={submitBallot}
              disabled={submitting}
              className="w-full text-sm font-bold font-display uppercase tracking-wider px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
            >
              {submitting ? "Submitting…" : "Submit ballot"}
            </button>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-800">
          <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            {state.voted_count} of {state.total_eligible} voters have voted
          </div>
          {votedNames.length > 0 && (
            <div className="text-xs text-gray-700 dark:text-gray-300">
              {votedNames.join(", ")}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={closeVoting}
              disabled={closing}
              className="text-xs font-bold font-display uppercase tracking-wider px-3 py-1.5 rounded border border-red-500/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
              {closing ? "Closing…" : "Close voting"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // closed state
  const winner = state.results.find((r) => r.player_id === state.winner_player_id) ?? null;
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 pb-2 mb-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-base font-bold font-display uppercase tracking-wider text-gray-900 dark:text-white">
          MVP Voting Results
        </h2>
        <span className="text-xs font-bold font-display uppercase tracking-wider px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          Closed
        </span>
      </div>

      {winner ? (
        <div className="mb-4">
          <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Winner
          </div>
          <Link
            href={`/player?id=${winner.player_id}`}
            className="text-2xl font-bold font-display text-gray-900 dark:text-white hover:text-blue-400 transition-colors"
          >
            {winner.name}
          </Link>
          <span className="ml-2 text-sm text-gray-500 tabular-nums">{winner.total_points} pts</span>
        </div>
      ) : state.results.length > 0 ? (
        <div className="mb-4 text-sm text-amber-700 dark:text-amber-300">
          Voting ended in a tie — admin must set the MVP manually below.
        </div>
      ) : (
        <div className="mb-4 text-sm text-gray-500">No ballots were cast.</div>
      )}

      {state.results.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Tally
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left py-1">Player</th>
                <th className="text-right py-1">Pts</th>
                <th className="text-right py-1">1st</th>
                <th className="text-right py-1">2nd</th>
                <th className="text-right py-1">3rd</th>
              </tr>
            </thead>
            <tbody>
              {state.results.map((r) => (
                <tr key={r.player_id} className="border-t border-gray-100 dark:border-gray-900">
                  <td className="py-1.5 font-bold font-display">
                    <Link href={`/player?id=${r.player_id}`} className="hover:text-blue-400">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-bold">{r.total_points}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.first_votes}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.second_votes}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.third_votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.ballots.length > 0 && (
        <details className="mt-4">
          <summary className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer">
            All ballots ({state.ballots.length})
          </summary>
          <div className="mt-2 text-xs space-y-1.5">
            {state.ballots.map((b) => (
              <div key={b.voter_player_id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-bold font-display text-gray-900 dark:text-white">{b.voter_name}:</span>
                <span className="text-gray-700 dark:text-gray-300">
                  1️⃣ {b.pick_1.name} · 2️⃣ {b.pick_2.name} · 3️⃣ {b.pick_3.name}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {isAdmin && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={reopenVoting}
            disabled={closing}
            className="text-xs font-bold font-display uppercase tracking-wider px-3 py-1.5 rounded border border-gray-400 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
          >
            {closing ? "Reopening…" : "Reopen voting"}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Per-season accordion ---

function SeasonAccordion({
  season,
  awards,
  expanded,
  onToggle,
  isAdmin,
  onMvpUpdate,
}: {
  season: number;
  awards: SeasonAwards;
  expanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onMvpUpdate: () => void;
}) {
  const completed = awards.games_in_season >= awards.total_games_in_season;

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      {/* Header bar */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronIcon expanded={expanded} />
          <div className="min-w-0">
            <div className="text-xl font-bold font-display uppercase tracking-wide text-gray-900 dark:text-white">
              Season {season}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {completed
                ? `Completed · ${awards.total_games_in_season} games`
                : `In progress · ${awards.games_in_season} / ${awards.total_games_in_season} games · min ${awards.min_games_required} GP to qualify`}
            </div>
          </div>
        </div>
        {!completed && (
          <span className="text-xs font-bold font-display uppercase tracking-wider px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 shrink-0">
            Provisional
          </span>
        )}
      </button>

      {/* Collapsed summary */}
      {!expanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryItem label="MVP" winner={awards.mvp} />
          <SummaryItem label="Scoring Leader" winner={awards.scoring_leader.winner} />
          <SummaryItem label="Def. POTS" winner={awards.defensive_pots.winner} />
          <SummaryItem label="Clutch POTS" winner={awards.clutch_pots.winner} />
        </div>
      )}

      {/* Expanded full layout */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-4">
          <MvpVotingPanel
            season={season}
            isAdmin={isAdmin}
            onVotingChange={onMvpUpdate}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MvpCard winner={awards.mvp} minGames={awards.min_games_required}>
              {isAdmin && (
                <AdminMvpPicker
                  season={season}
                  currentMvpId={awards.mvp?.player_id ?? null}
                  onSet={onMvpUpdate}
                />
              )}
            </MvpCard>

            <AwardCard
              title="Scoring Leader"
              subtitle="Highest PPG (normalized to game-to-11)"
              entry={awards.scoring_leader}
              minGames={awards.min_games_required}
            />

            <AwardCard
              title="Defensive Player of the Season"
              subtitle="Most steals + blocks per game"
              entry={awards.defensive_pots}
              minGames={awards.min_games_required}
            />

            <AwardCard
              title="Clutch Player of the Season"
              subtitle="Most game-winners in games decided by ≤ 3"
              entry={awards.clutch_pots}
              minGames={awards.min_games_required}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TeamCard
              title="All-YMCA First Team"
              players={awards.all_ymca_1st}
              minGames={30}
            />
            <TeamCard
              title="All-YMCA Second Team"
              players={awards.all_ymca_2nd}
              minGames={20}
            />
            <TeamCard
              title="All-YMCA Third Team"
              players={awards.all_ymca_3rd}
              minGames={8}
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
        </div>
      )}
    </div>
  );
}

// --- Page shell ---

export default function AwardsPage() {
  const { isAdmin } = useAuth();
  const [meta, setMeta] = useState<SeasonMeta | null>(null);
  const [awardsBySeason, setAwardsBySeason] = useState<Map<number, SeasonAwards>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Fetch meta + every season's awards in parallel.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const m: SeasonMeta = await fetch(`${API_BASE}/stats/seasons`).then((r) => r.json());
        if (cancelled) return;
        setMeta(m);

        const seasons = Array.from({ length: m.totalSeasons }, (_, i) => i + 1);
        const entries = await Promise.all(
          seasons.map(
            (s) =>
              fetch(`${API_BASE}/seasons/${s}/awards`)
                .then((r) => r.json() as Promise<SeasonAwards>)
                .then((a) => [s, a] as const),
          ),
        );
        if (cancelled) return;

        setAwardsBySeason(new Map(entries));

        // Default-expand the most recent COMPLETED season; if none exist,
        // fall back to the most recent visible (admin viewing only in-progress).
        const completedNums = entries
          .filter(([, a]) => a.games_in_season >= a.total_games_in_season)
          .map(([s]) => s);
        const defaultExpand =
          completedNums.length > 0 ? Math.max(...completedNums) : m.currentSeason;
        setExpanded(new Set([defaultExpand]));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function reloadSeason(season: number) {
    fetch(`${API_BASE}/seasons/${season}/awards`)
      .then((r) => r.json() as Promise<SeasonAwards>)
      .then((a) => {
        setAwardsBySeason((prev) => {
          const next = new Map(prev);
          next.set(season, a);
          return next;
        });
      })
      .catch(() => {});
  }

  function toggle(season: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  }

  if (loading || !meta) {
    return <div className="text-gray-500 text-center py-16">Loading awards...</div>;
  }

  // Most recent first; non-admins only see completed seasons.
  const seasonsDesc = Array.from({ length: meta.totalSeasons }, (_, i) => meta.totalSeasons - i);
  const visible = seasonsDesc.filter((s) => {
    const a = awardsBySeason.get(s);
    if (!a) return false;
    const completed = a.games_in_season >= a.total_games_in_season;
    return completed || isAdmin;
  });

  return (
    <div>
      <h1 className="text-3xl font-bold font-display uppercase tracking-wide mb-6">Awards</h1>

      {visible.length === 0 ? (
        <div className="text-gray-500 text-center py-16">
          <p className="text-lg">No completed seasons yet.</p>
          <p className="text-sm mt-2">Awards are revealed once the season finishes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <SeasonAccordion
              key={s}
              season={s}
              awards={awardsBySeason.get(s)!}
              expanded={expanded.has(s)}
              onToggle={() => toggle(s)}
              isAdmin={isAdmin}
              onMvpUpdate={() => reloadSeason(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
