import * as SecureStore from "expo-secure-store";

const API_BASE = "https://bball-stats-web.vercel.app/api";

let authToken: string | null = null;

export async function loadSessionCookie() {
  authToken = await SecureStore.getItemAsync("auth_token");
}

export async function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    await SecureStore.setItemAsync("auth_token", token);
  } else {
    await SecureStore.deleteItemAsync("auth_token");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// --- Auth ---

export async function login(password: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  const data = await res.json() as { ok: boolean; role: string; token?: string };
  if (data.ok && data.token) {
    await setAuthToken(data.token);
  }
  return data;
}

export async function checkAuth() {
  return request<{ authenticated: boolean; role: string }>("/auth/check");
}

export async function logout() {
  await setAuthToken(null);
}

// --- Players ---

export interface Player {
  id: string;
  name: string;
  games_played: number;
  wins: number;
  losses: number;
  win_pct: number;
  total_points: number;
  ppg: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  plus_minus: number;
  plus_minus_per_game: number;
  streak: string;
  mvp_count: number;
  apg: number;
  spg: number;
  bpg: number;
  fpg: number;
  ones_pg: number;
  twos_pg: number;
}

export async function getPlayers(season?: number): Promise<Player[]> {
  const params = season ? `?season=${season}` : "";
  // With season param, API wraps response as { data: [...], season: {...} }
  // Without season param, API returns Player[] directly
  const res = await request<Player[] | { data: Player[] }>(`/players${params}`);
  if (!Array.isArray(res)) return res.data;
  return res;
}

export function getPlayerStats(playerId: string) {
  return request<Player>(`/players/${playerId}/stats`);
}

export interface PlayerGame {
  game_id: string;
  start_time: string;
  status: string;
  team: string;
  winning_team: string | null;
  won: boolean;
  points_scored: number;
  assists: number;
  steals: number;
  blocks: number;
  team_a_score: number;
  team_b_score: number;
  winning_score: number;
}

export async function getPlayerGames(playerId: string): Promise<PlayerGame[]> {
  // API returns { id, result ("W"/"L"), ... } — map to mobile interface
  const rows = await request<Record<string, unknown>[]>(`/players/${playerId}/games`);
  return rows.map((r) => ({
    game_id: r.id as string,
    start_time: r.start_time as string,
    status: r.status as string,
    team: r.team as string,
    winning_team: (r.winning_team as string) || null,
    won: r.result === "W",
    points_scored: Number(r.points_scored),
    assists: Number(r.assists),
    steals: Number(r.steals),
    blocks: Number(r.blocks),
    team_a_score: 0, // Not returned by API
    team_b_score: 0,
    winning_score: Number(r.winning_score),
  }));
}

// --- Games ---

export interface Game {
  id: string;
  location: string | null;
  start_time: string;
  end_time: string | null;
  status: string;
  winning_team: string | null;
  team_a_players: string[];
  team_b_players: string[];
  team_a_score: number;
  team_b_score: number;
  game_number: number;
}

export function getGames() {
  return request<Game[]>("/games");
}

export function getGame(gameId: string) {
  return request<Game>(`/games/${gameId}`);
}

export interface BoxScorePlayer {
  player_id: string;
  player_name: string;
  team: "A" | "B";
  points: number;
  ones_made: number;
  twos_made: number;
  assists: number;
  steals: number;
  blocks: number;
  fantasy_points: number;
  is_mvp: boolean;
}

export interface BoxScore {
  game_id: string;
  status: string;
  winning_team: string | null;
  team_a_score: number;
  team_b_score: number;
  players: BoxScorePlayer[];
  mvp: BoxScorePlayer | null;
}

export function getBoxScore(gameId: string) {
  return request<BoxScore>(`/games/${gameId}/boxscore`);
}

export interface GameEvent {
  id: string;
  event_type: string;
  point_value: number;
  player_id: string;
  player_name: string;
  created_at: string;
  corrected_event_id: string | null;
  assisted_by_name: string | null;
}

export function getGameEvents(gameId: string) {
  return request<GameEvent[]>(`/games/${gameId}/events`);
}

// --- Game Recording ---

export function createGame(opts?: { location?: string; target_score?: number; scoring_mode?: string }) {
  return request<{ id: string }>("/games", {
    method: "POST",
    body: JSON.stringify({
      location: opts?.location ?? "Pickup",
      target_score: opts?.target_score,
      scoring_mode: opts?.scoring_mode,
    }),
  });
}

export function setRoster(
  gameId: string,
  body: { team_a: string[]; team_b: string[]; new_player_id?: string; new_team?: string }
) {
  return request(`/games/${gameId}/roster`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function recordEvent(
  gameId: string,
  event: {
    player_name: string;
    event_type: string;
    point_value: number;
    corrected_event_id?: string;
    assisted_event_id?: string;
    raw_transcript?: string;
  }
) {
  return request<{ id: string }>(`/games/${gameId}/events`, {
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

export interface ActiveGameData {
  game_id: string | null;
  game_status: "active" | "finished" | "idle";
  team_a_names: string[];
  team_b_names: string[];
  team_a_score: number;
  team_b_score: number;
  target_score: number | null;
}

export function getActiveGame() {
  return request<ActiveGameData>("/games/active");
}

export function redoEvent(gameId: string, correctedEventId: string) {
  return request(`/games/${gameId}/events/redo`, {
    method: "POST",
    body: JSON.stringify({ corrected_event_id: correctedEventId }),
  });
}

export function changeTargetScore(gameId: string, targetScore: number) {
  return request(`/games/${gameId}/target-score`, {
    method: "POST",
    body: JSON.stringify({ target_score: targetScore }),
  });
}

export function saveTranscript(gameId: string, rawText: string, actedOn: string | null) {
  return request(`/games/${gameId}/transcripts`, {
    method: "POST",
    body: JSON.stringify({ raw_text: rawText, acted_on: actedOn }),
  });
}

export function logFailedTranscript(gameId: string, text: string | null) {
  return request(`/games/${gameId}/failed-transcript`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function createPlayer(firstName: string, lastName: string) {
  return request<{ id: string; display_name: string; first_name: string; full_name: string }>("/players", {
    method: "POST",
    body: JSON.stringify({ first_name: firstName, last_name: lastName }),
  });
}

// --- Stats ---

export interface SeasonInfo {
  totalGames: number;
  totalSeasons: number;
  currentSeason: number;
  gamesPerSeason: number;
}

export function getSeasons() {
  return request<SeasonInfo>("/stats/seasons");
}

export interface TodayStats {
  games_today: number;
  players: Player[];
}

export function getTodayStats(date: string) {
  return request<TodayStats>(`/stats/today?date=${date}`);
}

export function getStreaks(season?: number) {
  const params = season ? `?season=${season}` : "";
  return request<{ player_id: string; player_name: string; streak_type: string; streak_count: number }[]>(
    `/stats/streaks${params}`
  );
}
