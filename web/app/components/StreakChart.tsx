"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { formatSeasonGameCompact } from "@/lib/seasons";

/**
 * Recent-form chart for the player page. Plots normalized fantasy points per
 * game (game-to-11) for the last 10 games against the player's career average
 * (dashed baseline) and last-5 average, with shaded hot / cold ranges.
 *
 * Hot/cold mirror lib/hot-streaks.ts: hot = ≥1.2× career FPG; cold = ≤0.5×.
 * "Career" here means all games, so this view intentionally ignores the
 * page's season toggle.
 */
interface StreakGame {
  fantasy_points: number;
  winning_score: number;
  losing_score: number;
  target_score: number;
  game_number: number;
  start_time: string;
  result: string;
  is_mvp: number;
}

const HOT_RATIO = 1.2;
const COLD_RATIO = 0.5;

const HOT = "#10B981";
const COLD = "#EF4444";
const NORMAL = "#3B82F6";
const LINE = "#6B7280";

/** Effective game length (game-to-11 equivalent), matching refreshGameStats:
 *  collapse a target+1 clincher back to target, otherwise use winning score. */
function effectiveGames(g: StreakGame): number {
  const w = Number(g.winning_score) || 11;
  const l = Number(g.losing_score) || 0;
  const t = Number(g.target_score) || 11;
  const eff = w === t + 1 && l < t - 1 ? t : w;
  return (eff || 11) / 11;
}

function gameFpg(g: StreakGame): number {
  const eg = effectiveGames(g);
  return eg > 0 ? Number(g.fantasy_points) / eg : 0;
}

export default function StreakChart({ games }: { games: StreakGame[] }) {
  if (!games || games.length < 3) return null;

  const r1 = (n: number) => Math.round(n * 10) / 10;

  // Career baseline (all games), summed-then-divided like the hot-streak engine.
  const careerFp = games.reduce((s, g) => s + Number(g.fantasy_points), 0);
  const careerEg = games.reduce((s, g) => s + effectiveGames(g), 0);
  const careerFpg = careerEg > 0 ? careerFp / careerEg : 0;
  if (careerFpg <= 0) return null;

  // Last 5 (games arrive most-recent-first from the API).
  const last5 = games.slice(0, 5);
  const last5Fp = last5.reduce((s, g) => s + Number(g.fantasy_points), 0);
  const last5Eg = last5.reduce((s, g) => s + effectiveGames(g), 0);
  const last5Fpg = last5Eg > 0 ? last5Fp / last5Eg : 0;

  const hot = careerFpg * HOT_RATIO;
  const cold = careerFpg * COLD_RATIO;

  // Last 10 games, oldest → newest so the line reads left to right.
  const data = games
    .slice(0, 10)
    .slice()
    .reverse()
    .map((g) => {
      const raw = gameFpg(g);
      const zone = raw >= hot ? "hot" : raw <= cold ? "cold" : "normal";
      return {
        label: formatSeasonGameCompact(g.game_number),
        fpg: r1(raw),
        zone,
        result: g.result,
        is_mvp: g.is_mvp,
        date: g.start_time,
      };
    });

  const yMax = Math.ceil(Math.max(hot, ...data.map((d) => d.fpg)) + 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null) return <g key={index} />;
    const fill = payload.zone === "hot" ? HOT : payload.zone === "cold" ? COLD : NORMAL;
    return <circle key={index} cx={cx} cy={cy} r={4} fill={fill} stroke="#030712" strokeWidth={1} />;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const dt = new Date(d.date);
    const dateStr = isNaN(dt.getTime())
      ? ""
      : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
    const color = d.zone === "hot" ? HOT : d.zone === "cold" ? COLD : NORMAL;
    return (
      <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs">
        <p className="text-gray-300 font-medium">
          {d.label}
          {dateStr && <span className="text-gray-500"> · {dateStr}</span>}
        </p>
        <p style={{ color }}>{d.fpg} FP/G</p>
        <p className="text-gray-400">
          {d.result === "W" ? "Win" : "Loss"}
          {d.is_mvp === 1 ? " · MVP" : ""}
        </p>
      </div>
    );
  };

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-xl font-bold font-display uppercase tracking-wide">Recent Form</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Last {data.length} games · game-to-11 FP/G
        </span>
      </div>
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-transparent">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ left: 0, right: 16, top: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
            <ReferenceArea
              y1={0}
              y2={cold}
              fill={COLD}
              fillOpacity={0.07}
              label={{ value: "Cold", position: "insideBottomRight", fill: COLD, fontSize: 11 }}
            />
            <ReferenceArea
              y1={hot}
              y2={yMax}
              fill={HOT}
              fillOpacity={0.07}
              label={{ value: "Hot", position: "insideTopRight", fill: HOT, fontSize: 11 }}
            />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, yMax]}
              tick={{ fontSize: 11, fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              width={28}
              allowDecimals={false}
            />
            <Tooltip content={<TipContent />} cursor={{ stroke: "#4B5563", strokeDasharray: "3 3" }} />
            <ReferenceLine
              y={careerFpg}
              stroke="#9CA3AF"
              strokeDasharray="6 4"
              label={{ value: `Career ${r1(careerFpg)}`, position: "insideTopLeft", fill: "#9CA3AF", fontSize: 11 }}
            />
            <ReferenceLine
              y={last5Fpg}
              stroke={NORMAL}
              strokeWidth={2}
              label={{ value: `Last 5 ${r1(last5Fpg)}`, position: "insideBottomLeft", fill: NORMAL, fontSize: 11 }}
            />
            <Line type="monotone" dataKey="fpg" stroke={LINE} strokeWidth={2} dot={renderDot} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-gray-400" /> Career avg ({r1(careerFpg)})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2" style={{ borderColor: NORMAL }} /> Last 5 avg ({r1(last5Fpg)})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: HOT, opacity: 0.5 }} /> Hot ≥ {r1(hot)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLD, opacity: 0.5 }} /> Cold ≤ {r1(cold)}
          </span>
        </div>
      </div>
    </div>
  );
}
