import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { colors } from "../../src/lib/colors";
import * as api from "../../src/services/api";
import { computeLeagueAvg, computeNBAComp } from "../../src/lib/nba-comps";

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stats, setStats] = useState<api.Player | null>(null);
  const [recentGames, setRecentGames] = useState<api.PlayerGame[]>([]);
  const [allPlayers, setAllPlayers] = useState<api.Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [s, games, players] = await Promise.all([
          api.getPlayerStats(id),
          api.getPlayerGames(id),
          api.getPlayers(),
        ]);
        setStats(s);
        setRecentGames(games);
        setAllPlayers(players);
      } catch (e) {
        console.error("Failed to load player:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // NBA Comp
  const leagueAvg = computeLeagueAvg(allPlayers);
  const nbaComp = computeNBAComp(
    { ppg: stats.ppg, tpg: stats.twos_pg, apg: stats.apg, spg: stats.spg, bpg: stats.bpg },
    leagueAvg
  );

  const norm = (raw: number, ws: number) => Math.round((raw * 11) / Math.max(ws, 1) * 10) / 10;

  return (
    <>
      <Stack.Screen options={{ title: stats.name }} />
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.playerName}>{stats.name}</Text>
          <Text style={styles.record}>
            {stats.wins}W-{stats.losses}L ({stats.win_pct}%) {stats.streak}
          </Text>
          {stats.mvp_count > 0 && (
            <Text style={styles.mvps}>MVP x{stats.mvp_count}</Text>
          )}
        </View>

        {/* Stat Cards */}
        <View style={styles.statGrid}>
          <StatCard label="PPG" value={stats.ppg} />
          <StatCard label="APG" value={stats.apg} />
          <StatCard label="SPG" value={stats.spg} />
          <StatCard label="BPG" value={stats.bpg} />
          <StatCard label="FPG" value={stats.fpg} />
          <StatCard label="+/-" value={stats.plus_minus_per_game} />
        </View>

        {/* Raw Totals */}
        <Text style={styles.sectionTitle}>Totals ({stats.games_played} games)</Text>
        <View style={styles.statGrid}>
          <StatCard label="Points" value={stats.total_points} />
          <StatCard label="Assists" value={stats.assists} />
          <StatCard label="Steals" value={stats.steals} />
          <StatCard label="Blocks" value={stats.blocks} />
          <StatCard label="1s Made" value={stats.ones_made} />
          <StatCard label="2s Made" value={stats.twos_made} />
        </View>

        {/* NBA Comp */}
        <Text style={styles.sectionTitle}>NBA Comparison</Text>
        <View style={styles.compCard}>
          <Text style={styles.compName}>{nbaComp.comp.name}</Text>
          <Text style={styles.compStats}>
            Scaled: {nbaComp.scaledStats.ppg} PPG / {nbaComp.scaledStats.apg} APG / {nbaComp.scaledStats.spg} SPG / {nbaComp.scaledStats.bpg} BPG
          </Text>
        </View>

        {/* Recent Games */}
        <Text style={styles.sectionTitle}>Recent Games</Text>
        {recentGames.slice(0, 10).map((g) => (
          <View key={g.game_id} style={styles.gameRow}>
            <View style={styles.gameResult}>
              <Text style={[styles.wl, g.won ? styles.win : styles.loss]}>
                {g.won ? "W" : "L"}
              </Text>
              <Text style={styles.gameScore}>
                {g.team_a_score}-{g.team_b_score}
              </Text>
            </View>
            <View style={styles.gameStats}>
              <Text style={styles.gameStat}>{norm(g.points_scored, g.winning_score)} pts</Text>
              <Text style={styles.gameStat}>{norm(g.assists, g.winning_score)} ast</Text>
              <Text style={styles.gameStat}>{norm(g.steals, g.winning_score)} stl</Text>
              <Text style={styles.gameStat}>{norm(g.blocks, g.winning_score)} blk</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  header: { alignItems: "center", paddingVertical: 24 },
  playerName: { color: colors.text, fontSize: 28, fontWeight: "bold" },
  record: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  mvps: { color: colors.chartYellow, fontSize: 14, fontWeight: "600", marginTop: 4 },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
    gap: 8,
  },
  statCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    width: "30%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCardValue: { color: colors.text, fontSize: 20, fontWeight: "bold" },
  statCardLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "bold",
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
  },
  compCard: {
    backgroundColor: colors.card,
    marginHorizontal: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compName: { color: colors.chartYellow, fontSize: 18, fontWeight: "bold" },
  compStats: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  gameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameResult: { flexDirection: "row", alignItems: "center", gap: 8 },
  wl: { fontSize: 14, fontWeight: "bold", width: 16 },
  win: { color: colors.chartGreen },
  loss: { color: colors.accent },
  gameScore: { color: colors.textSecondary, fontSize: 13 },
  gameStats: { flexDirection: "row", gap: 10 },
  gameStat: { color: colors.text, fontSize: 13 },
});
