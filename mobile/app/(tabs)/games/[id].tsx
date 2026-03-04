import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { colors } from "../../../src/lib/colors";
import * as api from "../../../src/services/api";

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [boxScore, setBoxScore] = useState<api.BoxScore | null>(null);
  const [events, setEvents] = useState<api.GameEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [bs, evts] = await Promise.all([
          api.getBoxScore(id),
          api.getGameEvents(id),
        ]);
        setBoxScore(bs);
        setEvents(evts);
      } catch (e) {
        console.error("Failed to load game:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !boxScore) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const teamA = boxScore.players.filter((p) => p.team === "A").sort((a, b) => b.points - a.points);
  const teamB = boxScore.players.filter((p) => p.team === "B").sort((a, b) => b.points - a.points);

  return (
    <>
      <Stack.Screen options={{ title: `Game` }} />
      <ScrollView style={styles.container}>
        {/* Big Score */}
        <View style={styles.scoreHeader}>
          <View style={styles.teamSide}>
            <Text style={styles.teamLabel}>Team A</Text>
            <Text style={[styles.bigScore, boxScore.winning_team === "A" && styles.winnerScore]}>
              {boxScore.team_a_score}
            </Text>
          </View>
          <Text style={styles.dash}>-</Text>
          <View style={styles.teamSide}>
            <Text style={styles.teamLabel}>Team B</Text>
            <Text style={[styles.bigScore, boxScore.winning_team === "B" && styles.winnerScore]}>
              {boxScore.team_b_score}
            </Text>
          </View>
        </View>

        {boxScore.mvp && (
          <Text style={styles.mvpText}>MVP: {boxScore.mvp.player_name}</Text>
        )}

        {/* Box Score - Team A */}
        <Text style={styles.teamHeader}>Team A</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Player</Text>
            <Text style={styles.tableHeaderCell}>PTS</Text>
            <Text style={styles.tableHeaderCell}>AST</Text>
            <Text style={styles.tableHeaderCell}>STL</Text>
            <Text style={styles.tableHeaderCell}>BLK</Text>
            <Text style={styles.tableHeaderCell}>FP</Text>
          </View>
          {teamA.map((p) => (
            <View key={p.player_id} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 2 }, p.is_mvp && styles.mvpName]}>
                {p.player_name} {p.is_mvp ? "★" : ""}
              </Text>
              <Text style={styles.tableCell}>{p.points}</Text>
              <Text style={styles.tableCell}>{p.assists}</Text>
              <Text style={styles.tableCell}>{p.steals}</Text>
              <Text style={styles.tableCell}>{p.blocks}</Text>
              <Text style={styles.tableCell}>{p.fantasy_points}</Text>
            </View>
          ))}
        </View>

        {/* Box Score - Team B */}
        <Text style={styles.teamHeader}>Team B</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Player</Text>
            <Text style={styles.tableHeaderCell}>PTS</Text>
            <Text style={styles.tableHeaderCell}>AST</Text>
            <Text style={styles.tableHeaderCell}>STL</Text>
            <Text style={styles.tableHeaderCell}>BLK</Text>
            <Text style={styles.tableHeaderCell}>FP</Text>
          </View>
          {teamB.map((p) => (
            <View key={p.player_id} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 2 }, p.is_mvp && styles.mvpName]}>
                {p.player_name} {p.is_mvp ? "★" : ""}
              </Text>
              <Text style={styles.tableCell}>{p.points}</Text>
              <Text style={styles.tableCell}>{p.assists}</Text>
              <Text style={styles.tableCell}>{p.steals}</Text>
              <Text style={styles.tableCell}>{p.blocks}</Text>
              <Text style={styles.tableCell}>{p.fantasy_points}</Text>
            </View>
          ))}
        </View>

        {/* Play-by-Play */}
        <Text style={styles.sectionTitle}>Play-by-Play</Text>
        {[...events].reverse().map((e) => {
          const isCorrection = e.event_type === "correction";
          return (
            <View key={e.id} style={[styles.eventRow, isCorrection && styles.correctionRow]}>
              <Text style={[styles.eventText, isCorrection && styles.correctionText]}>
                {isCorrection ? "UNDO " : ""}
                {e.player_name} {e.event_type === "score" ? `+${e.point_value}` : e.event_type === "assist" ? "AST" : e.event_type === "steal" ? "STL" : e.event_type === "block" ? "BLK" : e.event_type}
                {e.assisted_by_name ? ` (ast: ${e.assisted_by_name})` : ""}
              </Text>
              <Text style={styles.eventTime}>{formatTime(e.created_at)}</Text>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  scoreHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
    gap: 20,
  },
  teamSide: { alignItems: "center" },
  teamLabel: { color: colors.textSecondary, fontSize: 14, marginBottom: 4 },
  bigScore: { color: colors.text, fontSize: 48, fontWeight: "bold" },
  winnerScore: { color: colors.chartGreen },
  dash: { color: colors.textMuted, fontSize: 36 },
  mvpText: {
    color: colors.chartYellow,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 16,
  },
  teamHeader: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "bold",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  table: { marginHorizontal: 12 },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
  },
  tableHeaderCell: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableCell: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
    textAlign: "center",
  },
  mvpName: { color: colors.chartYellow, fontWeight: "bold" },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "bold",
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
  },
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  correctionRow: { opacity: 0.5 },
  eventText: { color: colors.text, fontSize: 14 },
  correctionText: { color: colors.flashUndo },
  eventTime: { color: colors.textMuted, fontSize: 12 },
});
