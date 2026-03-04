import * as SecureStore from "expo-secure-store";

const API_BASE = "https://bball-stats-web.vercel.app/api";

let sessionCookie: string | null = null;

export async function loadSessionCookie() {
  sessionCookie = await SecureStore.getItemAsync("session_cookie");
}

export async function setSessionCookie(cookie: string | null) {
  sessionCookie = cookie;
  if (cookie) {
    await SecureStore.setItemAsync("session_cookie", cookie);
  } else {
    await SecureStore.deleteItemAsync("session_cookie");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// Extract set-cookie header from response (for login)
async function requestWithCookie<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; cookie: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  const cookie = res.headers.get("set-cookie");
  const data = await res.json();
  return { data, cookie };
}

// --- Auth ---

export async function login(password: string) {
  const { data, cookie } = await requestWithCookie<{ ok: boolean; role: string }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ password }) }
  );
  if (data.ok && cookie) {
    await setSessionCookie(cookie);
  }
  return data;
}

export async function checkAuth() {
  return request<{ authenticated: boolean; role: string }>("/auth/check");
}

export async function logout() {
  await request("/auth/logout", { method: "POST" });
  await setSessionCookie(null);
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

export function getPlayers(season?: number) {
  const params = season ? `?season=${season}` : "";
  return request<Player[]>(`/players${params}`);
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

export function getPlayerGames(playerId: string) {
  return request<PlayerGame[]>(`/players/${playerId}/games`);
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

export function createGame(location?: string) {
  return request<{ id: string }>("/games", {
    method: "POST",
    body: JSON.stringify({ location }),
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
    assisted_by?: string;
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

export function getActiveGame() {
  return request<{ id: string; status: string } | null>("/games/active");
}

// --- Stats ---

export interface SeasonInfo {
  totalGames: number;
  totalSeasons: number;
  currentSeason: number;
  gamesInSeason: number;
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
