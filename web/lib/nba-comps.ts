export interface NBAPlayer {
  name: string;
  ppg: number;
  tpg: number; // 3-pointers made per game
  apg: number;
  spg: number;
  bpg: number;
  /** Team abbreviation (e.g. "BOS"). Optional — the all-time pool of
   *  legends often spans multiple teams over a career so we leave it off. */
  team?: string;
  /** Primary position ("PG" | "SG" | "SF" | "PF" | "C"). Optional for
   *  the same reason. */
  pos?: string;
}

// Pool of NBA legends and current starters with career per-game averages.
// tpg = career 3-pointers made per game.
//
// This is the default pool. A second pool (NBA_COMP_POOL_PLAYOFFS_2026) is
// declared further down — to switch, change one line in app/player/page.tsx
// (see the import + ACTIVE_NBA_POOL constant there). To undo the playoff
// theme entirely, delete that block and revert the import.
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

// =======================================================================
// 2026 NBA Playoffs pool (temporary theme)
// =======================================================================
//
// Self-contained block — delete it (and remove the import + ACTIVE_NBA_POOL
// line in app/player/page.tsx) to undo the playoff theme entirely.
//
// Snapshot from basketball-reference.com 2026 playoffs per-game table,
// fetched 2026-05-14. All 162 players with at least 5 playoff games.
//
// To refresh as the playoffs continue, re-run the helper:
//   mobile/scripts (not yet ported) or use the inline script from the
//   commit that added this block.
export const NBA_COMP_POOL_PLAYOFFS_2026: NBAPlayer[] = [
  { name: "Cade Cunningham", team: "DET", pos: "PG", ppg: 30.0, tpg: 3.0, apg: 7.7, spg: 1.1, bpg: 0.7 },
  { name: "Shai Gilgeous-Alexander", team: "OKC", pos: "PG", ppg: 29.1, tpg: 1.3, apg: 7.1, spg: 0.8, bpg: 0.9 },
  { name: "Jalen Brunson", team: "NYK", pos: "PG", ppg: 27.4, tpg: 2.7, apg: 6.1, spg: 0.9, bpg: 0.0 },
  { name: "Paolo Banchero", team: "ORL", pos: "PF", ppg: 26.3, tpg: 2.0, apg: 6.3, spg: 1.4, bpg: 0.7 },
  { name: "Donovan Mitchell", team: "CLE", pos: "SG", ppg: 26.3, tpg: 2.8, apg: 2.9, spg: 0.8, bpg: 0.2 },
  { name: "Nikola Jokić", team: "DEN", pos: "C", ppg: 25.8, tpg: 1.2, apg: 9.5, spg: 1.0, bpg: 0.8 },
  { name: "Jaylen Brown", team: "BOS", pos: "SF", ppg: 25.7, tpg: 2.4, apg: 3.3, spg: 0.9, bpg: 1.1 },
  { name: "Scottie Barnes", team: "TOR", pos: "PF", ppg: 24.1, tpg: 1.1, apg: 8.6, spg: 1.1, bpg: 1.7 },
  { name: "RJ Barrett", team: "TOR", pos: "SF", ppg: 24.1, tpg: 2.4, apg: 4.0, spg: 1.3, bpg: 0.3 },
  { name: "Joel Embiid", team: "PHI", pos: "C", ppg: 24.0, tpg: 0.7, apg: 5.4, spg: 0.3, bpg: 0.9 },
  { name: "Tyrese Maxey", team: "PHI", pos: "PG", ppg: 23.7, tpg: 2.4, apg: 5.9, spg: 0.8, bpg: 0.4 },
  { name: "Jamal Murray", team: "DEN", pos: "PG", ppg: 23.7, tpg: 1.8, apg: 5.7, spg: 0.8, bpg: 0.3 },
  { name: "Jayson Tatum", team: "BOS", pos: "PF", ppg: 23.3, tpg: 3.2, apg: 6.8, spg: 1.2, bpg: 0.0 },
  { name: "LeBron James", team: "LAL", pos: "SF", ppg: 23.2, tpg: 1.7, apg: 7.3, spg: 1.3, bpg: 0.3 },
  { name: "Deni Avdija", team: "POR", pos: "SF", ppg: 22.2, tpg: 1.4, apg: 4.6, spg: 0.4, bpg: 0.6 },
  { name: "OG Anunoby", team: "NYK", pos: "PF", ppg: 21.4, tpg: 2.6, apg: 1.3, spg: 1.9, bpg: 1.1 },
  { name: "Anthony Edwards", team: "MIN", pos: "SG", ppg: 21.3, tpg: 2.0, apg: 2.8, spg: 0.2, bpg: 0.8 },
  { name: "James Harden", team: "CLE", pos: "PG", ppg: 20.8, tpg: 2.5, apg: 6.4, spg: 1.8, bpg: 0.8 },
  { name: "Victor Wembanyama", team: "SAS", pos: "C", ppg: 20.4, tpg: 1.6, apg: 2.4, spg: 0.7, bpg: 4.2 },
  { name: "Alperen Şengün", team: "HOU", pos: "C", ppg: 20.3, tpg: 0.2, apg: 4.7, spg: 1.8, bpg: 1.3 },
  { name: "Tobias Harris", team: "DET", pos: "PF", ppg: 20.2, tpg: 1.6, apg: 1.5, spg: 1.5, bpg: 0.8 },
  { name: "Austin Reaves", team: "LAL", pos: "SG", ppg: 20.0, tpg: 1.5, apg: 5.8, spg: 0.0, bpg: 1.2 },
  { name: "Jalen Johnson", team: "ATL", pos: "SF", ppg: 19.5, tpg: 1.5, apg: 5.2, spg: 0.8, bpg: 0.3 },
  { name: "CJ McCollum", team: "ATL", pos: "PG", ppg: 19.2, tpg: 1.7, apg: 2.0, spg: 1.0, bpg: 1.2 },
  { name: "Amen Thompson", team: "HOU", pos: "PG", ppg: 19.2, tpg: 0.3, apg: 5.7, spg: 2.0, bpg: 1.2 },
  { name: "Ajay Mitchell", team: "OKC", pos: "SG", ppg: 18.8, tpg: 1.6, apg: 4.9, spg: 1.4, bpg: 0.0 },
  { name: "Stephon Castle", team: "SAS", pos: "PG", ppg: 18.7, tpg: 1.7, apg: 6.1, spg: 0.9, bpg: 0.4 },
  { name: "De'Aaron Fox", team: "SAS", pos: "PG", ppg: 18.6, tpg: 1.5, apg: 5.5, spg: 1.2, bpg: 0.2 },
  { name: "Chet Holmgren", team: "OKC", pos: "PF", ppg: 18.6, tpg: 1.5, apg: 1.3, spg: 1.4, bpg: 1.8 },
  { name: "Desmond Bane", team: "ORL", pos: "SG", ppg: 18.1, tpg: 3.6, apg: 1.9, spg: 1.9, bpg: 0.3 },
  { name: "Rui Hachimura", team: "LAL", pos: "PF", ppg: 17.5, tpg: 3.3, apg: 1.7, spg: 0.9, bpg: 0.6 },
  { name: "Jabari Smith Jr.", team: "HOU", pos: "PF", ppg: 17.5, tpg: 3.2, apg: 1.8, spg: 1.0, bpg: 0.7 },
  { name: "Karl-Anthony Towns", team: "NYK", pos: "C", ppg: 17.4, tpg: 1.4, apg: 6.6, spg: 1.1, bpg: 1.5 },
  { name: "Julius Randle", team: "MIN", pos: "PF", ppg: 17.2, tpg: 0.9, apg: 3.0, spg: 0.5, bpg: 0.1 },
  { name: "Jaden McDaniels", team: "MIN", pos: "PF", ppg: 16.6, tpg: 0.7, apg: 2.4, spg: 0.5, bpg: 0.6 },
  { name: "Evan Mobley", team: "CLE", pos: "PF", ppg: 16.6, tpg: 1.3, apg: 4.2, spg: 1.0, bpg: 1.8 },
  { name: "Paul George", team: "PHI", pos: "PF", ppg: 16.4, tpg: 3.2, apg: 3.0, spg: 1.3, bpg: 0.5 },
  { name: "Jrue Holiday", team: "POR", pos: "PG", ppg: 16.4, tpg: 2.4, apg: 7.2, spg: 1.4, bpg: 0.4 },
  { name: "Ayo Dosunmu", team: "MIN", pos: "SG", ppg: 16.2, tpg: 1.9, apg: 3.6, spg: 1.0, bpg: 0.4 },
  { name: "Scoot Henderson", team: "POR", pos: "PG", ppg: 15.0, tpg: 2.6, apg: 1.2, spg: 0.8, bpg: 0.2 },
  { name: "Payton Pritchard", team: "BOS", pos: "PG", ppg: 14.6, tpg: 2.4, apg: 5.1, spg: 0.4, bpg: 0.0 },
  { name: "Collin Murray-Boyles", team: "TOR", pos: "PF", ppg: 14.4, tpg: 0.0, apg: 2.4, spg: 1.3, bpg: 1.1 },
  { name: "Cameron Johnson", team: "DEN", pos: "SF", ppg: 14.2, tpg: 1.8, apg: 2.3, spg: 1.0, bpg: 0.3 },
  { name: "VJ Edgecombe", team: "PHI", pos: "SG", ppg: 14.0, tpg: 1.9, apg: 3.4, spg: 1.0, bpg: 0.4 },
  { name: "Tari Eason", team: "HOU", pos: "PF", ppg: 13.8, tpg: 1.7, apg: 1.7, spg: 2.5, bpg: 0.7 },
  { name: "Nickeil Alexander-Walker", team: "ATL", pos: "SG", ppg: 13.7, tpg: 3.0, apg: 2.7, spg: 0.5, bpg: 0.8 },
  { name: "Jonathan Kuminga", team: "ATL", pos: "PF", ppg: 13.7, tpg: 0.8, apg: 1.0, spg: 0.5, bpg: 0.5 },
  { name: "Dylan Harper", team: "SAS", pos: "SG", ppg: 13.6, tpg: 0.8, apg: 2.2, spg: 1.3, bpg: 0.3 },
  { name: "Mikal Bridges", team: "NYK", pos: "SF", ppg: 13.0, tpg: 1.1, apg: 2.4, spg: 1.0, bpg: 0.2 },
  { name: "Marcus Smart", team: "LAL", pos: "SG", ppg: 12.9, tpg: 1.7, apg: 5.1, spg: 2.4, bpg: 1.0 },
  { name: "Devin Vassell", team: "SAS", pos: "SG", ppg: 12.6, tpg: 1.8, apg: 2.7, spg: 1.4, bpg: 0.8 },
  { name: "Onyeka Okongwu", team: "ATL", pos: "C", ppg: 12.5, tpg: 1.7, apg: 2.3, spg: 1.2, bpg: 0.8 },
  { name: "Jarrett Allen", team: "CLE", pos: "C", ppg: 12.3, tpg: 0.0, apg: 1.1, spg: 1.0, bpg: 2.0 },
  { name: "Reed Sheppard", team: "HOU", pos: "SG", ppg: 12.2, tpg: 2.7, apg: 4.7, spg: 2.2, bpg: 0.8 },
  { name: "Naz Reid", team: "MIN", pos: "C", ppg: 12.1, tpg: 1.7, apg: 2.2, spg: 0.5, bpg: 0.4 },
  { name: "Brandon Ingram", team: "TOR", pos: "SF", ppg: 12.0, tpg: 1.0, apg: 2.2, spg: 0.6, bpg: 0.8 },
  { name: "Kelly Oubre Jr.", team: "PHI", pos: "SF", ppg: 11.6, tpg: 0.9, apg: 1.1, spg: 0.5, bpg: 0.5 },
  { name: "Luke Kennard", team: "LAL", pos: "SG", ppg: 11.5, tpg: 1.8, apg: 2.3, spg: 0.9, bpg: 0.1 },
  { name: "Duncan Robinson", team: "DET", pos: "SG", ppg: 11.5, tpg: 3.1, apg: 2.5, spg: 1.5, bpg: 0.3 },
  { name: "Jalen Suggs", team: "ORL", pos: "PG", ppg: 11.1, tpg: 1.9, apg: 4.1, spg: 1.9, bpg: 0.6 },
  { name: "Ja'Kobe Walter", team: "TOR", pos: "SG", ppg: 11.1, tpg: 2.4, apg: 1.4, spg: 2.0, bpg: 0.3 },
  { name: "Derrick White", team: "BOS", pos: "SG", ppg: 11.1, tpg: 2.1, apg: 3.1, spg: 0.9, bpg: 1.4 },
  { name: "Wendell Carter Jr.", team: "ORL", pos: "C", ppg: 11.0, tpg: 0.7, apg: 2.9, spg: 0.6, bpg: 1.7 },
  { name: "Tim Hardaway Jr.", team: "DEN", pos: "SG", ppg: 10.8, tpg: 1.3, apg: 0.8, spg: 0.7, bpg: 0.3 },
  { name: "Terrence Shannon Jr.", team: "MIN", pos: "SG", ppg: 10.6, tpg: 0.9, apg: 1.4, spg: 0.4, bpg: 0.0 },
  { name: "Max Strus", team: "CLE", pos: "SF", ppg: 10.5, tpg: 2.3, apg: 2.0, spg: 0.8, bpg: 0.3 },
  { name: "Jerami Grant", team: "POR", pos: "PF", ppg: 10.4, tpg: 1.0, apg: 0.4, spg: 1.0, bpg: 0.2 },
  { name: "Josh Hart", team: "NYK", pos: "SF", ppg: 10.3, tpg: 1.1, apg: 4.2, spg: 1.6, bpg: 0.2 },
  { name: "Julian Champagnie", team: "SAS", pos: "SF", ppg: 10.2, tpg: 2.4, apg: 1.4, spg: 1.4, bpg: 0.4 },
  { name: "Jalen Duren", team: "DET", pos: "C", ppg: 10.1, tpg: 0.0, apg: 2.3, spg: 0.7, bpg: 1.0 },
  { name: "Deandre Ayton", team: "LAL", pos: "C", ppg: 10.0, tpg: 0.0, apg: 0.9, spg: 0.2, bpg: 0.8 },
  { name: "Isaiah Hartenstein", team: "OKC", pos: "C", ppg: 9.9, tpg: 0.0, apg: 2.5, spg: 1.3, bpg: 0.9 },
  { name: "Robert Williams", team: "POR", pos: "C", ppg: 9.6, tpg: 0.6, apg: 2.6, spg: 0.6, bpg: 1.2 },
  { name: "Neemias Queta", team: "BOS", pos: "C", ppg: 9.3, tpg: 0.0, apg: 0.6, spg: 0.1, bpg: 0.9 },
  { name: "Jamal Shead", team: "TOR", pos: "PG", ppg: 9.0, tpg: 2.0, apg: 5.0, spg: 1.4, bpg: 0.1 },
  { name: "Keldon Johnson", team: "SAS", pos: "SF", ppg: 8.7, tpg: 0.8, apg: 1.1, spg: 0.9, bpg: 0.3 },
  { name: "Anthony Black", team: "ORL", pos: "PG", ppg: 8.6, tpg: 1.0, apg: 1.4, spg: 2.1, bpg: 0.7 },
  { name: "Christian Braun", team: "DEN", pos: "SG", ppg: 8.3, tpg: 1.0, apg: 1.7, spg: 1.0, bpg: 0.8 },
  { name: "Ausar Thompson", team: "DET", pos: "SF", ppg: 8.3, tpg: 0.0, apg: 3.3, spg: 2.0, bpg: 1.8 },
  { name: "Daniss Jenkins", team: "DET", pos: "PG", ppg: 8.0, tpg: 0.9, apg: 2.8, spg: 0.5, bpg: 0.4 },
  { name: "Rudy Gobert", team: "MIN", pos: "C", ppg: 7.8, tpg: 0.0, apg: 2.5, spg: 1.3, bpg: 1.2 },
  { name: "Sam Hauser", team: "BOS", pos: "PF", ppg: 7.7, tpg: 2.3, apg: 0.9, spg: 0.1, bpg: 0.1 },
  { name: "Alex Caruso", team: "OKC", pos: "SG", ppg: 7.6, tpg: 1.6, apg: 1.6, spg: 1.5, bpg: 0.1 },
  { name: "Miles McBride", team: "NYK", pos: "SG", ppg: 7.5, tpg: 2.2, apg: 1.0, spg: 0.5, bpg: 0.2 },
  { name: "Dyson Daniels", team: "ATL", pos: "SG", ppg: 7.3, tpg: 0.7, apg: 5.0, spg: 1.8, bpg: 0.3 },
  { name: "Jared McCain", team: "OKC", pos: "SG", ppg: 7.3, tpg: 1.6, apg: 0.5, spg: 0.0, bpg: 0.0 },
  { name: "Cason Wallace", team: "OKC", pos: "SG", ppg: 7.3, tpg: 1.5, apg: 2.1, spg: 1.8, bpg: 0.5 },
  { name: "Shaedon Sharpe", team: "POR", pos: "SG", ppg: 7.2, tpg: 0.6, apg: 0.6, spg: 0.4, bpg: 0.4 },
  { name: "Toumani Camara", team: "POR", pos: "PF", ppg: 7.0, tpg: 1.4, apg: 1.2, spg: 1.4, bpg: 0.6 },
  { name: "Donovan Clingan", team: "POR", pos: "C", ppg: 7.0, tpg: 1.0, apg: 2.2, spg: 0.2, bpg: 0.6 },
  { name: "Jakob Poeltl", team: "TOR", pos: "C", ppg: 7.0, tpg: 0.0, apg: 1.4, spg: 0.9, bpg: 0.9 },
  { name: "Dennis Schröder", team: "CLE", pos: "PG", ppg: 6.8, tpg: 0.8, apg: 2.1, spg: 0.3, bpg: 0.3 },
  { name: "Quentin Grimes", team: "PHI", pos: "SG", ppg: 6.7, tpg: 1.3, apg: 2.3, spg: 0.3, bpg: 0.5 },
  { name: "Isaiah Joe", team: "OKC", pos: "SG", ppg: 6.6, tpg: 1.7, apg: 1.1, spg: 0.6, bpg: 0.0 },
  { name: "Paul Reed", team: "DET", pos: "C", ppg: 6.6, tpg: 0.1, apg: 0.4, spg: 0.1, bpg: 0.7 },
  { name: "Jordan Clarkson", team: "NYK", pos: "SG", ppg: 6.5, tpg: 0.0, apg: 1.0, spg: 0.3, bpg: 0.0 },
  { name: "Luguentz Dort", team: "OKC", pos: "SF", ppg: 6.5, tpg: 1.9, apg: 1.4, spg: 0.5, bpg: 0.1 },
  { name: "Spencer Jones", team: "DEN", pos: "SF", ppg: 6.5, tpg: 1.5, apg: 0.3, spg: 0.7, bpg: 1.2 },
  { name: "Sam Merrill", team: "CLE", pos: "SG", ppg: 6.5, tpg: 1.5, apg: 1.1, spg: 0.5, bpg: 0.0 },
  { name: "Bruce Brown", team: "DEN", pos: "SG", ppg: 6.3, tpg: 0.5, apg: 1.7, spg: 1.7, bpg: 0.0 },
  { name: "Nikola Vučević", team: "BOS", pos: "C", ppg: 6.2, tpg: 1.2, apg: 2.3, spg: 0.2, bpg: 0.5 },
  { name: "Jaxson Hayes", team: "LAL", pos: "C", ppg: 5.7, tpg: 0.0, apg: 0.7, spg: 0.3, bpg: 0.8 },
  { name: "Mitchell Robinson", team: "NYK", pos: "C", ppg: 5.7, tpg: 0.0, apg: 0.3, spg: 0.3, bpg: 0.8 },
  { name: "Luke Kornet", team: "SAS", pos: "C", ppg: 5.6, tpg: 0.1, apg: 1.0, spg: 0.9, bpg: 0.9 },
  { name: "Caris LeVert", team: "DET", pos: "SG", ppg: 5.3, tpg: 0.5, apg: 1.0, spg: 0.5, bpg: 0.5 },
  { name: "Sandro Mamukelashvili", team: "TOR", pos: "C", ppg: 5.0, tpg: 0.6, apg: 1.0, spg: 0.7, bpg: 0.4 },
  { name: "Jose Alvarado", team: "NYK", pos: "PG", ppg: 4.9, tpg: 1.0, apg: 1.2, spg: 0.8, bpg: 0.1 },
  { name: "Jamison Battle", team: "TOR", pos: "SF", ppg: 4.8, tpg: 1.2, apg: 0.2, spg: 0.0, bpg: 0.0 },
  { name: "Bones Hyland", team: "MIN", pos: "PG", ppg: 4.8, tpg: 0.9, apg: 1.7, spg: 0.4, bpg: 0.1 },
  { name: "Josh Okogie", team: "HOU", pos: "SG", ppg: 4.8, tpg: 0.8, apg: 0.8, spg: 1.2, bpg: 0.0 },
  { name: "Jaylon Tyson", team: "CLE", pos: "SG", ppg: 4.8, tpg: 0.8, apg: 1.6, spg: 0.2, bpg: 0.1 },
  { name: "Dean Wade", team: "CLE", pos: "PF", ppg: 4.8, tpg: 1.0, apg: 0.4, spg: 0.8, bpg: 0.0 },
  { name: "Jamal Cain", team: "ORL", pos: "SF", ppg: 4.6, tpg: 0.4, apg: 0.6, spg: 0.3, bpg: 0.4 },
  { name: "Luka Garza", team: "BOS", pos: "C", ppg: 4.4, tpg: 0.6, apg: 0.9, spg: 0.0, bpg: 0.1 },
  { name: "Isaiah Stewart", team: "DET", pos: "C", ppg: 4.4, tpg: 0.3, apg: 0.3, spg: 0.1, bpg: 1.2 },
  { name: "Mike Conley", team: "MIN", pos: "PG", ppg: 4.3, tpg: 1.0, apg: 2.5, spg: 0.5, bpg: 0.0 },
  { name: "Baylor Scheierman", team: "BOS", pos: "SG", ppg: 4.3, tpg: 1.1, apg: 0.6, spg: 0.9, bpg: 0.1 },
  { name: "Gabe Vincent", team: "ATL", pos: "PG", ppg: 4.3, tpg: 1.0, apg: 1.2, spg: 0.3, bpg: 0.2 },
  { name: "Tristan Da Silva", team: "ORL", pos: "SF", ppg: 4.1, tpg: 0.7, apg: 0.1, spg: 0.1, bpg: 0.0 },
  { name: "Landry Shamet", team: "NYK", pos: "SG", ppg: 4.1, tpg: 1.0, apg: 0.4, spg: 0.2, bpg: 0.0 },
  { name: "Jeremy Sochan", team: "NYK", pos: "PF", ppg: 4.0, tpg: 0.2, apg: 0.4, spg: 0.2, bpg: 0.2 },
  { name: "Andre Drummond", team: "PHI", pos: "C", ppg: 3.9, tpg: 0.4, apg: 0.6, spg: 0.4, bpg: 0.2 },
  { name: "Jaylin Williams", team: "OKC", pos: "PF", ppg: 3.6, tpg: 1.0, apg: 1.4, spg: 0.8, bpg: 0.4 },
  { name: "Justin Edwards", team: "PHI", pos: "SF", ppg: 3.3, tpg: 0.4, apg: 0.4, spg: 0.0, bpg: 0.1 },
  { name: "Tyler Kolek", team: "NYK", pos: "PG", ppg: 3.3, tpg: 0.3, apg: 1.8, spg: 0.0, bpg: 0.2 },
  { name: "Jake LaRavia", team: "LAL", pos: "PF", ppg: 3.3, tpg: 0.3, apg: 0.8, spg: 0.5, bpg: 0.8 },
  { name: "Carter Bryant", team: "SAS", pos: "PF", ppg: 3.2, tpg: 0.8, apg: 1.2, spg: 0.0, bpg: 0.3 },
  { name: "Dominick Barlow", team: "PHI", pos: "PF", ppg: 2.9, tpg: 0.0, apg: 0.1, spg: 0.2, bpg: 0.4 },
  { name: "Jarred Vanderbilt", team: "LAL", pos: "PF", ppg: 2.9, tpg: 0.1, apg: 0.3, spg: 0.3, bpg: 0.0 },
  { name: "Trendon Watford", team: "PHI", pos: "PF", ppg: 2.9, tpg: 0.0, apg: 0.4, spg: 0.4, bpg: 0.0 },
  { name: "Goga Bitadze", team: "ORL", pos: "C", ppg: 2.8, tpg: 0.0, apg: 0.3, spg: 0.3, bpg: 1.7 },
  { name: "Pacôme Dadiet", team: "NYK", pos: "SG", ppg: 2.8, tpg: 0.4, apg: 0.6, spg: 0.2, bpg: 0.0 },
  { name: "Harrison Barnes", team: "SAS", pos: "PF", ppg: 2.7, tpg: 0.2, apg: 0.2, spg: 0.1, bpg: 0.1 },
  { name: "Javonte Green", team: "DET", pos: "SG", ppg: 2.7, tpg: 0.6, apg: 0.3, spg: 0.5, bpg: 0.5 },
  { name: "Aaron Holiday", team: "HOU", pos: "PG", ppg: 2.7, tpg: 0.7, apg: 0.5, spg: 0.3, bpg: 0.2 },
  { name: "Nick Smith Jr.", team: "LAL", pos: "SG", ppg: 2.7, tpg: 0.5, apg: 0.2, spg: 0.2, bpg: 0.2 },
  { name: "Adem Bona", team: "PHI", pos: "C", ppg: 2.6, tpg: 0.0, apg: 0.1, spg: 0.1, bpg: 0.7 },
  { name: "Corey Kispert", team: "ATL", pos: "SF", ppg: 2.2, tpg: 0.2, apg: 1.2, spg: 0.4, bpg: 0.0 },
  { name: "Lindy Waters III", team: "SAS", pos: "SG", ppg: 2.2, tpg: 0.6, apg: 0.2, spg: 0.0, bpg: 0.0 },
  { name: "Ariel Hukporti", team: "NYK", pos: "C", ppg: 2.1, tpg: 0.0, apg: 0.1, spg: 0.1, bpg: 0.7 },
  { name: "Dalton Knecht", team: "LAL", pos: "SF", ppg: 2.0, tpg: 0.4, apg: 0.6, spg: 0.0, bpg: 0.0 },
  { name: "Jae'Sean Tate", team: "HOU", pos: "SF", ppg: 2.0, tpg: 0.0, apg: 0.0, spg: 0.2, bpg: 0.0 },
  { name: "Kyle Anderson", team: "MIN", pos: "SF", ppg: 1.9, tpg: 0.0, apg: 1.7, spg: 0.3, bpg: 0.0 },
  { name: "Dalton Terry", team: "PHI", pos: "SG", ppg: 1.9, tpg: 0.3, apg: 1.0, spg: 0.7, bpg: 0.0 },
  { name: "Ron Harper Jr.", team: "BOS", pos: "SF", ppg: 1.8, tpg: 0.5, apg: 0.2, spg: 0.5, bpg: 0.0 },
  { name: "Mouhamed Gueye", team: "ATL", pos: "PF", ppg: 1.7, tpg: 0.2, apg: 0.7, spg: 0.2, bpg: 0.0 },
  { name: "A.J. Lawson", team: "TOR", pos: "SG", ppg: 1.7, tpg: 0.3, apg: 0.6, spg: 0.0, bpg: 0.3 },
  { name: "Jordan Walsh", team: "BOS", pos: "PF", ppg: 1.7, tpg: 0.3, apg: 1.0, spg: 0.6, bpg: 0.3 },
  { name: "Jaylen Clark", team: "MIN", pos: "SG", ppg: 1.6, tpg: 0.4, apg: 0.6, spg: 0.2, bpg: 0.2 },
  { name: "Bronny James", team: "LAL", pos: "SG", ppg: 1.5, tpg: 0.3, apg: 0.9, spg: 0.1, bpg: 0.0 },
  { name: "Adou Thiero", team: "LAL", pos: "SF", ppg: 1.5, tpg: 0.0, apg: 0.2, spg: 0.0, bpg: 0.0 },
  { name: "Thomas Bryant", team: "CLE", pos: "C", ppg: 1.4, tpg: 0.0, apg: 0.2, spg: 0.4, bpg: 0.2 },
  { name: "Mohamed Diawara", team: "NYK", pos: "SF", ppg: 1.4, tpg: 0.2, apg: 0.8, spg: 0.2, bpg: 0.0 },
  { name: "Ron Holland", team: "DET", pos: "SF", ppg: 1.4, tpg: 0.1, apg: 0.1, spg: 0.6, bpg: 0.3 },
  { name: "Aaron Wiggins", team: "OKC", pos: "SG", ppg: 1.4, tpg: 0.0, apg: 0.7, spg: 0.1, bpg: 0.0 },
  { name: "Keon Ellis", team: "CLE", pos: "SG", ppg: 1.3, tpg: 0.4, apg: 0.1, spg: 0.7, bpg: 0.1 },
  { name: "Kevin Huerter", team: "DET", pos: "SG", ppg: 1.2, tpg: 0.4, apg: 1.4, spg: 0.4, bpg: 0.0 },
  { name: "Kris Murray", team: "POR", pos: "SF", ppg: 1.0, tpg: 0.0, apg: 0.0, spg: 0.0, bpg: 0.0 },
  { name: "Bismack Biyombo", team: "SAS", pos: "C", ppg: 0.8, tpg: 0.0, apg: 0.0, spg: 0.0, bpg: 0.0 },
  { name: "Jabari Walker", team: "PHI", pos: "PF", ppg: 0.7, tpg: 0.0, apg: 0.0, spg: 0.0, bpg: 0.0 },
  { name: "Nikola Topić", team: "OKC", pos: "PG", ppg: 0.4, tpg: 0.0, apg: 0.2, spg: 0.2, bpg: 0.0 },
  { name: "Kenrich Williams", team: "OKC", pos: "PF", ppg: 0.3, tpg: 0.0, apg: 0.2, spg: 0.0, bpg: 0.0 },
];

