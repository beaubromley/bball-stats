export type CommandType =
  | "score"
  | "correction"
  | "new_game"
  | "end_game"
  | "set_teams"
  | "steal"
  | "block"
  | "assist"
  | "unknown";

export interface ParsedCommand {
  type: CommandType;
  playerName?: string;
  points?: number;
  assistBy?: string;
  stealBy?: string;
  winningTeam?: "A" | "B";
  teams?: { a: string[]; b: string[] };
  rawTranscript: string;
  confidence: number;
}

// Speech recognition mishears words — map common variants to what we mean
// Add entries here as you discover new mishearings during games
const ALIASES: Record<string, string> = {
  // Names
  gauge: "gage",
  gates: "gage",
  bow: "beau",
  bo: "beau",
  o: "beau",
  add: "ed",
  john: "jon",
  garrett: "garett",
  gareth: "garett",
  jarrett: "garett",
  print: "brent",
  brett: "brent",
  boston: "austin",
  awesome: "austin",
  austen: "austin",
  madison: "addison",
  edison: "addison",
  brendan: "brandon",
  brenton: "brandon",
  jaxon: "jackson",
  tailor: "taylor",
  tiler: "tyler",
  "a j": "aj",
  jay: "aj",
  jane: "james",
  chains: "james",
  mac: "mack",
  tie: "ty",
  thai: "ty",
  jesse: "jc",
  jaycee: "jc",
  don: "jon",
  bison: "bryson",
  brian: "ryan",
  dave: "david",
  darker: "parker",
  grand: "grant",
  golden: "colton",
  // Basketball terms
  still: "steal",
  steel: "steal",
  steele: "steal",
  stills: "steals",
  steels: "steals",
  "a cyst": "assist",
  "a sister": "assist",
  // Blocks
  blok: "block",
  blocked: "block",
  blocks: "block",
  bloc: "block",
  lock: "block",
  tu: "two",
  to: "two",
  too: "two",
  free: "three",
  tree: "three",
  buckets: "bucket",
  buggy: "bucket",
  "lay up": "layup",
  "lay-up": "layup",
  late: "layup",
  flurter: "floater",
  flutter: "floater",
  done: "dunk",
  drunk: "dunk",
};

// Words that indicate a 2-pointer (outside shot) — in 1's and 2's, "threes" count as 2
const TWO_RE =
  /\b(two|2|three|3|three ?pointer|deep ?3|deep ?three|deep|from ?deep|from ?outside|downtown|splash|long ?range|pull ?up|bomb)\b/;

// Words that indicate a 1-pointer (inside shot)
const ONE_RE =
  /\b(bucket|score[ds]?|one|won|1|layup|lay ?up|dunk|floater|mid[- ]?range|hook|hook ?shot|put ?back|tip ?in|finger ?roll|bank|bank ?shot|off ?the ?glass)\b/;

// All scoring-related words (used to filter them out when finding unknown player names)
const SCORING_WORDS = new Set([
  "bucket", "score", "scored", "scores", "two", "three", "pointer",
  "layup", "lay", "dunk", "deep", "downtown", "splash", "from", "for",
  "with", "the", "a", "an", "and", "got", "mid", "range", "floater",
  "one", "won", "hook", "shot", "put", "back", "tip", "in", "finger", "roll",
  "bank", "off", "glass", "long", "pull", "up", "bomb", "outside",
  "steal", "steals", "assist", "assists", "block", "blocks", "to", "his", "her",
]);

