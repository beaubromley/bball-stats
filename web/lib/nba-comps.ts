export interface NBAPlayer {
  name: string;
  team: string;
  ppg: number;
  apg: number;
  spg: number;
  bpg: number;
}

// Pool of NBA legends and current starters with career per-game averages
export const NBA_COMP_POOL: NBAPlayer[] = [
  // ── Legends ──
  { name: "Michael Jordan", team: "CHI", ppg: 30.1, apg: 5.3, spg: 2.3, bpg: 0.8 },
  { name: "LeBron James", team: "CLE", ppg: 27.1, apg: 7.4, spg: 1.5, bpg: 0.8 },
  { name: "Kobe Bryant", team: "LAL", ppg: 25.0, apg: 4.7, spg: 1.4, bpg: 0.5 },
  { name: "Magic Johnson", team: "LAL", ppg: 19.5, apg: 11.2, spg: 1.9, bpg: 0.4 },
  { name: "Larry Bird", team: "BOS", ppg: 24.3, apg: 6.3, spg: 1.7, bpg: 0.8 },
  { name: "Shaquille O'Neal", team: "LAL", ppg: 23.7, apg: 2.5, spg: 0.6, bpg: 2.3 },
  { name: "Hakeem Olajuwon", team: "HOU", ppg: 21.8, apg: 2.5, spg: 1.7, bpg: 3.1 },
  { name: "Tim Duncan", team: "SAS", ppg: 19.0, apg: 3.0, spg: 0.7, bpg: 2.2 },
  { name: "Kevin Garnett", team: "MIN", ppg: 17.8, apg: 3.7, spg: 1.3, bpg: 1.4 },
  { name: "Allen Iverson", team: "PHI", ppg: 26.7, apg: 6.2, spg: 2.2, bpg: 0.2 },
  { name: "Dwyane Wade", team: "MIA", ppg: 22.0, apg: 5.4, spg: 1.5, bpg: 0.9 },
  { name: "Dirk Nowitzki", team: "DAL", ppg: 20.7, apg: 2.4, spg: 0.8, bpg: 0.8 },
  { name: "Charles Barkley", team: "PHX", ppg: 22.1, apg: 3.9, spg: 1.5, bpg: 0.8 },
  { name: "Karl Malone", team: "UTA", ppg: 25.0, apg: 3.6, spg: 1.4, bpg: 0.7 },
  { name: "John Stockton", team: "UTA", ppg: 13.1, apg: 10.5, spg: 2.2, bpg: 0.2 },
  { name: "David Robinson", team: "SAS", ppg: 21.1, apg: 2.5, spg: 1.4, bpg: 3.0 },
  { name: "Patrick Ewing", team: "NYK", ppg: 21.0, apg: 1.9, spg: 1.0, bpg: 2.4 },
  { name: "Isiah Thomas", team: "DET", ppg: 19.2, apg: 9.3, spg: 1.9, bpg: 0.3 },
  { name: "Scottie Pippen", team: "CHI", ppg: 16.1, apg: 5.2, spg: 2.0, bpg: 0.8 },
  { name: "Julius Erving", team: "PHI", ppg: 22.0, apg: 3.9, spg: 1.8, bpg: 1.5 },
  { name: "Kareem Abdul-Jabbar", team: "LAL", ppg: 24.6, apg: 3.6, spg: 0.9, bpg: 2.6 },
  { name: "Clyde Drexler", team: "POR", ppg: 20.4, apg: 5.6, spg: 2.0, bpg: 0.7 },
  { name: "Russell Westbrook", team: "OKC", ppg: 22.2, apg: 8.4, spg: 1.7, bpg: 0.3 },
  { name: "James Harden", team: "HOU", ppg: 24.1, apg: 7.1, spg: 1.5, bpg: 0.5 },
  { name: "Chris Paul", team: "NOH", ppg: 17.5, apg: 9.4, spg: 2.1, bpg: 0.2 },

  // ── Current Stars ──
  { name: "Stephen Curry", team: "GSW", ppg: 24.8, apg: 6.4, spg: 1.7, bpg: 0.2 },
  { name: "Kevin Durant", team: "PHX", ppg: 27.3, apg: 4.4, spg: 1.1, bpg: 1.1 },
  { name: "Nikola Jokic", team: "DEN", ppg: 24.9, apg: 7.3, spg: 1.3, bpg: 0.7 },
  { name: "Giannis Antetokounmpo", team: "MIL", ppg: 23.4, apg: 5.3, spg: 1.1, bpg: 1.3 },
  { name: "Luka Doncic", team: "DAL", ppg: 28.7, apg: 8.3, spg: 1.4, bpg: 0.5 },
  { name: "Jayson Tatum", team: "BOS", ppg: 23.1, apg: 4.6, spg: 1.1, bpg: 0.7 },
  { name: "Shai Gilgeous-Alexander", team: "OKC", ppg: 25.0, apg: 5.5, spg: 1.7, bpg: 0.8 },
  { name: "Anthony Edwards", team: "MIN", ppg: 24.0, apg: 4.8, spg: 1.3, bpg: 0.5 },
  { name: "Ja Morant", team: "MEM", ppg: 22.5, apg: 7.4, spg: 1.1, bpg: 0.3 },
  { name: "Jimmy Butler", team: "MIA", ppg: 20.0, apg: 5.5, spg: 1.7, bpg: 0.3 },
  { name: "Kawhi Leonard", team: "LAC", ppg: 19.9, apg: 3.8, spg: 1.7, bpg: 0.6 },
  { name: "Joel Embiid", team: "PHI", ppg: 27.9, apg: 3.6, spg: 1.0, bpg: 1.7 },
  { name: "Anthony Davis", team: "LAL", ppg: 24.1, apg: 2.6, spg: 1.2, bpg: 2.3 },
  { name: "Damian Lillard", team: "MIL", ppg: 25.2, apg: 6.7, spg: 1.0, bpg: 0.3 },
  { name: "Devin Booker", team: "PHX", ppg: 25.6, apg: 4.9, spg: 1.1, bpg: 0.3 },
  { name: "Donovan Mitchell", team: "CLE", ppg: 24.4, apg: 4.5, spg: 1.4, bpg: 0.4 },
  { name: "Trae Young", team: "ATL", ppg: 25.3, apg: 9.5, spg: 1.0, bpg: 0.2 },
  { name: "De'Aaron Fox", team: "SAC", ppg: 22.0, apg: 6.1, spg: 1.5, bpg: 0.4 },
  { name: "Victor Wembanyama", team: "SAS", ppg: 21.4, apg: 3.7, spg: 1.2, bpg: 3.6 },
  { name: "Paolo Banchero", team: "ORL", ppg: 21.6, apg: 5.0, spg: 0.8, bpg: 0.6 },
  { name: "Tyrese Haliburton", team: "IND", ppg: 17.5, apg: 9.5, spg: 1.5, bpg: 0.5 },
];

