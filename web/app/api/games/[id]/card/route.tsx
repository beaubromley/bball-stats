import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { initDb, getDb } from "@/lib/turso";
import { getBoxScore } from "@/lib/stats";

export const runtime = "nodejs";

async function loadFonts() {
  const [interRes, bebasRes] = await Promise.all([
    fetch("https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKv0E.woff2"),
    fetch("https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2"),
  ]);
  return Promise.all([interRes.arrayBuffer(), bebasRes.arrayBuffer()]);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    const [interData, bebasData] = await loadFonts();
    const fonts = [
      { name: "Inter", data: interData, weight: 700 as const },
      { name: "Bebas", data: bebasData, weight: 400 as const },
    ];

    if (style === "boxscore") {
      return new ImageResponse(
        boxScoreCard(teamA, teamB, boxScore.team_a_score, boxScore.team_b_score, dateStr),
        { width: 1200, height: 630, fonts }
      );
    }

    return new ImageResponse(
      mvpCard(
        boxScore.team_a_score,
        boxScore.team_b_score,
        teamA.map((p) => p.player_name),
        teamB.map((p) => p.player_name),
        boxScore.mvp,
        boxScore.winning_team,
        dateStr
      ),
      { width: 1200, height: 630, fonts }
    );
  } catch (e) {
    return new Response(`Card generation failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}

function mvpCard(
  teamAScore: number,
  teamBScore: number,
  teamANames: string[],
  teamBNames: string[],
  mvp: { player_name: string; points: number; assists: number; steals: number; blocks: number; fantasy_points: number } | null,
  winningTeam: string | null,
  date: string
) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", color: "#f1f5f9", padding: "48px 56px", fontFamily: "Inter" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: "16px", color: "#94a3b8", letterSpacing: "2px", fontFamily: "Bebas" }}>RANKIN YMCA STATS</div>
        <div style={{ display: "flex", fontSize: "14px", color: "#64748b" }}>{date}</div>
      </div>

      {/* Score */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "40px", marginTop: "36px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: "14px", color: "#3b82f6", letterSpacing: "3px", fontFamily: "Bebas" }}>TEAM A</div>
          <div style={{ display: "flex", fontSize: "96px", fontFamily: "Bebas", lineHeight: 1, color: winningTeam === "A" ? "#ffffff" : "#94a3b8" }}>{teamAScore}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <div style={{ display: "flex", fontSize: "28px", color: "#475569", fontFamily: "Bebas" }}>VS</div>
          <div style={{ display: "flex", fontSize: "14px", color: "#f59e0b", letterSpacing: "2px", fontFamily: "Bebas" }}>FINAL</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: "14px", color: "#f97316", letterSpacing: "3px", fontFamily: "Bebas" }}>TEAM B</div>
          <div style={{ display: "flex", fontSize: "96px", fontFamily: "Bebas", lineHeight: 1, color: winningTeam === "B" ? "#ffffff" : "#94a3b8" }}>{teamBScore}</div>
        </div>
      </div>

      {/* MVP */}
      {mvp ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "28px", padding: "16px 32px", borderRadius: "12px", background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)" }}>
          <div style={{ display: "flex", fontSize: "12px", color: "#eab308", letterSpacing: "3px", fontFamily: "Bebas" }}>GAME MVP</div>
          <div style={{ display: "flex", fontSize: "36px", color: "#fbbf24", fontFamily: "Bebas", lineHeight: 1.2 }}>{mvp.player_name}</div>
          <div style={{ display: "flex", gap: "20px", fontSize: "14px", color: "#94a3b8", marginTop: "4px" }}>
            <div style={{ display: "flex" }}>{mvp.points} pts</div>
            <div style={{ display: "flex" }}>{mvp.assists} ast</div>
            <div style={{ display: "flex" }}>{mvp.steals} stl</div>
            <div style={{ display: "flex" }}>{mvp.blocks} blk</div>
            <div style={{ display: "flex", color: "#3b82f6" }}>{mvp.fantasy_points} FP</div>
          </div>
        </div>
      ) : null}

      {/* Team rosters */}
      <div style={{ display: "flex", justifyContent: "center", gap: "48px", marginTop: "auto" }}>
        <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#64748b" }}>
          <div style={{ display: "flex", color: "#3b82f6" }}>A:</div>
          <div style={{ display: "flex" }}>{teamANames.join(", ")}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#64748b" }}>
          <div style={{ display: "flex", color: "#f97316" }}>B:</div>
          <div style={{ display: "flex" }}>{teamBNames.join(", ")}</div>
        </div>
      </div>
    </div>
  );
}

function boxScoreCard(
  teamA: { player_name: string; points: number; assists: number; steals: number; blocks: number; is_mvp: boolean }[],
  teamB: { player_name: string; points: number; assists: number; steals: number; blocks: number; is_mvp: boolean }[],
  teamAScore: number,
  teamBScore: number,
  date: string
) {
  const headerRow = (
    <div style={{ display: "flex", padding: "4px 0", fontSize: "11px", color: "#64748b", letterSpacing: "1px", fontFamily: "Bebas" }}>
      <div style={{ display: "flex", flex: 1 }}>PLAYER</div>
      <div style={{ display: "flex", width: "48px", justifyContent: "flex-end" }}>PTS</div>
      <div style={{ display: "flex", width: "44px", justifyContent: "flex-end" }}>AST</div>
      <div style={{ display: "flex", width: "44px", justifyContent: "flex-end" }}>STL</div>
      <div style={{ display: "flex", width: "44px", justifyContent: "flex-end" }}>BLK</div>
    </div>
  );

  const statRow = (name: string, pts: number, ast: number, stl: number, blk: number, isMvp: boolean, color: string) => (
    <div key={name} style={{ display: "flex", alignItems: "center", padding: "6px 0", fontSize: "15px" }}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "8px" }}>
        <div style={{ display: "flex", color: isMvp ? "#fbbf24" : "#e2e8f0" }}>{name}</div>
        {isMvp ? <div style={{ display: "flex", fontSize: "11px", color: "#eab308", letterSpacing: "1px" }}>MVP</div> : null}
      </div>
      <div style={{ display: "flex", width: "48px", justifyContent: "flex-end", color }}>{pts}</div>
      <div style={{ display: "flex", width: "44px", justifyContent: "flex-end", color: "#94a3b8" }}>{ast}</div>
      <div style={{ display: "flex", width: "44px", justifyContent: "flex-end", color: "#94a3b8" }}>{stl}</div>
      <div style={{ display: "flex", width: "44px", justifyContent: "flex-end", color: "#94a3b8" }}>{blk}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", color: "#f1f5f9", padding: "36px 56px", fontFamily: "Inter" }}>
      {/* Header with score */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ display: "flex", fontSize: "16px", color: "#94a3b8", letterSpacing: "2px", fontFamily: "Bebas" }}>RANKIN YMCA STATS</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
          <div style={{ display: "flex", fontSize: "48px", fontFamily: "Bebas", lineHeight: 1 }}>{teamAScore}</div>
          <div style={{ display: "flex", fontSize: "18px", color: "#475569" }}>-</div>
          <div style={{ display: "flex", fontSize: "48px", fontFamily: "Bebas", lineHeight: 1 }}>{teamBScore}</div>
          <div style={{ display: "flex", fontSize: "14px", color: "#f59e0b", letterSpacing: "2px", fontFamily: "Bebas", marginLeft: "8px" }}>FINAL</div>
        </div>
        <div style={{ display: "flex", fontSize: "14px", color: "#64748b" }}>{date}</div>
      </div>

      {/* Two columns */}
      <div style={{ display: "flex", gap: "32px", flex: 1 }}>
        {/* Team A */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "13px", color: "#3b82f6", letterSpacing: "2px", fontFamily: "Bebas", marginBottom: "8px", paddingBottom: "6px", borderBottom: "1px solid #1e3a5f" }}>TEAM A</div>
          {headerRow}
          {teamA.map((p) => statRow(p.player_name, p.points, p.assists, p.steals, p.blocks, p.is_mvp, "#3b82f6"))}
        </div>

        {/* Divider */}
        <div style={{ display: "flex", width: "1px", background: "#1e293b" }} />

        {/* Team B */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "13px", color: "#f97316", letterSpacing: "2px", fontFamily: "Bebas", marginBottom: "8px", paddingBottom: "6px", borderBottom: "1px solid #5f3a1e" }}>TEAM B</div>
          {headerRow}
          {teamB.map((p) => statRow(p.player_name, p.points, p.assists, p.steals, p.blocks, p.is_mvp, "#f97316"))}
        </div>
      </div>
    </div>
  );
}
