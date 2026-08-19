import React, { Component, type ReactNode } from "react";
import { appFailedToStartMessage } from "shared/branding/appBrand.ts";
import { ScrollView, Text, View, StyleSheet } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ExpoErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ExpoErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{appFailedToStartMessage()}</Text>
        <ScrollView style={styles.scroll}>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.stack}>{this.state.error.stack}</Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  scroll: { flex: 1 },
  message: { fontSize: 14, color: "#c00", marginBottom: 8 },
  stack: { fontSize: 11, color: "#444", fontFamily: "Menlo" }
});
