import { useCallback, useReducer } from "react";
import * as api from "../services/api";

export interface ScoringEvent {
  id: number;
  apiId?: string;
  playerName: string;
  points: number;
  eventType: "score" | "correction" | "steal" | "block" | "assist";
  correctedEventId?: number;
  assistBy?: string;
  stealBy?: string;
  rawTranscript: string;
  timestamp: number;
}

export type TargetScore = number;

export interface GameState {
  gameId: string | null;
  status: "idle" | "setup" | "active" | "finished";
  targetScore: TargetScore;

  teamA: string[];
  teamB: string[];

  teamAScore: number;
  teamBScore: number;

  events: ScoringEvent[];
  nextEventId: number;

  winningTeam: "A" | "B" | null;

  recentTranscripts: string[];
  lastCommand: string | null;
  flashColor: string | null;
}

type GameAction =
  | { type: "SET_TARGET"; targetScore: TargetScore }
  | { type: "SET_STATUS"; status: GameState["status"] }
  | { type: "SET_GAME_ID"; gameId: string }
  | { type: "SET_TEAMS"; teamA: string[]; teamB: string[] }
  | {
      type: "SCORE";
      playerName: string;
      points: number;
      rawTranscript: string;
      assistBy?: string;
      stealBy?: string;
    }
  | { type: "STEAL"; playerName: string; rawTranscript: string }
  | { type: "BLOCK"; playerName: string; rawTranscript: string }
  | { type: "ASSIST"; playerName: string; rawTranscript: string }
  | { type: "UNDO"; rawTranscript: string }
  | { type: "SET_API_ID"; localId: number; apiId: string }
  | { type: "END_GAME"; winningTeam: "A" | "B" }
  | { type: "RESET" }
  | { type: "ADD_TRANSCRIPT"; text: string }
  | { type: "SET_LAST_COMMAND"; text: string | null }
  | { type: "SET_FLASH"; color: string | null };

function getTeamForPlayer(
  state: GameState,
  playerName: string
): "A" | "B" | null {
  const nameL = playerName.toLowerCase();
  if (state.teamA.some((n) => n.toLowerCase() === nameL)) return "A";
  if (state.teamB.some((n) => n.toLowerCase() === nameL)) return "B";
  return null;
}

function recalcScores(events: ScoringEvent[], state: GameState) {
  let teamAScore = 0;
  let teamBScore = 0;

  for (const event of events) {
    if (event.eventType !== "score" && event.eventType !== "correction") continue;
    const team = getTeamForPlayer(state, event.playerName);
    if (team === "A") teamAScore += event.points;
    else if (team === "B") teamBScore += event.points;
  }

  return { teamAScore, teamBScore };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_TARGET":
      return { ...state, targetScore: action.targetScore };

    case "SET_STATUS":
      return { ...state, status: action.status };

    case "SET_GAME_ID":
      return { ...state, gameId: action.gameId };

    case "SET_TEAMS":
      return { ...state, teamA: action.teamA, teamB: action.teamB };

    case "SCORE": {
      const newEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: action.playerName,
        points: action.points,
        eventType: "score",
        assistBy: action.assistBy,
        stealBy: action.stealBy,
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

      let autoEnd: Partial<GameState> = {};
      if (scores.teamAScore >= state.targetScore) {
        autoEnd = { status: "finished", winningTeam: "A" };
      } else if (scores.teamBScore >= state.targetScore) {
        autoEnd = { status: "finished", winningTeam: "B" };
      }

      return { ...newState, ...scores, ...autoEnd };
    }

    case "STEAL": {
      const newEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: action.playerName,
        points: 0,
        eventType: "steal",
        rawTranscript: action.rawTranscript,
        timestamp: Date.now(),
      };
      return {
        ...state,
        events: [...state.events, newEvent],
        nextEventId: state.nextEventId + 1,
      };
    }

    case "BLOCK": {
      const newEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: action.playerName,
        points: 0,
        eventType: "block",
        rawTranscript: action.rawTranscript,
        timestamp: Date.now(),
      };
      return {
        ...state,
        events: [...state.events, newEvent],
        nextEventId: state.nextEventId + 1,
      };
    }

    case "ASSIST": {
      const newEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: action.playerName,
        points: 0,
        eventType: "assist",
        rawTranscript: action.rawTranscript,
        timestamp: Date.now(),
      };
      return {
        ...state,
        events: [...state.events, newEvent],
        nextEventId: state.nextEventId + 1,
      };
    }

    case "UNDO": {
      const lastScore = [...state.events]
        .reverse()
        .find((e) => e.eventType === "score");
      if (!lastScore) return state;

      const correctionEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: lastScore.playerName,
        points: -lastScore.points,
        eventType: "correction",
        correctedEventId: lastScore.id,
        rawTranscript: action.rawTranscript,
        timestamp: Date.now(),
      };
      const events = [...state.events, correctionEvent];
      const newState = {
        ...state,
        events,
        nextEventId: state.nextEventId + 1,
      };
      const scores = recalcScores(events, newState);
      return { ...newState, ...scores, status: "active", winningTeam: null };
    }

    case "SET_API_ID":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.localId ? { ...e, apiId: action.apiId } : e
        ),
      };

    case "END_GAME":
      return { ...state, status: "finished", winningTeam: action.winningTeam };

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

    case "SET_LAST_COMMAND":
      return { ...state, lastCommand: action.text };

    case "SET_FLASH":
      return { ...state, flashColor: action.color };

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
  lastCommand: null,
  flashColor: null,
};

