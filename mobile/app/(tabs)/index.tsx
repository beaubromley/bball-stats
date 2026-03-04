import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { colors } from "../../src/lib/colors";
import * as api from "../../src/services/api";

export default function StatsScreen() {
  const [players, setPlayers] = useState<api.Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [seasonInfo, setSeasonInfo] = useState<api.SeasonInfo | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [playersData, seasonsData] = await Promise.all([
        api.getPlayers(season ?? undefined),
        api.getSeasons(),
      ]);
      // Sort by FPG descending
      playersData.sort((a, b) => b.fpg - a.fpg);
      setPlayers(playersData);
      setSeasonInfo(seasonsData);
      if (season === null) {
        setSeason(seasonsData.currentSeason);
      }
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Season Toggle */}
      {seasonInfo && (
        <View style={styles.seasonRow}>
          {Array.from({ length: seasonInfo.totalSeasons }, (_, i) => i + 1).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.seasonBtn, season === s && styles.seasonBtnActive]}
              onPress={() => { setSeason(s); setLoading(true); }}
            >
              <Text style={[styles.seasonBtnText, season === s && styles.seasonBtnTextActive]}>
                S{s}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.seasonBtn, season === 0 && styles.seasonBtnActive]}
            onPress={() => { setSeason(0); setLoading(true); }}
          >
            <Text style={[styles.seasonBtnText, season === 0 && styles.seasonBtnTextActive]}>
              All
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Leaderboard */}
      <Text style={styles.sectionTitle}>Leaderboard</Text>
      {players.map((p, i) => (
        <TouchableOpacity
          key={p.id}
          style={styles.playerRow}
          onPress={() => router.push(`/player/${p.id}`)}
        >
          <Text style={styles.rank}>#{i + 1}</Text>
          <View style={styles.playerInfo}>
            <Text style={styles.playerName}>{p.name}</Text>
            <Text style={styles.playerRecord}>
              {p.wins}W-{p.losses}L ({p.win_pct}%) {p.streak}
            </Text>
          </View>
          <View style={styles.statCols}>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{p.ppg}</Text>
              <Text style={styles.statLabel}>PPG</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{p.apg}</Text>
              <Text style={styles.statLabel}>APG</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{p.fpg}</Text>
              <Text style={styles.statLabel}>FPG</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  seasonRow: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
  },
  seasonBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seasonBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  seasonBtnText: { color: colors.textSecondary, fontWeight: "600" },
  seasonBtnTextActive: { color: "#fff" },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rank: {
    color: colors.textMuted,
    fontSize: 14,
    width: 30,
    fontWeight: "bold",
  },
  playerInfo: { flex: 1 },
  playerName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  playerRecord: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  statCols: { flexDirection: "row", gap: 12 },
  statCol: { alignItems: "center", minWidth: 36 },
  statValue: { color: colors.text, fontSize: 15, fontWeight: "bold" },
  statLabel: { color: colors.textMuted, fontSize: 10 },
});
