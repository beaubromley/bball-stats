import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from "react-native";
import { useSpeechRecognition, SpeechResult } from "../services/speech";
import { parseTranscript } from "../services/parser";
import { useGameStore, ScoringEvent, TargetScore } from "../store/gameStore";

export default function GameScreen() {
  const {
    state,
    startGame,
    setTeams,
    score,
    undo,
    endGame,
    reset,
    addTranscript,
  } = useGameStore();

  const knownPlayers = useMemo(
    () => [...state.teamA, ...state.teamB],
    [state.teamA, state.teamB]
  );

  const handleSpeechResult = useCallback(
    (result: SpeechResult) => {
      if (!result.isFinal) return;

      addTranscript(result.transcript);

      const command = parseTranscript(result.transcript, knownPlayers);

      switch (command.type) {
        case "score":
          if (state.status === "active" && command.playerName && command.points) {
            score(command.playerName, command.points, result.transcript);
          }
          break;
        case "correction":
          if (state.status === "active") {
            undo(result.transcript);
          }
          break;
        case "end_game":
          if (state.status === "active" && command.winningTeam) {
            endGame(command.winningTeam);
          }
          break;
        case "set_teams":
          if (command.teams) {
            setTeams(command.teams.a, command.teams.b);
          }
          break;
        case "new_game":
          startGame();
          break;
      }
    },
    [state.status, knownPlayers, score, undo, endGame, setTeams, startGame, addTranscript]
  );

  const { isListening, error, start, stop } =
    useSpeechRecognition(handleSpeechResult);

  const handleStartGame = (targetScore: TargetScore = 11) => {
    if (state.teamA.length === 0 || state.teamB.length === 0) {
      Alert.prompt(
        "Set Teams",
        'Enter teams separated by "vs" (e.g., "Me, John, Steve vs Mike, Gary, Sam")',
        (text) => {
          if (!text) return;
          const parts = text.split(/\s+(?:vs\.?|versus|v)\s+/i);
          if (parts.length === 2) {
            const teamA = parts[0].split(/\s*,\s*/).map((n) => n.trim()).filter(Boolean);
            const teamB = parts[1].split(/\s*,\s*/).map((n) => n.trim()).filter(Boolean);
            setTeams(teamA, teamB);
            startGame(targetScore);
          }
        }
      );
    } else {
      startGame(targetScore);
    }
  };

  const renderEvent = ({ item }: { item: ScoringEvent }) => {
    const isCorrection = item.eventType === "correction";
    return (
      <View style={[styles.eventRow, isCorrection && styles.correctionRow]}>
        <Text style={styles.eventPlayer}>{item.playerName}</Text>
        <Text style={[styles.eventPoints, isCorrection && styles.correctionText]}>
          {isCorrection ? "UNDO" : `+${item.points}`}
        </Text>
        <Text style={styles.eventTime}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        <View style={styles.teamScore}>
          <Text style={styles.teamLabel}>TEAM A</Text>
          <Text style={styles.scoreText}>{state.teamAScore}</Text>
          <Text style={styles.teamPlayers} numberOfLines={2}>
            {state.teamA.join(", ") || "—"}
          </Text>
        </View>

        <View style={styles.divider}>
          <Text style={styles.vsText}>VS</Text>
          <Text style={styles.statusText}>
            {state.status === "active"
              ? "LIVE"
              : state.status === "finished"
              ? "FINAL"
              : "READY"}
          </Text>
          {state.status === "active" && (
            <Text style={styles.targetText}>to {state.targetScore}</Text>
          )}
        </View>

        <View style={styles.teamScore}>
          <Text style={styles.teamLabel}>TEAM B</Text>
          <Text style={styles.scoreText}>{state.teamBScore}</Text>
          <Text style={styles.teamPlayers} numberOfLines={2}>
            {state.teamB.join(", ") || "—"}
          </Text>
        </View>
      </View>

      {/* Listening indicator */}
      <View style={styles.listenRow}>
        <View
          style={[styles.dot, isListening ? styles.dotActive : styles.dotInactive]}
        />
        <Text style={styles.listenText}>
          {isListening ? "Listening..." : "Mic off"}
        </Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {/* Recent transcript */}
      {state.recentTranscripts.length > 0 && (
        <Text style={styles.transcript} numberOfLines={1}>
          "{state.recentTranscripts[0]}"
        </Text>
      )}

      {/* Event log */}
      <FlatList
        data={[...state.events].reverse()}
        renderItem={renderEvent}
        keyExtractor={(item) => String(item.id)}
        style={styles.eventList}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {state.status === "active"
              ? 'Say "bucket" (+1) or "two" (+2), with a name for other players'
              : "Start a game to begin tracking"}
          </Text>
        }
      />

      {/* Controls */}
      <View style={styles.controls}>
        {state.status === "idle" && (
          <>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => handleStartGame(11)}>
              <Text style={styles.btnText}>New Game — to 11</Text>
            </TouchableOpacity>
            <View style={styles.altGameRow}>
              <TouchableOpacity style={styles.altGameBtn} onPress={() => handleStartGame(15)}>
                <Text style={styles.altGameBtnText}>To 15</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.altGameBtn} onPress={() => handleStartGame(21)}>
                <Text style={styles.altGameBtnText}>To 21</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {state.status === "active" && (
          <>
            <TouchableOpacity
              style={[styles.btn, isListening ? styles.btnDanger : styles.btnPrimary]}
              onPress={isListening ? stop : start}
            >
              <Text style={styles.btnText}>
                {isListening ? "Stop Listening" : "Start Listening"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => {
                Alert.alert("End Game", "Which team won?", [
                  { text: "Team A", onPress: () => endGame("A") },
                  { text: "Team B", onPress: () => endGame("B") },
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
            >
              <Text style={styles.btnTextSecondary}>End Game</Text>
            </TouchableOpacity>
          </>
        )}

        {state.status === "finished" && (
          <>
            <Text style={styles.winnerText}>
              {state.winningTeam === "A" ? "Team A" : "Team B"} wins!
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={reset}>
              <Text style={styles.btnText}>New Game</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Manual score buttons (backup for voice) */}
      {state.status === "active" && (
        <View style={styles.manualRow}>
          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => score("Me", 1, "[manual +1]")}
          >
            <Text style={styles.manualBtnText}>+1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => score("Me", 2, "[manual +2]")}
          >
            <Text style={styles.manualBtnText}>+2</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.manualBtn, styles.undoBtn]}
            onPress={() => undo("[manual undo]")}
          >
            <Text style={styles.manualBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    paddingTop: 60,
  },
  scoreboard: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  teamScore: {
    alignItems: "center",
    flex: 1,
  },
  teamLabel: {
    color: "#8888aa",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
  },
  scoreText: {
    color: "#ffffff",
    fontSize: 64,
    fontWeight: "700",
  },
  teamPlayers: {
    color: "#6666aa",
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
  },
  divider: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  vsText: {
    color: "#444466",
    fontSize: 18,
    fontWeight: "700",
  },
  statusText: {
    color: "#ff4444",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  targetText: {
    color: "#666688",
    fontSize: 11,
    marginTop: 2,
  },
  listenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    backgroundColor: "#44ff44",
  },
  dotInactive: {
    backgroundColor: "#666666",
  },
  listenText: {
    color: "#888888",
    fontSize: 14,
  },
  errorText: {
    color: "#ff4444",
    fontSize: 12,
  },
  transcript: {
    color: "#666688",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 20,
    fontStyle: "italic",
  },
  eventList: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4e",
  },
  correctionRow: {
    opacity: 0.5,
  },
  eventPlayer: {
    color: "#ffffff",
    fontSize: 16,
    flex: 1,
  },
  eventPoints: {
    color: "#44ff44",
    fontSize: 18,
    fontWeight: "700",
    width: 60,
    textAlign: "center",
  },
  correctionText: {
    color: "#ff4444",
  },
  eventTime: {
    color: "#666688",
    fontSize: 12,
    width: 50,
    textAlign: "right",
  },
  emptyText: {
    color: "#555577",
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
  },
  controls: {
    padding: 20,
    gap: 12,
    alignItems: "center",
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#4444ff",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  btnDanger: {
    backgroundColor: "#ff4444",
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: "#4444ff",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  btnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  btnTextSecondary: {
    color: "#4444ff",
    fontSize: 16,
    fontWeight: "600",
  },
  winnerText: {
    color: "#ffcc00",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  altGameRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  altGameBtn: {
    borderWidth: 1,
    borderColor: "#4444ff",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  altGameBtnText: {
    color: "#4444ff",
    fontSize: 14,
    fontWeight: "600",
  },
  manualRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  manualBtn: {
    backgroundColor: "#2a2a4e",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  undoBtn: {
    backgroundColor: "#4a2a2e",
  },
  manualBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
