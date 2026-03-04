import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../src/lib/colors";

// TODO: Port GameScreen.tsx here with full voice recording, roster setup, and API integration
export default function RecordScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Game Recording</Text>
      <Text style={styles.subtitle}>Voice recording coming soon</Text>
      <Text style={styles.hint}>
        This screen will include team setup, voice-activated scoring,{"\n"}
        and live score tracking with API sync.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  subtitle: { color: colors.textSecondary, fontSize: 16, marginBottom: 24 },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
});