export function useGameStore() {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const setTarget = useCallback(
    (targetScore: TargetScore) =>
      dispatch({ type: "SET_TARGET", targetScore }),
    []
  );

  const setTeams = useCallback(
    (teamA: string[], teamB: string[]) =>
      dispatch({ type: "SET_TEAMS", teamA, teamB }),
    []
  );

  const startSetup = useCallback(
    () => dispatch({ type: "SET_STATUS", status: "setup" }),
    []
  );

  const startGame = useCallback(
    async (teamA: string[], teamB: string[]) => {
      try {
        const { id } = await api.createGame();
        dispatch({ type: "SET_GAME_ID", gameId: id });
        dispatch({ type: "SET_TEAMS", teamA, teamB });
        await api.setRoster(id, { team_a: teamA, team_b: teamB });
        dispatch({ type: "SET_STATUS", status: "active" });
      } catch (e) {
        console.error("Failed to start game:", e);
        // Start locally even if API fails
        dispatch({ type: "SET_TEAMS", teamA, teamB });
        dispatch({ type: "SET_STATUS", status: "active" });
      }
    },
    []
  );

  const score = useCallback(
    async (playerName: string, points: number, rawTranscript: string, assistBy?: string, stealBy?: string) => {
      dispatch({ type: "SCORE", playerName, points, rawTranscript, assistBy, stealBy });

      // Post steal event first if compound
      if (stealBy && state.gameId) {
        api.recordEvent(state.gameId, {
          player_name: stealBy,
          event_type: "steal",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }

      // Post score event to API
      if (state.gameId) {
        api.recordEvent(state.gameId, {
          player_name: playerName,
          event_type: "score",
          point_value: points,
          raw_transcript: rawTranscript,
        }).then((data) => {
          dispatch({ type: "SET_API_ID", localId: state.nextEventId, apiId: data.id });

          // Post assist event if compound
          if (assistBy) {
            api.recordEvent(state.gameId!, {
              player_name: assistBy,
              event_type: "assist",
              point_value: 0,
              raw_transcript: rawTranscript,
            }).catch(console.error);
          }
        }).catch(console.error);
      }
    },
    [state.gameId, state.nextEventId]
  );

  const recordSteal = useCallback(
    async (playerName: string, rawTranscript: string) => {
      dispatch({ type: "STEAL", playerName, rawTranscript });
      if (state.gameId) {
        api.recordEvent(state.gameId, {
          player_name: playerName,
          event_type: "steal",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    [state.gameId]
  );

  const recordBlock = useCallback(
    async (playerName: string, rawTranscript: string) => {
      dispatch({ type: "BLOCK", playerName, rawTranscript });
      if (state.gameId) {
        api.recordEvent(state.gameId, {
          player_name: playerName,
          event_type: "block",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    [state.gameId]
  );

  const recordAssist = useCallback(
    async (playerName: string, rawTranscript: string) => {
      dispatch({ type: "ASSIST", playerName, rawTranscript });
      if (state.gameId) {
        api.recordEvent(state.gameId, {
          player_name: playerName,
          event_type: "assist",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    [state.gameId]
  );

  const undo = useCallback(
    async (rawTranscript: string) => {
      const lastScore = [...state.events].reverse().find((e) => e.eventType === "score");
      if (!lastScore) return;

      dispatch({ type: "UNDO", rawTranscript });

      if (state.gameId) {
        api.recordEvent(state.gameId, {
          player_name: lastScore.playerName,
          event_type: "correction",
          point_value: -lastScore.points,
          corrected_event_id: lastScore.apiId,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    [state.gameId, state.events]
  );

  const endGame = useCallback(
    async (winningTeam: "A" | "B") => {
      dispatch({ type: "END_GAME", winningTeam });
      if (state.gameId) {
        api.endGame(state.gameId, winningTeam).catch(console.error);
      }
    },
    [state.gameId]
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const addTranscript = useCallback(
    (text: string) => dispatch({ type: "ADD_TRANSCRIPT", text }),
    []
  );

  const setLastCommand = useCallback(
    (text: string | null) => dispatch({ type: "SET_LAST_COMMAND", text }),
    []
  );

  const flash = useCallback(
    (color: string) => {
      dispatch({ type: "SET_FLASH", color });
      setTimeout(() => dispatch({ type: "SET_FLASH", color: null }), 800);
    },
    []
  );

  return {
    state,
    setTarget,
    setTeams,
    startSetup,
    startGame,
    score,
    recordSteal,
    recordBlock,
    recordAssist,
    undo,
    endGame,
    reset,
    addTranscript,
    setLastCommand,
    flash,
  };
}
