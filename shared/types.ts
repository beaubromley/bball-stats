// Shared types for bball-stats

export interface Player {
  id: string;
  name: string;
  created_at: string;
}

export interface Game {
  id: string;
  location: string | null;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'finished';
  winning_team: 'A' | 'B' | null;
}

export interface Roster {
  game_id: string;
  player_id: string;
  team: 'A' | 'B';
}

export type EventType = 'score' | 'correction';

export interface GameEvent {
  id: number;
  game_id: string;
  player_id: string;
  event_type: EventType;
  point_value: number; // 2 or 3 (negative for corrections)
  corrected_event_id: number | null;
  raw_transcript: string | null;
  created_at: string;
}

// Voice command parsing result
export interface ParsedCommand {
  type: 'score' | 'correction' | 'new_game' | 'end_game' | 'set_teams' | 'unknown';
  player_name?: string;
  points?: number;
  winning_team?: 'A' | 'B';
  teams?: { a: string[]; b: string[] };
  raw_transcript: string;
  confidence: number; // 0-1, how confident the parser is
}

// API request/response types
export interface CreateGameRequest {
  location?: string;
}

export interface SetRosterRequest {
  team_a: string[]; // player names
  team_b: string[];
}

export interface RecordEventRequest {
  player_name: string;
  event_type: EventType;
  point_value: number;
  corrected_event_id?: number;
  raw_transcript?: string;
}

export interface EndGameRequest {
  winning_team: 'A' | 'B';
}

export interface PlayerStats {
  player: Player;
  games_played: number;
  wins: number;
  losses: number;
  win_pct: number;
  total_points: number;
  ppg: number; // points per game
  twos_made: number;
  threes_made: number;
  efg_pct: number; // effective field goal %
}

// Garmin watch display data
export interface WatchData {
  game_id: string | null;
  team_a_score: number;
  team_b_score: number;
  team_a_names: string[];
  team_b_names: string[];
  last_event: string; // e.g. "John +2"
  last_event_id: number | null;
  last_event_player: string | null;
  last_event_points: number | null;
  game_status: 'active' | 'finished' | 'idle';
  target_score: number | null;
}
