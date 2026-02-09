export type CommandType =
  | "score"
  | "correction"
  | "new_game"
  | "end_game"
  | "set_teams"
  | "unknown";

export interface ParsedCommand {
  type: CommandType;
  playerName?: string;
  points?: number;
  winningTeam?: "A" | "B";
  teams?: { a: string[]; b: string[] };
  rawTranscript: string;
  confidence: number;
}

// The "hero" player — the person wearing the mic
const HERO = "Me";

// Normalize transcript for matching
function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[.,!?]/g, "");
}

/**
 * Parse a voice transcript into a basketball command.
 *
 * Pickup scoring: 1's and 2's (inside = 1, outside/three = 2)
 *
 * Handles patterns like:
 *   "bucket" / "score" / "one" → 1pt for speaker
 *   "two" / "three" / "from deep" / "downtown" → 2pts for speaker
 *   "John bucket" / "John scored" → 1pt for John
 *   "John two" / "two John" → 2pts for John
 *   "cancel" / "undo" / "take that back" → correction
 *   "game over we won" / "game over they won" → end game
 *   "new game" / "start game" → new game
 *   "teams me John Steve versus Mike Gary Sam" → set rosters
 */
export function parseTranscript(
  transcript: string,
  knownPlayers: string[] = []
): ParsedCommand {
  const text = normalize(transcript);
  const result: ParsedCommand = {
    type: "unknown",
    rawTranscript: transcript,
    confidence: 0,
  };

  // --- Correction ---
  if (
    /\b(cancel|undo|take that back|never ?mind|scratch that|no good|my bad)\b/.test(
      text
    )
  ) {
    return { ...result, type: "correction", confidence: 0.9 };
  }

  // --- New Game ---
  if (/\b(new game|start game|next game|run it back)\b/.test(text)) {
    return { ...result, type: "new_game", confidence: 0.9 };
  }

  // --- End Game ---
  const endGameMatch = text.match(
    /\b(game over|game done|that'?s game|we'?re done)\b/
  );
  if (endGameMatch) {
    let winningTeam: "A" | "B" | undefined;
    if (/\b(we won|we win|dub|let'?s go)\b/.test(text)) {
      winningTeam = "A"; // Hero's team
    } else if (/\b(they won|they win|we lost|we lose|l)\b/.test(text)) {
      winningTeam = "B";
    }
    return {
      ...result,
      type: "end_game",
      winningTeam,
      confidence: winningTeam ? 0.9 : 0.7,
    };
  }

  // --- Set Teams ---
  const teamsMatch = text.match(
    /\bteams?\b[:\s]*([\w\s]+?)\s+(?:versus|vs\.?|v)\s+([\w\s]+)/
  );
  if (teamsMatch) {
    const teamA = teamsMatch[1]
      .trim()
      .split(/\s+and\s+|\s*,\s*|\s+/)
      .filter(Boolean);
    const teamB = teamsMatch[2]
      .trim()
      .split(/\s+and\s+|\s*,\s*|\s+/)
      .filter(Boolean);
    return {
      ...result,
      type: "set_teams",
      teams: { a: teamA, b: teamB },
      confidence: 0.8,
    };
  }

  // --- Scoring (1's and 2's pickup rules) ---
  // "two" / "three" / "deep" / "downtown" = 2pts (outside shot)
  const isTwo = /\b(two|2|three|3|three pointer|from deep|downtown|splash)\b/.test(
    text
  );
  // "bucket" / "score" / "one" / "layup" = 1pt (inside shot)
  const isOne = /\b(bucket|score[ds]?|one|1|layup|dunk|mid[- ]?range|floater|and one)\b/.test(
    text
  );

  if (isTwo || isOne) {
    const points = isTwo ? 2 : 1;

    // Try to find a player name in the transcript
    const playerName = findPlayerName(text, knownPlayers);

    return {
      ...result,
      type: "score",
      playerName: playerName || HERO,
      points,
      confidence: playerName ? 0.85 : 0.8,
    };
  }

  return result;
}

/**
 * Try to extract a player name from the transcript.
 * Checks against a list of known players first, then falls back to
 * looking for a capitalized word near scoring keywords.
 */
function findPlayerName(
  text: string,
  knownPlayers: string[]
): string | undefined {
  const lower = text.toLowerCase();

  // Check known players (case-insensitive)
  for (const player of knownPlayers) {
    if (lower.includes(player.toLowerCase())) {
      return player;
    }
  }

  // Try to find a name-like word that isn't a scoring keyword
  const scoringWords = new Set([
    "bucket",
    "score",
    "scored",
    "scores",
    "two",
    "three",
    "pointer",
    "layup",
    "dunk",
    "deep",
    "downtown",
    "splash",
    "from",
    "for",
    "with",
    "the",
    "a",
    "an",
    "and",
    "got",
    "mid",
    "range",
    "floater",
    "one",
  ]);

  const words = text.split(/\s+/);
  for (const word of words) {
    if (word.length > 1 && !scoringWords.has(word)) {
      // This could be a player name
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
  }

  return undefined;
}
