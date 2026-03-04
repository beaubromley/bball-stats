import { useCallback, useReducer, useRef } from "react";
import * as api from "../services/api";
import type { ScoringMode } from "../services/parser";

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
  undone?: boolean;
}

export type TargetScore = number;

export interface GameState {
  gameId: string | null;
  status: "idle" | "setup" | "active" | "finished";
  targetScore: TargetScore;
  scoringMode: ScoringMode;

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
  | { type: "SET_SCORING_MODE"; scoringMode: ScoringMode }
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
  | { type: "REDO" }
  | { type: "SET_API_ID"; localId: number; apiId: string }
  | { type: "END_GAME"; winningTeam: "A" | "B" }
  | { type: "RESET" }
  | { type: "RESUME_GAME"; gameId: string; teamA: string[]; teamB: string[]; teamAScore: number; teamBScore: number; targetScore: number; events: ScoringEvent[] }
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
    if (event.undone) continue;
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

    case "SET_SCORING_MODE":
      return { ...state, scoringMode: action.scoringMode };

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
        .find((e) => e.eventType === "score" && !e.undone);
      if (!lastScore) return state;

      // Mark the score as undone
      const markedEvents = state.events.map((e) =>
        e.id === lastScore.id ? { ...e, undone: true } : e
      );

      const correctionEvent: ScoringEvent = {
        id: state.nextEventId,
        playerName: lastScore.playerName,
        points: -lastScore.points,
        eventType: "correction",
        correctedEventId: lastScore.id,
        rawTranscript: action.rawTranscript,
        timestamp: Date.now(),
      };
      const events = [...markedEvents, correctionEvent];
      const newState = {
        ...state,
        events,
        nextEventId: state.nextEventId + 1,
      };
      const scores = recalcScores(events, newState);
      return { ...newState, ...scores, status: "active", winningTeam: null };
    }

    case "REDO": {
      // Find the last undone score event
      const lastUndone = [...state.events]
        .reverse()
        .find((e) => e.eventType === "score" && e.undone);
      if (!lastUndone) return state;

      // Un-mark the score as undone
      let events = state.events.map((e) =>
        e.id === lastUndone.id ? { ...e, undone: false } : e
      );
      // Remove the correction event for this score
      const corrIdx = [...events].reverse().findIndex(
        (e) =>
          e.eventType === "correction" &&
          e.playerName === lastUndone.playerName &&
          e.points === -lastUndone.points
      );
      if (corrIdx >= 0) {
        const actualIdx = events.length - 1 - corrIdx;
        events = events.filter((_, i) => i !== actualIdx);
      }
      const newState = { ...state, events };
      const scores = recalcScores(events, newState);
      return { ...newState, ...scores };
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

    case "RESUME_GAME":
      return {
        ...state,
        gameId: action.gameId,
        status: "active",
        teamA: action.teamA,
        teamB: action.teamB,
        teamAScore: action.teamAScore,
        teamBScore: action.teamBScore,
        targetScore: action.targetScore,
        events: action.events,
        nextEventId: action.events.length + 1,
        winningTeam: null,
      };

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
  scoringMode: "1s2s",
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

  // Refs to avoid stale closures in async callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const setTarget = useCallback(
    (targetScore: TargetScore) =>
      dispatch({ type: "SET_TARGET", targetScore }),
    []
  );

  const setScoringMode = useCallback(
    (scoringMode: ScoringMode) =>
      dispatch({ type: "SET_SCORING_MODE", scoringMode }),
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
      const s = stateRef.current;
      try {
        const { id } = await api.createGame({
          target_score: s.targetScore,
          scoring_mode: s.scoringMode,
        });
        dispatch({ type: "SET_GAME_ID", gameId: id });
        dispatch({ type: "SET_TEAMS", teamA, teamB });
        await api.setRoster(id, { team_a: teamA, team_b: teamB });
        dispatch({ type: "SET_STATUS", status: "active" });
      } catch (e) {
        console.error("Failed to start game:", e);
        dispatch({ type: "SET_TEAMS", teamA, teamB });
        dispatch({ type: "SET_STATUS", status: "active" });
      }
    },
    []
  );

  const resumeGame = useCallback(
    (data: {
      gameId: string;
      teamA: string[];
      teamB: string[];
      teamAScore: number;
      teamBScore: number;
      targetScore: number;
      events: ScoringEvent[];
    }) => {
      dispatch({
        type: "RESUME_GAME",
        gameId: data.gameId,
        teamA: data.teamA,
        teamB: data.teamB,
        teamAScore: data.teamAScore,
        teamBScore: data.teamBScore,
        targetScore: data.targetScore,
        events: data.events,
      });
    },
    []
  );

  const score = useCallback(
    async (playerName: string, points: number, rawTranscript: string, assistBy?: string, stealBy?: string) => {
      const s = stateRef.current;
      dispatch({ type: "SCORE", playerName, points, rawTranscript, assistBy, stealBy });

      if (stealBy && s.gameId) {
        api.recordEvent(s.gameId, {
          player_name: stealBy,
          event_type: "steal",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }

      if (s.gameId) {
        api.recordEvent(s.gameId, {
          player_name: playerName,
          event_type: "score",
          point_value: points,
          raw_transcript: rawTranscript,
        }).then((data) => {
          dispatch({ type: "SET_API_ID", localId: s.nextEventId, apiId: data.id });

          if (assistBy) {
            api.recordEvent(s.gameId!, {
              player_name: assistBy,
              event_type: "assist",
              point_value: 0,
              raw_transcript: rawTranscript,
              assisted_event_id: data.id,
            }).catch(console.error);
          }
        }).catch(console.error);
      }
    },
    []
  );

  const recordSteal = useCallback(
    async (playerName: string, rawTranscript: string) => {
      const s = stateRef.current;
      dispatch({ type: "STEAL", playerName, rawTranscript });
      if (s.gameId) {
        api.recordEvent(s.gameId, {
          player_name: playerName,
          event_type: "steal",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    []
  );

  const recordBlock = useCallback(
    async (playerName: string, rawTranscript: string) => {
      const s = stateRef.current;
      dispatch({ type: "BLOCK", playerName, rawTranscript });
      if (s.gameId) {
        api.recordEvent(s.gameId, {
          player_name: playerName,
          event_type: "block",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    []
  );

  const recordAssist = useCallback(
    async (playerName: string, rawTranscript: string) => {
      const s = stateRef.current;
      dispatch({ type: "ASSIST", playerName, rawTranscript });
      if (s.gameId) {
        api.recordEvent(s.gameId, {
          player_name: playerName,
          event_type: "assist",
          point_value: 0,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    []
  );

  const undo = useCallback(
    async (rawTranscript: string) => {
      const s = stateRef.current;
      const lastScore = [...s.events].reverse().find((e) => e.eventType === "score" && !e.undone);
      if (!lastScore) return;

      dispatch({ type: "UNDO", rawTranscript });

      if (s.gameId) {
        api.recordEvent(s.gameId, {
          player_name: lastScore.playerName,
          event_type: "correction",
          point_value: -lastScore.points,
          corrected_event_id: lastScore.apiId,
          raw_transcript: rawTranscript,
        }).catch(console.error);
      }
    },
    []
  );

  const redo = useCallback(
    async (rawTranscript: string) => {
      const s = stateRef.current;
      const lastUndone = [...s.events].reverse().find((e) => e.eventType === "score" && e.undone);
      if (!lastUndone) return;

      dispatch({ type: "REDO" });

      if (s.gameId) {
        const scoreApiId = lastUndone.apiId || String(lastUndone.id);
        api.redoEvent(s.gameId, scoreApiId).catch(console.error);
      }
    },
    []
  );

  const changeTargetScore = useCallback(
    async (newTarget: number) => {
      const s = stateRef.current;
      dispatch({ type: "SET_TARGET", targetScore: newTarget });
      if (s.gameId) {
        api.changeTargetScore(s.gameId, newTarget).catch(console.error);
      }
    },
    []
  );

  const endGame = useCallback(
    async (winningTeam: "A" | "B") => {
      const s = stateRef.current;
      dispatch({ type: "END_GAME", winningTeam });
      if (s.gameId) {
        api.endGame(s.gameId, winningTeam).catch(console.error);
      }
    },
    []
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
    setScoringMode,
    setTeams,
    startSetup,
    startGame,
    resumeGame,
    score,
    recordSteal,
    recordBlock,
    recordAssist,
    undo,
    redo,
    changeTargetScore,
    endGame,
    reset,
    addTranscript,
    setLastCommand,
    flash,
  };
}
