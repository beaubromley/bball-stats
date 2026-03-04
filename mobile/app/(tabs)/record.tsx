import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Modal,
  Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../../src/lib/colors";
import { useSpeechRecognition, SpeechResult } from "../../src/services/speech";
import { parseTranscript, ScoringMode } from "../../src/services/parser";
import { useGameStore, ScoringEvent } from "../../src/store/gameStore";
import { useAuth } from "../../src/context/AuthContext";
import * as api from "../../src/services/api";

const LAST_GAME_TEAMS_KEY = "lastGameTeams";

interface LastGameTeams {
  teamA: string[];
  teamB: string[];
  winningTeam: "A" | "B" | null;
}

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
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [creating, setCreating] = useState(false);

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

  const addNewPlayer = async () => {
    if (!newFirst.trim() || !newLast.trim()) return;
    setCreating(true);
    try {
      const result = await api.createPlayer(newFirst.trim(), newLast.trim());
      const newPlayer = { id: result.id, name: result.display_name };
      setAllPlayers((prev) => [...prev, newPlayer]);
      setPlayers((prev) => [...prev, { ...newPlayer, team: null }]);
      setNewFirst("");
      setNewLast("");
    } catch (e) {
      Alert.alert("Error", "Failed to create player");
      console.error(e);
    } finally {
      setCreating(false);
    }
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

      <Text style={styles.sectionHeader}>EXPECTED TO PLAY</Text>
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
      <Text style={styles.sectionHeader}>ADD PLAYER</Text>
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

      {/* Create new player */}
      <Text style={styles.sectionHeader}>CREATE NEW PLAYER</Text>
      <View style={styles.newPlayerRow}>
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="First"
          placeholderTextColor={colors.textMuted}
          value={newFirst}
          onChangeText={setNewFirst}
        />
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Last"
          placeholderTextColor={colors.textMuted}
          value={newLast}
          onChangeText={setNewLast}
        />
        <TouchableOpacity
          style={[styles.createBtn, (!newFirst.trim() || !newLast.trim()) && styles.btnDisabled]}
          disabled={!newFirst.trim() || !newLast.trim() || creating}
          onPress={addNewPlayer}
        >
          <Text style={styles.createBtnText}>{creating ? "..." : "Create"}</Text>
        </TouchableOpacity>
      </View>

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
  const { state, score, recordSteal, recordBlock, recordAssist, undo, redo, endGame, changeTargetScore, addTranscript, setLastCommand, flash } = store;

  const [showFullscreen, setShowFullscreen] = useState(false);
  const [triggerWord, setTriggerWord] = useState(false);
  const triggerWordRef = useRef(false);
  triggerWordRef.current = triggerWord;

  // Debug log
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const addDebugLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setDebugLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  // Last play indicator (with color)
  const [lastPlay, setLastPlay] = useState<{ text: string; color: string } | null>(null);

  // Name carry-forward
  const pendingNameRef = useRef<{ name: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const knownPlayers = useMemo(
    () => [...state.teamA, ...state.teamB],
    [state.teamA, state.teamB]
  );

  const handleSpeechResult = useCallback(
    (result: SpeechResult) => {
      if (!result.isFinal) return;

      const rawText = result.transcript;
      addTranscript(rawText);
      addDebugLog(`Final: "${rawText}"`);

      // Trigger word handling
      let text = rawText;
      const lower = text.toLowerCase().trim();
      const hasStatPrefix = lower.startsWith("stat ") || lower === "stat";
      if (triggerWordRef.current && !hasStatPrefix) return;
      if (hasStatPrefix) {
        text = text.replace(/^stat\s*/i, "").trim();
        if (!text) return;
      }

      // Name carry-forward: prepend buffered name
      const pending = pendingNameRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        pendingNameRef.current = null;
        text = pending.name + " " + text;
      }

      const command = parseTranscript(text, knownPlayers, state.scoringMode);

      // Name carry-forward: buffer bare player name
      if (command.type === "unknown" && text.trim().split(/\s+/).length <= 2) {
        const word = text.trim().toLowerCase();
        const matched = knownPlayers.find((p) => word.includes(p.toLowerCase()));
        if (matched) {
          if (pendingNameRef.current) clearTimeout(pendingNameRef.current.timer);
          const timer = setTimeout(() => { pendingNameRef.current = null; }, 2000);
          pendingNameRef.current = { name: text.trim(), timer };
          addDebugLog(`Buffered name: "${text.trim()}"`);
          return;
        }
      }

      // Reject events without a player name
      if ((command.type === "score" || command.type === "steal" || command.type === "block" || command.type === "assist") && !command.playerName) {
        addDebugLog(`No player name found in: "${text}"`);
        if (state.gameId) api.logFailedTranscript(state.gameId, text).catch(() => {});
        return;
      }

      let actedOn: string | null = null;

      switch (command.type) {
        case "score":
          if (command.playerName && command.points) {
            score(command.playerName, command.points, rawText, command.assistBy, command.stealBy);
            const label = command.assistBy
              ? `${command.playerName} +${command.points} (ast: ${command.assistBy})`
              : `${command.playerName} +${command.points}`;
            setLastCommand(label);
            const scoreColor = command.assistBy ? colors.flashAssist : colors.flashScore;
            flash(scoreColor);
            setLastPlay({ text: label, color: scoreColor });
            actedOn = label;
          }
          break;
        case "correction":
          undo(rawText);
          setLastCommand("UNDO");
          flash(colors.flashUndo);
          setLastPlay({ text: "UNDO", color: colors.flashUndo });
          actedOn = "UNDO";
          break;
        case "redo":
          redo(rawText);
          setLastCommand("REDO");
          flash(colors.flashRedo);
          setLastPlay({ text: "REDO", color: colors.flashRedo });
          actedOn = "REDO";
          break;
        case "steal":
          if (command.playerName) {
            recordSteal(command.playerName, rawText);
            setLastCommand(`${command.playerName} STL`);
            flash(colors.flashSteal);
            setLastPlay({ text: `${command.playerName} STL`, color: colors.flashSteal });
            actedOn = `${command.playerName} STL`;
          }
          break;
        case "block":
          if (command.playerName) {
            recordBlock(command.playerName, rawText);
            setLastCommand(`${command.playerName} BLK`);
            flash(colors.flashBlock);
            setLastPlay({ text: `${command.playerName} BLK`, color: colors.flashBlock });
            actedOn = `${command.playerName} BLK`;
          }
          break;
        case "assist":
          if (command.playerName) {
            recordAssist(command.playerName, rawText);
            setLastCommand(`${command.playerName} AST`);
            flash(colors.flashAssist);
            setLastPlay({ text: `${command.playerName} AST`, color: colors.flashAssist });
            actedOn = `${command.playerName} AST`;
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
          actedOn = "END_GAME";
          break;
        default:
          if (state.gameId) api.logFailedTranscript(state.gameId, text).catch(() => {});
          break;
      }

      // Save transcript to API
      if (state.gameId) {
        api.saveTranscript(state.gameId, rawText, actedOn).catch(() => {});
        if (actedOn) api.logFailedTranscript(state.gameId, null).catch(() => {});
      }
    },
    [knownPlayers, state.scoringMode, state.gameId, score, undo, redo, recordSteal, recordBlock, recordAssist, endGame, addTranscript, setLastCommand, flash, addDebugLog]
  );

  const { isListening, error, start, stop } =
    useSpeechRecognition(handleSpeechResult);

  useEffect(() => {
    addDebugLog(isListening ? "Speech recognition started" : "Speech recognition stopped");
  }, [isListening, addDebugLog]);

  const [showTargetInput, setShowTargetInput] = useState(false);
  const [targetInput, setTargetInput] = useState("");

  const handleTargetChange = () => {
    setTargetInput(String(state.targetScore));
    setShowTargetInput(true);
  };

  const confirmTargetChange = () => {
    const num = parseInt(targetInput);
    if (!isNaN(num) && num >= 1) {
      changeTargetScore(num);
    }
    setShowTargetInput(false);
  };

  const renderEvent = ({ item }: { item: ScoringEvent }) => {
    const isCorrection = item.eventType === "correction";
    const isUndone = item.undone;
    const isStat = item.eventType === "steal" || item.eventType === "block" || item.eventType === "assist";
    return (
      <View style={[styles.eventRow, (isCorrection || isUndone) && styles.correctionRow]}>
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

      {/* Fullscreen scoreboard modal */}
      <Modal visible={showFullscreen} animationType="fade" statusBarTranslucent>
        <TouchableOpacity
          style={styles.fullscreenModal}
          activeOpacity={1}
          onPress={() => setShowFullscreen(false)}
        >
          <Text style={styles.fullscreenHint}>TAP TO CLOSE</Text>
          <View style={styles.fullscreenScores}>
            <View style={styles.fullscreenTeam}>
              <Text style={[styles.fullscreenTeamLabel, { color: colors.teamA }]}>TEAM A</Text>
              <Text style={styles.fullscreenBigScore}>{state.teamAScore}</Text>
              <Text style={styles.fullscreenRoster}>{state.teamA.join(", ")}</Text>
            </View>
            <Text style={styles.fullscreenDash}>-</Text>
            <View style={styles.fullscreenTeam}>
              <Text style={[styles.fullscreenTeamLabel, { color: colors.teamB }]}>TEAM B</Text>
              <Text style={styles.fullscreenBigScore}>{state.teamBScore}</Text>
              <Text style={styles.fullscreenRoster}>{state.teamB.join(", ")}</Text>
            </View>
          </View>
          {lastPlay && (
            <Text style={[styles.fullscreenLastPlay, { color: lastPlay.color }]}>
              {lastPlay.text}
            </Text>
          )}
          <Text style={styles.fullscreenLive}>LIVE</Text>
        </TouchableOpacity>
      </Modal>

      {/* Target score change modal */}
      <Modal visible={showTargetInput} transparent animationType="fade">
        <View style={styles.targetModalOverlay}>
          <View style={styles.targetModalContent}>
            <Text style={styles.targetModalTitle}>Change Target Score</Text>
            <TextInput
              style={styles.targetModalInput}
              keyboardType="number-pad"
              value={targetInput}
              onChangeText={setTargetInput}
              onSubmitEditing={confirmTargetChange}
              autoFocus
            />
            <View style={styles.targetModalButtons}>
              <TouchableOpacity style={styles.targetModalCancel} onPress={() => setShowTargetInput(false)}>
                <Text style={styles.targetModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.targetModalOk} onPress={confirmTargetChange}>
                <Text style={styles.targetModalOkText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Scoreboard */}
      <TouchableOpacity
        style={styles.scoreboard}
        activeOpacity={0.7}
        onPress={() => setShowFullscreen(true)}
      >
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
          <TouchableOpacity onPress={handleTargetChange}>
            <Text style={styles.targetText}>to {state.targetScore}</Text>
          </TouchableOpacity>
          <Text style={styles.modeText}>
            {state.scoringMode === "2s3s" ? "2s & 3s" : "1s & 2s"}
          </Text>
        </View>

        <View style={styles.teamScoreSection}>
          <Text style={[styles.teamLabel, { color: colors.teamB }]}>TEAM B</Text>
          <Text style={styles.bigScore}>{state.teamBScore}</Text>
          <Text style={styles.teamPlayers} numberOfLines={2}>
            {state.teamB.join(", ")}
          </Text>
        </View>
      </TouchableOpacity>

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

      {/* Settings row */}
      <View style={styles.settingsRow}>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Trigger Word</Text>
          <Switch
            value={triggerWord}
            onValueChange={setTriggerWord}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>

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
                const pts = state.scoringMode === "2s3s" ? 2 : 1;
                score(name, pts, `[manual +${pts}]`);
                setLastCommand(`${name} +${pts}`);
                flash(colors.flashScore);
                setLastPlay({ text: `${name} +${pts}`, color: colors.flashScore });
              }}
              onLongPress={() => {
                const pts = state.scoringMode === "2s3s" ? 3 : 2;
                score(name, pts, `[manual +${pts}]`);
                setLastCommand(`${name} +${pts}`);
                flash(colors.flashScore);
                setLastPlay({ text: `${name} +${pts}`, color: colors.flashScore });
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
              setLastPlay({ text: "UNDO", color: colors.flashUndo });
            }}
          >
            <Text style={styles.undoBtnText}>Undo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.redoBtn}
            onPress={() => {
              redo("[manual redo]");
              setLastCommand("REDO");
              flash(colors.flashRedo);
              setLastPlay({ text: "REDO", color: colors.flashRedo });
            }}
          >
            <Text style={styles.redoBtnText}>Redo</Text>
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

      {/* Debug log */}
      {debugLog.length > 0 && (
        <View style={styles.debugSection}>
          <TouchableOpacity onPress={() => setShowDebug((p) => !p)}>
            <Text style={styles.debugToggle}>
              {showDebug ? "Hide" : "Show"} debug log ({debugLog.length})
            </Text>
          </TouchableOpacity>
          {showDebug && (
            <View style={styles.debugContainer}>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert("Debug Log", debugLog.slice(0, 20).join("\n"));
                }}
              >
                <Text style={styles.debugCopy}>View full log</Text>
              </TouchableOpacity>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                {debugLog.map((line, i) => (
                  <Text key={i} style={styles.debugLine}>{line}</Text>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------- FINISHED SCREEN ----------
function FinishedScreen({
  store,
  onRunItBack,
}: {
  store: ReturnType<typeof useGameStore>;
  onRunItBack: () => void;
}) {
  const { state, reset } = store;

  // Player totals
  const playerTotals = new Map<string, number>();
  for (const e of state.events) {
    if ((e.eventType === "score" || e.eventType === "correction") && !e.undone) {
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

      <TouchableOpacity
        style={[styles.btnGreen, { marginTop: 24 }]}
        onPress={onRunItBack}
      >
        <Text style={styles.btnText}>Run It Back — Same Teams</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btnPrimary, { marginTop: 8 }]} onPress={reset}>
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

  // Last game teams for "Run It Back"
  const [lastGameTeams, setLastGameTeams] = useState<LastGameTeams | null>(null);
  const [customTarget, setCustomTarget] = useState("");

  // Active game data for resume
  const [activeGameData, setActiveGameData] = useState<api.ActiveGameData | null>(null);

  // Load last game teams from storage
  useEffect(() => {
    AsyncStorage.getItem(LAST_GAME_TEAMS_KEY).then((val) => {
      if (val) {
        try { setLastGameTeams(JSON.parse(val)); } catch { /* ignore */ }
      }
    });
  }, []);

  // Check for active game when idle
  useEffect(() => {
    if (state.status !== "idle" || !isAuthenticated) return;
    api.getActiveGame()
      .then((data) => {
        if (data.game_id && data.game_status === "active") {
          setActiveGameData(data);
        }
      })
      .catch(() => {});
  }, [state.status, isAuthenticated]);

  // Save teams when game ends
  useEffect(() => {
    if (state.status === "finished" && state.winningTeam) {
      const teams: LastGameTeams = {
        teamA: state.teamA,
        teamB: state.teamB,
        winningTeam: state.winningTeam,
      };
      setLastGameTeams(teams);
      AsyncStorage.setItem(LAST_GAME_TEAMS_KEY, JSON.stringify(teams)).catch(() => {});
    }
  }, [state.status, state.winningTeam]);

  const resumeGame = async () => {
    if (!activeGameData) return;
    const { game_id, team_a_names, team_b_names, team_a_score, team_b_score, target_score } = activeGameData;
    if (!game_id) return;

    let events: ScoringEvent[] = [];
    try {
      const apiEvents = await api.getGameEvents(game_id);
      events = apiEvents
        .filter((e) => e.event_type !== "correction")
        .map((e, i) => ({
          id: i + 1,
          apiId: e.id,
          playerName: e.player_name,
          points: e.point_value,
          eventType: e.event_type as ScoringEvent["eventType"],
          rawTranscript: "",
          timestamp: new Date(e.created_at).getTime(),
        }));
    } catch { /* continue without events */ }

    store.resumeGame({
      gameId: game_id,
      teamA: team_a_names,
      teamB: team_b_names,
      teamAScore: team_a_score,
      teamBScore: team_b_score,
      targetScore: target_score || 11,
      events,
    });
    setActiveGameData(null);
  };

  const runItBack = () => {
    if (!lastGameTeams) return;
    // Winners become Team A
    const newA = lastGameTeams.winningTeam === "B" ? lastGameTeams.teamB : lastGameTeams.teamA;
    const newB = lastGameTeams.winningTeam === "B" ? lastGameTeams.teamA : lastGameTeams.teamB;
    store.setTeams(newA, newB);
    store.startSetup();
  };

  const startWithCustomTarget = () => {
    const val = parseInt(customTarget);
    if (isNaN(val) || val < 1) return;
    store.setTarget(val);
    store.startSetup();
  };

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
    return <FinishedScreen store={store} onRunItBack={runItBack} />;
  }

  // IDLE
  return (
    <View style={styles.container}>
      <View style={styles.idleContent}>
        <Text style={styles.idleTitle}>Record a Game</Text>

        {/* Scoring mode toggle */}
        <View style={styles.scoringModeRow}>
          <Text style={styles.scoringModeLabel}>Scoring:</Text>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              state.scoringMode === "1s2s" && styles.modeBtnActive,
            ]}
            onPress={() => store.setScoringMode("1s2s")}
          >
            <Text style={[
              styles.modeBtnText,
              state.scoringMode === "1s2s" && styles.modeBtnTextActive,
            ]}>1s & 2s</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              state.scoringMode === "2s3s" && styles.modeBtnActive,
            ]}
            onPress={() => store.setScoringMode("2s3s")}
          >
            <Text style={[
              styles.modeBtnText,
              state.scoringMode === "2s3s" && styles.modeBtnTextActive,
            ]}>2s & 3s</Text>
          </TouchableOpacity>
        </View>

        {/* Resume active game */}
        {activeGameData && activeGameData.game_id && (
          <TouchableOpacity style={styles.resumeBtn} onPress={resumeGame}>
            <Text style={styles.btnText}>
              Resume Active Game ({activeGameData.team_a_score}-{activeGameData.team_b_score})
            </Text>
          </TouchableOpacity>
        )}

        {/* Run it back */}
        {lastGameTeams && (
          <TouchableOpacity style={styles.runItBackBtn} onPress={runItBack}>
            <Text style={styles.btnText}>Run It Back — Same Teams</Text>
          </TouchableOpacity>
        )}

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

        {/* Custom target */}
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            placeholder="Custom"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={customTarget}
            onChangeText={setCustomTarget}
            onSubmitEditing={startWithCustomTarget}
          />
          <TouchableOpacity style={styles.customGoBtn} onPress={startWithCustomTarget}>
            <Text style={styles.customGoText}>Go</Text>
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
    marginBottom: 12,
  },
  idleSubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 16,
    marginTop: 8,
  },

  // Scoring mode
  scoringModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  scoringModeLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  modeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  modeBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  modeBtnTextActive: {
    color: "#fff",
  },

  // Resume & Run It Back
  resumeBtn: {
    width: "100%",
    backgroundColor: "#ca8a04",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  runItBackBtn: {
    width: "100%",
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
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
    marginBottom: 12,
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

  // Custom target
  customRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    fontSize: 15,
    textAlign: "center",
  },
  customGoBtn: {
    borderWidth: 1,
    borderColor: "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  customGoText: {
    color: "#60a5fa",
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
  sectionHeader: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
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

  // New player creation
  newPlayerRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  createBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

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
  btnGreen: {
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
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
  targetText: {
    color: "#60a5fa",
    fontSize: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeText: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },

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

  // Settings row
  settingsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 16,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingLabel: {
    color: colors.textMuted,
    fontSize: 12,
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
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    alignItems: "center",
  },
  undoBtnText: { color: colors.flashUndo, fontSize: 14, fontWeight: "600" },
  redoBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: colors.textMuted,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    alignItems: "center",
  },
  redoBtnText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  endBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    alignItems: "center",
  },
  endBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },

  // Fullscreen modal
  fullscreenModal: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenHint: {
    color: "#333",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 24,
  },
  fullscreenScores: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  fullscreenTeam: {
    alignItems: "center",
  },
  fullscreenTeamLabel: {
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 3,
  },
  fullscreenBigScore: {
    color: "#fff",
    fontSize: 120,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  fullscreenRoster: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 150,
  },
  fullscreenDash: {
    color: "#444",
    fontSize: 48,
  },
  fullscreenLastPlay: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 32,
  },
  fullscreenLive: {
    color: colors.flashUndo,
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 4,
    marginTop: 16,
  },

  // Debug log
  debugSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  debugToggle: {
    color: colors.textMuted,
    fontSize: 12,
    textDecorationLine: "underline",
    textAlign: "center",
    paddingVertical: 4,
  },
  debugContainer: {
    marginTop: 4,
  },
  debugCopy: {
    color: "#60a5fa",
    fontSize: 12,
    textDecorationLine: "underline",
    marginBottom: 4,
  },
  debugScroll: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    maxHeight: 160,
  },
  debugLine: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: "monospace",
    lineHeight: 16,
  },

  // Target change modal
  targetModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  targetModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: 280,
    alignItems: "center",
  },
  targetModalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  targetModalInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    fontSize: 20,
    textAlign: "center",
    width: "100%",
    marginBottom: 16,
  },
  targetModalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  targetModalCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  targetModalCancelText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  targetModalOk: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    alignItems: "center",
  },
  targetModalOkText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },

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
