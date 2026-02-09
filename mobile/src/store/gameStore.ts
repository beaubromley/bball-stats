import { useCallback, useReducer } from "react";
import { v4 as uuid } from "uuid";

export interface ScoringEvent {
  id: number;
  playerName: string;
  points: number;
  eventType: "score" | "correction";
  correctedEventId?: number;
  rawTranscript: string;
  timestamp: number;
}

export type TargetScore = 11 | 15 | 21;

export interface GameState {
  // Current game
  gameId: string | null;
  status: "idle" | "active" | "finished";
  targetScore: TargetScore;

  // Teams
  teamA: string[]; // player names
  teamB: string[];

  // Live scores (derived from events, but cached for display)
  teamAScore: number;
  teamBScore: number;

  // Event log
  events: ScoringEvent[];
  nextEventId: number;

  // Result
  winningTeam: "A" | "B" | null;

  // Transcript log (for debugging)
  recentTranscripts: string[];
}

type GameAction =
  | { type: "START_GAME"; targetScore?: TargetScore }
  | { type: "SET_TEAMS"; teamA: string[]; teamB: string[] }
  | {
      type: "SCORE";
      playerName: string;
      points: number;
      rawTranscript: string;
    }
  | { type: "UNDO"; rawTranscript: string }
  | { type: "END_GAME"; winningTeam: "A" | "B" }
  | { type: "RESET" }
  | { type: "ADD_TRANSCRIPT"; text: string };

function getTeamForPlayer(
  state: GameState,
  playerName: string
): "A" | "B" | null {
  const nameL = playerName.toLowerCase();
  if (
    state.teamA.some((n) => n.toLowerCase() === nameL) ||
    nameL === "me"
  ) {
    return "A";
  }
  if (state.teamB.some((n) => n.toLowerCase() === nameL)) {
    return "B";
  }
  return null;
}

function recalcScores(events: ScoringEvent[], state: GameState) {
  let teamAScore = 0;
  let teamBScore = 0;

  for (const event of events) {
    if (event.eventType === "correction") continue; // corrections are handled via negation

    const team = getTeamForPlayer(state, event.playerName);
    if (team === "A") teamAScore += event.points;
    else if (team === "B") teamBScore += event.points;
  }

  return { teamAScore, teamBScore };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "START_GAME":
      return {
        ...initialState,
        gameId: uuid(),
        status: "active",
        targetScore: action.targetScore ?? 11,
      };

    case "SET_TEAMS":
      return {
        ...state,
        teamA: action.teamA,
        teamB: action.teamB,
      };

    case "SCORE": {
      const newEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: action.playerName,
        points: action.points,
        eventType: "score",
        rawTranscript: action.rawTranscript,
        timestamp: Date.now(),
      };
      const events = [...state.events, newEvent];
      const newState = {
        ...state,
        events,
        nextEventId: state.nextEventId + 1,
      };
      const scores = recalcScores(events, newState);

      // Auto-end game when a team hits the target score
      let autoEnd: Partial<GameState> = {};
      if (scores.teamAScore >= state.targetScore) {
        autoEnd = { status: "finished", winningTeam: "A" };
      } else if (scores.teamBScore >= state.targetScore) {
        autoEnd = { status: "finished", winningTeam: "B" };
      }

      return { ...newState, ...scores, ...autoEnd };
    }

    case "UNDO": {
      // Find the last non-correction event and remove it
      const lastScore = [...state.events]
        .reverse()
        .find((e) => e.eventType === "score");
      if (!lastScore) return state;

      // Mark it as corrected by filtering it out
      const events = state.events.filter((e) => e.id !== lastScore.id);
      const correctionEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: lastScore.playerName,
        points: -lastScore.points,
        eventType: "correction",
        correctedEventId: lastScore.id,
        rawTranscript: action.rawTranscript,
        timestamp: Date.now(),
      };
      const allEvents = [...events, correctionEvent];
      const newState = {
        ...state,
        events: allEvents,
        nextEventId: state.nextEventId + 1,
      };
      const scores = recalcScores(
        allEvents.filter((e) => e.eventType === "score"),
        newState
      );
      return { ...newState, ...scores };
    }

    case "END_GAME":
      return {
        ...state,
        status: "finished",
        winningTeam: action.winningTeam,
      };

    case "RESET":
      return initialState;

    case "ADD_TRANSCRIPT":
      return {
        ...state,
        recentTranscripts: [
          action.text,
          ...state.recentTranscripts.slice(0, 9),
        ],
      };

    default:
      return state;
  }
}

const initialState: GameState = {
  gameId: null,
  status: "idle",
  targetScore: 11,
  teamA: [],
  teamB: [],
  teamAScore: 0,
  teamBScore: 0,
  events: [],
  nextEventId: 1,
  winningTeam: null,
  recentTranscripts: [],
};

export function useGameStore() {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const startGame = useCallback(
    (targetScore?: TargetScore) =>
      dispatch({ type: "START_GAME", targetScore }),
    []
  );
  const setTeams = useCallback(
    (teamA: string[], teamB: string[]) =>
      dispatch({ type: "SET_TEAMS", teamA, teamB }),
    []
  );
  const score = useCallback(
    (playerName: string, points: number, rawTranscript: string) =>
      dispatch({ type: "SCORE", playerName, points, rawTranscript }),
    []
  );
  const undo = useCallback(
    (rawTranscript: string) => dispatch({ type: "UNDO", rawTranscript }),
    []
  );
  const endGame = useCallback(
    (winningTeam: "A" | "B") => dispatch({ type: "END_GAME", winningTeam }),
    []
  );
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const addTranscript = useCallback(
    (text: string) => dispatch({ type: "ADD_TRANSCRIPT", text }),
    []
  );

  return {
    state,
    startGame,
    setTeams,
    score,
    undo,
    endGame,
    reset,
    addTranscript,
  };
}
