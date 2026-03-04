import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { colors } from "../../src/lib/colors";
import { useSpeechRecognition, SpeechResult } from "../../src/services/speech";
import { parseTranscript } from "../../src/services/parser";
import { useGameStore, ScoringEvent } from "../../src/store/gameStore";
import { useAuth } from "../../src/context/AuthContext";

// ---------- Player assignment for setup ----------
interface PlayerOption {
  id: string;
  name: string;
  team: "A" | "B" | null;
}

// ---------- SETUP SCREEN ----------
function SetupScreen({
  onStart,
  onBack,
}: {
  onStart: (teamA: string[], teamB: string[]) => void;
  onBack: () => void;
}) {
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [allPlayers, setAllPlayers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          "https://bball-stats-web.vercel.app/api/players?status=active&expected=true"
        );
        const data = await res.json();
        const expectedPlayers = (data.players || []).map((p: { id: string; name: string }) => ({
          id: p.id,
          name: p.name,
          team: null as "A" | "B" | null,
        }));
        setPlayers(expectedPlayers);

        const allRes = await fetch(
          "https://bball-stats-web.vercel.app/api/players?status=active"
        );
        const allData = await allRes.json();
        setAllPlayers(
          (allData.players || []).map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
          }))
        );
      } catch (e) {
        console.error("Failed to fetch players:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cycleTeam = (id: string) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = p.team === null ? "A" : p.team === "A" ? "B" : null;
        return { ...p, team: next };
      })
    );
  };

  const teamA = players.filter((p) => p.team === "A").map((p) => p.name);
  const teamB = players.filter((p) => p.team === "B").map((p) => p.name);

  const expectedIds = new Set(players.map((p) => p.id));
  const searchResults = search.length > 0
    ? allPlayers
        .filter(
          (p) =>
            !expectedIds.has(p.id) &&
            p.name.toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 10)
    : [];

  const addPlayer = (player: { id: string; name: string }) => {
    setPlayers((prev) => [...prev, { ...player, team: null }]);
    setSearch("");
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
          Loading players...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.setupTitle}>Set Up Teams</Text>
      <Text style={styles.setupHint}>
        Tap a player to cycle: unassigned → Team A (blue) → Team B (orange)
      </Text>

      <View style={styles.chipGrid}>
        {players.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.chip,
              p.team === "A" && styles.chipTeamA,
              p.team === "B" && styles.chipTeamB,
            ]}
            onPress={() => cycleTeam(p.id)}
          >
            <Text
              style={[
                styles.chipText,
                p.team && { color: "#fff" },
              ]}
            >
              {p.name}
            </Text>
            {p.team && (
              <Text style={styles.chipTeamLabel}>
                {p.team === "A" ? "A" : "B"}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Search to add more */}
      <Text style={styles.sectionLabel}>Add Player</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search players..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      {searchResults.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={styles.searchResult}
          onPress={() => addPlayer(p)}
        >
          <Text style={styles.searchResultText}>{p.name}</Text>
          <Text style={styles.addBtn}>+ Add</Text>
        </TouchableOpacity>
      ))}

      {/* Team preview */}
      <View style={styles.teamPreview}>
        <View style={styles.teamPreviewCol}>
          <Text style={[styles.teamPreviewLabel, { color: colors.teamA }]}>
            Team A ({teamA.length})
          </Text>
          {teamA.map((n) => (
            <Text key={n} style={styles.teamPreviewName}>{n}</Text>
          ))}
          {teamA.length === 0 && (
            <Text style={styles.teamPreviewEmpty}>No players</Text>
          )}
        </View>
        <View style={styles.teamPreviewCol}>
          <Text style={[styles.teamPreviewLabel, { color: colors.teamB }]}>
            Team B ({teamB.length})
          </Text>
          {teamB.map((n) => (
            <Text key={n} style={styles.teamPreviewName}>{n}</Text>
          ))}
          {teamB.length === 0 && (
            <Text style={styles.teamPreviewEmpty}>No players</Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.btnPrimary,
          (teamA.length === 0 || teamB.length === 0) && styles.btnDisabled,
        ]}
        disabled={teamA.length === 0 || teamB.length === 0}
        onPress={() => onStart(teamA, teamB)}
      >
        <Text style={styles.btnText}>Start Game</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnOutline} onPress={onBack}>
        <Text style={styles.btnOutlineText}>Back</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ---------- ACTIVE GAME SCREEN ----------