// Average NBA starter per-game stats (used as scaling reference).
// These reference values stay constant across pool variants — they're the
// destination distribution the scaling math maps your league into.
const NBA_AVG = { ppg: 16.0, tpg: 1.3, apg: 4.0, spg: 1.1, bpg: 0.6 };

// =======================================================================
// Manual comp overrides
// =======================================================================
//
// Hand-picked comps that bypass the nearest-neighbor algorithm. Keyed by
// YBA player display name (case-sensitive — match the players table). To
// remove an override, delete the entry; the algorithm takes over again.
//
// Used today for at least one bit-of-comedy override; safe to keep around.
export const MANUAL_COMP_OVERRIDES: Record<string, NBAPlayer> = {};

/**
 * Per-player heading override. Lets us label individual players' comp
 * cards with a different context (e.g. Celebrity Game instead of the
 * default Playoffs theme). Keys match MANUAL_COMP_OVERRIDES.
 */
export const COMP_HEADING_OVERRIDES: Record<string, string> = {};

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
  players: { ppg: number; twos_pg?: number; apg?: number; spg?: number; bpg?: number; ones_made?: number; twos_made?: number; assists: number; steals: number; blocks: number; games_played: number }[]
): PerGameStats {
  // Filter to players with at least 2 games for stable averages
  const qualified = players.filter((p) => p.games_played >= 2);
  if (qualified.length === 0) {
    const all = players.length > 0 ? players : [{ ppg: 1, twos_pg: 0, apg: 0, spg: 0, bpg: 0, ones_made: 0, twos_made: 0, assists: 0, steals: 0, blocks: 0, games_played: 1 }];
    return avgOf(all);
  }
  return avgOf(qualified);
}

