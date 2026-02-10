export interface Season {
  label: string; // e.g., "Winter 2026"
  key: string; // e.g., "2026-winter" (for sorting/grouping)
}

export function getSeason(dateStr: string): Season {
  const date = new Date(dateStr);
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();

  let seasonName: string;
  let seasonYear: number;

  if (month === 11) {
    // December → next year's winter
    seasonName = "Winter";
    seasonYear = year + 1;
  } else if (month <= 1) {
    // Jan, Feb
    seasonName = "Winter";
    seasonYear = year;
  } else if (month <= 4) {
    // Mar, Apr, May
    seasonName = "Spring";
    seasonYear = year;
  } else if (month <= 7) {
    // Jun, Jul, Aug
    seasonName = "Summer";
    seasonYear = year;
  } else {
    // Sep, Oct, Nov
    seasonName = "Fall";
    seasonYear = year;
  }

  return {
    label: `${seasonName} ${seasonYear}`,
    key: `${seasonYear}-${seasonName.toLowerCase()}`,
  };
}

/** Group items by season, preserving existing sort order */
export function groupBySeason<T extends { start_time: string }>(
  items: T[]
): { season: Season; games: T[] }[] {
  const groups = new Map<string, { season: Season; games: T[] }>();

  for (const item of items) {
    const season = getSeason(item.start_time);
    if (!groups.has(season.key)) {
      groups.set(season.key, { season, games: [] });
    }
    groups.get(season.key)!.games.push(item);
  }

  return Array.from(groups.values());
}