function ActiveGameScreen({
  store,
}: {
  store: ReturnType<typeof useGameStore>;
}) {
  const { state, score, recordSteal, recordBlock, recordAssist, undo, endGame, addTranscript, setLastCommand, flash } = store;

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
          if (command.playerName && command.points) {
            score(command.playerName, command.points, result.transcript, command.assistBy, command.stealBy);
            const label = command.assistBy
              ? `${command.playerName} +${command.points} (ast: ${command.assistBy})`
              : `${command.playerName} +${command.points}`;
            setLastCommand(label);
            flash(command.assistBy ? colors.flashAssist : colors.flashScore);
          }
          break;
        case "correction":
          undo(result.transcript);
          setLastCommand("UNDO");
          flash(colors.flashUndo);
          break;
        case "steal":
          if (command.playerName) {
            recordSteal(command.playerName, result.transcript);
            setLastCommand(`${command.playerName} STL`);
            flash(colors.flashSteal);
          }
          break;
        case "block":
          if (command.playerName) {
            recordBlock(command.playerName, result.transcript);
            setLastCommand(`${command.playerName} BLK`);
            flash(colors.flashBlock);
          }
          break;
        case "assist":
          if (command.playerName) {
            recordAssist(command.playerName, result.transcript);
            setLastCommand(`${command.playerName} AST`);
            flash(colors.flashAssist);
          }
          break;
        case "end_game":
          if (command.winningTeam) {
            endGame(command.winningTeam);
          } else {
            Alert.alert("End Game", "Which team won?", [
              { text: "Team A", onPress: () => endGame("A") },
              { text: "Team B", onPress: () => endGame("B") },
              { text: "Cancel", style: "cancel" },
            ]);
          }
          break;
      }
    },
    [knownPlayers, score, undo, recordSteal, recordBlock, recordAssist, endGame, addTranscript, setLastCommand, flash]
  );

  const { isListening, error, start, stop } =
    useSpeechRecognition(handleSpeechResult);

  const renderEvent = ({ item }: { item: ScoringEvent }) => {
    const isCorrection = item.eventType === "correction";
    const isStat = item.eventType === "steal" || item.eventType === "block" || item.eventType === "assist";
    return (
      <View style={[styles.eventRow, isCorrection && styles.correctionRow]}>
        <Text style={styles.eventPlayer} numberOfLines={1}>
          {item.playerName}
          {item.assistBy ? ` (ast: ${item.assistBy})` : ""}
        </Text>
        <Text
          style={[
            styles.eventPoints,
            isCorrection && { color: colors.flashUndo },
            isStat && {
              color:
                item.eventType === "steal"
                  ? colors.flashSteal
                  : item.eventType === "block"
                  ? colors.flashBlock
                  : colors.flashAssist,
            },
          ]}
        >
          {isCorrection
            ? "UNDO"
            : isStat
            ? item.eventType.toUpperCase()
            : `+${item.points}`}
        </Text>
        <Text style={styles.eventTime}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Flash overlay */}
      {state.flashColor && (
        <View
          style={[styles.flashOverlay, { backgroundColor: state.flashColor }]}
        />
      )}

      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        <View style={styles.teamScoreSection}>
          <Text style={[styles.teamLabel, { color: colors.teamA }]}>TEAM A</Text>
          <Text style={styles.bigScore}>{state.teamAScore}</Text>
          <Text style={styles.teamPlayers} numberOfLines={2}>
            {state.teamA.join(", ")}
          </Text>
        </View>

        <View style={styles.dividerSection}>
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.targetText}>to {state.targetScore}</Text>
        </View>

        <View style={styles.teamScoreSection}>
          <Text style={[styles.teamLabel, { color: colors.teamB }]}>TEAM B</Text>
          <Text style={styles.bigScore}>{state.teamBScore}</Text>
          <Text style={styles.teamPlayers} numberOfLines={2}>
            {state.teamB.join(", ")}
          </Text>
        </View>
      </View>

      {/* Last command */}
      {state.lastCommand && (
        <Text style={styles.lastCommand}>{state.lastCommand}</Text>
      )}

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

      {/* Transcript */}
      {state.recentTranscripts.length > 0 && (
        <Text style={styles.transcript} numberOfLines={1}>
          &quot;{state.recentTranscripts[0]}&quot;
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
            Say a player name + &quot;bucket&quot; (+1) or &quot;two&quot; (+2)
          </Text>
        }
      />

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.btnFull, isListening ? styles.btnDanger : styles.btnListen]}
          onPress={isListening ? stop : start}
        >
          <Text style={styles.btnText}>
            {isListening ? "Stop Listening" : "Start Listening"}
          </Text>
        </TouchableOpacity>

        {/* Manual score buttons - tap for +1, long press for +2 */}
        <View style={styles.manualRow}>
          {knownPlayers.map((name) => (
            <TouchableOpacity
              key={name}
              style={styles.playerBtn}
              onPress={() => {
                score(name, 1, "[manual +1]");
                setLastCommand(`${name} +1`);
                flash(colors.flashScore);
              }}
              onLongPress={() => {
                score(name, 2, "[manual +2]");
                setLastCommand(`${name} +2`);
                flash(colors.flashScore);
              }}
            >
              <Text style={styles.playerBtnText} numberOfLines={1}>
                {name.split(" ")[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={styles.undoBtn}
            onPress={() => {
              undo("[manual undo]");
              setLastCommand("UNDO");
              flash(colors.flashUndo);
            }}
          >
            <Text style={styles.undoBtnText}>Undo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endBtn}
            onPress={() => {
              Alert.alert("End Game", "Which team won?", [
                { text: "Team A", onPress: () => endGame("A") },
                { text: "Team B", onPress: () => endGame("B") },
                { text: "Cancel", style: "cancel" },
              ]);
            }}
          >
            <Text style={styles.endBtnText}>End Game</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------- FINISHED SCREEN ----------
function FinishedScreen({
  store,
}: {
  store: ReturnType<typeof useGameStore>;
}) {
  const { state, reset } = store;

  // Player totals
  const playerTotals = new Map<string, number>();
  for (const e of state.events) {
    if (e.eventType === "score" || e.eventType === "correction") {
      playerTotals.set(
        e.playerName,
        (playerTotals.get(e.playerName) || 0) + e.points
      );
    }
  }

  const sortedPlayers = [...playerTotals.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.finishedHeader}>
        <Text style={styles.finishedTitle}>Game Over</Text>
        <Text style={styles.winnerLabel}>
          {state.winningTeam === "A" ? "Team A" : "Team B"} Wins!
        </Text>
      </View>

      <View style={styles.finalScoreRow}>
        <View style={styles.finalTeam}>
          <Text style={[styles.finalTeamLabel, { color: colors.teamA }]}>
            Team A
          </Text>
          <Text
            style={[
              styles.finalScore,
              state.winningTeam === "A" && { color: colors.chartGreen },
            ]}
          >
            {state.teamAScore}
          </Text>
        </View>
        <Text style={styles.finalDash}>-</Text>
        <View style={styles.finalTeam}>
          <Text style={[styles.finalTeamLabel, { color: colors.teamB }]}>
            Team B
          </Text>
          <Text
            style={[
              styles.finalScore,
              state.winningTeam === "B" && { color: colors.chartGreen },
            ]}
          >
            {state.teamBScore}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Box Score</Text>
      {sortedPlayers.map(([name, pts]) => (
        <View key={name} style={styles.boxRow}>
          <Text style={styles.boxName}>{name}</Text>
          <Text style={styles.boxPts}>{pts} pts</Text>
        </View>
      ))}

      <TouchableOpacity style={[styles.btnPrimary, { marginTop: 24 }]} onPress={reset}>
        <Text style={styles.btnText}>New Game</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ---------- MAIN RECORD SCREEN ----------
export default function RecordScreen() {
  const store = useGameStore();
  const { state } = store;
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.setupTitle}>Login Required</Text>
        <Text style={styles.setupHint}>
          Log in to record games. Go to the Stats tab and tap the login button.
        </Text>
      </View>
    );
  }

  if (state.status === "setup") {
    return (
      <SetupScreen
        onStart={(teamA, teamB) => store.startGame(teamA, teamB)}
        onBack={() => store.reset()}
      />
    );
  }

  if (state.status === "active") {
    return <ActiveGameScreen store={store} />;
  }

  if (state.status === "finished") {
    return <FinishedScreen store={store} />;
  }

  // IDLE
  return (
    <View style={styles.container}>
      <View style={styles.idleContent}>
        <Text style={styles.idleTitle}>Record a Game</Text>
        <Text style={styles.idleSubtitle}>Choose target score</Text>

        <TouchableOpacity
          style={styles.bigStartBtn}
          onPress={() => {
            store.setTarget(11);
            store.startSetup();
          }}
        >
          <Text style={styles.bigStartText}>Game to 11</Text>
        </TouchableOpacity>

        <View style={styles.altRow}>
          <TouchableOpacity
            style={styles.altStartBtn}
            onPress={() => {
              store.setTarget(15);
              store.startSetup();
            }}
          >
            <Text style={styles.altStartBtnText}>To 15</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.altStartBtn}
            onPress={() => {
              store.setTarget(21);
              store.startSetup();
            }}
          >
            <Text style={styles.altStartBtnText}>To 21</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------- STYLES ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },

  flashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.15,
    zIndex: 100,
    pointerEvents: "none",
  },

  // Idle
  idleContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  idleTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  idleSubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 32,
  },
  bigStartBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginBottom: 20,
  },
  bigStartText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  altRow: {
    flexDirection: "row",
    gap: 12,
  },
  altStartBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  altStartBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },

  // Setup
  setupTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  setupHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 20,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipTeamA: {
    backgroundColor: colors.teamA,
    borderColor: colors.teamA,
  },
  chipTeamB: {
    backgroundColor: colors.teamB,
    borderColor: colors.teamB,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  chipTeamLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "bold",
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    fontSize: 15,
    marginBottom: 8,
  },
  searchResult: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchResultText: { color: colors.text, fontSize: 15 },
  addBtn: { color: colors.accent, fontSize: 14, fontWeight: "600" },

  teamPreview: {
    flexDirection: "row",
    marginTop: 20,
    marginBottom: 20,
    gap: 16,
  },
  teamPreviewCol: { flex: 1 },
  teamPreviewLabel: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  teamPreviewName: { color: colors.text, fontSize: 14, paddingVertical: 2 },
  teamPreviewEmpty: { color: colors.textMuted, fontSize: 13, fontStyle: "italic" },

  btnPrimary: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnOutlineText: { color: colors.textSecondary, fontSize: 15 },

  // Scoreboard
  scoreboard: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  teamScoreSection: {
    alignItems: "center",
    flex: 1,
  },
  teamLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  bigScore: {
    color: colors.text,
    fontSize: 56,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  teamPlayers: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 2,
  },
  dividerSection: { alignItems: "center", paddingHorizontal: 8 },
  vsText: { color: colors.textMuted, fontSize: 16, fontWeight: "700" },
  liveBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  targetText: { color: colors.textMuted, fontSize: 11, marginTop: 4 },

  lastCommand: {
    color: colors.chartGreen,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    paddingVertical: 6,
  },

  listenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { backgroundColor: colors.flashScore },
  dotInactive: { backgroundColor: colors.textMuted },
  listenText: { color: colors.textMuted, fontSize: 13 },
  errorText: { color: colors.flashUndo, fontSize: 12 },
  transcript: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 20,
    fontStyle: "italic",
  },

  eventList: { flex: 1, paddingHorizontal: 16, marginTop: 8 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  correctionRow: { opacity: 0.4 },
  eventPlayer: { color: colors.text, fontSize: 14, flex: 1 },
  eventPoints: {
    color: colors.flashScore,
    fontSize: 16,
    fontWeight: "700",
    width: 55,
    textAlign: "center",
  },
  eventTime: {
    color: colors.textMuted,
    fontSize: 11,
    width: 50,
    textAlign: "right",
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
  },

  controls: { padding: 12, gap: 8 },
  btnFull: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnListen: { backgroundColor: "#2563eb" },
  btnDanger: { backgroundColor: colors.flashUndo },
  manualRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  playerBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
  },
  playerBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  bottomRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  undoBtn: {
    backgroundColor: "rgba(239,68,68,0.2)",
    borderWidth: 1,
    borderColor: colors.flashUndo,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    flex: 1,
    alignItems: "center",
  },
  undoBtnText: { color: colors.flashUndo, fontSize: 14, fontWeight: "600" },
  endBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    flex: 1,
    alignItems: "center",
  },
  endBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },

  // Finished
  finishedHeader: { alignItems: "center", paddingVertical: 24 },
  finishedTitle: { color: colors.text, fontSize: 28, fontWeight: "bold" },
  winnerLabel: {
    color: colors.chartYellow,
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 8,
  },
  finalScoreRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    marginBottom: 24,
  },
  finalTeam: { alignItems: "center" },
  finalTeamLabel: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
  finalScore: { color: colors.text, fontSize: 48, fontWeight: "bold" },
  finalDash: { color: colors.textMuted, fontSize: 32 },
  boxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  boxName: { color: colors.text, fontSize: 15 },
  boxPts: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
});
