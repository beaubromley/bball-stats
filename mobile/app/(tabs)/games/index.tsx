import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Stack, router } from "expo-router";
import { colors } from "../../../src/lib/colors";
import * as api from "../../../src/services/api";
import { groupBySeason } from "../../../src/lib/seasons";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
}

export default function GamesScreen() {
  const [games, setGames] = useState<api.Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGames = useCallback(async () => {
    try {
      const data = await api.getGames();
      setGames(data);
    } catch (e) {
      console.error("Failed to fetch games:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGames();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Games come from API in desc order (newest first). Reverse for groupBySeason (wants oldest first).
  const chronological = [...games].reverse();
  const grouped = groupBySeason(chronological);
  // Reverse sections so newest season is first
  const sections = grouped
    .map((g) => ({
      title: `${g.season.label} (${g.games.length} games)`,
      data: [...g.games].reverse(), // Newest game first within each season
    }))
    .reverse();

  return (
    <>
      <Stack.Screen options={{ title: "Games" }} />
      <SectionList
        style={styles.container}
        sections={sections}
        keyExtractor={(item) => item.id as string}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const game = item as api.Game;
          const isLive = game.status === "active" || game.status === "started";
          return (
            <TouchableOpacity
              style={styles.gameRow}
              onPress={() => router.push(`/games/${game.id}`)}
            >
              <View style={styles.gameLeft}>
                <Text style={styles.gameNum}>#{game.game_number}</Text>
                <Text style={styles.gameDate}>{formatDate(game.start_time)}</Text>
              </View>
              <View style={styles.scoreSection}>
                <Text style={[styles.teamScore, game.winning_team === "A" && styles.winnerScore]}>
                  {game.team_a_score}
                </Text>
                <Text style={styles.vs}>-</Text>
                <Text style={[styles.teamScore, game.winning_team === "B" && styles.winnerScore]}>
                  {game.team_b_score}
                </Text>
              </View>
              {isLive && (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No games yet</Text>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  sectionHeader: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "bold" },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameLeft: { width: 80 },
  gameNum: { color: colors.textMuted, fontSize: 12 },
  gameDate: { color: colors.textSecondary, fontSize: 14 },
  scoreSection: { flexDirection: "row", alignItems: "center", flex: 1, justifyContent: "center" },
  teamScore: { color: colors.text, fontSize: 22, fontWeight: "bold", width: 40, textAlign: "center" },
  winnerScore: { color: colors.chartGreen },
  vs: { color: colors.textMuted, fontSize: 18, marginHorizontal: 8 },
  liveBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 16 },
});
