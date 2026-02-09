// API client for communicating with the backend
// TODO: Replace with actual API URL once backend is deployed

const API_BASE = __DEV__
  ? "http://192.168.1.100:3001" // Local dev — update to your machine's IP
  : "https://bball-stats-api.example.com";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

// --- Games ---

export function createGame(location?: string) {
  return request<{ id: string }>("/games", {
    method: "POST",
    body: JSON.stringify({ location }),
  });
}

export function setRoster(
  gameId: string,
  teamA: string[],
  teamB: string[]
) {
  return request(`/games/${gameId}/roster`, {
    method: "POST",
    body: JSON.stringify({ team_a: teamA, team_b: teamB }),
  });
}

export function recordEvent(
  gameId: string,
  event: {
    player_name: string;
    event_type: "score" | "correction";
    point_value: number;
    corrected_event_id?: number;
    raw_transcript?: string;
  }
) {
  return request(`/games/${gameId}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export function endGame(gameId: string, winningTeam: "A" | "B") {
  return request(`/games/${gameId}/end`, {
    method: "POST",
    body: JSON.stringify({ winning_team: winningTeam }),
  });
}

// --- Players ---

export function getPlayers() {
  return request<{ id: string; name: string }[]>("/players");
}

export function getPlayerStats(playerId: string) {
  return request(`/players/${playerId}/stats`);
}

// --- Game History ---

export function getGames() {
  return request("/games");
}
