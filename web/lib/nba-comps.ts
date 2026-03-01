export interface NBAPlayer {
  name: string;
  ppg: number;
  tpg: number; // 3-pointers made per game
  apg: number;
  spg: number;
  bpg: number;
}

// Pool of NBA legends and current starters with career per-game averages
// tpg = career 3-pointers made per game
export const NBA_COMP_POOL: NBAPlayer[] = [
  // ── Legends ──
  { name: "Kobe Bryant", ppg: 25.0, tpg: 1.4, apg: 4.7, spg: 1.4, bpg: 0.5 },
  { name: "Magic Johnson", ppg: 19.5, tpg: 0.3, apg: 11.2, spg: 1.9, bpg: 0.4 },
  { name: "Larry Bird", ppg: 24.3, tpg: 0.6, apg: 6.3, spg: 1.7, bpg: 0.8 },
  { name: "Shaquille O'Neal", ppg: 23.7, tpg: 0.0, apg: 2.5, spg: 0.6, bpg: 2.3 },
  { name: "Hakeem Olajuwon", ppg: 21.8, tpg: 0.1, apg: 2.5, spg: 1.7, bpg: 3.1 },
  { name: "Tim Duncan", ppg: 19.0, tpg: 0.1, apg: 3.0, spg: 0.7, bpg: 2.2 },
  { name: "Kevin Garnett", ppg: 17.8, tpg: 0.2, apg: 3.7, spg: 1.3, bpg: 1.4 },
  { name: "Allen Iverson", ppg: 26.7, tpg: 1.0, apg: 6.2, spg: 2.2, bpg: 0.2 },
  { name: "Dwyane Wade", ppg: 22.0, tpg: 0.5, apg: 5.4, spg: 1.5, bpg: 0.9 },
  { name: "Dirk Nowitzki", ppg: 20.7, tpg: 1.3, apg: 2.4, spg: 0.8, bpg: 0.8 },
  { name: "Charles Barkley", ppg: 22.1, tpg: 0.5, apg: 3.9, spg: 1.5, bpg: 0.8 },
  { name: "Karl Malone", ppg: 25.0, tpg: 0.1, apg: 3.6, spg: 1.4, bpg: 0.7 },
  { name: "John Stockton", ppg: 13.1, tpg: 0.6, apg: 10.5, spg: 2.2, bpg: 0.2 },
  { name: "David Robinson", ppg: 21.1, tpg: 0.0, apg: 2.5, spg: 1.4, bpg: 3.0 },
  { name: "Patrick Ewing", ppg: 21.0, tpg: 0.0, apg: 1.9, spg: 1.0, bpg: 2.4 },
  { name: "Isiah Thomas", ppg: 19.2, tpg: 0.5, apg: 9.3, spg: 1.9, bpg: 0.3 },
  { name: "Scottie Pippen", ppg: 16.1, tpg: 0.8, apg: 5.2, spg: 2.0, bpg: 0.8 },
  { name: "Julius Erving", ppg: 22.0, tpg: 0.1, apg: 3.9, spg: 1.8, bpg: 1.5 },
  { name: "Kareem Abdul-Jabbar", ppg: 24.6, tpg: 0.0, apg: 3.6, spg: 0.9, bpg: 2.6 },
  { name: "Clyde Drexler", ppg: 20.4, tpg: 0.7, apg: 5.6, spg: 2.0, bpg: 0.7 },
  { name: "Russell Westbrook", ppg: 22.2, tpg: 1.2, apg: 8.4, spg: 1.7, bpg: 0.3 },
  { name: "James Harden", ppg: 24.1, tpg: 3.0, apg: 7.1, spg: 1.5, bpg: 0.5 },
  { name: "Chris Paul", ppg: 17.5, tpg: 1.4, apg: 9.4, spg: 2.1, bpg: 0.2 },

  // ── Current Stars ──
  { name: "Stephen Curry", ppg: 24.8, tpg: 3.6, apg: 6.4, spg: 1.7, bpg: 0.2 },
  { name: "Kevin Durant", ppg: 27.3, tpg: 1.8, apg: 4.4, spg: 1.1, bpg: 1.1 },
  { name: "Nikola Jokic", ppg: 24.9, tpg: 1.0, apg: 7.3, spg: 1.3, bpg: 0.7 },
  { name: "Giannis Antetokounmpo", ppg: 23.4, tpg: 0.7, apg: 5.3, spg: 1.1, bpg: 1.3 },
  { name: "Luka Doncic", ppg: 28.7, tpg: 3.0, apg: 8.3, spg: 1.4, bpg: 0.5 },
  { name: "Jayson Tatum", ppg: 23.1, tpg: 2.7, apg: 4.6, spg: 1.1, bpg: 0.7 },
  { name: "Shai Gilgeous-Alexander", ppg: 25.0, tpg: 1.0, apg: 5.5, spg: 1.7, bpg: 0.8 },
  { name: "Anthony Edwards", ppg: 24.0, tpg: 2.5, apg: 4.8, spg: 1.3, bpg: 0.5 },
  { name: "Ja Morant", ppg: 22.5, tpg: 1.2, apg: 7.4, spg: 1.1, bpg: 0.3 },
  { name: "Jimmy Butler", ppg: 20.0, tpg: 0.7, apg: 5.5, spg: 1.7, bpg: 0.3 },
  { name: "Kawhi Leonard", ppg: 19.9, tpg: 1.4, apg: 3.8, spg: 1.7, bpg: 0.6 },
  { name: "Joel Embiid", ppg: 27.9, tpg: 1.0, apg: 3.6, spg: 1.0, bpg: 1.7 },
  { name: "Anthony Davis", ppg: 24.1, tpg: 0.5, apg: 2.6, spg: 1.2, bpg: 2.3 },
  { name: "Damian Lillard", ppg: 25.2, tpg: 3.0, apg: 6.7, spg: 1.0, bpg: 0.3 },
  { name: "Devin Booker", ppg: 25.6, tpg: 2.2, apg: 4.9, spg: 1.1, bpg: 0.3 },
  { name: "Donovan Mitchell", ppg: 24.4, tpg: 2.6, apg: 4.5, spg: 1.4, bpg: 0.4 },
  { name: "Trae Young", ppg: 25.3, tpg: 2.5, apg: 9.5, spg: 1.0, bpg: 0.2 },
  { name: "De'Aaron Fox", ppg: 22.0, tpg: 1.5, apg: 6.1, spg: 1.5, bpg: 0.4 },
  { name: "Victor Wembanyama", ppg: 21.4, tpg: 1.5, apg: 3.7, spg: 1.2, bpg: 3.6 },
  { name: "Paolo Banchero", ppg: 21.6, tpg: 1.0, apg: 5.0, spg: 0.8, bpg: 0.6 },
  { name: "Tyrese Haliburton", ppg: 17.5, tpg: 2.5, apg: 9.5, spg: 1.5, bpg: 0.5 },
  { name: "Kyrie Irving", ppg: 22.6, tpg: 2.0, apg: 5.7, spg: 1.3, bpg: 0.3 },
  { name: "Paul George", ppg: 20.8, tpg: 2.2, apg: 3.6, spg: 1.7, bpg: 0.4 },
  { name: "Karl-Anthony Towns", ppg: 22.9, tpg: 2.0, apg: 3.3, spg: 0.7, bpg: 1.1 },
  { name: "Zion Williamson", ppg: 25.0, tpg: 0.3, apg: 3.6, spg: 0.8, bpg: 0.6 },
  { name: "Jalen Brunson", ppg: 18.4, tpg: 1.8, apg: 5.7, spg: 0.8, bpg: 0.2 },
  { name: "LaMelo Ball", ppg: 18.8, tpg: 2.5, apg: 7.0, spg: 1.5, bpg: 0.4 },
  { name: "Cade Cunningham", ppg: 21.0, tpg: 1.5, apg: 6.5, spg: 1.0, bpg: 0.4 },
  { name: "Darius Garland", ppg: 19.0, tpg: 2.0, apg: 7.5, spg: 1.3, bpg: 0.2 },
  { name: "Bam Adebayo", ppg: 15.9, tpg: 0.1, apg: 3.4, spg: 1.1, bpg: 0.8 },
  { name: "Evan Mobley", ppg: 15.5, tpg: 0.5, apg: 2.8, spg: 0.8, bpg: 1.4 },
  { name: "Scottie Barnes", ppg: 16.5, tpg: 0.7, apg: 4.7, spg: 1.1, bpg: 0.9 },
  { name: "Jaren Jackson Jr.", ppg: 17.5, tpg: 1.5, apg: 1.6, spg: 0.9, bpg: 2.3 },
  { name: "Jamal Murray", ppg: 18.5, tpg: 2.0, apg: 4.4, spg: 1.0, bpg: 0.3 },
  { name: "Zach LaVine", ppg: 21.6, tpg: 2.3, apg: 4.0, spg: 1.0, bpg: 0.4 },
  { name: "Brandon Ingram", ppg: 19.5, tpg: 1.2, apg: 4.1, spg: 0.7, bpg: 0.5 },
  { name: "Franz Wagner", ppg: 18.0, tpg: 1.3, apg: 4.5, spg: 1.0, bpg: 0.4 },
  { name: "Jalen Williams", ppg: 19.1, tpg: 1.3, apg: 4.5, spg: 1.5, bpg: 0.5 },
  { name: "Domantas Sabonis", ppg: 16.3, tpg: 0.5, apg: 4.3, spg: 0.8, bpg: 0.5 },
  { name: "Chet Holmgren", ppg: 16.7, tpg: 1.5, apg: 2.5, spg: 0.9, bpg: 2.4 },
  { name: "Tyler Herro", ppg: 17.5, tpg: 2.5, apg: 3.5, spg: 0.7, bpg: 0.2 },

  // ── More Legends ──
  { name: "Gary Payton", ppg: 16.3, tpg: 0.7, apg: 6.7, spg: 1.8, bpg: 0.2 },
  { name: "Ray Allen", ppg: 18.9, tpg: 2.3, apg: 3.4, spg: 1.1, bpg: 0.2 },
  { name: "Reggie Miller", ppg: 18.2, tpg: 1.7, apg: 3.0, spg: 1.1, bpg: 0.2 },
  { name: "Tracy McGrady", ppg: 19.6, tpg: 1.2, apg: 4.4, spg: 1.2, bpg: 0.8 },
  { name: "Vince Carter", ppg: 16.7, tpg: 1.5, apg: 3.1, spg: 1.0, bpg: 0.6 },
  { name: "Paul Pierce", ppg: 19.7, tpg: 1.2, apg: 3.5, spg: 1.3, bpg: 0.6 },
  { name: "Carmelo Anthony", ppg: 22.5, tpg: 1.2, apg: 3.0, spg: 1.0, bpg: 0.5 },
  { name: "Steve Nash", ppg: 14.3, tpg: 1.4, apg: 8.5, spg: 0.7, bpg: 0.1 },
  { name: "Jason Kidd", ppg: 12.6, tpg: 1.2, apg: 8.7, spg: 1.9, bpg: 0.3 },
  { name: "Dominique Wilkins", ppg: 24.8, tpg: 0.5, apg: 2.5, spg: 1.3, bpg: 0.6 },
  { name: "George Gervin", ppg: 25.1, tpg: 0.1, apg: 2.6, spg: 1.2, bpg: 0.8 },
  { name: "Moses Malone", ppg: 20.6, tpg: 0.0, apg: 1.3, spg: 0.8, bpg: 1.3 },
  { name: "James Worthy", ppg: 17.6, tpg: 0.0, apg: 3.0, spg: 1.1, bpg: 0.5 },
  { name: "Kevin McHale", ppg: 17.9, tpg: 0.0, apg: 1.7, spg: 0.3, bpg: 1.7 },
  { name: "Dwight Howard", ppg: 15.7, tpg: 0.0, apg: 1.4, spg: 0.9, bpg: 1.8 },
  { name: "Chris Bosh", ppg: 19.2, tpg: 0.5, apg: 2.0, spg: 0.8, bpg: 1.0 },
  { name: "Pau Gasol", ppg: 17.0, tpg: 0.2, apg: 3.2, spg: 0.5, bpg: 1.6 },
  { name: "Amar'e Stoudemire", ppg: 18.9, tpg: 0.1, apg: 1.6, spg: 0.8, bpg: 1.3 },
  { name: "Dikembe Mutombo", ppg: 9.8, tpg: 0.0, apg: 1.0, spg: 0.3, bpg: 2.8 },
  { name: "Alonzo Mourning", ppg: 17.1, tpg: 0.0, apg: 1.1, spg: 0.5, bpg: 2.8 },
  { name: "Tony Parker", ppg: 15.5, tpg: 0.3, apg: 5.6, spg: 0.7, bpg: 0.1 },
  { name: "Manu Ginobili", ppg: 13.3, tpg: 1.2, apg: 3.8, spg: 1.5, bpg: 0.3 },
  { name: "Grant Hill", ppg: 16.7, tpg: 0.5, apg: 4.1, spg: 1.2, bpg: 0.5 },
  { name: "Penny Hardaway", ppg: 15.2, tpg: 0.5, apg: 5.0, spg: 1.3, bpg: 0.5 },
  { name: "Pete Maravich", ppg: 24.2, tpg: 0.1, apg: 5.4, spg: 1.4, bpg: 0.2 },
  { name: "Yao Ming", ppg: 19.0, tpg: 0.0, apg: 1.6, spg: 0.4, bpg: 1.9 },
  { name: "Chris Mullin", ppg: 18.2, tpg: 1.0, apg: 3.5, spg: 1.6, bpg: 0.4 },
  { name: "Dennis Rodman", ppg: 7.3, tpg: 0.0, apg: 1.8, spg: 0.7, bpg: 0.6 },
  { name: "Ben Wallace", ppg: 5.7, tpg: 0.0, apg: 1.3, spg: 1.3, bpg: 2.0 },
  { name: "Adrian Dantley", ppg: 24.3, tpg: 0.0, apg: 3.0, spg: 0.7, bpg: 0.1 },
];

