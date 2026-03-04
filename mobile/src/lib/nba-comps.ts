export interface NBAPlayer {
  name: string;
  ppg: number;
  tpg: number;
  apg: number;
  spg: number;
  bpg: number;
}

export const NBA_COMP_POOL: NBAPlayer[] = [
  { name: "Kobe Bryant", ppg: 25.0, tpg: 1.4, apg: 4.7, spg: 1.4, bpg: 0.5 },
  { name: "Magic Johnson", ppg: 19.5, tpg: 0.3, apg: 11.2, spg: 1.9, bpg: 0.4 },
  { name: "Larry Bird", ppg: 24.3, tpg: 0.6, apg: 6.3, spg: 1.7, bpg: 0.8 },
  { name: "Shaquille O'Neal", ppg: 23.7, tpg: 0.0, apg: 2.5, spg: 0.6, bpg: 2.3 },
  { name: "Tim Duncan", ppg: 19.0, tpg: 0.1, apg: 3.0, spg: 0.7, bpg: 2.2 },
  { name: "Allen Iverson", ppg: 26.7, tpg: 1.0, apg: 6.2, spg: 2.2, bpg: 0.2 },
  { name: "Dwyane Wade", ppg: 22.0, tpg: 0.5, apg: 5.4, spg: 1.5, bpg: 0.9 },
  { name: "Stephen Curry", ppg: 24.8, tpg: 3.6, apg: 6.4, spg: 1.7, bpg: 0.2 },
  { name: "Kevin Durant", ppg: 27.3, tpg: 1.8, apg: 4.4, spg: 1.1, bpg: 1.1 },
  { name: "Nikola Jokic", ppg: 24.9, tpg: 1.0, apg: 7.3, spg: 1.3, bpg: 0.7 },
  { name: "Giannis Antetokounmpo", ppg: 23.4, tpg: 0.7, apg: 5.3, spg: 1.1, bpg: 1.3 },
  { name: "Luka Doncic", ppg: 28.7, tpg: 3.0, apg: 8.3, spg: 1.4, bpg: 0.5 },
  { name: "Shai Gilgeous-Alexander", ppg: 25.0, tpg: 1.0, apg: 5.5, spg: 1.7, bpg: 0.8 },
  { name: "Joel Embiid", ppg: 27.9, tpg: 1.0, apg: 3.6, spg: 1.0, bpg: 1.7 },
  { name: "Anthony Davis", ppg: 24.1, tpg: 0.5, apg: 2.6, spg: 1.2, bpg: 2.3 },
  { name: "Victor Wembanyama", ppg: 21.4, tpg: 1.5, apg: 3.7, spg: 1.2, bpg: 3.6 },
  { name: "Trae Young", ppg: 25.3, tpg: 2.5, apg: 9.5, spg: 1.0, bpg: 0.2 },
  { name: "Jimmy Butler", ppg: 20.0, tpg: 0.7, apg: 5.5, spg: 1.7, bpg: 0.3 },
  { name: "Russell Westbrook", ppg: 22.2, tpg: 1.2, apg: 8.4, spg: 1.7, bpg: 0.3 },
  { name: "James Harden", ppg: 24.1, tpg: 3.0, apg: 7.1, spg: 1.5, bpg: 0.5 },
  { name: "Carmelo Anthony", ppg: 22.5, tpg: 1.2, apg: 3.0, spg: 1.0, bpg: 0.5 },
  { name: "Dennis Rodman", ppg: 7.3, tpg: 0.0, apg: 1.8, spg: 0.7, bpg: 0.6 },
  { name: "Ben Wallace", ppg: 5.7, tpg: 0.0, apg: 1.3, spg: 1.3, bpg: 2.0 },
  { name: "John Stockton", ppg: 13.1, tpg: 0.6, apg: 10.5, spg: 2.2, bpg: 0.2 },
  { name: "Charles Barkley", ppg: 22.1, tpg: 0.5, apg: 3.9, spg: 1.5, bpg: 0.8 },
  { name: "Damian Lillard", ppg: 25.2, tpg: 3.0, apg: 6.7, spg: 1.0, bpg: 0.3 },
];

const NBA_AVG = { ppg: 16.0, tpg: 1.3, apg: 4.0, spg: 1.1, bpg: 0.6 };

export interface PerGameStats {
  ppg: number;
  tpg: number;
  apg: number;
  spg: number;
  bpg: number;
}

export interface NBACompResult {
  comp: NBAPlayer;
  scaledStats: PerGameStats;
}

export function computeLeagueAvg(
  players: { ppg: number; twos_pg?: number; apg?: number; spg?: number; bpg?: number; assists: number; steals: number; blocks: number; games_played: number }[]
): PerGameStats {
  const qualified = players.filter((p) => p.games_played >= 2);
  const pool = qualified.length > 0 ? qualified : players.length > 0 ? players : [{ ppg: 1, twos_pg: 0, apg: 0, spg: 0, bpg: 0, assists: 0, steals: 0, blocks: 0, games_played: 1 }];
  const n = pool.length;
  return {
    ppg: pool.reduce((s, p) => s + p.ppg, 0) / n,
    tpg: pool.reduce((s, p) => s + (p.twos_pg ?? 0), 0) / n,
    apg: pool.reduce((s, p) => s + (p.apg ?? p.assists / (p.games_played || 1)), 0) / n,
    spg: pool.reduce((s, p) => s + (p.spg ?? p.steals / (p.games_played || 1)), 0) / n,
    bpg: pool.reduce((s, p) => s + (p.bpg ?? p.blocks / (p.games_played || 1)), 0) / n,
  };
}

export function computeNBAComp(playerPerGame: PerGameStats, leagueAvg: PerGameStats): NBACompResult {
  const scaled: PerGameStats = {
    ppg: leagueAvg.ppg > 0 ? Math.round(playerPerGame.ppg * (NBA_AVG.ppg / leagueAvg.ppg) * 10) / 10 : 0,
    tpg: leagueAvg.tpg > 0 ? Math.round(playerPerGame.tpg * (NBA_AVG.tpg / leagueAvg.tpg) * 10) / 10 : 0,
    apg: leagueAvg.apg > 0 ? Math.round(playerPerGame.apg * (NBA_AVG.apg / leagueAvg.apg) * 10) / 10 : 0,
    spg: leagueAvg.spg > 0 ? Math.round(playerPerGame.spg * (NBA_AVG.spg / leagueAvg.spg) * 10) / 10 : 0,
    bpg: leagueAvg.bpg > 0 ? Math.round(playerPerGame.bpg * (NBA_AVG.bpg / leagueAvg.bpg) * 10) / 10 : 0,
  };

  const pool = NBA_COMP_POOL;
  const statKeys = ["ppg", "tpg", "apg", "spg", "bpg"] as const;
  const mean: Record<string, number> = {};
  const std: Record<string, number> = {};
  for (const k of statKeys) {
    const vals = pool.map((p) => p[k]);
    mean[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, v) => a + (v - mean[k]) ** 2, 0) / vals.length;
    std[k] = Math.sqrt(variance) || 1;
  }

  let bestDist = Infinity;
  let bestComp = pool[0];
  for (const nba of pool) {
    let dist = 0;
    for (const k of statKeys) {
      const pZ = (scaled[k] - mean[k]) / std[k];
      const nZ = (nba[k] - mean[k]) / std[k];
      dist += (pZ - nZ) ** 2;
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestComp = nba;
    }
  }

  return { comp: bestComp, scaledStats: scaled };
}
