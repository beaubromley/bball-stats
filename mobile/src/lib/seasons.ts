export const GAMES_PER_SEASON = 82;

export interface Season {
  number: number;
  label: string;
  startGame: number;
  endGame: number;
}

/** Given a 1-indexed game number, return which season it belongs to */
export function getSeasonForGameNumber(gameNum: number): number {
  return Math.ceil(gameNum / GAMES_PER_SEASON);
}

/** Given a season number (1-indexed), return the game number range */
export function getGameRangeForSeason(season: number): {
  startGame: number;
  endGame: number;
} {
  return {
    startGame: (season - 1) * GAMES_PER_SEASON + 1,
    endGame: season * GAMES_PER_SEASON,
  };
}

/** Given total number of finished games, return current season and total seasons */
export function getSeasonInfo(totalGames: number): {
  currentSeason: number;
  totalSeasons: number;
} {
  if (totalGames === 0) return { currentSeason: 1, totalSeasons: 1 };
  const currentSeason = Math.ceil(totalGames / GAMES_PER_SEASON);
  return { currentSeason, totalSeasons: currentSeason };
}

/** Group items by 82-game seasons. Items must be in chronological order (oldest first). */
export function groupBySeason<T>(items: T[]): { season: Season; games: T[] }[] {
  const groups: { season: Season; games: T[] }[] = [];

  for (let i = 0; i < items.length; i++) {
    const gameNum = i + 1;
    const seasonNum = getSeasonForGameNumber(gameNum);
    const { startGame, endGame } = getGameRangeForSeason(seasonNum);

    if (!groups[seasonNum - 1]) {
      groups[seasonNum - 1] = {
        season: {
          number: seasonNum,
          label: `Season ${seasonNum}`,
          startGame,
          endGame,
        },
        games: [],
      };
    }
    groups[seasonNum - 1].games.push(items[i]);
  }

  return groups;
}
