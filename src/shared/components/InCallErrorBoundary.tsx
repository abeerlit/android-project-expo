import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text.tsx";
import { Button } from "./Button.tsx";
import { padding, fontSize } from "core/theme/theme.ts";

interface Props {
  children: ReactNode;
  onRetry?: () => void;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for InCallScreen to prevent full app crash on Android
 * when receiving/answering calls. Catches JS render errors only;
 * native crashes (CallKeep, audio) still need to be fixed at source.
 */
export class InCallErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      "[InCallErrorBoundary] Caught error:",
      error?.message,
      errorInfo?.componentStack
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text
            size={fontSize.lg}
            weight="semiBold"
            style={styles.title}
          >
            Call screen error
          </Text>
          <Text size={fontSize.sm} style={styles.message}>
            {this.state.error?.message || "Something went wrong"}
          </Text>
          <View style={styles.buttons}>
            {this.props.onClose && (
              <Button
                type="secondary"
                onPress={() => {
                  this.setState({ hasError: false, error: null });
                  this.props.onClose?.();
                }}
              >
                Close
              </Button>
            )}
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: padding.xl
  },
  title: {
    marginBottom: padding.md,
    textAlign: "center"
  },
  message: {
    marginBottom: padding.xl,
    textAlign: "center"
  },
  buttons: {
    gap: padding.md
  }
});
