import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { getBoxScore } from "@/lib/stats";

export const runtime = "nodejs";

// Load fonts once
const interBold = fetch(
  "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKv0E.woff2"
).then((res) => res.arrayBuffer());

const bebasNeue = fetch(
  "https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2"
).then((res) => res.arrayBuffer());

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await params;
  const style = req.nextUrl.searchParams.get("style") || "mvp";

  const boxScore = await getBoxScore(id);
  if (!boxScore) {
    return new Response("Game not found", { status: 404 });
  }

  const db = getDb();
  const gameResult = await db.execute({ sql: "SELECT start_time FROM games WHERE id = ?", args: [id] });
  const startTime = gameResult.rows[0]?.start_time as string | undefined;
  const dateStr = startTime
    ? new Date(startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const teamA = boxScore.players.filter((p) => p.team === "A");
  const teamB = boxScore.players.filter((p) => p.team === "B");

  const [interBoldData, bebasData] = await Promise.all([interBold, bebasNeue]);

  if (style === "boxscore") {
    return new ImageResponse(
      <BoxScoreCard
        teamAScore={boxScore.team_a_score}
        teamBScore={boxScore.team_b_score}
        teamA={teamA}
        teamB={teamB}
        mvpName={boxScore.mvp?.player_name ?? null}
        date={dateStr}
      />,
      {
        width: 1200,
        height: 630,
        fonts: [
          { name: "Inter", data: interBoldData, weight: 700 },
          { name: "Bebas Neue", data: bebasData, weight: 400 },
        ],
      }
    );
  }

  // Default: MVP card
  return new ImageResponse(
    <MvpCard
      teamAScore={boxScore.team_a_score}
      teamBScore={boxScore.team_b_score}
      teamANames={teamA.map((p) => p.player_name)}
      teamBNames={teamB.map((p) => p.player_name)}
      mvp={boxScore.mvp}
      winningTeam={boxScore.winning_team}
      date={dateStr}
    />,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: interBoldData, weight: 700 },
        { name: "Bebas Neue", data: bebasData, weight: 400 },
      ],
    }
  );
}

interface MvpCardProps {
  teamAScore: number;
  teamBScore: number;
  teamANames: string[];
  teamBNames: string[];
  mvp: { player_name: string; points: number; assists: number; steals: number; blocks: number; fantasy_points: number } | null;
  winningTeam: string | null;
  date: string;
}

function MvpCard({ teamAScore, teamBScore, teamANames, teamBNames, mvp, winningTeam, date }: MvpCardProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        color: "#f1f5f9",
        padding: "48px 56px",
        fontFamily: "Inter",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "16px", color: "#94a3b8", letterSpacing: "2px", fontFamily: "Bebas Neue" }}>
            RANKIN YMCA STATS
          </div>
        </div>
        <div style={{ fontSize: "14px", color: "#64748b" }}>{date}</div>
      </div>

      {/* Score */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "40px",
          marginTop: "36px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: "14px", color: "#3b82f6", letterSpacing: "3px", fontFamily: "Bebas Neue" }}>
            TEAM A
          </div>
          <div
            style={{
              fontSize: "96px",
              fontFamily: "Bebas Neue",
              lineHeight: 1,
              color: winningTeam === "A" ? "#ffffff" : "#94a3b8",
            }}
          >
            {teamAScore}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <div style={{ fontSize: "28px", color: "#475569", fontFamily: "Bebas Neue" }}>VS</div>
          <div style={{ fontSize: "14px", color: "#f59e0b", letterSpacing: "2px", fontFamily: "Bebas Neue" }}>
            FINAL
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: "14px", color: "#f97316", letterSpacing: "3px", fontFamily: "Bebas Neue" }}>
            TEAM B
          </div>
          <div
            style={{
              fontSize: "96px",
              fontFamily: "Bebas Neue",
              lineHeight: 1,
              color: winningTeam === "B" ? "#ffffff" : "#94a3b8",
            }}
          >
            {teamBScore}
          </div>
        </div>
      </div>

      {/* MVP */}
      {mvp && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: "28px",
            padding: "16px 32px",
            borderRadius: "12px",
            background: "rgba(234, 179, 8, 0.08)",
            border: "1px solid rgba(234, 179, 8, 0.2)",
          }}
        >
          <div style={{ fontSize: "12px", color: "#eab308", letterSpacing: "3px", fontFamily: "Bebas Neue" }}>
            GAME MVP
          </div>
          <div style={{ fontSize: "36px", color: "#fbbf24", fontFamily: "Bebas Neue", lineHeight: 1.2 }}>
            {mvp.player_name}
          </div>
          <div style={{ display: "flex", gap: "20px", fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>
            <span>{mvp.points} pts</span>
            <span>{mvp.assists} ast</span>
            <span>{mvp.steals} stl</span>
            <span>{mvp.blocks} blk</span>
            <span style={{ color: "#3b82f6" }}>{mvp.fantasy_points} FP</span>
          </div>
        </div>
      )}

      {/* Team rosters */}
      <div style={{ display: "flex", justifyContent: "center", gap: "48px", marginTop: "auto" }}>
        <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#64748b" }}>
          <span style={{ color: "#3b82f6" }}>A:</span>
          {teamANames.join(", ")}
        </div>
        <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#64748b" }}>
          <span style={{ color: "#f97316" }}>B:</span>
          {teamBNames.join(", ")}
        </div>
      </div>
    </div>
  );
}

