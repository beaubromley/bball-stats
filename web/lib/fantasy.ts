export interface FantasyInput {
  points: number;
  assists: number;
  steals: number;
  blocks: number;
}

/** Fantasy points: 1 FP per point, assist, steal, and block */
export function calculateFantasyPoints(stats: FantasyInput): number {
  return stats.points + stats.assists + stats.steals + stats.blocks;
}