// Average NBA starter per-game stats (used as scaling reference)
const NBA_AVG = { ppg: 16.0, apg: 4.0, spg: 1.1, bpg: 0.6 };

export interface PerGameStats {
  ppg: number;
  apg: number;
  spg: number;
  bpg: number;
}

export interface NBACompResult {
  comp: NBAPlayer;
  scaledStats: PerGameStats;
}

export function computeLeagueAvg(
  players: { ppg: number; assists: number; steals: number; blocks: number; games_played: number }[]
): PerGameStats {
  // Filter to players with at least 2 games for stable averages
  const qualified = players.filter((p) => p.games_played >= 2);
  if (qualified.length === 0) {
    // Fall back to all players
    const all = players.length > 0 ? players : [{ ppg: 1, assists: 0, steals: 0, blocks: 0, games_played: 1 }];
    return avgOf(all);
  }
  return avgOf(qualified);
}

function avgOf(
  players: { ppg: number; assists: number; steals: number; blocks: number; games_played: number }[]
): PerGameStats {
  const n = players.length;
  const sumPpg = players.reduce((s, p) => s + p.ppg, 0);
  const sumApg = players.reduce((s, p) => s + p.assists / (p.games_played || 1), 0);
  const sumSpg = players.reduce((s, p) => s + p.steals / (p.games_played || 1), 0);
  const sumBpg = players.reduce((s, p) => s + p.blocks / (p.games_played || 1), 0);
  return {
    ppg: sumPpg / n,
    apg: sumApg / n,
    spg: sumSpg / n,
    bpg: sumBpg / n,
  };
}

export function computeNBAComp(
  playerPerGame: PerGameStats,
  leagueAvg: PerGameStats
): NBACompResult {
  // Scale pickup stats to NBA equivalents using ratio method
  const scaled: PerGameStats = {
    ppg: leagueAvg.ppg > 0 ? playerPerGame.ppg * (NBA_AVG.ppg / leagueAvg.ppg) : 0,
    apg: leagueAvg.apg > 0 ? playerPerGame.apg * (NBA_AVG.apg / leagueAvg.apg) : 0,
    spg: leagueAvg.spg > 0 ? playerPerGame.spg * (NBA_AVG.spg / leagueAvg.spg) : 0,
    bpg: leagueAvg.bpg > 0 ? playerPerGame.bpg * (NBA_AVG.bpg / leagueAvg.bpg) : 0,
  };

  // Round to 1 decimal
  scaled.ppg = Math.round(scaled.ppg * 10) / 10;
  scaled.apg = Math.round(scaled.apg * 10) / 10;
  scaled.spg = Math.round(scaled.spg * 10) / 10;
  scaled.bpg = Math.round(scaled.bpg * 10) / 10;

  // Find closest NBA comp using z-score normalized Euclidean distance
  const pool = NBA_COMP_POOL;
  const statKeys = ["ppg", "apg", "spg", "bpg"] as const;

  // Compute mean and std of the comp pool for normalization
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
      const playerZ = (scaled[k] - mean[k]) / std[k];
      const nbaZ = (nba[k] - mean[k]) / std[k];
      dist += (playerZ - nbaZ) ** 2;
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestComp = nba;
    }
  }

  return { comp: bestComp, scaledStats: scaled };
}