function avgOf(
  players: { ppg: number; twos_pg?: number; apg?: number; spg?: number; bpg?: number; ones_made?: number; twos_made?: number; assists: number; steals: number; blocks: number; games_played: number }[]
): PerGameStats {
  const n = players.length;
  const sumPpg = players.reduce((s, p) => s + p.ppg, 0);
  // Use pre-computed normalized per-game fields if available, otherwise fall back to raw division
  const sumTpg = players.reduce((s, p) => s + (p.twos_pg ?? (p.twos_made || 0) / (p.games_played || 1)), 0);
  const sumApg = players.reduce((s, p) => s + (p.apg ?? p.assists / (p.games_played || 1)), 0);
  const sumSpg = players.reduce((s, p) => s + (p.spg ?? p.steals / (p.games_played || 1)), 0);
  const sumBpg = players.reduce((s, p) => s + (p.bpg ?? p.blocks / (p.games_played || 1)), 0);
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
  leagueAvg: PerGameStats,
  // Optional override — defaults to the all-time pool. The player page
  // passes NBA_COMP_POOL_PLAYOFFS_2026 when the playoff theme is active.
  pool: NBAPlayer[] = NBA_COMP_POOL,
  // Optional YBA player display name. When provided, we first check the
  // MANUAL_COMP_OVERRIDES map and short-circuit the distance math when
  // a hand-picked comp is set.
  playerName?: string,
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

  // Manual override — short-circuit the distance algorithm when this player
  // has a hand-picked comp. We still return the scaled stats so the card's
  // "NBA Scaled Stats" section keeps showing real numbers for the player.
  if (playerName && MANUAL_COMP_OVERRIDES[playerName]) {
    return { comp: MANUAL_COMP_OVERRIDES[playerName], scaledStats: scaled };
  }

  // Find closest NBA comp using z-score normalized Euclidean distance
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