interface BoxScoreCardProps {
  teamAScore: number;
  teamBScore: number;
  teamA: { player_name: string; points: number; assists: number; steals: number; blocks: number; is_mvp: boolean }[];
  teamB: { player_name: string; points: number; assists: number; steals: number; blocks: number; is_mvp: boolean }[];
  mvpName: string | null;
  date: string;
}

function BoxScoreCard({ teamAScore, teamBScore, teamA, teamB, mvpName, date }: BoxScoreCardProps) {
  const StatRow = ({ name, pts, ast, stl, blk, isMvp, color }: { name: string; pts: number; ast: number; stl: number; blk: number; isMvp: boolean; color: string }) => (
    <div style={{ display: "flex", alignItems: "center", padding: "6px 0", fontSize: "15px" }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: isMvp ? "#fbbf24" : "#e2e8f0" }}>{name}</span>
        {isMvp && <span style={{ fontSize: "11px", color: "#eab308", letterSpacing: "1px" }}>MVP</span>}
      </div>
      <div style={{ width: "48px", textAlign: "right", color: color }}>{pts}</div>
      <div style={{ width: "44px", textAlign: "right", color: "#94a3b8" }}>{ast}</div>
      <div style={{ width: "44px", textAlign: "right", color: "#94a3b8" }}>{stl}</div>
      <div style={{ width: "44px", textAlign: "right", color: "#94a3b8" }}>{blk}</div>
    </div>
  );

  const HeaderRow = () => (
    <div style={{ display: "flex", padding: "4px 0", fontSize: "11px", color: "#64748b", letterSpacing: "1px", fontFamily: "Bebas Neue" }}>
      <div style={{ flex: 1 }}>PLAYER</div>
      <div style={{ width: "48px", textAlign: "right" }}>PTS</div>
      <div style={{ width: "44px", textAlign: "right" }}>AST</div>
      <div style={{ width: "44px", textAlign: "right" }}>STL</div>
      <div style={{ width: "44px", textAlign: "right" }}>BLK</div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        color: "#f1f5f9",
        padding: "36px 56px",
        fontFamily: "Inter",
      }}
    >
      {/* Header with score */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontSize: "16px", color: "#94a3b8", letterSpacing: "2px", fontFamily: "Bebas Neue" }}>
          RANKIN YMCA STATS
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
          <span style={{ fontSize: "48px", fontFamily: "Bebas Neue", lineHeight: 1 }}>{teamAScore}</span>
          <span style={{ fontSize: "18px", color: "#475569" }}>-</span>
          <span style={{ fontSize: "48px", fontFamily: "Bebas Neue", lineHeight: 1 }}>{teamBScore}</span>
          <span style={{ fontSize: "14px", color: "#f59e0b", letterSpacing: "2px", fontFamily: "Bebas Neue", marginLeft: "8px" }}>FINAL</span>
        </div>
        <div style={{ fontSize: "14px", color: "#64748b" }}>{date}</div>
      </div>

      {/* Two columns */}
      <div style={{ display: "flex", gap: "32px", flex: 1 }}>
        {/* Team A */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "13px", color: "#3b82f6", letterSpacing: "2px", fontFamily: "Bebas Neue", marginBottom: "8px", paddingBottom: "6px", borderBottom: "1px solid #1e3a5f" }}>
            TEAM A
          </div>
          <HeaderRow />
          {teamA.map((p) => (
            <StatRow key={p.player_name} name={p.player_name} pts={p.points} ast={p.assists} stl={p.steals} blk={p.blocks} isMvp={p.is_mvp} color="#3b82f6" />
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: "1px", background: "#1e293b" }} />

        {/* Team B */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "13px", color: "#f97316", letterSpacing: "2px", fontFamily: "Bebas Neue", marginBottom: "8px", paddingBottom: "6px", borderBottom: "1px solid #5f3a1e" }}>
            TEAM B
          </div>
          <HeaderRow />
          {teamB.map((p) => (
            <StatRow key={p.player_name} name={p.player_name} pts={p.points} ast={p.assists} stl={p.steals} blk={p.blocks} isMvp={p.is_mvp} color="#f97316" />
          ))}
        </div>
      </div>
    </div>
  );
}
