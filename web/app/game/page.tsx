"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import BoxScore from "@/app/components/BoxScore";

const API_BASE = "/api";

interface GameDetail {
  id: string;
  start_time: string;
  status: string;
  winning_team: string | null;
  team_a: string[];
  team_b: string[];
}

interface GameEvent {
  id: number;
  player_name: string;
  event_type: string;
  point_value: number;
  created_at: string;
  corrected_event_id: number | null;
}

interface WinProbPoint {
  play: number;
  score_a: number;
  score_b: number;
  win_prob_a: number;
  sample_size: number | null;
}

interface WinProbResponse {
  data: WinProbPoint[];
  total_games_analyzed: number;
  min_games_required?: number;
  message?: string;
}

function GameDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [game, setGame] = useState<GameDetail | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [winProb, setWinProb] = useState<WinProbResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`${API_BASE}/games/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/games/${id}/events`).then((r) => r.json()),
      fetch(`${API_BASE}/games/${id}/win-probability`).then((r) => r.json()).catch(() => null),
    ])
      .then(([g, e, wp]) => {
        setGame(g);
        setEvents(e);
        setWinProb(wp);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  if (!game) {
    return (
      <div className="text-gray-500 text-center py-16">Game not found.</div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Game Detail</h1>
      <p className="text-gray-500 text-sm mb-6">
        {new Date(game.start_time).toLocaleString()}
        {game.status === "finished" && (
          <span className="ml-2 text-gray-400">
            — Team {game.winning_team} wins
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm text-gray-400 mb-2">Team A</h3>
          <ul className="space-y-1">
            {game.team_a.map((name) => (
              <li key={name} className="text-sm">
                {name}
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm text-gray-400 mb-2">Team B</h3>
          <ul className="space-y-1">
            {game.team_b.map((name) => (
              <li key={name} className="text-sm">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {game.status === "finished" && id && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Box Score</h2>
          <BoxScore gameId={id} />
        </div>
      )}

      {/* Game Flow Chart */}
      {(() => {
        // Build set of corrected event IDs to exclude undone plays
        const correctedIds = new Set<number>();
        for (const event of events) {
          if (event.event_type === "correction" && event.corrected_event_id != null) {
            correctedIds.add(event.corrected_event_id);
          }
        }
        // Filter out corrections and the original events they corrected
        const cleanEvents = events.filter(
          (e) => e.event_type !== "correction" && !correctedIds.has(e.id)
        );

        const teamASet = new Set(game.team_a.map((n) => n.toLowerCase()));
        let a = 0;
        let b = 0;
        const flowData: { play: number; "Team A": number; "Team B": number }[] = [
          { play: 0, "Team A": 0, "Team B": 0 },
        ];
        let playNum = 0;
        let leadChanges = 0;
        let prevLeader: "A" | "B" | "tie" = "tie";

        for (const event of cleanEvents) {
          if (event.event_type === "score" && event.point_value !== 0) {
            const isTeamA = teamASet.has(event.player_name.toLowerCase());
            if (isTeamA) a += event.point_value;
            else b += event.point_value;
            playNum++;

            const leader = a > b ? "A" : b > a ? "B" : "tie";
            if (
              leader !== "tie" &&
              prevLeader !== "tie" &&
              leader !== prevLeader
            ) {
              leadChanges++;
            }
            if (leader !== "tie") prevLeader = leader;

            flowData.push({ play: playNum, "Team A": a, "Team B": b });
          }
        }

        if (flowData.length <= 1) return null;

        return (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Game Flow</h2>
              <span className="text-sm text-gray-500">
                {leadChanges} Lead Change{leadChanges !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="border border-gray-800 rounded-lg p-4">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={flowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="play"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "Scoring Plays", position: "insideBottom", offset: -2, fontSize: 11, fill: "#6B7280" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                      fontSize: "13px",
                      color: "#E5E7EB",
                    }}
                    labelStyle={{ color: "#9CA3AF" }}
                    itemStyle={{ color: "#E5E7EB" }}
                    labelFormatter={(v) => `Play ${v}`}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    formatter={(value) => <span style={{ color: "#D1D5DB" }}>{value}</span>}
                  />
                  <Line
                    type="monotone"
                    dataKey="Team A"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Team B"
                    stroke="#F97316"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* Win Probability Chart */}
      {game.status === "finished" && winProb && (() => {
        if (winProb.message) {
          return (
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4">Win Probability</h2>
              <div className="border border-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-500 text-sm">{winProb.message}</p>
              </div>
            </div>
          );
        }

        if (winProb.data.length <= 1) return null;

        const chartData = winProb.data.map((d) => ({
          play: d.play,
          "Team A": Math.round(d.win_prob_a * 100),
          score_a: d.score_a,
          score_b: d.score_b,
          sample_size: d.sample_size,
        }));

        return (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Win Probability</h2>
              <span className="text-sm text-gray-500">
                Based on {winProb.total_games_analyzed} games
              </span>
            </div>
            <div className="border border-gray-800 rounded-lg p-4">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="wpGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="50%" stopColor="#3B82F6" stopOpacity={0.05} />
                      <stop offset="50%" stopColor="#F97316" stopOpacity={0.05} />
                      <stop offset="100%" stopColor="#F97316" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="play"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "Scoring Plays", position: "insideBottom", offset: -2, fontSize: 11, fill: "#6B7280" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ReferenceLine y={50} stroke="#4B5563" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                      fontSize: "13px",
                      color: "#E5E7EB",
                    }}
                    labelStyle={{ color: "#9CA3AF" }}
                    labelFormatter={(v) => `Play ${v}`}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, _name: any, props: any) => {
                      const { score_a, score_b, sample_size } = props.payload;
                      const lines = [`${value}%`];
                      if (score_a !== undefined) lines.push(`Score: ${score_a}-${score_b}`);
                      if (sample_size) lines.push(`Sample: ${sample_size} games`);
                      return [lines.join("  |  "), "Team A"];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    formatter={(value) => <span style={{ color: "#D1D5DB" }}>{value} Win %</span>}
                  />
                  <Area
                    type="monotone"
                    dataKey="Team A"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill="url(#wpGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      <h2 className="text-xl font-bold mb-4">Play-by-Play</h2>
      {events.length === 0 ? (
        <p className="text-gray-500">No events recorded.</p>
      ) : (
        <div className="space-y-2">
          {(() => {
            const teamASet = new Set(game.team_a.map((n) => n.toLowerCase()));
            let scoreA = 0;
            let scoreB = 0;

            // Build a map: for each score event index, find the assist that follows it
            const assistForScore = new Map<number, string>();
            const consumedAssists = new Set<number>();
            for (let i = 0; i < events.length - 1; i++) {
              if (events[i].event_type === "score") {
                const next = events[i + 1];
                if (next.event_type === "assist") {
                  assistForScore.set(i, next.player_name);
                  consumedAssists.add(i + 1);
                }
              }
            }

            return events.map((event, idx) => {
              // Skip assist events that are merged into a score line
              if (consumedAssists.has(idx)) return null;

              const isCorrection = event.event_type === "correction";
              const isScore = event.event_type === "score" || isCorrection;

              if (isScore && event.point_value !== 0) {
                const isTeamA = teamASet.has(event.player_name.toLowerCase());
                if (isTeamA) {
                  scoreA += event.point_value;
                } else {
                  scoreB += event.point_value;
                }
              }

              const assist = assistForScore.get(idx);

              return (
                <div
                  key={event.id}
                  className={`flex items-center gap-4 py-2 border-b border-gray-900 ${
                    isCorrection ? "opacity-50" : ""
                  }`}
                >
                  <span className="text-sm text-gray-500 w-16">
                    {new Date(event.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="flex-1">
                    {event.player_name}
                    {assist && (
                      <span className="text-blue-400 text-sm ml-2">
                        (ast: {assist})
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-bold tabular-nums ${
                      isCorrection ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    {isCorrection ? "UNDO" : event.event_type === "score" ? `+${event.point_value}` : event.event_type.toUpperCase()}
                  </span>
                  {isScore && (
                    <span className="text-sm text-gray-400 tabular-nums w-14 text-right">
                      {scoreA}-{scoreB}
                    </span>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

export default function GameDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="text-gray-500 text-center py-16">Loading...</div>
      }
    >
      <GameDetailInner />
    </Suspense>
  );
}