// Average NBA starter per-game stats (used as scaling reference)
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
  players: { ppg: number; ones_made?: number; twos_made?: number; assists: number; steals: number; blocks: number; games_played: number }[]
): PerGameStats {
  // Filter to players with at least 2 games for stable averages
  const qualified = players.filter((p) => p.games_played >= 2);
  if (qualified.length === 0) {
    const all = players.length > 0 ? players : [{ ppg: 1, ones_made: 0, twos_made: 0, assists: 0, steals: 0, blocks: 0, games_played: 1 }];
    return avgOf(all);
  }
  return avgOf(qualified);
}

function avgOf(
  players: { ppg: number; ones_made?: number; twos_made?: number; assists: number; steals: number; blocks: number; games_played: number }[]
): PerGameStats {
  const n = players.length;
  const sumPpg = players.reduce((s, p) => s + p.ppg, 0);
  const sumTpg = players.reduce((s, p) => s + (p.twos_made || 0) / (p.games_played || 1), 0);
  const sumApg = players.reduce((s, p) => s + p.assists / (p.games_played || 1), 0);
  const sumSpg = players.reduce((s, p) => s + p.steals / (p.games_played || 1), 0);
  const sumBpg = players.reduce((s, p) => s + p.blocks / (p.games_played || 1), 0);
  return {
    ppg: sumPpg / n,
    tpg: sumTpg / n,
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
    tpg: leagueAvg.tpg > 0 ? playerPerGame.tpg * (NBA_AVG.tpg / leagueAvg.tpg) : 0,
    apg: leagueAvg.apg > 0 ? playerPerGame.apg * (NBA_AVG.apg / leagueAvg.apg) : 0,
    spg: leagueAvg.spg > 0 ? playerPerGame.spg * (NBA_AVG.spg / leagueAvg.spg) : 0,
    bpg: leagueAvg.bpg > 0 ? playerPerGame.bpg * (NBA_AVG.bpg / leagueAvg.bpg) : 0,
  };

  // Round to 1 decimal
  scaled.ppg = Math.round(scaled.ppg * 10) / 10;
  scaled.tpg = Math.round(scaled.tpg * 10) / 10;
  scaled.apg = Math.round(scaled.apg * 10) / 10;
  scaled.spg = Math.round(scaled.spg * 10) / 10;
  scaled.bpg = Math.round(scaled.bpg * 10) / 10;

  // Find closest NBA comp using z-score normalized Euclidean distance
  const pool = NBA_COMP_POOL;
  const statKeys = ["ppg", "tpg", "apg", "spg", "bpg"] as const;

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