function normalize(text: string): string {
  let t = text.toLowerCase().trim().replace(/[.,!?']/g, "");
  // Split joined name+number combos: "joe3" → "joe 3", "beaub3" → "beaub 3"
  t = t.replace(/([a-z])(\d)/g, "$1 $2");
  t = t.replace(/(\d)([a-z])/g, "$1 $2");
  // Apply longest aliases first to avoid partial replacements
  const sorted = Object.entries(ALIASES).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [mishear, correct] of sorted) {
    const escaped = mishear.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\b${escaped}\\b`, "g"), correct);
  }
  return t;
}

export type ScoringMode = "1s2s" | "2s3s";

/** Detect if the text contains a shot type and return point value.
 *  1s/2s mode: inside = 1, outside = 2
 *  2s/3s mode: inside = 2, outside = 3
 */
function detectPoints(text: string, scoringMode: ScoringMode = "1s2s"): number {
  if (scoringMode === "2s3s") {
    return TWO_RE.test(text) ? 3 : 2;
  }
  return TWO_RE.test(text) ? 2 : 1;
}

/** Resolve a captured word against the known players list */
function resolvePlayer(word: string, knownPlayers: string[]): string {
  const lower = word.toLowerCase();
  for (const player of knownPlayers) {
    if (player.toLowerCase() === lower) return player;
  }
  // Capitalize first letter for unknown names
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Find any known player name mentioned in the text */
function findPlayerName(
  text: string,
  knownPlayers: string[],
  exclude?: string[]
): string | undefined {
  const lower = text.toLowerCase();
  const excluded = new Set((exclude || []).map((e) => e.toLowerCase()));

  for (const player of knownPlayers) {
    const pLower = player.toLowerCase();
    if (excluded.has(pLower)) continue;
    if (lower.includes(pLower)) return player;
  }

  // Fallback: first non-scoring word that looks like a name
  const words = text.split(/\s+/);
  for (const word of words) {
    if (word.length > 1 && !SCORING_WORDS.has(word) && !excluded.has(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
  }
  return undefined;
}

/**
 * Parse a voice transcript into a basketball command.
 * Supports 1s/2s (default) or 2s/3s scoring modes.
 * Supports compound events: assists, steals, steal-and-score, assist-to-score
 */
export function parseTranscript(
  transcript: string,
  knownPlayers: string[] = [],
  scoringMode: ScoringMode = "1s2s"
): ParsedCommand {
  const text = normalize(transcript);
  const result: ParsedCommand = {
    type: "unknown",
    rawTranscript: transcript,
    confidence: 0,
  };

  // --- Corrections ---
  if (
    /\b(cancel|undo|take that back|never ?mind|scratch that|no good|my bad)\b/.test(text)
  ) {
    return { ...result, type: "correction", confidence: 0.9 };
  }

  // --- New game ---
  if (/\b(new game|start game|next game|run it back)\b/.test(text)) {
    return { ...result, type: "new_game", confidence: 0.9 };
  }

  // --- End game ---
  if (/\b(game over|game done|thats game|were done)\b/.test(text)) {
    let winningTeam: "A" | "B" | undefined;
    if (/\b(we won|we win|dub|lets go)\b/.test(text)) winningTeam = "A";
    else if (/\b(they won|they win|we lost|we lose)\b/.test(text))
      winningTeam = "B";
    return {
      ...result,
      type: "end_game",
      winningTeam,
      confidence: winningTeam ? 0.9 : 0.7,
    };
  }

  // --- Set teams ---
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

  // --- Compound: steal and assist to [name] [shot] ---
  const stealAssistMatch = text.match(
    /(\w+)\s+steals?\s+and\s+assists?\s+to\s+(\w+)/
  );
  if (stealAssistMatch) {
    const stealer = resolvePlayer(stealAssistMatch[1], knownPlayers);
    const scorer = resolvePlayer(stealAssistMatch[2], knownPlayers);
    return {
      ...result,
      type: "score",
      stealBy: stealer,
      assistBy: stealer,
      playerName: scorer,
      points: detectPoints(text, scoringMode),
      confidence: 0.85,
    };
  }

  // --- Compound: [name] assist to [name] [shot] ---
  // Also handles "assist to [name]" (assister = Me)
  const assistMatch = text.match(/(\w+)\s+assists?\s+to\s+(\w+)/);
  if (assistMatch) {
    const assister = resolvePlayer(assistMatch[1], knownPlayers);
    const scorer = resolvePlayer(assistMatch[2], knownPlayers);
    return {
      ...result,
      type: "score",
      assistBy: assister,
      playerName: scorer,
      points: detectPoints(text, scoringMode),
      confidence: 0.85,
    };
  }

  // --- "[name] assist to [name]" or "[name] assist [name]" ---
  const assistNoTo = text.match(/(\w+)\s+assists?\s+(?:to\s+)?(\w+)/);
  if (assistNoTo && !SCORING_WORDS.has(assistNoTo[1]) && !SCORING_WORDS.has(assistNoTo[2])) {
    const assister = resolvePlayer(assistNoTo[1], knownPlayers);
    const scorer = resolvePlayer(assistNoTo[2], knownPlayers);
    return {
      ...result,
      type: "score",
      assistBy: assister,
      playerName: scorer,
      points: detectPoints(text, scoringMode),
      confidence: 0.8,
    };
  }

  // --- Compound: [name] steal and [shot] ---
  const stealScoreMatch = text.match(/(\w+)\s+steals?\s+and\s+/);
  if (stealScoreMatch && (TWO_RE.test(text) || ONE_RE.test(text))) {
    const player = resolvePlayer(stealScoreMatch[1], knownPlayers);
    return {
      ...result,
      type: "score",
      stealBy: player,
      playerName: player,
      points: detectPoints(text, scoringMode),
      confidence: 0.85,
    };
  }

  // "steal and [shot]" without naming stealer — require a name
  // (handled by compound patterns above when a name is present)

  // --- Standalone steal ---
  const stealMatch = text.match(/(\w+)\s+steals?(?:\s|$)/);
  if (stealMatch && !SCORING_WORDS.has(stealMatch[1])) {
    return {
      ...result,
      type: "steal",
      playerName: resolvePlayer(stealMatch[1], knownPlayers),
      confidence: 0.8,
    };
  }

  // --- Standalone block ---
  const blockMatch = text.match(/(\w+)\s+blocks?(?:\s|$)/);
  if (blockMatch && !SCORING_WORDS.has(blockMatch[1])) {
    return {
      ...result,
      type: "block",
      playerName: resolvePlayer(blockMatch[1], knownPlayers),
      confidence: 0.8,
    };
  }

  // --- Assist-only (no scoring word) ---
  // Matches "Tyler assist" or "assist Tyler" when no shot type is present
  if (/\bassists?\b/.test(text) && !TWO_RE.test(text) && !ONE_RE.test(text)) {
    const assistOnlyMatch = text.match(/(\w+)\s+assists?(?:\s|$)/) || text.match(/assists?\s+(?:by\s+|to\s+)?(\w+)/);
    if (assistOnlyMatch) {
      const name = assistOnlyMatch[1];
      if (!SCORING_WORDS.has(name) || name === "assist") {
        const resolvedName = name === "assist" ? undefined : resolvePlayer(name, knownPlayers);
        if (resolvedName) {
          return {
            ...result,
            type: "assist",
            playerName: resolvedName,
            confidence: 0.8,
          };
        }
      }
    }
  }

  // --- Simple scoring ---
  const isTwo = TWO_RE.test(text);
  const isOne = ONE_RE.test(text);

  if (isTwo || isOne) {
    const points = isTwo
      ? (scoringMode === "2s3s" ? 3 : 2)
      : (scoringMode === "2s3s" ? 2 : 1);

    // Check for assist mentioned alongside the score (e.g., "Tyler bucket assist Joe")
    let assistBy: string | undefined;
    let playerName: string | undefined;

    const assistInScore = text.match(/\bassists?\s+(?:to\s+|by\s+)?(\w+)/);
    if (assistInScore && !SCORING_WORDS.has(assistInScore[1])) {
      assistBy = resolvePlayer(assistInScore[1], knownPlayers);
      playerName = findPlayerName(text, knownPlayers, [assistBy]);
    } else {
      playerName = findPlayerName(text, knownPlayers);
    }

    return {
      ...result,
      type: "score",
      playerName,
      points,
      assistBy,
      confidence: playerName ? 0.85 : 0.3,
    };
  }

  return result;
}
